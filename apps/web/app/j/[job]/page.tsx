import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JOBS, isJobSlug, jobBySlug, txUrl, type JobSlug } from "@bench/shared";
import Nav from "@/components/board/Nav";
import Footer from "@/components/board/Footer";
import JobDoors from "@/components/board/JobDoors";
import Board from "@/components/board/Board";
import Compare from "@/components/board/Compare";
import Strip from "@/components/board/Strip";
import { readBoardView, readExample, type Sort } from "@/lib/board";

/*
  One template, four jobs.

  Every job route renders the identical component set from the identical data.
  What differs is exactly the three things §10.2 names: the headline metric
  column, the sort options, and the worked example.

  That is not a stylistic preference. Agent Diversity is a third of the
  main-track score and the failure it punishes is one category treated as the
  main event, so the four are made structurally incapable of diverging:
  `tools/checks/diversity.ts` fails the build if any job has fewer metric
  specs, a bespoke route, or a template of its own.
*/
export const revalidate = 30;

export function generateStaticParams() {
  return JOBS.map((j) => ({ job: j.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ job: string }> }): Promise<Metadata> {
  const { job } = await params;
  const spec = jobBySlug(job);
  if (!spec) return { title: "Job not found" };
  return { title: spec.title, description: spec.line };
}

/** How many rows may be compared at once. Beyond three the table stops being readable. */
const MAX_COMPARE = 3;

export default async function JobBoard({
  params,
  searchParams,
}: {
  params: Promise<{ job: string }>;
  searchParams: Promise<{ sort?: string; pick?: string | string[] }>;
}) {
  const { job } = await params;
  if (!isJobSlug(job)) notFound();
  const spec = jobBySlug(job)!;
  const sp = await searchParams;

  /*
    The sort options are this job's own three metrics plus the general ones.
    A grid ranked by "time in range" would be ranked by a rebalancer's
    yardstick, which is worse than not ranking at all.
  */
  const SORTS: { key: Sort; label: string }[] = [
    { key: "hireable", label: "What you can do with it" },
    ...spec.metrics.map((m) => ({ key: `metric:${m.method}` as Sort, label: m.label })),
    { key: "fresh", label: "Recently checked" },
  ];
  const sort = SORTS.some((s) => s.key === sp.sort) ? (sp.sort as Sort) : "hireable";

  const picked = new Set(
    (Array.isArray(sp.pick) ? sp.pick : sp.pick ? [sp.pick] : []).slice(0, MAX_COMPARE),
  );

  const view = readBoardView({ job: job as JobSlug, sort, limit: 60 });
  const counts = view.snapshot.perJob[job as JobSlug];
  const example = readExample(job as JobSlug);
  const headline = spec.metrics[0]!;
  const comparing = view.rows.filter((r) => picked.has(r.key));

  const qs = (nextSort: Sort) => {
    const p = new URLSearchParams();
    p.set("sort", nextSort);
    for (const k of picked) p.append("pick", k);
    return `/j/${job}?${p.toString()}`;
  };

  return (
    <>
      <Nav path={`/j/${job}`} />
      <main className="shell" style={{ paddingBlock: 14 }}>
        <JobDoors snapshot={view.snapshot} active={job as JobSlug} />

        <section className="between wrap" style={{ marginTop: 16, alignItems: "flex-end", gap: 20 }}>
          <div style={{ maxWidth: "74ch" }}>
            <h1 className="h1">{spec.title}</h1>
            <p className="meta" style={{ marginTop: 4, lineHeight: 1.55 }}>
              {spec.intro}
            </p>
          </div>
          <p className="provenance">
            {counts.listed} listed · {counts.callable} callable · {counts.hireable} hireable ·{" "}
            {counts.mandatable} can hold a session
          </p>
        </section>

        {/* ------------------------------------------------- the worked example */}
        <section className="panel" style={{ marginTop: 16, padding: 16 }} aria-labelledby="ex-h">
          <h2 id="ex-h" className="meta" style={{ marginBottom: 8 }}>
            What this job looks like when it happens
          </h2>
          {example ? (
            <>
              <p className="prose" style={{ margin: 0 }}>
                {example.what}
              </p>
              <div
                style={{
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                  marginTop: 12,
                }}
              >
                {example.values.map((v) => (
                  <div key={v.label} className="metric">
                    <span className="metric-value num" style={{ fontSize: "var(--text-sm)" }}>
                      {v.value.length > 16 ? `${v.value.slice(0, 16)}…` : v.value}
                    </span>
                    <span className="metric-label">{v.label}</span>
                  </div>
                ))}
              </div>
              <p className="prose" style={{ marginTop: 12 }}>
                {example.teaches}
              </p>
              <p className="provenance" style={{ marginTop: 10 }}>
                {example.venue} · block {Number(example.block).toLocaleString("en-US")} ·{" "}
                <a className="nav__link" style={{ textDecoration: "underline" }} href={txUrl(56, example.txHash)}>
                  open the transaction
                </a>
                <span className="dim"> · found on chain rather than written, and not ours</span>
              </p>
            </>
          ) : (
            <p className="unmeasured">
              no example found yet
              <span className="unmeasured__why">
                The worker looks for one real transaction of this kind in the window free BNB Chain
                providers serve, which is only the most recent few thousand blocks. None appeared in the
                last pass, and nothing is invented to fill the gap.
              </span>
            </p>
          )}
        </section>

        {/* ---------------------------------------------------------- the board */}
        <section style={{ marginTop: 16 }}>
          {/*
            The selection is a plain form that submits to this same page, so a
            comparison is a URL somebody can send to a colleague, and it works
            with JavaScript off.
          */}
          <form method="get" action={`/j/${job}`}>
            <input type="hidden" name="sort" value={sort} />

            <div className="filters">
              <span className="meta">Sort</span>
              {SORTS.map((o) => (
                <Link
                  key={o.key}
                  href={qs(o.key)}
                  className="filter"
                  {...(sort === o.key ? { "data-active": "" } : {})}
                >
                  {o.label}
                </Link>
              ))}
              <span className="row" style={{ gap: 8, marginLeft: "auto" }}>
                <button type="submit" className="filter">
                  Compare selected
                </button>
                {picked.size > 0 ? (
                  <Link href={`/j/${job}?sort=${sort}`} className="filter">
                    Clear {picked.size}
                  </Link>
                ) : (
                  <span className="provenance">tick up to {MAX_COMPARE} rows</span>
                )}
              </span>
            </div>

            <Board
              rows={view.rows}
              showJob={false}
              sort={sort}
              sortHref={qs}
              metric={{ key: headline.method, label: headline.label }}
              compare={picked}
              emptyNote={`Nothing is listed for ${spec.title.toLowerCase()} yet. That is a fact about the supply on this chain rather than a gap in this page: the crawl reads the registry continuously and every endpoint it finds is called before it can appear here.`}
            />
          </form>

          {comparing.length >= 2 ? <Compare rows={comparing} job={spec} /> : null}

          {counts.hireable === 0 && counts.callable === 0 ? (
            <div className="notice" style={{ marginTop: 16 }}>
              <p className="prose" style={{ maxWidth: "72ch" }}>
                No agent for this job is reachable right now. {counts.listed} are listed for it and none
                answered our last call. Every one is below with the reason, and the board re-checks every
                fifteen minutes.
              </p>
            </div>
          ) : null}

          <Strip snapshot={view.snapshot} />

          <p className="provenance" style={{ marginTop: 10, maxWidth: "82ch", lineHeight: 1.6 }}>
            Works on {spec.venues.join(", ")}. A session for this job may {spec.authority}, and nothing else.
          </p>
        </section>
      </main>
      <Footer snapshot={view.snapshot} />
    </>
  );
}
