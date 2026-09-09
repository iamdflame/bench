/**
 * Re-derives the ladder at a past block, from event history alone.
 *
 *   npx tsx src/scripts/replay.ts 120100000
 *   npx tsx src/scripts/replay.ts --steps 5
 */

import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import { ladderAt, LOG_RPC } from "@/lib/replay";

const args = process.argv.slice(2);
const stepsIndex = args.indexOf("--steps");
const steps = stepsIndex >= 0 ? Number(args[stepsIndex + 1]) : 0;
// A bare number is a block — but not the one that belongs to --steps.
const explicit = args.find((a, i) => /^\d+$/.test(a) && i !== stepsIndex + 1);

async function main() {
  const c = createPublicClient({ chain: bsc, transport: http(LOG_RPC) });
  const head = await c.getBlockNumber();

  const blocks = explicit
    ? [BigInt(explicit)]
    : steps
      ? Array.from({ length: steps }, (_, i) => head - BigInt(i) * 20_000n).reverse()
      : [head];

  for (const block of blocks) {
    const replay = await ladderAt(block);
    console.log(`\nblock ${replay.blockNumber}${replay.blockTime ? `  ${replay.blockTime}` : ""}`);
    for (const r of replay.rungs) {
      const pop = r.population === null ? "—".padStart(9) : r.population.toLocaleString().padStart(9);
      console.log(`  ${r.n} ${r.name.padEnd(11)} ${pop}   ${r.replayable ? "" : "not replayable: "}${r.method.slice(0, 74)}`);
    }
    for (const n of replay.notes) console.log(`     · ${n}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
