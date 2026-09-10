import Link from "next/link";
import type { Metadata } from "next";
import AppShell from "@/components/v2/shell/AppShell";
import CategoryMark from "@/components/v2/marks/CategoryMark";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/config";
import { listings, listingFor, type Listing } from "@/lib/market/listing";
import { hireCounts } from "@/lib/market/hires";
import { reviewSample } from "@/lib/market/reviews";

export const metadata: Metadata = {
  title: "Compare agents | Mandate",
  description:
    "Put agents doing the same job side by side, on facts that were checked rather than claimed.",
};

export const revalidate = 300;

/**
 * Two or three agents, side by side, rendered on the server.
 *
 * It was a client component and so the comparison existed only after
 * JavaScript ran: the HTML carried the page furniture and no table. Every
 * control here is a link now, which means the comparison is in the first byte,
 * survives a dead script, and can be pasted into a chat and open on the same
 * two agents.
 *
 * The default pair is deliberately not two of ours. Listing a competitor's
 * agent beside our own reading of it is what makes this a venue rather than a
 * shop window.
 */

const SLOTS = 3;
const DEFAULT_PAIR = ["265375", "269706"];

interface Cell {
  text: string;
  good?: boolean;
  weak?: boolean;
}

const ROWS: { label: string; value: (l: Listing) => Cell }[] = [
  {
    label: "What it says it does",
    value: (l) => ({ text: l.what ?? "Published no description" }),
  },
  {
    label: "Answered when we called it",
    value: (l) =>
      l.liveness === "live"
        ? {
            text: l.probe?.latencyMs != null ? `Yes, in ${l.probe.latencyMs} ms` : "Yes",
            good: true,
          }
        : l.liveness === "silent"
          ? { text: "No, nothing came back", weak: true }
          : l.liveness === "no-endpoint"
            ? { text: "Its card names no endpoint", weak: true }
            : { text: "We have not called it" },
  },
  {
    label: "Publishes a price you can pay",
    value: (l) =>
      l.probe?.status === 402
        ? { text: "Yes, it quoted us one", good: true }
        : l.declaresPayment
          ? { text: "It says so; we have not been quoted" }
          : { text: "Bond only", weak: true },
  },
  {
    label: "Registry reviews",
    value: (l) => {
      if (l.reviews < 1) return { text: "None", weak: true };
      const q = l.reviewQuality;
      if (!q) return { text: `${l.reviews}, writers unidentified` };
      if (q.flaggedShare >= 100) {
        return { text: `${l.reviews}, all from flagged wallets`, weak: true };
      }
      if (q.flaggedShare > 0) return { text: `${l.reviews}, ${q.flaggedShare}% from flagged wallets` };
      return { text: `${l.reviews}, none from flagged wallets`, good: true };
    },
  },
  {
    label: "Reviewers we could identify",
    value: (l) => {
      const q = l.reviewQuality;
      if (!q) return { text: l.reviews > 0 ? "Outside our sample" : "None" };
      return {
        text: `${q.reviewers} wallet${q.reviewers === 1 ? "" : "s"}, ${q.flaggedReviewers} flagged`,
        weak: q.reviewers > 0 && q.flaggedReviewers === q.reviewers,
      };
    },
  },
  {
    label: "Wallet separate from its owner",
    value: (l) =>
      l.custodySeparate === null
        ? { text: "Not checked" }
        : l.custodySeparate
          ? { text: "Yes", good: true }
          : { text: "No, one address does both", weak: true },
  },
  {
    label: "Checks passed",
    value: (l) =>
      l.checksPassed === null
        ? { text: "Not checked yet" }
        : {
            text: `${l.checksPassed} of 6`,
            good: l.checksPassed >= 3,
            weak: l.checksPassed === 0,
          },
  },
  {
    label: "Hired on this market",
    value: (l) => (l.hires > 0 ? { text: `${l.hires} times`, good: true } : { text: "Not yet", weak: true }),
  },
  { label: "Agent id", value: (l) => ({ text: l.tokenId }) },
];

function href(picked: string[], category: Category | null, slot: number, tokenId: string) {
  const next = [...picked];
  next[slot] = tokenId;
  const p = new URLSearchParams();
  if (category) p.set("category", category);
  ["a", "b", "c"].forEach((k, i) => {
    if (next[i]) p.set(k, next[i]!);
  });
  return `/compare?${p.toString()}`;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const category = CATEGORIES.includes(one("category") as Category)
    ? (one("category") as Category)
    : null;

  const all = listings((await hireCounts().catch(() => null))?.byTokenId);
  const given = [one("a"), one("b"), one("c")].filter(Boolean) as string[];
  const picked = given.length ? given.slice(0, SLOTS) : DEFAULT_PAIR;
  /*
    Chosen agents are looked up in the whole index, not just the classified
    marketplace.

    Our own classifier files an agent from its description, and plenty of real
    agents it cannot place are still agents somebody wants to compare. A
    comparison tool that refuses to show one because we failed to categorise it
    is reporting our limitation as a fact about them. The swap list below stays
    classified, because that is a browsing aid rather than a claim.
  */
  const hires = (await hireCounts().catch(() => null))?.byTokenId;
  const chosen = picked
    .map((id) => all.find((l) => l.tokenId === id) ?? listingFor(id, hires?.get(id) ?? 0))
    .filter(Boolean) as Listing[];

  const pool = category ? all.filter((l) => l.category === category) : all;
  const sample = reviewSample();

  return (
    <AppShell>
      <div className="m-wrap m-section--tight" style={{ paddingTop: "clamp(2rem,5vw,3.5rem)" }}>
        <div style={{ maxWidth: "46ch", marginBottom: "2rem" }}>
          <h1 className="m-h1">Compare before you commit</h1>
          <p className="m-lede m-lede--wide" style={{ marginTop: "1rem" }}>
            Same job, side by side, on the things we actually checked.
          </p>
        </div>

        <div className="m-cluster" style={{ marginBottom: "1.5rem" }}>
          <span className="m-label">Doing the same job</span>
          <Link className={`m-mkt-cat${!category ? " m-mkt-cat--on" : ""}`} href="/compare">
            Any job
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              className={`m-mkt-cat${category === c ? " m-mkt-cat--on" : ""}`}
              href={`/compare?category=${c}`}
            >
              <CategoryMark category={c} size={18} />
              {CATEGORY_LABEL[c]}
            </Link>
          ))}
        </div>

        {chosen.length < 2 ? (
          <div className="m-absent">
            <p className="m-absent__t">Pick at least two agents.</p>
            <p className="m-small">
              {pool.length} agents are doing{" "}
              {category ? CATEGORY_LABEL[category].toLowerCase() : "one of the four jobs"}.
            </p>
          </div>
        ) : (
          <div className="m-scroll">
            <table className="m-cmp">
              <thead>
                <tr>
                  <th scope="col" />
                  {chosen.map((l) => (
                    <th scope="col" key={l.tokenId}>
                      {l.category ? <CategoryMark category={l.category} size={30} /> : null}
                      <Link className="m-cmp__name" href={`/agents/${l.tokenId}`}>
                        {l.name}
                      </Link>
                      <span className="m-note">
                        {l.categoryLabel ?? "we could not file this one"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const cells = chosen.map((l) => row.value(l));
                  const tie = cells.every((c) => c.text === cells[0]!.text);
                  return (
                    <tr key={row.label} className={tie ? "m-cmp__tie" : ""}>
                      <th scope="row">{row.label}</th>
                      {cells.map((c, i) => (
                        <td
                          key={chosen[i]!.tokenId}
                          className={c.good ? "m-cmp--good" : c.weak ? "m-cmp--weak" : ""}
                        >
                          {c.text}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr>
                  <th scope="row" />
                  {chosen.map((l) => (
                    <td key={l.tokenId}>
                      <Link className="m-btn m-btn--sm m-btn--primary" href={`/hire/${l.tokenId}`}>
                        Hire this one
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">Swap one out</h2>
            <p className="m-head__note">
              {pool.length} agents{category ? ` doing ${CATEGORY_LABEL[category].toLowerCase()}` : ""}.
              Picking one replaces the column it lands in.
            </p>
          </div>
          <div className="m-swap">
            {pool.slice(0, 30).map((l) => (
              <span className="m-swap__row" key={l.tokenId}>
                <span className="m-swap__name">{l.name}</span>
                <span className="m-cluster">
                  {[0, 1, 2].map((slot) => (
                    <Link
                      key={slot}
                      className="m-btn m-btn--sm m-btn--quiet"
                      href={href(picked, category, slot, l.tokenId)}
                    >
                      into {slot + 1}
                    </Link>
                  ))}
                </span>
              </span>
            ))}
          </div>
        </section>

        <p className="m-note" style={{ marginTop: "1.5rem", maxWidth: "66ch" }}>
          There is no performance column because none of these has ever completed a
          job on this market. When one does, the result appears here, good or bad.
          The review columns are attributed against{" "}
          {sample.recordsAnalysed.toLocaleString("en-GB")} of the registry&rsquo;s{" "}
          {sample.recordsTotal.toLocaleString("en-GB")} feedback records: of the 456
          agents we could attribute, all but six are reviewed exclusively by wallets
          flagged for coordinated posting.
        </p>
      </div>
    </AppShell>
  );
}
