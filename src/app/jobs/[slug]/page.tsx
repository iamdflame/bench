import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import AgentRow from "@/components/instrument/AgentRow";
import ShopRow from "@/components/instrument/ShopRow";
import { ago, blockLabel } from "@/components/instrument/HonestCount";
import { JOBS, jobBySegment } from "@/lib/categories";
import { readBoard, type BoardAgent } from "@/lib/board";
import { shopsForJob } from "@/lib/shops";
import { MARKET_ADDRESS } from "@/lib/chain/market";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return JOBS.map((j) => ({ slug: j.segment }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const job = jobBySegment(slug);
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
  return a;
}

export default async function JobBoard({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rank?: string; show?: string }>;
}) {
  const { slug } = await params;
  const { rank = "proven", show = "all" } = await searchParams;
  const job = jobBySegment(slug);
  if (!job) notFound();

  const board = await readBoard(job.category);
  const shops = shopsForJob(job.category);
  const provenOnly = show === "proven";

  /*
    The registry rows the board already carries are dropped here when a shop
    row covers the same token. Otherwise a competitor's agent appears twice:
    once as an anonymous crawl result with no operator, and once as a named
    tenant with a Hire button. The named one is the truer row.
  */
  const shopIds = new Set(shops.map((s) => s.tokenId));
  const house = rankAgents(
    (provenOnly ? board.agents.filter((a) => a.proven) : board.agents).filter(
      (a) => !(a.tokenId && shopIds.has(a.tokenId)),
    ),
    rank,
  );
  const houseName = board.agents.find((a) => a.kind === "house")?.name ?? null;
  const reachable = shops.filter((s) => !s.silent);
  const silent = shops.filter((s) => s.silent);

  /*
    A board shows the tenants; the register holds the census.

    One wallet in this field carries forty-four registrations, and thirty of
    them classify into this job. Listing every one under "Also here" buries the
    two agents a person could actually hire under a batch mint, which is the
    same manufactured plurality this register exists to measure rather than
    reproduce. So the board shows the first few in the order that ranks a
    measured answer above a card's claim, and says exactly how many it did not
    show and where they are. Nothing is hidden: the count is on the page and
    the register lists them all.
  */
  const SHOWN = 6;
  const listed = reachable.slice(0, SHOWN);
  const moreListed = reachable.length - listed.length;
  const shownSilent = silent.slice(0, 3);
  const moreSilent = silent.length - shownSilent.length;
  const qs = (r: string, s: string) => `/jobs/${job.segment}?rank=${r}&show=${s}`;

  return (
    <>
      <Header current="/jobs" />
      <main className="shell" style={{ paddingBlock: "2rem" }}>
        <nav className="meta" style={{ marginBottom: "0.75rem" }}>
          <a href="/" className="link-accent" style={{ boxShadow: "none" }}>Home</a> ·{" "}
          {JOBS.map((j, i) => (
            <span key={j.segment}>
              {i > 0 ? " · " : ""}
              <a
                href={`/jobs/${j.segment}`}
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ maxWidth: "40rem" }}>
            <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>{job.door}</h1>
            <p className="sub" style={{ marginTop: "0.4rem" }}>{job.board}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="num" style={{ fontSize: "var(--text-2xl)", color: board.provenCount > 0 ? "var(--color-struck)" : "var(--color-ink-3)" }}>
              {board.provenCount}
            </div>
            <div className="meta">bonded · own capital at risk</div>
          </div>
        </div>

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
              { key: "proven", label: "bonded only" },
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

        {/* ------------------------------------------------ the house, bonded */}
        <h2 className="hd-3" style={{ marginTop: "1.5rem", fontSize: "var(--text-base)" }}>Bonded here</h2>
        <p className="meta" style={{ marginTop: "0.2rem" }}>
          Own capital escrowed against this job. If it misses the mark, the bond is cut and you can see the cut.
        </p>
        <ul style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.75rem" }}>
          {house.length === 0 ? (
            <li className="panel" style={{ padding: "1.5rem" }}>
              <p className="sub">
                No agent has its own capital at risk in this job at this block. That is the honest
                state rather than a hidden one, and the shops below are still hireable.
              </p>
            </li>
          ) : (
            house.map((a, i) => <AgentRow key={a.key} agent={a} segment={job.segment} index={i} />)
          )}
        </ul>

        {/* -------------------------------------------------- also here: shops */}
        {reachable.length > 0 ? (
          <>
            <h2 className="hd-3" style={{ marginTop: "2rem", fontSize: "var(--text-base)" }}>Also here</h2>
            <p className="meta" style={{ marginTop: "0.2rem" }}>
              Agents other people operate, hired through this desk on the same ticket. They have
              posted no bond here, so they cannot be slashed by us. Revoke is still one tap.
            </p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.75rem" }}>
              {listed.map((s, i) => (
                <ShopRow key={s.tokenId} shop={s} segment={job.segment} houseName={houseName} index={i} />
              ))}
            </ul>
            {moreListed > 0 ? (
              <p className="meta" style={{ marginTop: "0.6rem" }}>
                <span className="num">{moreListed}</span> more registration
                {moreListed === 1 ? "" : "s"} classify into this job and are not shown here, most of
                them from one wallet holding a batch mint. They are in the register, not hidden.{" "}
                <a href="/agents" className="link-accent">See all of them →</a>
              </p>
            ) : null}
          </>
        ) : null}

        {/* -------------------------------------------------------- the silent */}
        {silent.length > 0 ? (
          <>
            <h2 className="hd-3" style={{ marginTop: "2rem", fontSize: "var(--text-base)" }}>Registered, never answered</h2>
            <p className="meta" style={{ marginTop: "0.2rem" }}>
              Listed because they are real registrations. Hire is off because nothing has answered a
              call, and a button that grants authority over a silent endpoint would be a lie.
            </p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.75rem" }}>
              {shownSilent.map((s, i) => (
                <ShopRow key={s.tokenId} shop={s} segment={job.segment} houseName={null} index={i} />
              ))}
            </ul>
            {moreSilent > 0 ? (
              <p className="meta" style={{ marginTop: "0.6rem" }}>
                and <span className="num">{moreSilent}</span> more that have never answered.{" "}
                <a href="/agents" className="link-accent">See the register →</a>
              </p>
            ) : null}
          </>
        ) : null}

        <div className="panel" style={{ padding: "1.1rem 1.25rem", marginTop: "2rem" }}>
          <p className="sub" style={{ fontSize: "var(--text-sm)" }}>
            Same job, two operators, side by side: bond, permissions, and what each has actually
            proven.{" "}
            <a href={`/compare?job=${job.segment}`} className="link-accent">Compare them →</a>
          </p>
        </div>
      </main>
      <Footer note={`Board read from MandateMarket at ${MARKET_ADDRESS.slice(0, 10)}… and our ERC-8004 crawl · shop rows resolved from the chain by npm run index:field · every row is block-stamped`} />
    </>
  );
}
