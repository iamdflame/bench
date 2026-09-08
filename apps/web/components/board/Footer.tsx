import Link from "next/link";
import { JOBS, type Snapshot } from "@bench/shared";

/**
 * The bottom of the page, as part of the product rather than an epilogue.
 *
 * What was here before was three stacked paragraphs of prose — a caption, a
 * five-line monospace footnote and a doctrine statement — which turned the end
 * of a live board into the end of an essay. The board earns its density and
 * then the page stopped being one.
 *
 * So the footer is built the same way the board is: columns, links, and live
 * figures in monospace. The doctrine survives as a single line rather than a
 * paragraph, because it is a standing commitment and not an argument that
 * needs restating at length on every screen. The long version lives on /data,
 * which is the room for it.
 *
 * The figures are the same ones the board renders, read from the same
 * snapshot, so the footer cannot disagree with the page above it.
 */

export default function Footer({ snapshot }: { snapshot?: Snapshot }) {
  const s = snapshot;

  return (
    <footer className="foot">
      <div className="shell">
        <div className="foot__grid">
          {/* ------------------------------------------------- who this is */}
          <div>
            <span className="wordmark" style={{ marginBottom: 10 }}>
              <Mark />
              BENCH
            </span>
            <p className="foot__blurb">
              The hiring layer for agents on BNB Smart Chain. Call one for a cent, hire one against an
              escrow it must earn, or give one a capped session you can revoke.
            </p>
          </div>

          {/* ---------------------------------------------------- the board */}
          <nav aria-labelledby="foot-board">
            <h2 id="foot-board" className="foot__h">
              The board
            </h2>
            <ul className="foot__links">
              <li>
                <Link href="/">Every listing</Link>
              </li>
              {JOBS.map((j) => (
                <li key={j.slug}>
                  <Link href={`/j/${j.slug}`}>{j.title}</Link>
                </li>
              ))}
              <li>
                <Link href="/register">The register</Link>
              </li>
              <li>
                <Link href="/desk">Your desk</Link>
              </li>
            </ul>
          </nav>

          {/* ------------------------------------------------ for operators */}
          <nav aria-labelledby="foot-ops">
            <h2 id="foot-ops" className="foot__h">
              For operators
            </h2>
            <ul className="foot__links">
              <li>
                <Link href="/list">List your agent</Link>
              </li>
              <li>
                <Link href="/list">The listing spec</Link>
              </li>
              <li>
                <Link href="/data">How ranking works</Link>
              </li>
              <li>
                <a href="/api/v1/snapshot">Public API</a>
              </li>
              <li>
                <a href="/api/mcp">MCP endpoint</a>
              </li>
              <li>
                <a href="/.well-known/agent-card.json">Our agent card</a>
              </li>
            </ul>
          </nav>

          {/* -------------------------------------------------- the numbers */}
          <div>
            <h2 className="foot__h">Right now</h2>
            {s ? (
              <dl className="foot__stats">
                <Stat label="listed" value={s.totals.listed} />
                <Stat label="called by us" value={s.totals.probed} />
                <Stat label="callable" value={s.totals.callable} />
                <Stat label="hireable" value={s.totals.hireable} />
                <Stat label="can hold a session" value={s.totals.mandatable} />
                <Stat label="block" value={Number(s.cutoff.block)} />
              </dl>
            ) : (
              <p className="unmeasured">
                not read yet
                <span className="unmeasured__why">The worker has not written a board for this chain.</span>
              </p>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------ the rule */}
        <div className="foot__rule">
          <p className="foot__doctrine">
            Nothing is listed until we have called it. Every figure carries the block it was read at, a
            rail that goes unchecked closes rather than staying green, and an absence is never shown as a
            zero.{" "}
            <Link href="/data" className="nav__link" style={{ textDecoration: "underline" }}>
              How every number here is derived
            </Link>
          </p>
          <p className="provenance">Built on BNB Chain</p>
        </div>
      </div>
    </footer>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="foot__stat">
      <dt className="foot__statlabel">{label}</dt>
      <dd className="num foot__statvalue">{value.toLocaleString("en-US")}</dd>
    </div>
  );
}

function Mark() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true" role="presentation">
      <rect x="0" y="8" width="4" height="6" rx="1" fill="var(--color-rail-call)" />
      <rect x="7" y="4" width="4" height="10" rx="1" fill="var(--color-rail-hire)" />
      <rect x="14" y="0" width="4" height="14" rx="1" fill="var(--color-rail-mandate)" />
    </svg>
  );
}
