import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import AgentRow from "@/components/instrument/AgentRow";
import { ago, blockLabel } from "@/components/instrument/HonestCount";
import { JOBS, jobBySegment } from "@/lib/categories";
import { readBoard, type BoardAgent } from "@/lib/board";
import { MARKET_ADDRESS } from "@/lib/chain/market";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return JOBS.map((j) => ({ category: j.segment }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const job = jobBySegment(category);
  if (!job) return { title: "Hire an agent" };
  return { title: `${job.door} · hire an assayed agent`, description: job.board };
}

const RANKS = [
  { key: "proven", label: "proven" },
  { key: "fineness", label: "fineness" },
  { key: "alpha", label: "alpha" },
] as const;

function rankAgents(agents: BoardAgent[], rank: string): BoardAgent[] {
  const a = [...agents];
  if (rank === "fineness") {
    a.sort((x, y) => (y.fineness ?? -1) - (x.fineness ?? -1) || Number(y.proven) - Number(x.proven));
  } else if (rank === "alpha") {
    const val = (s: string | null) => (s ? parseFloat(s.replace("%", "")) : -Infinity);
    a.sort((x, y) => val(y.alpha) - val(x.alpha) || Number(y.proven) - Number(x.proven));
  }
  // "proven" is the board's native order, already applied.
  return a;
}

export default async function HireBoard({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ rank?: string; show?: string }>;
}) {
  const { category } = await params;
  const { rank = "proven", show = "all" } = await searchParams;
  const job = jobBySegment(category);
  if (!job) notFound();

  const board = await readBoard(job.category);
  const provenOnly = show === "proven";
  const agents = rankAgents(
    provenOnly ? board.agents.filter((a) => a.proven) : board.agents,
    rank,
  );
  const qs = (r: string, s: string) => `/hire/${job.segment}?rank=${r}&show=${s}`;

  return (
    <>
      <Header current="/hire/health" />
      <main className="shell" style={{ paddingBlock: "2rem" }}>
        {/* breadcrumb / doors */}
        <nav className="meta" style={{ marginBottom: "0.75rem" }}>
          <a href="/" className="link-accent" style={{ boxShadow: "none" }}>Home</a> ·{" "}
          {JOBS.map((j, i) => (
            <span key={j.segment}>
              {i > 0 ? " · " : ""}
              <a
                href={`/hire/${j.segment}`}
                style={{ color: j.segment === job.segment ? "var(--color-touchstone)" : "var(--color-ink-3)", fontWeight: j.segment === job.segment ? 500 : 400 }}
              >
                {j.door}
              </a>
            </span>
          ))}
        </nav>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ maxWidth: "40rem" }}>
            <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>{job.door}</h1>
            <p className="sub" style={{ marginTop: "0.4rem" }}>{job.board}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="num" style={{ fontSize: "var(--text-2xl)", color: board.provenCount > 0 ? "var(--color-struck)" : "var(--color-ink-3)" }}>
              {board.provenCount}
            </div>
            <div className="meta">proven · own capital at risk</div>
          </div>
        </div>

        {/* rank controls, JS-free: each is a link that re-reads at the block */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <span className="meta">Rank by</span>
            {RANKS.map((r) => (
              <a
                key={r.key}
                href={qs(r.key, show)}
                className="chip"
                style={{
                  background: rank === r.key ? "var(--color-assay-wash)" : undefined,
                  borderColor: rank === r.key ? "color-mix(in srgb, var(--color-assay) 30%, white)" : undefined,
                  color: rank === r.key ? "var(--color-assay-ink)" : undefined,
                }}
              >
                {r.label}
              </a>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <span className="meta">Show</span>
            {[
              { key: "all", label: "everyone" },
              { key: "proven", label: "proven only" },
            ].map((s) => (
              <a
                key={s.key}
                href={qs(rank, s.key)}
                className="chip"
                style={{
                  background: show === s.key ? "var(--color-assay-wash)" : undefined,
                  borderColor: show === s.key ? "color-mix(in srgb, var(--color-assay) 30%, white)" : undefined,
                  color: show === s.key ? "var(--color-assay-ink)" : undefined,
                }}
              >
                {s.label}
              </a>
            ))}
          </div>
          <span className="meta" style={{ marginLeft: "auto" }}>
            {blockLabel(board.block) ? `${blockLabel(board.block)} · ` : ""}read {ago(board.at)}
          </span>
        </div>

        {board.unread.length ? (
          <p className="meta" style={{ marginTop: "0.5rem", color: "var(--color-fail)" }}>
            {board.unread.join(", ")} could not be read this block. Not counted, not guessed at.
          </p>
        ) : null}

        <ul style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "1.25rem" }}>
          {agents.length === 0 ? (
            <li className="panel" style={{ padding: "1.5rem" }}>
              <p className="sub">
                {provenOnly
                  ? "No agent has its own capital at risk in this office yet. Filtered to proven, the board is empty, and that is the honest state rather than a hidden one."
                  : "No agent is fielded for this job at this block. That is the honest state: the registry has entries our crawl classified here, but none has cleared enough of the assay to be worth putting your capital behind yet."}
              </p>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
                {provenOnly ? <a href={qs(rank, "all")} className="btn btn--primary">Show everyone</a> : null}
                <a href="/registry" className="btn">See the whole registry →</a>
              </div>
            </li>
          ) : (
            agents.map((a, i) => <AgentRow key={a.key} agent={a} segment={job.segment} index={i} />)
          )}
        </ul>
      </main>
      <Footer note={`Board read from MandateMarket at ${MARKET_ADDRESS.slice(0, 10)}… and our ERC-8004 crawl · every row is a current, block-stamped reading`} />
    </>
  );
}
