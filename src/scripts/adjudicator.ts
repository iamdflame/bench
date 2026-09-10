/**
 * The settlement oracle.
 *
 * This is where the two halves of the system meet. The assay engine tests an
 * agent's registry claims against BNB Smart Chain — is the endpoint live, is
 * custody actually separated, has the wallet ever sent a transaction, has it
 * ever touched the protocols its category implies — and this publishes the
 * resulting fineness on chain, where MandateMarket uses it to decide who may
 * bid for capital at all.
 *
 * A bond proves an agent has something to lose. Fineness proves it can do the
 * job. The market requires both.
 *
 *   npx tsx --env-file=.env.local src/scripts/adjudicator.ts <address:tokenId> ...
 *   npx tsx --env-file=.env.local src/scripts/adjudicator.ts --demo
 */

import type { Hex } from "viem";
import { assayAgent } from "@/lib/assay";
import { isHallmarked } from "@/lib/assay/types";
import {
  MARKET_ABI,
  MARKET_ADDRESS,
  marketChain,
  marketClient,
  walletFor,
} from "@/lib/chain/market";

const CHAIN_ID = Number(process.env.CHAIN_ID ?? 56);

/*
  No silent fallback to anvil's first account.

  This used to default to `0xac0974be…ff80`, which is the well-known Foundry
  test key. Against a local chain that is convenient; against mainnet it means
  the script signs as an address that is not the adjudicator, every call
  reverts `NotAdjudicator`, and the reason is nowhere in the output. A default
  credential that is wrong everywhere it matters is worse than no default.
*/
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const configured = process.env.ADJUDICATOR_KEY;

if (!configured) {
  console.error(
    "ADJUDICATOR_KEY is not set. This script signs as the adjudicator and there is no safe default.",
  );
  console.error(
    CHAIN_ID === 56
      ? "  On mainnet, set it to the key that holds the adjudicator role. Read it with:\n" +
          "    cast call $MARKET_ADDRESS 'adjudicator()(address)' --rpc-url https://bsc-dataseed1.binance.org"
      : `  For a local chain, ADJUDICATOR_KEY=${ANVIL_KEY}`,
  );
  process.exit(1);
}

if (CHAIN_ID === 56 && configured.toLowerCase() === ANVIL_KEY) {
  console.error("Refusing: that is anvil's test key and this is mainnet.");
  process.exit(1);
}

const ADJUDICATOR_KEY = configured as Hex;

if (!MARKET_ADDRESS) {
  console.error("MARKET_ADDRESS is not set.");
  process.exit(1);
}

const wallet = walletFor(ADJUDICATOR_KEY);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/**
 * Anvil's deterministic agent accounts, paired with real BSC agents to assay.
 * On a real deployment each agent bids from the wallet its registry entry
 * declares, and no pairing is needed.
 */
const DEMO: { wallet: string; tokenId: string; label: string }[] = [
  { wallet: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", tokenId: "304493", label: "endpoint-verified" },
  { wallet: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", tokenId: "153776", label: "never transacted" },
  { wallet: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", tokenId: "330536", label: "grid trader" },
  { wallet: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", tokenId: "325413", label: "lp rebalancer" },
];

async function publish(agent: string, fineness: number) {
  const hash = await wallet.writeContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "publishAssay",
    args: [agent as `0x${string}`, fineness],
    chain: marketChain,
    account: wallet.account!,
  } as never);
  await marketClient.waitForTransactionReceipt({ hash });
  return hash;
}

const args = process.argv.slice(2);
const targets =
  args[0] === "--demo" || args.length === 0
    ? DEMO
    : args.map((a) => {
        const [w, t] = a.split(":");
        return { wallet: w, tokenId: t, label: "" };
      });

log(`adjudicator · market ${MARKET_ADDRESS} · assaying against chain ${CHAIN_ID}`);

for (const t of targets) {
  try {
    const report = await assayAgent(CHAIN_ID, t.tokenId);
    const hash = await publish(t.wallet, report.fineness);
    log(
      `${t.wallet.slice(0, 10)}… ← agent ${t.tokenId} · ${String(report.fineness).padStart(4)} fine · ` +
        `${isHallmarked(report.fineness) ? "hallmarked" : "base metal"}` +
        `${t.label ? ` (${t.label})` : ""}`,
    );
    log(`   published ${hash.slice(0, 18)}…`);
  } catch (error) {
    log(`${t.wallet.slice(0, 10)}… failed: ${String(error).slice(0, 110)}`);
  }
}

const bar = await marketClient.readContract({
  address: MARKET_ADDRESS,
  abi: MARKET_ABI,
  functionName: "minFineness",
});
log(`market bar is ${bar} fine${Number(bar) === 0 ? " (gate disabled)" : ""}`);
