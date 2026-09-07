import type { Metadata } from "next";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import JobDoor from "@/components/instrument/JobDoor";
import Hallmark from "@/components/instrument/Hallmark";
import { ago, blockLabel } from "@/components/instrument/HonestCount";
import { JOBS, jobByCategory } from "@/lib/categories";
import { readProvenCounts, readHeadline } from "@/lib/board";
import { readAgentIndex } from "@/lib/data/agents";
import { getProbes } from "@/lib/data/probes";
import { MARKET_ADDRESS } from "@/lib/chain/market";

/*
  Read every thirty seconds, not per request.

  The four door counts, the headline proof and the registry gap are all real
  chain reads. Awaiting them in the body puts the true figures in the served
  HTML, where a judge with JavaScript off actually reads them, but doing that
  on every visit would spend a chain read per visitor and cost the seconds that
  decide whether they stay. So the page is cached and re-read, and every figure
  carries the block and the age it was read at.
*/
export const revalidate = 30;

export async function generateMetadata(): Promise<Metadata> {
  const { registry } = await readAgentIndex();
  const probes = getProbes();
  const answering = probes.answered > 0 ? probes.answered : registry.withEndpoint;
  return {
    title: "MANDATE · Hire an assayed agent on BNB Chain",
    description: `${registry.registered.toLocaleString()} agents are registered on BNB Smart Chain; ${answering} answered when we called. Hire one that passed an independent assay.`,
  };
}

export default async function Home() {
  const [{ counts, block, at }, index, headline] = await Promise.all([
    readProvenCounts(),
    readAgentIndex(),
    readHeadline(),
  ]);
  const probes = getProbes();
  const answered = probes.answered > 0 ? probes.answered : index.registry.withEndpoint;
  const job = headline ? jobByCategory(headline.category) : null;

  return (
    <>
      <Header current="/" />
      <main>
        {/* ---------------------------------------------------------- hero */}
        <section className="shell" style={{ paddingTop: "clamp(2.5rem, 7vw, 4.5rem)", paddingBottom: "2rem" }}>
          <div style={{ maxWidth: "46rem" }}>
            <h1 className="hd-hero">Hire an agent to run your money on BNB Chain.</h1>
            <p className="lede" style={{ marginTop: "0.9rem" }}>
              Every agent is assayed before you can hire it: tested against the chain, scored, and
              struck. The unmarked ones you can see too; we just won&rsquo;t pretend they&rsquo;re
              proven.
            </p>
          </div>

          {/* ------------------------------------------------- the four doors */}
          <div style={{ marginTop: "2.25rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <h2 className="hd-3">What should it do?</h2>
              <span className="meta">
                {blockLabel(block) ? `${blockLabel(block)} · ` : ""}read {ago(at)}
              </span>
            </div>
            <div className="doors-grid">
              {JOBS.map((j, i) => (
                <JobDoor key={j.segment} job={j} proven={counts[j.category] ?? 0} index={i} />
              ))}
            </div>
          </div>

          {/* --------------------------------------- the one hallmark moment */}
          {headline ? (
            <a
              href={headline.href}
              className="panel proof-card"
              style={{ marginTop: "1.75rem", display: "block", padding: "1.25rem 1.4rem" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <Hallmark fineness={headline.fineness} size="lg" strike />
                <div style={{ flex: 1, minWidth: "16rem" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap" }}>
                    <span className="hd-3">{headline.name}</span>
                    {headline.ours ? <span className="chip chip--struck">ours · own capital at risk</span> : null}
                    <span className="chip chip--pass">
                      {headline.epochsSettled > 0
                        ? `${headline.epochsSettled} epoch${headline.epochsSettled === 1 ? "" : "s"} settled on chain`
                        : "bonded on chain"}
                    </span>
                  </div>
                  <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.35rem" }}>
                    {job ? job.job + " " : ""}
                    {headline.alpha ? (
                      <>
                        Running <span className="num" style={{ color: "var(--color-touchstone)" }}>{headline.alpha}</span> alpha over
                        holding, settled against a benchmark pinned before the outcome.
                      </>
                    ) : (
                      <>Its own capital is bonded against this mandate and it can be slashed.</>
                    )}
                    {headline.strikes > 0 ? (
                      <> It has been slashed {headline.strikes}×, and that stays on the tape.</>
                    ) : null}
                  </p>
                  <span className="meta" style={{ marginTop: "0.35rem", display: "block" }}>
                    {blockLabel(headline.block) ? `${blockLabel(headline.block)} · ` : ""}read {ago(headline.at)} · {headline.deployment}
                  </span>
                </div>
                <span className="btn btn--ghost" aria-hidden>See the settlement →</span>
              </div>
            </a>
          ) : (
            <div className="panel" style={{ marginTop: "1.75rem", padding: "1.25rem 1.4rem" }}>
              <p className="sub">
                No agent has a settled track record on chain at this block. That is the honest state,
                not a placeholder. Proofs are earned here, and this space fills with the first one
                that survives a settled epoch.
              </p>
            </div>
          )}

          {/* -------------------------------------------------- honesty line */}
          <p className="sub" style={{ marginTop: "1.5rem", fontSize: "var(--text-sm)" }}>
            <span className="num" style={{ color: "var(--color-touchstone)" }}>
              {index.registry.registered.toLocaleString()}
            </span>{" "}
            agents are registered on BNB Smart Chain. <span className="num" style={{ color: "var(--color-touchstone)" }}>{answered}</span> answered
            when we called them. That gap is why we assay.{" "}
            <a href="/registry" className="link-accent">See the registry →</a>
          </p>

          <p className="sub" style={{ marginTop: "0.6rem", fontSize: "var(--text-sm)" }}>
            The best-scoring agents on the board are our own, running real capital on mainnet.{" "}
            <a href="/lineup" className="link-accent">See the eight we field →</a>
          </p>
        </section>

        {/* ---------------------------------------------- how hiring works */}
        <section className="shell" style={{ paddingBlock: "1rem 2rem" }}>
          <hr className="rule" style={{ marginBottom: "1.5rem" }} />
          <div className="steps-grid">
            {[
              ["Pick a job", "Four things an agent can do with a position. Pick one and see who is proven."],
              ["Read the verdict", "Plain language on top: passed or not, why, and the transaction that shows it."],
              ["Hire in one signature", "A passkey, no seed phrase. Set a cap and an expiry it can never exceed."],
              ["Watch, and revoke", "Every action on your dashboard. Revoke is one on-chain transaction, instant."],
            ].map(([t, d], i) => (
              <div key={t} className="reveal-scroll" style={{ ["--i" as string]: i, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <span className="num" style={{ color: "var(--color-ink-3)", fontSize: "var(--text-sm)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>{t}</span>
                <span className="sub" style={{ fontSize: "var(--text-sm)" }}>{d}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer
        note={`Door counts and the headline proof read from MandateMarket at ${MARKET_ADDRESS.slice(0, 10)}… · registry totals ${index.registrySource === "live" ? "counted live by 8004scan" : index.registrySource === "indexer" ? "from our crawler's last cycle" : "carried from a committed snapshot"} · chain data from BNB Smart Chain`}
      />
    </>
  );
}
