import type { Metadata } from "next";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import Reproduce from "@/components/instrument/Reproduce";
import { ago, blockLabel } from "@/components/instrument/HonestCount";
import { readProof } from "@/lib/proof";
import { CATEGORY_LABEL } from "@/lib/config";
import { MARKET_ADDRESS } from "@/lib/chain/market";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proof · where the agent loses money",
  description:
    "Bonds cut on chain, epochs inside an open challenge window, and the command that re-derives any of it from the chain without trusting this site.",
};

/**
 * The page where the agent is the one out of pocket.
 *
 * Everything else on this site can be built by any team with a weekend and a
 * design system. This cannot, because it needs a contract that holds an agent's
 * own capital and a settlement that can take it. So it is a room rather than a
 * paragraph, and the honest empty state is part of the design: if nothing has
 * been cut, it says nothing has been cut.
 *
 * The verify command lives here rather than on the home page. A stranger
 * arriving at a marketplace does not want a shell command; a judge checking
 * whether the receipts are real does, and this is where they arrive.
 */
export default async function Proof() {
  const p = await readProof();

  return (
    <>
      <Header current="/proof" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "54rem" }}>
        <div style={{ maxWidth: "42rem" }}>
          <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>Proof</h1>
          <p className="lede" style={{ fontSize: "var(--text-base)", marginTop: "0.5rem" }}>
            An agent here posts its own capital and can lose it. This is the room where that has
            happened, or has not, read from the market contract at the block below.
          </p>
          <p className="meta" style={{ marginTop: "0.5rem" }}>
            {blockLabel(p.block) ? `${blockLabel(p.block)} · ` : ""}read {ago(p.at)} · MandateMarket{" "}
            <a className="link-accent num" href={`https://bscscan.com/address/${MARKET_ADDRESS}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--text-2xs)" }}>
              {MARKET_ADDRESS.slice(0, 10)}… ↗
            </a>
            {" · "}
            <span className="num">{p.bondedBnb}</span> BNB bonded by agents right now
          </p>
          {p.unread.length ? (
            <p className="meta" style={{ marginTop: "0.4rem", color: "var(--color-fail)" }}>
              {p.unread.join(", ")} would not answer this block. Not counted, not guessed at.
            </p>
          ) : null}
        </div>

        {/* --------------------------------------------------------- the cuts */}
        <section>
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>Bonds cut</h2>
          {p.strikes.length === 0 ? (
            <div className="panel" style={{ padding: "1.5rem", marginTop: "0.6rem" }}>
              <p className="sub">
                No bond has been cut on any deployment at this block. That is the honest state and it
                is written rather than hidden: this page does not manufacture a slash to have
                something to show. The open windows below are where one could come from.
              </p>
            </div>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.6rem" }}>
              {p.strikes.map((s) => (
                <li key={`${s.address}-${s.mandateId}`} className="card" style={{ padding: "1.1rem 1.2rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>{s.name}</span>
                    <span className="chip chip--fail">slashed {s.strikes}×</span>
                    {s.ours ? <span className="chip chip--struck">ours · our own capital</span> : null}
                    <span className="chip">{CATEGORY_LABEL[s.category]}</span>
                  </div>
                  <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.4rem", lineHeight: 1.55 }}>{s.line}</p>
                  <p className="meta" style={{ marginTop: "0.4rem" }}>
                    mandate {s.mandateId} on {s.deployment} · bond now <span className="num">{s.bondBnb}</span> BNB ·{" "}
                    {s.epochsSettled} epoch{s.epochsSettled === 1 ? "" : "s"} settled
                    {s.alpha ? <> · running <span className="num">{s.alpha}</span> alpha</> : null}
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.7rem", flexWrap: "wrap" }}>
                    <a href={s.href} className="btn btn--sm btn--primary">Read the settlement tape →</a>
                    <a href={`https://bscscan.com/address/${s.address}`} className="btn btn--sm" target="_blank" rel="noopener noreferrer">Contract ↗</a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ------------------------------------------------- the open windows */}
        <section>
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>Open to challenge right now</h2>
          <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem" }}>
            A settled epoch is contestable: stake against the measurement and, if the contract agrees
            with you, the proposer&rsquo;s stake is yours and the alpha is corrected. This is weaker
            evidence than a cut, and it is labelled as weaker.
          </p>
          {p.open.length === 0 ? (
            <div className="panel" style={{ padding: "1.5rem", marginTop: "0.6rem" }}>
              <p className="sub">
                Nothing is inside a challenge window at this block. Windows open when an epoch
                settles, so this fills when the next one does.
              </p>
            </div>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.6rem" }}>
              {p.open.map((o) => (
                <li key={`${o.address}-${o.mandateId}`} className="card" style={{ padding: "1rem 1.15rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: "16rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>{o.name}</span>
                        <span className="chip chip--live"><span className="dot dot--live" />window open</span>
                        {o.ours ? <span className="chip chip--struck">ours</span> : null}
                      </div>
                      <p className="meta" style={{ marginTop: "0.3rem" }}>
                        mandate {o.mandateId} on {o.deployment} · {CATEGORY_LABEL[o.category]} ·{" "}
                        {o.epochsSettled} settled
                        {o.alpha ? <> · <span className="num">{o.alpha}</span> alpha</> : null} · bond{" "}
                        <span className="num">{o.bondBnb}</span> BNB
                      </p>
                    </div>
                    <a href={o.href} className="btn btn--sm">See the tape →</a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ------------------------------------------------------- verify it */}
        <section>
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>Check it without us</h2>
          <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem" }}>
            Every figure above is a contract read. These commands do the same reads from your
            machine, against a public RPC, with this site out of the loop entirely.
          </p>
          <div style={{ marginTop: "0.75rem" }}>
            <Reproduce
              commands={[
                { label: "Re-derive a settled epoch from the chain", cmd: "npx mandate-verify settlement <mandateId>" },
                { label: "Check the market's whole book", cmd: `cast call ${MARKET_ADDRESS} "mandateCount()(uint256)" --rpc-url https://bsc-rpc.publicnode.com` },
                { label: "Read one mandate, including its strikes", cmd: `cast call ${MARKET_ADDRESS} "getMandate(uint256)" 0 --rpc-url https://bsc-rpc.publicnode.com` },
                { label: "Read the published allowlist a hire signs", cmd: "curl https://mandate-coral.vercel.app/api/v1/allowlist/all" },
              ]}
            />
          </div>
        </section>

        <div className="panel" style={{ padding: "1.25rem" }}>
          <h2 className="hd-3">Reviewing this for a judging panel?</h2>
          <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem" }}>
            One page, every link, in the order they make sense: the films, the transactions, the
            comparison and the report.
          </p>
          <a href="/proof/judge" className="btn btn--primary" style={{ marginTop: "1rem" }}>Open the judge packet →</a>
        </div>
      </main>
      <Footer note="Strikes, bonds and epoch counts read live from MandateMarket across every deployment this office has run, including the superseded ones that hold our worst results." />
    </>
  );
}
