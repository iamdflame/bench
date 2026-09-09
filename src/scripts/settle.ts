/**
 * Settles a mandate from a measurement the chain can check.
 *
 *   npm run settle -- measure <mandateId>
 *   npm run settle -- settle  <mandateId>
 *
 * `measure` reads and prints without sending — the check that a figure is real
 * before it is written to a contract that slashes against it. There is no
 * `open` command any more: the opening mark is taken by `award`, on chain.
 */

import type { Hex } from "viem";
import {
  MANDATE_MARKET_ABI,
  MARKET_ADDRESS,
  marketChain,
  marketClient,
  readMandate,
  walletFor,
} from "@/lib/chain/market";
import { measureAlpha } from "@/lib/settlement";

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;
const cmd = process.argv[2] ?? "measure";
const id = Number(process.argv[3] ?? 0);

const mandate = await readMandate(id);
const epoch = mandate.epochsSettled;
const m = await measureAlpha(id, epoch);

console.log(`mandate ${id} · epoch ${epoch}`);
console.log(`  ${m.explanation}`);

if (m.alphaBps !== null && m.observation) {
  const pct = (Number(m.alphaBps) / 100).toFixed(2);
  console.log(`\n  alpha        ${m.alphaBps >= 0n ? "+" : ""}${pct}%  (${m.alphaBps} bps)`);
  console.log(`  previous     ${fmt(m.previousWei!)} BNB`);
  console.log(`  now          ${fmt(m.observation.valuationWei)} BNB`);
  console.log(`  at block     ${m.observation.blockNumber}`);
  console.log(`  pool price   ${m.observation.priceX96}`);
  for (const p of m.valuation?.parts ?? []) {
    console.log(`    ${p.asset.padEnd(5)} ${fmt(p.wei)} BNB`);
  }
}

if (cmd !== "settle") {
  console.log("\nmeasurement only — nothing sent.");
  process.exit(0);
}

if (m.alphaBps === null || !m.observation) {
  console.error("\nrefusing to settle: alpha is not measurable, and a made-up figure is what this replaced.");
  process.exit(1);
}

const wallet = walletFor(norm(process.env.PRIVATE_KEY));
const hash = await wallet.writeContract({
  address: MARKET_ADDRESS,
  abi: MANDATE_MARKET_ABI,
  functionName: "settleEpoch",
  args: [BigInt(id), m.alphaBps, m.observation],
  chain: marketChain,
  account: wallet.account!,
} as never);
const receipt = await marketClient.waitForTransactionReceipt({ hash });

console.log(`\nsettled epoch ${epoch} at ${(Number(m.alphaBps) / 100).toFixed(2)}%`);
console.log(`  https://bscscan.com/tx/${hash}  (block ${receipt.blockNumber})`);
console.log(`  the observation is in the log; the contract checked the alpha against it.`);

function fmt(wei: bigint) {
  return (Number(wei) / 1e18).toFixed(8);
}
