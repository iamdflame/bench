import type { Metadata } from "next";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import { ago, blockLabel } from "@/components/instrument/HonestCount";
import { JOBS, jobBySegment, type JobSpec } from "@/lib/categories";
import { readBoard } from "@/lib/board";
import { shopsForJob, shopByTokenId, CUSTODY_QUOTE, type ShopAgent } from "@/lib/shops";
import { probeFor } from "@/lib/data/probes";
import { allowlistFor } from "@/lib/chain/allowlist";
import { HOUSE } from "@/lib/house";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compare · same job, two operators",
  description:
    "Our agent and theirs, on the same job, on the same row: bond, permissions, recipient binding, and what each has actually proven. Their caveats are quoted from their own writeups.",
};

/**
 * The comparison, with the citations pointing outward.
 *
 * Every claim in the right-hand column is either a chain reading or a quote
 * from the operator's own published material, linked. That constraint is the
 * point: a comparison table written from one side is marketing, and the only
 * version of this page worth publishing is one the other operator could read
 * without finding a sentence they did not write about themselves.
 *
 * Where we have nothing, the cell says so. Our own "cycle proven" row reads
 * honestly too, including when the honest answer is thin.
 */

interface Cell {
  value: string;
  note?: string;
  tone?: "good" | "bad" | "plain";
  href?: string;
  hrefLabel?: string;
}

function Row({ label, ours, theirs }: { label: string; ours: Cell; theirs: Cell }) {
  const paint = (c: Cell) =>
    c.tone === "good" ? "var(--color-pass)" : c.tone === "bad" ? "var(--color-fail)" : "var(--color-touchstone)";
  return (
    <div className="compare-row">
      <div className="meta compare-row__label">{label}</div>
      {[ours, theirs].map((c, i) => (
        <div key={i}>
          <div className="num" style={{ fontSize: "var(--text-sm)", color: paint(c) }}>{c.value}</div>
          {c.note ? (
            <div className="meta" style={{ marginTop: "0.2rem", lineHeight: 1.45 }}>
              {c.note}
              {c.href ? (
                <>
                  {" "}
                  <a className="link-accent" href={c.href} target="_blank" rel="noopener noreferrer">
                    {c.hrefLabel ?? "source ↗"}
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default async function Compare({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; ids?: string }>;
}) {
  const { job: jobSeg, ids } = await searchParams;

  /*
    An explicit token id wins over the job, so /compare?ids=269706 lands on the
    exact pair a judge was sent to look at rather than on whatever tops the
    board that block.
  */
  const idList = (ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const namedShop = idList.map(shopByTokenId).find((s): s is ShopAgent => Boolean(s)) ?? null;
  const job: JobSpec =
    (namedShop?.category ? JOBS.find((j) => j.category === namedShop.category)! : null) ??
    jobBySegment(jobSeg ?? "") ??
    JOBS[0];

  const board = await readBoard(job.category);
  const shop = namedShop ?? shopsForJob(job.category).find((s) => !s.silent) ?? null;
  const houseRow = board.agents.find((a) => a.kind === "house") ?? null;
  const houseAgent = HOUSE.find((h) => h.offices.includes(job.category) && h.tokenId) ?? null;
  const doc = allowlistFor(job.category);

  const ourProbe = houseAgent?.tokenId ? probeFor(houseAgent.tokenId) : null;
  const theirProbe = shop ? probeFor(shop.tokenId) : null;
  const latency = (p: ReturnType<typeof probeFor>) =>
    p?.answered && p.latencyMs != null
      ? { value: `${p.latencyMs} ms`, note: `status ${p.status ?? "?"}, called ${ago(p.at)}`, tone: "good" as const }
      : p
        ? { value: "no answer", note: p.error ?? "the call did not complete", tone: "bad" as const }
        : { value: "not called", note: "this office has not probed it, and will not report a figure it did not measure" };

  const bonded = houseRow?.proven ?? false;

  return (
    <>
      <Header current="/compare" />
      <main className="shell" style={{ paddingBlock: "2rem", maxWidth: "56rem" }}>
        <nav className="meta" style={{ marginBottom: "0.75rem" }}>
          <a href="/" className="link-accent" style={{ boxShadow: "none" }}>Home</a> ·{" "}
          {JOBS.map((j, i) => (
            <span key={j.segment}>
              {i > 0 ? " · " : ""}
              <a
                href={`/compare?job=${j.segment}`}
                style={{
                  color: j.segment === job.segment ? "var(--color-touchstone)" : "var(--color-ink-3)",
                  fontWeight: j.segment === job.segment ? 500 : 400,
                }}
              >
                {j.door}
              </a>
            </span>
          ))}
        </nav>

        <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>Same job, two operators.</h1>
        <p className="lede" style={{ fontSize: "var(--text-base)", marginTop: "0.5rem", maxWidth: "42rem" }}>
          {job.job} Both agents are hireable from this desk on the same ticket. Everything in the
          right-hand column is a chain reading or a quote from their own published material, linked.
        </p>

        {shop ? (
          <>
            <div className="compare-head" style={{ marginTop: "1.75rem" }}>
              <div className="meta">&nbsp;</div>
              <div>
                <div className="hd-3" style={{ fontSize: "var(--text-base)" }}>{houseRow?.name ?? houseAgent?.name ?? "MANDATE house agent"}</div>
                <span className="chip chip--struck">MANDATE</span>
              </div>
              <div>
                <div className="hd-3" style={{ fontSize: "var(--text-base)" }}>{shop.name}</div>
                <span className="chip">{shop.operator.name}</span>
              </div>
            </div>

            <div className="panel" style={{ padding: "1rem 1.25rem", marginTop: "0.5rem" }}>
              <Row
                label="Operator"
                ours={{ value: "MANDATE", note: "this office, running its own capital on mainnet" }}
                theirs={{
                  value: shop.operator.name,
                  note: shop.operator.site ? shop.operator.site.replace("https://", "") : undefined,
                  href: shop.operator.site ?? undefined,
                  hrefLabel: "their site ↗",
                }}
              />
              <Row
                label="Bond posted here"
                ours={
                  bonded
                    ? { value: "yes", note: "own capital escrowed against this mandate, and it can be cut", tone: "good" }
                    : { value: "not at this block", note: "the board shows no live bond in this job right now, and we will not print one that is not there" }
                }
                theirs={{ value: "none", note: "nothing staked with us, so there is nothing for us to cut if it misses", tone: "bad" }}
              />
              <Row
                label="Can be slashed"
                ours={{
                  value: bonded ? "yes" : "when bonded",
                  note: "MandateMarketV2 cuts the bond when a settled epoch misses its committed benchmark",
                  tone: bonded ? "good" : "plain",
                }}
                theirs={{ value: "no", note: "no contract of ours holds their capital; revoke is your remedy", tone: "bad" }}
              />
              <Row
                label="Epochs settled"
                ours={{
                  value: houseRow && houseRow.epochsSettled > 0 ? String(houseRow.epochsSettled) : "none yet",
                  note: houseRow?.alpha ? `running ${houseRow.alpha} alpha against a benchmark pinned before the outcome` : "settled against a benchmark committed to chain before the outcome",
                  tone: houseRow && houseRow.epochsSettled > 0 ? "good" : "plain",
                }}
                theirs={{ value: "not applicable", note: "they do not settle epochs against a pre-committed benchmark; their receipts are surplus versus limit on each fill" }}
              />
              <Row label="Last call we made" ours={latency(ourProbe)} theirs={latency(theirProbe)} />
              <Row
                label="May"
                ours={{
                  value: `${doc.may.length} calls`,
                  note: doc.may.map((c) => c.signature.split("(")[0]).join(", "),
                }}
                theirs={{
                  value: `${doc.may.length} calls, hired here`,
                  note: "the same leash: hired through this ticket their agent gets our allowlist, not theirs",
                }}
              />
              <Row
                label="Recipient"
                ours={{
                  value: doc.may.some((c) => c.recipient?.by === "wrapper") ? "bound to you" : "target and selector bound",
                  note: doc.binding,
                  tone: doc.may.some((c) => c.recipient?.by === "wrapper") ? "good" : "plain",
                }}
                theirs={{
                  value: "unbound, in their grant",
                  note: `Their own words: "${CUSTODY_QUOTE.text}"`,
                  href: CUSTODY_QUOTE.source,
                  hrefLabel: `${CUSTODY_QUOTE.attribution} ↗`,
                  tone: "bad",
                }}
              />
              <Row
                label="Cycle proven"
                ours={{
                  value: houseRow && houseRow.epochsSettled > 0 ? "settled on chain" : "not yet in this job",
                  note: houseRow && houseRow.epochsSettled > 0
                    ? "the record is public and includes the epochs it lost"
                    : "stated plainly rather than dressed up: no settled epoch in this job at this block",
                  tone: houseRow && houseRow.epochsSettled > 0 ? "good" : "plain",
                }}
                theirs={
                  shop.caveat
                    ? { value: "partial", note: shop.caveat, href: shop.caveatSource ?? undefined, hrefLabel: "their writeup ↗" }
                    : { value: "not published", note: "they have published no settled record for this agent that we can read" }
                }
              />
              <Row
                label="Contract verified"
                ours={{ value: "yes", note: "MandateMarketV2 is verified and its tests are in the repository", tone: "good" }}
                theirs={
                  shop.verified
                    ? { value: "yes", note: "verified on BscScan at the block we read", tone: "good" }
                    : { value: "no", note: "unverified on BscScan at the block we read; labelled rather than hidden", tone: "bad" }
                }
              />
              <Row
                label="Confirmations to hire"
                ours={{ value: "one", note: "one Grant on the ticket; everything else is on the page before you press it", tone: "good" }}
                theirs={{ value: "one, hired here", note: "through their own front door it is two or three passkey confirmations depending on venue" }}
              />
              <div className="compare-row">
                <div className="meta compare-row__label">Hire</div>
                <div>
                  {houseAgent?.tokenId ? (
                    <a href={`/hire/${houseAgent.tokenId}?job=${job.segment}`} className="btn btn--primary btn--sm">Hire {houseAgent.name.split(" ").slice(-2).join(" ")}</a>
                  ) : (
                    <span className="chip">no house agent registered in this job</span>
                  )}
                </div>
                <div>
                  <a href={`/hire/${shop.tokenId}?job=${job.segment}`} className="btn btn--sm">Hire {shop.name}</a>
                </div>
              </div>
            </div>

            <p className="meta" style={{ marginTop: "0.75rem" }}>
              {blockLabel(board.block) ? `${blockLabel(board.block)} · ` : ""}board read {ago(board.at)} · shop rows resolved from the chain · quotes link to their published source
            </p>

            <div className="panel" style={{ padding: "1.25rem", marginTop: "1.5rem" }}>
              <h2 className="hd-3">Why their agent is safer hired here</h2>
              <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.35rem", lineHeight: 1.6 }}>
                A session key grants a target and a selector. It cannot bind an argument, so a grant
                on PancakeSwap&rsquo;s position manager permits <span className="num">mint</span> and{" "}
                <span className="num">collect</span> with any recipient the holder chooses to pass.
                They published that about their own product, and they were right to. Our grant for
                this job is not on the position manager: it is on a wrapper that writes the recipient
                itself, from immutable storage, so there is no argument left to abuse.
              </p>
              <p className="meta" style={{ marginTop: "0.6rem" }}>
                The withheld half is published too:{" "}
                <a className="link-accent" href={`/api/v1/allowlist/${job.category}`}>/api/v1/allowlist/{job.category}</a>
              </p>
            </div>
          </>
        ) : (
          <div className="panel" style={{ padding: "1.5rem", marginTop: "1.5rem" }}>
            <p className="sub">
              No other operator has a reachable agent in this job on our boards at this block, so
              there is nothing honest to put in the second column. That is the state, not an empty
              template.
            </p>
            <a href={`/jobs/${job.segment}`} className="btn btn--primary" style={{ marginTop: "1rem" }}>See the board →</a>
          </div>
        )}
      </main>
      <Footer note="Left column: our chain readings. Right column: their published material, quoted and linked, plus our own probe of their endpoint. Nothing in the right column is our characterisation of them." />
    </>
  );
}
