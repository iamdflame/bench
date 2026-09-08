/**
 * The gate that keeps the counterfactual honest.
 *
 * A replay engine is trivial to make flattering. Let a strategy see one tick
 * past its own decision block and it beats every benchmark, every time, on
 * every window — and the output looks like an unusually good agent rather than
 * a bug. There is no way to spot it in the result, which is precisely why it
 * has to be checked in the code.
 *
 * `Observation` has no series on it, so lookahead should be impossible by
 * construction. This does not trust that. It proves the property the way the
 * property is stated:
 *
 *   1. Replay a strategy over a price series, recording every decision.
 *   2. Corrupt every tick *after* some cut, violently — invert the price
 *      direction, multiply the volume, move the tick hundreds of basis points.
 *   3. Replay again.
 *   4. Every decision at or before the cut must be byte-identical.
 *
 * If a strategy ever reads forward, step 4 fails, because the future it read
 * has changed. The check runs over several cuts and every reference strategy,
 * and it uses a synthetic series rather than the chain so it is deterministic
 * and needs no network.
 *
 *   npx tsx tools/checks/no-lookahead.ts
 */

import {
  REFERENCE_STRATEGIES,
  costModel,
  holdPosition,
  liquidityFor,
  replay,
  type History,
  type Strategy,
  type Tick,
} from "@bench/counterfactual";
import { getSqrtRatioAtTick } from "@bench/metrics";

let failed = 0;
const fail = (m: string) => {
  console.error(`  FAIL  ${m}`);
  failed++;
};
const pass = (m: string) => console.log(`  ok    ${m}`);

/**
 * A price series that actually moves.
 *
 * A flat series would pass this check trivially — nothing to see ahead — so the
 * walk wanders far enough to push any band out of range several times.
 */
function synthesise(n: number): Tick[] {
  const ticks: Tick[] = [];
  let tick = -66_000;
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < n; i++) {
    tick += Math.round((rnd() - 0.5) * 60);
    ticks.push({
      block: 120_000_000n + BigInt(i),
      timestamp: 1_780_000_000 + i * 3,
      tick,
      sqrtPriceX96: getSqrtRatioAtTick(tick),
      amount0: BigInt(Math.round(rnd() * 1e18)),
      amount1: -BigInt(Math.round(rnd() * 1e15)),
      liquidity: 5_000_000_000_000_000_000n,
    });
  }
  return ticks;
}

/**
 * Corrupt everything after `cut`.
 *
 * Deliberately extreme. A subtle perturbation could be swamped by a strategy's
 * own thresholds and let a genuine lookahead slip through; a violent one cannot
 * be mistaken for noise.
 */
function corruptAfter(ticks: Tick[], cut: number): Tick[] {
  return ticks.map((t, i) => {
    if (i <= cut) return t;
    const moved = t.tick + 4_000 * (i % 2 === 0 ? 1 : -1);
    return {
      ...t,
      tick: moved,
      sqrtPriceX96: getSqrtRatioAtTick(moved),
      amount0: t.amount0 * 7n,
      amount1: t.amount1 * 7n,
      liquidity: t.liquidity / 3n,
    };
  });
}

const historyOf = (ticks: Tick[]): History => ({
  chainId: 56,
  pool: "0x36696169C63e42cd08ce11f5deeBbCeBae652050",
  feePips: 500,
  token0: "0x55d398326f99059fF775485246999027B3197955",
  token1: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  ticks,
  fromBlock: ticks[0]?.block ?? 0n,
  toBlock: ticks[ticks.length - 1]?.block ?? 0n,
  complete: true,
  shortenedBecause: null,
  via: "synthetic",
});

/** The decisions a replay made, as a comparable string. */
const fingerprint = (events: { block: bigint; action: { kind: string } }[], cut: bigint): string =>
  events
    .filter((e) => e.block <= cut)
    .map((e) => `${e.block}:${e.action.kind}:${JSON.stringify(e.action)}`)
    .join("|");

console.log("\nno-lookahead: a strategy must not be able to see past its own block\n");

const ticks = synthesise(600);
const cost = costModel(50_000_000n);
const first = ticks[0]!;
const lower = Math.round((first.tick - 200) / 10) * 10;
const upper = Math.round((first.tick + 200) / 10) * 10;
const open = {
  tickLower: lower,
  tickUpper: upper,
  liquidity: liquidityFor({
    amount0: 10n ** 21n,
    amount1: 10n ** 18n,
    tickLower: lower,
    tickUpper: upper,
    sqrtPriceX96: first.sqrtPriceX96,
    sqrtLower: getSqrtRatioAtTick(lower),
    sqrtUpper: getSqrtRatioAtTick(upper),
  }),
  owed0: 0n,
  owed1: 0n,
};

const strategies: Strategy<never>[] = [
  ...(REFERENCE_STRATEGIES as readonly Strategy<never>[]),
  holdPosition as unknown as Strategy<never>,
];

const CUTS = [50, 150, 300, 450];
let anyDecisions = 0;

for (const strategy of strategies) {
  const truth = replay(historyOf(ticks), strategy, open, cost);
  anyDecisions += truth.events.length;

  for (const cut of CUTS) {
    const cutBlock = ticks[cut]!.block;
    const altered = replay(historyOf(corruptAfter(ticks, cut)), strategy, open, cost);
    const before = fingerprint(truth.events, cutBlock);
    const after = fingerprint(altered.events, cutBlock);
    if (before !== after) {
      fail(
        `${strategy.slug} changed what it did at or before block ${cutBlock} when only later ticks were corrupted — it is reading ahead`,
      );
      break;
    }
  }
  pass(`${strategy.slug.padEnd(20)} decided identically across ${CUTS.length} corrupted futures`);
}

/*
  A check that can pass by doing nothing is not a check.

  If no strategy ever acted, every fingerprint would be the empty string and
  this file would report success on an engine that had not run. So the run has
  to have produced decisions for its silence to mean anything.
*/
if (anyDecisions === 0) {
  fail("no strategy took a single action, so the comparison above proves nothing");
} else {
  pass(`${anyDecisions} decisions were actually made, so the comparison had something to compare`);
}

console.log(
  failed === 0
    ? "\n  nothing reads past its own block.\n"
    : `\n  ${failed} failed.\n`,
);
process.exit(failed > 0 ? 1 : 0);
