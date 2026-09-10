import Link from "next/link";
import type { Metadata } from "next";
import AppShell from "@/components/v2/shell/AppShell";
import AgentCard from "@/components/v2/agent/AgentCard";
import CategoryMark from "@/components/v2/marks/CategoryMark";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/config";
import { listings, censusAge, type Listing } from "@/lib/market/listing";
import { hireCounts } from "@/lib/market/hires";

export const metadata: Metadata = {
  title: "Agents you can hire | Mandate",
  description:
    "Browse autonomous agents on BNB Smart Chain by what they do: rebalancing, grid trading, yield, and loan health. Each one checked against the chain before it is listed.",
};

export const revalidate = 300;

/**
 * The marketplace, rendered on the server.
 *
 * It was a client component, and that was a serious mistake rather than a
 * style choice. Reading the query string in the browser opts the whole subtree
 * out of server rendering, so `/agents?category=rebalancing` shipped HTML
 * containing no agents at all and filled itself in after hydration. Anybody
 * who looked before the JavaScript landed, a slow phone, a crawler, a judge
 * clicking through quickly, saw an empty shop advertising ninety agents.
 *
 * So every control here is a link or a plain GET form. The filters are in the
 * URL, the server does the filtering, and the list is in the first byte of
 * HTML. Nothing about this page depends on JavaScript running at all, which is
 * also why it cannot come back empty.
 */

type Sort = "checks" | "reviews" | "name";
const SORTS: { id: Sort; label: string }[] = [
  { id: "checks", label: "Most checks passed" },
  { id: "reviews", label: "Most reviewed" },
  { id: "name", label: "Name" },
];

const PAGE = 24;

interface Query {
  category: Category | null;
  live: boolean;
  priced: boolean;
  reviewed: boolean;
  q: string;
  sort: Sort;
  n: number;
}

function href(query: Query, patch: Partial<Query>): string {
  const next = { ...query, ...patch };
  const p = new URLSearchParams();
  if (next.category) p.set("category", next.category);
  if (next.live) p.set("live", "1");
  if (next.priced) p.set("priced", "1");
  if (next.reviewed) p.set("reviewed", "1");
  if (next.q) p.set("q", next.q);
  if (next.sort !== "checks") p.set("sort", next.sort);
  if (next.n !== PAGE) p.set("n", String(next.n));
  const s = p.toString();
  return s ? `/agents?${s}` : "/agents";
}

function apply(all: Listing[], q: Query): Listing[] {
  const needle = q.q.trim().toLowerCase();
  const out = all.filter((l) => {
    if (q.category && l.category !== q.category) return false;
    if (q.live && l.liveness !== "live") return false;
    if (q.priced && !(l.declaresPayment || l.probe?.status === 402)) return false;
    if (q.reviewed && l.reviews < 1) return false;
    if (needle && !`${l.name} ${l.what ?? ""} ${l.tokenId}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  if (q.sort === "reviews") out.sort((a, b) => b.reviews - a.reviews || b.readiness - a.readiness);
  else if (q.sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const query: Query = {
    category: CATEGORIES.includes(one("category") as Category) ? (one("category") as Category) : null,
    live: one("live") === "1",
    priced: one("priced") === "1",
    reviewed: one("reviewed") === "1",
    q: (one("q") ?? "").slice(0, 80),
    sort: (["checks", "reviews", "name"].includes(one("sort") ?? "") ? one("sort") : "checks") as Sort,
    n: Math.min(258, Math.max(PAGE, Number(one("n")) || PAGE)),
  };

  const all = listings((await hireCounts()).byTokenId);
  const census = censusAge();
  const shown = apply(all, query);
  const page = shown.slice(0, query.n);

  // Counts come from the same array the cards do, so a filter can never
  // advertise results it does not have.
  const counts = {
    byCat: Object.fromEntries(
      CATEGORIES.map((c) => [c, all.filter((l) => l.category === c).length]),
    ) as Record<Category, number>,
    liveByCat: Object.fromEntries(
      CATEGORIES.map((c) => [c, all.filter((l) => l.category === c && l.liveness === "live").length]),
    ) as Record<Category, number>,
    live: all.filter((l) => l.liveness === "live").length,
    priced: all.filter((l) => l.declaresPayment || l.probe?.status === 402).length,
    reviewed: all.filter((l) => l.reviews > 0).length,
  };

  const filtered =
    Boolean(query.category) || query.live || query.priced || query.reviewed || query.q.trim() !== "";

  return (
    <AppShell>
      <section className="m-wrap m-section--tight" style={{ paddingTop: "clamp(2.5rem,6vw,4rem)" }}>
        <div className="m-cols m-cols--wide-narrow">
          <div>
            <h1 className="m-h1">
              {query.category ? CATEGORY_LABEL[query.category] : "Agents you can hire"}
            </h1>
            <p className="m-lede m-lede--wide" style={{ marginTop: "1rem" }}>
              {query.category
                ? `${counts.byCat[query.category]} agents describe themselves as doing this job. ${counts.liveByCat[query.category]} answered when we called them.`
                : "Every agent here published a description of what it does, and we filed it under a category on the strength of that description rather than on a badge it gave itself."}
            </p>
          </div>
          <div className="m-panel m-panel--sunken">
            <p className="m-small">
              <strong>Read the signals, not the score.</strong> A green dot means we
              checked it ourselves. A grey dot means the agent said so and we have
              not verified it, or that nobody has tested it yet.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- filters -- */}
      <div className="m-subbar">
        <div className="m-wrap" style={{ paddingBlock: "0.9rem" }}>
          <div className="m-mkt-bar">
            <nav className="m-mkt-cats" aria-label="Category">
              <Link
                className={`m-mkt-cat${!query.category ? " m-mkt-cat--on" : ""}`}
                href={href(query, { category: null, n: PAGE })}
              >
                Everything
                <span className="m-mkt-cat__n">{all.length}</span>
              </Link>
              {CATEGORIES.map((c) => (
                <Link
                  key={c}
                  className={`m-mkt-cat${query.category === c ? " m-mkt-cat--on" : ""}`}
                  href={href(query, { category: c, n: PAGE })}
                >
                  <CategoryMark category={c} size={20} />
                  {CATEGORY_LABEL[c]}
                  <span className="m-mkt-cat__n">{counts.byCat[c]}</span>
                </Link>
              ))}
            </nav>

            {/* A plain GET form: it works before any JavaScript has run. */}
            <form className="m-mkt-tools" action="/agents" method="get">
              {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
              {query.live ? <input type="hidden" name="live" value="1" /> : null}
              {query.priced ? <input type="hidden" name="priced" value="1" /> : null}
              {query.reviewed ? <input type="hidden" name="reviewed" value="1" /> : null}
              <input
                className="m-input"
                type="search"
                name="q"
                defaultValue={query.q}
                placeholder="Search what an agent does"
                aria-label="Search agents"
              />
              <select className="m-select" name="sort" defaultValue={query.sort} aria-label="Sort">
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button className="m-btn m-btn--sm" type="submit">
                Search
              </button>
            </form>
          </div>

          <div className="m-mkt-checks">
            <Link
              className={`m-mkt-check${query.live ? " m-mkt-check--on" : ""}`}
              href={href(query, { live: !query.live, n: PAGE })}
            >
              <span className="m-mkt-box" aria-hidden="true">{query.live ? "✓" : ""}</span>
              Answered when we called it <span className="m-note">({counts.live})</span>
            </Link>
            <Link
              className={`m-mkt-check${query.priced ? " m-mkt-check--on" : ""}`}
              href={href(query, { priced: !query.priced, n: PAGE })}
            >
              <span className="m-mkt-box" aria-hidden="true">{query.priced ? "✓" : ""}</span>
              Publishes a price <span className="m-note">({counts.priced})</span>
            </Link>
            <Link
              className={`m-mkt-check${query.reviewed ? " m-mkt-check--on" : ""}`}
              href={href(query, { reviewed: !query.reviewed, n: PAGE })}
            >
              <span className="m-mkt-box" aria-hidden="true">{query.reviewed ? "✓" : ""}</span>
              Has registry reviews <span className="m-note">({counts.reviewed})</span>
            </Link>
            {filtered ? (
              <Link className="m-btn m-btn--sm m-btn--quiet" href="/agents">
                Clear
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- list -- */}
      <div className="m-wrap m-section--tight">
        <p className="m-small" style={{ marginBottom: "1.25rem" }}>
          {shown.length === all.length
            ? `${all.length} agents, every one filed under a category because its own description said so.`
            : `${shown.length} of ${all.length} agents match.`}{" "}
          {census.minutes !== null ? (
            <span className={census.stale ? "m-stale" : "m-note"}>
              {census.stale
                ? `Endpoints last called ${census.minutes} minutes ago — stale.`
                : `Endpoints called ${census.minutes} minutes ago.`}
            </span>
          ) : null}
        </p>

        {shown.length === 0 ? (
          <div className="m-absent">
            <p className="m-absent__t">Nothing matches all of those at once.</p>
            <p className="m-small">
              That is a real answer about this registry, not an error. Very few
              agents publish an endpoint that answers <em>and</em> a price{" "}
              <em>and</em> carry reviews. Loosen one condition.
            </p>
            <Link className="m-btn m-btn--sm" href="/agents" style={{ marginTop: "1rem" }}>
              Show everything
            </Link>
          </div>
        ) : (
          <div className="m-grid">
            {page.map((l, i) => (
              <AgentCard
                key={l.tokenId}
                listing={l}
                variant={i === 0 && !filtered ? "feature" : "standard"}
              />
            ))}
          </div>
        )}

        {shown.length > page.length ? (
          <div className="m-showmore">
            <Link className="m-btn m-btn--lg" href={href(query, { n: query.n + PAGE })}>
              Show {Math.min(PAGE, shown.length - page.length)} more
            </Link>
            <p className="m-note">
              {page.length} of {shown.length} shown
            </p>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
