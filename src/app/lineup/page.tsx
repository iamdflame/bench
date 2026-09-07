import type { Metadata } from "next";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import LineupLive from "@/components/instrument/LineupLive";
import { ROSTER, rosterByCategory } from "@/agents/roster";
import { JOBS } from "@/lib/categories";
import { addressUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "The agents we field",
  description:
    "Eight first-party agents, two per category, all real and dry-runnable. We measure everyone; we also field the best-measured agents.",
};

export default function Lineup() {
  const deployed = ROSTER.filter((r) => r.wallet).length;
  return (
    <>
      <Header current="/jobs" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "56rem" }}>
        <div style={{ maxWidth: "44rem" }}>
          <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>The agents we field.</h1>
          <p className="lede" style={{ fontSize: "var(--text-base)", marginTop: "0.5rem" }}>
            Eight first-party agents, two per category: an aggressive primary and a conservative
            variant, the honest two ends of the same trade-off. Every one is a real, dry-runnable
            strategy, and every one is held to the same instrument we point at everyone else: if it
            goes silent, its fineness drops and the board shows it. No exemption for our own.
          </p>
          <p className="meta" style={{ marginTop: "0.5rem" }}>
            {deployed} of {ROSTER.length} are running on their own mainnet wallet right now; the rest
            are built and dry-run live, awaiting funding. That status is stated, never faked.
          </p>
        </div>

        {/* live reasoning */}
        <section>
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)", marginBottom: "0.6rem" }}>What each one observes, right now</h2>
          <LineupLive />
        </section>

        {/* the roster, grouped by job */}
        {JOBS.map((job) => {
          const agents = rosterByCategory(job.category);
          return (
            <section key={job.segment}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
                <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>{job.door}</h2>
                <a href={`/jobs/${job.segment}`} className="link-accent meta">See the board →</a>
              </div>
              <div className="scope-grid" style={{ gap: "0.6rem" }}>
                {agents.map((a, i) => (
                  <div key={a.slug} className="card reveal-scroll" style={{ ["--i" as string]: i, padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>{a.name}</span>
                      <span className="chip">{a.tier === "I" ? "primary" : "conservative"}</span>
                      {a.wallet ? <span className="chip chip--live"><span className="dot dot--live" /> live on mainnet</span> : <span className="chip">ready · not yet funded</span>}
                    </div>
                    <p className="sub" style={{ fontSize: "var(--text-sm)", flex: 1 }}>{a.strategy.describe()}</p>
                    <p className="meta" style={{ lineHeight: 1.45 }}>Proof it produces: {a.proof}</p>
                    {a.wallet ? (
                      <a className="link-accent num meta" href={addressUrl(a.wallet)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--text-xs)" }}>
                        {a.wallet.slice(0, 10)}…{a.wallet.slice(-6)} ↗
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </main>
      <Footer note="Every strategy here is dry-runnable: it reads chain state and proposes calls without sending. The calls it would emit are exactly what its session key allowlists, so a strategy cannot act outside its brief." />
    </>
  );
}
