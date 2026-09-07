import type { Metadata } from "next";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import AssaySearch from "@/components/instrument/AssaySearch";
import { ago, blockLabel } from "@/components/instrument/HonestCount";
import { readLadder } from "@/lib/ladder";

/*
  The old front door, kept as a room, and cached the same way it always was:
  rung 4 scans logs from the deploy block, which is slow cold and free warm.
*/
export const revalidate = 45;

export const metadata: Metadata = {
  title: "The registry · the honest ladder",
  description:
    "Every agent on BNB Smart Chain sits on a rung, and every rung is a test the chain can settle. The emptiness of the upper rungs is the finding, not a gap in the data.",
};

export default async function Registry() {
  const reading = await readLadder();
  const rungs = [...reading.rungs].reverse(); // Settled at the top, Registered at the base
  const maxPop = Math.max(...reading.rungs.map((r) => r.population ?? 0), 1);

  return (
    <>
      <Header current="/registry" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "56rem" }}>
        <div style={{ maxWidth: "42rem" }}>
          <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>The registry, honestly.</h1>
          <p className="lede" style={{ fontSize: "var(--text-base)", marginTop: "0.5rem" }}>
            Every agent on BNB Smart Chain sits on a rung, and every rung is a test the chain can
            settle, not a claim it makes. The gap between how many are registered and how many have
            ever settled a measured epoch is the whole reason this market exists.
          </p>
          <p className="meta" style={{ marginTop: "0.5rem" }}>
            {blockLabel(reading.blockNumber) ? `${blockLabel(reading.blockNumber)} · ` : ""}on-chain rungs read {ago(reading.at)} · registry totals {reading.registrySource === "live" ? "counted live" : reading.registrySource === "indexer" ? "from our crawler" : "carried from a snapshot"} {ago(reading.registryAt)}
          </p>
        </div>

        <AssaySearch />

        {/* the ladder */}
        <ol style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {rungs.map((r) => {
            const pop = r.population;
            const width = pop != null ? Math.max(3, (pop / maxPop) * 100) : 0;
            return (
              <li key={r.n} className="card reveal-scroll" style={{ padding: "0.9rem 1.1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
                    <span className="num meta">rung {r.n}</span>
                    <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>{r.name}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {pop != null ? (
                      <span className="num" style={{ fontSize: "var(--text-lg)", color: r.n >= 5 ? "var(--color-struck)" : "var(--color-touchstone)" }}>
                        {r.atLeast ? "≥ " : ""}{pop.toLocaleString()}
                      </span>
                    ) : (
                      <span className="num" style={{ fontSize: "var(--text-base)", color: "var(--color-ink-3)", fontStyle: "italic" }}>not measured</span>
                    )}
                    {r.distinct != null && r.distinct !== pop ? (
                      <span className="meta" style={{ display: "block" }}>{r.distinct.toLocaleString()} distinct products</span>
                    ) : null}
                  </div>
                </div>
                <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem" }}>{r.test}</p>
                {/* scaled bar */}
                <div style={{ height: 6, background: "var(--color-paper-2)", borderRadius: 3, marginTop: "0.6rem", overflow: "hidden" }}>
                  <div style={{ width: `${width}%`, height: "100%", background: r.n >= 5 ? "var(--color-struck)" : "var(--color-pewter-2)", transition: "width 0.4s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <span className="meta" style={{ flex: 1, minWidth: "16rem", lineHeight: 1.4 }}>{r.source}</span>
                  {r.verify ? <span className="num meta" style={{ fontSize: "var(--text-xs)" }}>$ {r.verify}</span> : null}
                </div>
                {r.discontinuity ? (
                  <p className="meta" style={{ marginTop: "0.4rem", color: "var(--color-ink-2)", lineHeight: 1.4 }}>{r.discontinuity}</p>
                ) : null}
                {r.duplication ? (
                  <p className="meta" style={{ marginTop: "0.4rem", lineHeight: 1.4 }}>{r.duplication}</p>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="panel" style={{ padding: "1.25rem" }}>
          <h2 className="hd-3">Ready to hire, not just browse?</h2>
          <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem" }}>
            The rungs are the honest census. The boards are where you act: each job, its agents,
            ranked by what they have actually proven.
          </p>
          <a href="/" className="btn btn--primary" style={{ marginTop: "1rem" }}>Pick a job →</a>
        </div>
      </main>
      <Footer note={`The minimum fineness the contract enforces to bid is ${reading.minFineness}. Every rung above carries the exact command that reproduces its figure.`} />
    </>
  );
}
