/**
 * What a wallet is worth, decomposed.
 *
 * A debugging instrument for the valuation engine and the thing you run when
 * you want to know *why* a number is what it is. Prints every part with the
 * adapter that produced it, so a total can always be taken apart.
 *
 *   npx tsx src/scripts/value-wallet.ts <address> [--rpc URL] [--settlement] [--block N]
 */

import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import { valueWallet } from "@/lib/chain/valuation";

const args = process.argv.slice(2);
const wallet = args.find((a) => a.startsWith("0x")) as Address | undefined;
const rpc = args.includes("--rpc") ? args[args.indexOf("--rpc") + 1]! : (process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org");
const kind = args.includes("--settlement") ? "settlement" : "execution";
const block = args.includes("--block") ? BigInt(args[args.indexOf("--block") + 1]!) : undefined;

if (!wallet) {
  console.error("usage: value-wallet <address> [--rpc URL] [--settlement] [--block N]");
  process.exit(2);
}

const bnb = (wei: bigint) => (Number(wei) / 1e18).toFixed(8).padStart(14);

async function main() {
  const client = createPublicClient({
    chain: bsc,
    transport: http(rpc, { timeout: 30_000 }),
  }) as PublicClient;

  const result = await valueWallet(client, wallet!, { kind, block });

  console.log(`wallet     ${wallet}`);
  console.log(`rpc        ${rpc}`);
  console.log(`block      ${result.blockNumber}`);
  console.log(`prices     ${kind}`);
  console.log(`deviation  ${result.maxDeviationBps} bps${result.deviationExceeded ? "  ** EXCEEDS GUARD **" : ""}`);

  if (!result.valuation) {
    // A refusal is a result, not an error. It names the adapter that could not
    // see, which is the whole reason refusal beats a partial total.
    console.log(`\nREFUSED    by ${result.refusedBy}`);
    console.log("No number is reported. A valuation that cannot see the whole wallet");
    console.log("would read as a loss for whatever it missed.");
    process.exit(3);
  }

  const v = result.valuation;
  console.log(`\n${"".padEnd(14)}  asset`);
  for (const p of v.parts) {
    const sign = p.kind === "liability" ? "-" : "+";
    console.log(`${sign}${bnb(p.bnbWei)}  ${p.asset.padEnd(28)} [${p.adapter}]${p.detail ? `  ${p.detail}` : ""}`);
  }
  console.log("".padEnd(60, "-"));
  console.log(`${bnb(v.assetsWei)}  assets`);
  console.log(`${bnb(v.liabilitiesWei)}  liabilities`);
  console.log(`${bnb(v.netWei)}  NET`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
