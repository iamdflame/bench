import type { Metadata } from "next";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import Bench from "@/components/Bench";
import { readAgentIndex } from "@/lib/data/agents";
import { CHAIN_ID } from "@/lib/config";
import { MARKET_ADDRESS } from "@/lib/chain/market";

export const metadata: Metadata = {
  title: "The bench — MANDATE",
  description:
    "Paste any agent registered on BNB Smart Chain and watch six tests run against it live. No wallet, no account, no permission from us.",
};

export const dynamic = "force-dynamic";

export default async function BenchPage() {
  const index = await readAgentIndex();

  /*
    Seeded with agents whose registry standing most overstates the evidence.

    Not a showcase — the suggestions are chosen precisely because their
    published score is the thing the bench is about to contradict, and a
    visitor who clicks one sees the argument happen rather than reading it.
  */
  const suggestions = index.agents
    .filter((a) => (a.registryScore ?? 0) > 0)
    .sort((a, b) => (b.registryScore ?? 0) - (a.registryScore ?? 0))
    .slice(0, 4)
    .map((a) => ({ tokenId: a.tokenId, name: a.name ?? a.tokenId, fineness: 0 }));

  return (
    <div className="app">
      <SiteHeader current="/assay" />

      <main className="shell bench-page">
        <p className="mark-label">The bench</p>
        <h1 className="display bench__title">Assay anything on this chain.</h1>
        <p className="lede bench__lede">
          Six tests, run live against BNB Smart Chain. It does not have to be one of
          ours — any agent in the ERC-8004 identity registry can be put on the bench,
          including one you are being asked to trust somewhere else. No wallet, no
          account, and no permission from us.
        </p>

        <Bench chainId={CHAIN_ID} suggestions={suggestions} />
      </main>

      <SiteFooter
        market={MARKET_ADDRESS}
        note="Nothing is revealed before the chain has answered. The waiting is the content."
      />
    </div>
  );
}
