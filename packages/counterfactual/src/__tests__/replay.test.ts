/**
 * The engine's two load-bearing properties, and proof that the check for the
 * important one has teeth.
 *
 * `tools/checks/no-lookahead.ts` passes. That is only meaningful if it would
 * fail on a strategy that genuinely reads ahead — a gate that cannot fail is
 * decoration. So the first test here builds a cheat, in the way a real cheat
 * would happen (a closure over the series, captured before the replay starts),
 * and asserts the detection catches it.
 */

import { describe, expect, it } from "vitest";
import { getSqrtRatioAtTick } from "@bench/metrics";
import { accrue, costModel, liquidityFor, replay, valueAt } from "../index";
import type { History, Position, Strategy, Tick } from "../types";

function series(n: number, drift = 45): Tick[] {
  const ticks: Tick[] = [];
  let tick = -66_000;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
  for (let i = 0; i < n; i++) {
    tick += Math.round((rnd() - 0.5) * drift * 2);
    ticks.push({
      block: 120_000_000n + BigInt(i),
      timestamp: 1_780_000_000 + i * 3,
      tick,
      sqrtPriceX96: getSqrtRatioAtTick(tick),
      amount0: 10n ** 18n,
      amount1: -(10n ** 15n),
      liquidity: 5n * 10n ** 18n,
    });
  }
  return ticks;
}

const historyOf = (ticks: Tick[]): History => ({
  chainId: 56,
  pool: "0x36696169C63e42cd08ce11f5deeBbCeBae652050",
  feePips: 500,
  token0: "0x55d398326f99059fF775485246999027B3197955",
  token1: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  ticks,
  fromBlock: ticks[0]!.block,
  toBlock: ticks[ticks.length - 1]!.block,
  complete: true,
  shortenedBecause: null,
  via: "synthetic",
});

function openPosition(first: Tick, half = 90): Position {
  const lower = Math.round((first.tick - half) / 10) * 10;
  const upper = Math.round((first.tick + half) / 10) * 10;
  return {
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
}

const corrupt = (ticks: Tick[], cut: number): Tick[] =>
  ticks.map((t, i) => {
    if (i <= cut) return t;
    const moved = t.tick + 4_000;
    return { ...t, tick: moved, sqrtPriceX96: getSqrtRatioAtTick(moved) };
  });

const cost = costModel(50_000_000n);

/** The decisions a replay made at or before `cutBlock`, as a comparable string. */
const printUpTo = (
  events: { block: bigint; action: unknown }[],
  cutBlock: bigint,
): string =>
  events
    .filter((e) => e.block <= cutBlock)
    .map((e) => `${e.block}:${JSON.stringify(e.action)}`)
    .join("|");

/**
 * A strategy that reads a series it was never given.
 *
 * This is how a real lookahead would appear: not as a field on `Observation`,
 * which has none, but as a closure captured before the replay starts. It aims
 * the band at where the price will be in a hundred observations.
 */
function clairvoyantOver(series: Tick[]): Strategy<null> {
  let i = -1;
  return {
    slug: "clairvoyant",
    name: "Clairvoyant",
    describes: "Reads a hundred ticks ahead. Exists only to be caught.",
    decide(o) {
      i++;
      const future = series[i + 100];
      if (!future) return { actions: [{ kind: "hold", why: "no future left" }], state: null };
      const target = future.tick;
      if (target >= o.position.tickLower && target <= o.position.tickUpper) {
        return { actions: [{ kind: "hold", why: "the future is inside the band" }], state: null };
      }
      return {
        actions: [
          {
            kind: "recentre",
            tickLower: Math.round((target - 100) / 10) * 10,
            tickUpper: Math.round((target + 100) / 10) * 10,
            why: "moving to where the price will be",
          },
        ],
        state: null,
      };
    },
  };
}

/** An honest strategy: decides from the observation it was handed, and nothing else. */
const honest: Strategy<null> = {
  slug: "honest",
  name: "Honest",
  describes: "Recentres on the observation it was handed.",
  decide(o) {
    const inside = o.at.tick >= o.position.tickLower && o.at.tick <= o.position.tickUpper;
    return inside
      ? { actions: [{ kind: "hold", why: "inside" }], state: null }
      : {
          actions: [
            {
              kind: "recentre",
              tickLower: Math.round((o.at.tick - 150) / 10) * 10,
              tickUpper: Math.round((o.at.tick + 150) / 10) * 10,
              why: "outside",
            },
          ],
          state: null,
        };
  },
};

describe("no-lookahead detection", () => {
  const CUT = 150;

  it("catches a strategy that closes over the future", () => {
    const ticks = series(400);
    const open = openPosition(ticks[0]!);
    const cutBlock = ticks[CUT]!.block;
    const corrupted = corrupt(ticks, CUT);

    /*
      Both replays run over histories identical up to the cut. The only thing
      that differs is the future each cheat can see. An honest strategy cannot
      tell them apart; this one can, and that is the whole point.
    */
    const onTruth = replay(historyOf(ticks), clairvoyantOver(ticks), open, cost);
    const onCorrupted = replay(historyOf(corrupted), clairvoyantOver(corrupted), open, cost);

    expect(onTruth.events.length).toBeGreaterThan(0);
    expect(printUpTo(onCorrupted.events, cutBlock)).not.toBe(printUpTo(onTruth.events, cutBlock));
  });

  it("leaves an honest strategy identical before the cut", () => {
    const ticks = series(400);
    const open = openPosition(ticks[0]!);
    const cutBlock = ticks[CUT]!.block;

    const truth = replay(historyOf(ticks), honest, open, cost);
    const altered = replay(historyOf(corrupt(ticks, CUT)), honest, open, cost);

    expect(truth.events.length).toBeGreaterThan(0);
    expect(printUpTo(altered.events, cutBlock)).toBe(printUpTo(truth.events, cutBlock));
  });
});

describe("fees are computed from the swap, not assumed", () => {
  it("earns nothing when the price is outside the band", () => {
    const t: Tick = {
      block: 1n,
      timestamp: 0,
      tick: -60_000,
      sqrtPriceX96: getSqrtRatioAtTick(-60_000),
      amount0: 10n ** 20n,
      amount1: -(10n ** 17n),
      liquidity: 10n ** 19n,
    };
    const p: Position = { tickLower: -66_100, tickUpper: -65_900, liquidity: 10n ** 18n, owed0: 0n, owed1: 0n };
    expect(accrue(p, t, 500)).toEqual(p);
  });

  it("earns its liquidity share of the fee when in range", () => {
    const tick = -66_000;
    const t: Tick = {
      block: 1n,
      timestamp: 0,
      tick,
      sqrtPriceX96: getSqrtRatioAtTick(tick),
      amount0: 1_000_000n, // token0 came in
      amount1: -500n,
      liquidity: 10n, // our position is 10% of it below
      };
    const p: Position = { tickLower: -66_100, tickUpper: -65_900, liquidity: 1n, owed0: 0n, owed1: 0n };
    const after = accrue(p, t, 500); // 0.05%
    /* 1,000,000 × 500/1e6 × (1/10) = 50 */
    expect(after.owed0).toBe(50n);
    expect(after.owed1).toBe(0n);
  });

  it("counts owed fees in the position's value", () => {
    const tick = -66_000;
    const t: Tick = {
      block: 1n,
      timestamp: 0,
      tick,
      sqrtPriceX96: getSqrtRatioAtTick(tick),
      amount0: 0n,
      amount1: 0n,
      liquidity: 10n ** 18n,
    };
    const bare: Position = { tickLower: -66_100, tickUpper: -65_900, liquidity: 10n ** 15n, owed0: 0n, owed1: 0n };
    const withFees: Position = { ...bare, owed0: 777n, owed1: 3n };
    expect(valueAt(withFees, t).amount0 - valueAt(bare, t).amount0).toBe(777n);
    expect(valueAt(withFees, t).amount1 - valueAt(bare, t).amount1).toBe(3n);
  });
});
