import type { Metadata } from "next";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import Reproduce from "@/components/instrument/Reproduce";
import FinenessDial from "@/components/instrument/FinenessDial";
import { WEIGHTS } from "@/lib/assay";

export const metadata: Metadata = {
  title: "Method · how the assay works",
  description:
    "Six tests against the chain, weighted into a millesimal fineness, null when unmeasured. Every number reproducible with one command.",
};

const TESTS: { id: keyof typeof WEIGHTS; title: string; asks: string }[] = [
  { id: "identity", title: "Identity", asks: "Does the endpoint the registry points at actually exist and answer?" },
  { id: "custody", title: "Custody", asks: "Is the agent self-custodial, or is it wearing its owner's wallet?" },
  { id: "activity", title: "Activity", asks: "Has the wallet ever transacted, or is it nonce zero since registration?" },
  { id: "capability", title: "Capability", asks: "Does the chain show it touching the contracts its claimed category implies?" },
  { id: "reputation", title: "Reputation", asks: "Is the feedback organic, or does a coordinated cohort inflate it?" },
  { id: "performance", title: "Performance", asks: "Did it beat holding, measured rather than asserted?" },
];

const TRANSLATION: [string, string][] = [
  ["Rung 4: fineness null when unmeasured", "Not assayed yet. Never a fake score."],
  ["3,000 records, 14 wallets flag as one cohort; 84.7 → 81.1", "Some reviews look coordinated. Real score: 81."],
  ["valueWallet reads V3 + Venus + native", "We count your LP and lending positions, not just tokens."],
  ["Settlement proposed, challengeable, block-pinned", "This track record can be disputed on chain. Here's the tape."],
  ["Endpoint silent → fineness drops", "Offline now. The score reflects it, ours included."],
];

const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

export default function Method() {
  return (
    <>
      <Header current="/method" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "56rem" }}>
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <FinenessDial fineness={812} size={150} showGrade={false} />
          <div style={{ flex: 1, minWidth: "18rem" }}>
            <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>How the assay works.</h1>
            <p className="lede" style={{ fontSize: "var(--text-base)", marginTop: "0.5rem" }}>
              Six tests, run against BNB Smart Chain, each comparing what an agent&rsquo;s registry card
              claims against what the chain proves. The tests are weighted into a millesimal fineness,
              0 to 999, the assay-office unit. Below 375, nothing is struck at all. Absence of evidence
              is impurity: an unmeasured test scores zero, never a guess.
            </p>
          </div>
        </div>

        {/* the six tests */}
        <section>
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)", marginBottom: "0.85rem" }}>The six tests</h2>
          <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {TESTS.map((t) => (
              <li key={t.id} className="card" style={{ padding: "0.9rem 1.1rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <span className="hd-3" style={{ fontSize: "var(--text-base)", minWidth: "9rem" }}>{t.title}</span>
                <span className="sub" style={{ fontSize: "var(--text-sm)", flex: 1, minWidth: "16rem" }}>{t.asks}</span>
                <span style={{ textAlign: "right" }}>
                  <span className="num" style={{ fontSize: "var(--text-lg)", color: "var(--color-struck)" }}>{WEIGHTS[t.id]}</span>
                  <span className="meta"> / {total} at a perfect pass</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="meta" style={{ marginTop: "0.6rem" }}>
            The fineness is the weighted sum of what each test earned, over the total weight, in
            millesimal points. The order matters: activity runs before capability, because a wallet
            with nonce zero has provably touched nothing, which settles capability for free.
          </p>
        </section>

        {/* the honesty translation */}
        <section>
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)", marginBottom: "0.85rem" }}>The same guarantee, said twice</h2>
          <p className="sub" style={{ fontSize: "var(--text-sm)", marginBottom: "0.85rem" }}>
            The culture is the brand. Every guarantee is kept in full (the auditor&rsquo;s version is
            always one tap deeper) and translated to a sentence a person can read at the surface.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {TRANSLATION.map(([auditor, human]) => (
              <div key={auditor} className="card scope-grid" style={{ padding: "0.75rem 1rem", gap: "1rem" }} >
                <span className="num meta" style={{ fontSize: "var(--text-xs)", lineHeight: 1.4 }}>{auditor}</span>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--color-touchstone)" }}>{human}</span>
              </div>
            ))}
          </div>
        </section>

        <Reproduce
          title="Reproduce any number on this site"
          commands={[
            { label: "Assay any agent by token id", cmd: "npm run assay -- <tokenId>" },
            { label: "Read an assay over the open API", cmd: "curl https://mandate.example/api/v1/assay/56/<tokenId>" },
            { label: "Re-count the registry ladder", cmd: "npm run funnel" },
            { label: "Check the Sybil filter on a corpus", cmd: "npm run sybil -- <tokenId>" },
            { label: "Verify any settlement end to end", cmd: "npx mandate-verify --mandate <id> --chain 56" },
          ]}
        />
      </main>
      <Footer note="The assay engine, the valuation gauge, the Sybil filter and the settlement contract are all open. Nothing on this page is a number you have to take on trust." />
    </>
  );
}
