/**
 * Grade the counterfactual against the window that came after it.
 *
 * §9 says the projection is graded and the forecast error published, and that
 * this is the strongest trust signal available because no competitor will
 * volunteer it. This is the first thing in the product that can actually do it.
 *
 * ---------------------------------------------------------------------------
 * Why this is a real forecast test and not a circular one
 * ---------------------------------------------------------------------------
 *
 * Replaying a strategy over a window and then "measuring" it over the same
 * window proves nothing: the replay already saw every trade in it. The only
 * honest version compares two *disjoint* windows —
 *
 *     window 1   the published counterfactual, blocks A → B
 *     window 2   everything since, blocks B → head
 *
 * — replays the identical strategies, against the identical synthetic position
 * spec, on the identical pool, and asks whether what window 1 said held up.
 * Nothing about window 2 was visible when window 1 was published, which is what
 * makes the comparison worth anything.
 *
 * ---------------------------------------------------------------------------
 * What it actually measures, stated precisely
 * ---------------------------------------------------------------------------
 *
 * Not "did the agent make money". It measures **how far a single-window replay
 * generalises**: a strategy that beat doing nothing by X in one window, and by
 * Y in the next, has a forecast error of Y − X. That number is the honest
 * answer to the only question a reader should be asking about the table on
 * `/data` — *should I believe this about tomorrow?*
 *
 * The page already carries the warning in words. This replaces the warning with
 * a figure, and the figure is published whichever way it points.
 */

import {
  REFERENCE_STRATEGIES,
  holdPosition,
  liquidityFor,
  readCostModel,
  readHistory,
  recentres,
  replay,
  timeInRange,
  type ReplayResult,
  type Strategy,
} from "@bench/counterfactual";
import { getSqrtRatioAtTick } from "@bench/metrics";
import { chainClient, type SupportedChain } from "@bench/shared";
import { formatUnits, type Address } from "viem";
import type { CounterfactualRecord } from "./counterfactual";

export interface GradeRow {
  strategy: string;
  name: string;
  /** What the published window said this strategy did against doing nothing. */
  projected: string;
  /** What it did over the window that followed. */
  actual: string;
  /** actual − projected. Published whichever way it points. */
  error: string;
  /** Did the sign hold? The coarsest and most useful question. */
  directionHeld: boolean;
  projectedRecentres: number;
  actualRecentres: number;
}

export interface GradeRecord {
  chainId: number;
  pool: Address;
  pair: string;
  token0Symbol: string;
  /** The window that was published, and is now being graded. */
  projectedWindow: { fromBlock: string; toBlock: string; hours: number; swaps: number };
  /** The window that came after it, which nothing had seen. */
  actualWindow: { fromBlock: string; toBlock: string; hours: number; swaps: number; complete: boolean };
  rows: GradeRow[];
  /** How many strategies kept the same sign. The headline. */
  directionsHeld: number;
  observedAt: string;
  reproduce: string;
  /** Set when the following window is too short or too quiet to grade against. */
  refusedBecause: string | null;
}

/**
 * Replay the published strategies over everything since the published window.
 *
 * Returns null when there is not enough new chain to say anything — which is a
 * fact about elapsed time, not about the strategies, and the caller renders it
 * as such rather than as a grade of zero.
 */
export async function gradeCounterfactual(
  chainId: SupportedChain,
  published: CounterfactualRecord,
): Promise<GradeRecord | null> {
  const client = chainClient(chainId);
  const head = await client.getBlockNumber();
  const from = BigInt(published.toBlock);

  /*
    A window shorter than the one it grades is not a fair test — half an hour
    against a day would attribute the difference to the clock rather than to the
    strategy. It refuses until enough chain has passed, and says how much.
  */
  const elapsed = head > from ? head - from : 0n;
  const minimum = 20_000n; // about 2.5 hours at 0.45s
  if (elapsed < minimum) {
    return {
      chainId,
      pool: published.pool,
      pair: published.pair,
      token0Symbol: published.token0Symbol,
      projectedWindow: {
        fromBlock: published.fromBlock,
        toBlock: published.toBlock,
        hours: published.hours,
        swaps: published.swaps,
      },
      actualWindow: { fromBlock: from.toString(), toBlock: head.toString(), hours: 0, swaps: 0, complete: false },
      rows: [],
      directionsHeld: 0,
      observedAt: new Date().toISOString(),
      reproduce: "npm run grade",
      refusedBecause: `Only ${elapsed} blocks have passed since the published window closed, and grading needs at least ${minimum}. A window graded against a much shorter one measures the clock rather than the strategy.`,
    };
  }

  const history = await readHistory(chainId, published.pool, from, head);
  if (history.ticks.length < 2) return null;

  const first = history.ticks[0]!;
  const last = history.ticks[history.ticks.length - 1]!;
  const cost = await readCostModel(client as never, first.block);

  /*
    The identical position spec: same band half-width, same capital, opened at
    the start of the new window. Changing any of it would grade a different
    experiment and call it the same one.
  */
  const halfWidth = published.bandHalfWidthTicks;
  const lower = Math.round((first.tick - halfWidth) / 10) * 10;
  const upper = Math.round((first.tick + halfWidth) / 10) * 10;
  const Q96 = 1n << 96n;
  const price0In1 = (first.sqrtPriceX96 * first.sqrtPriceX96) / Q96;
  const capital = 1_000n * 10n ** 18n;
  const open = {
    tickLower: lower,
    tickUpper: upper,
    liquidity: liquidityFor({
      amount0: capital,
      amount1: (capital * price0In1) / Q96,
      tickLower: lower,
      tickUpper: upper,
      sqrtPriceX96: first.sqrtPriceX96,
      sqrtLower: getSqrtRatioAtTick(lower),
      sqrtUpper: getSqrtRatioAtTick(upper),
    }),
    owed0: 0n,
    owed1: 0n,
  };
  if (open.liquidity === 0n) return null;

  const p1in0 = (Q96 * Q96) / ((last.sqrtPriceX96 * last.sqrtPriceX96) / Q96);
  const inToken0 = (a0: bigint, a1: bigint) => a0 + (a1 * p1in0) / Q96;
  const gasInToken0 = (wei: bigint) => (wei * p1in0) / Q96;

  const strategies: Strategy<unknown>[] = [holdPosition, ...REFERENCE_STRATEGIES];
  const results = strategies.map((s) => ({ s, r: replay(history, s, open, cost) }));
  const netOf = (r: ReplayResult) =>
    inToken0(r.end.amount0 - r.start.amount0, r.end.amount1 - r.start.amount1) - gasInToken0(r.gasWei);
  const holdNet = netOf(results[0]!.r);

  const publishedBy = new Map(published.rows.map((r) => [r.strategy, r]));
  const rows: GradeRow[] = [];

  for (const { s, r } of results) {
    if (s.slug === "hold") continue;
    const was = publishedBy.get(s.slug);
    if (!was) continue;
    const actualNum = netOf(r) - holdNet;
    const actual = formatUnits(actualNum, 18);
    const projected = was.vsHold;
    const error = formatUnits(actualNum - BigInt(Math.round(Number(projected) * 1e18)), 18);
    rows.push({
      strategy: s.slug,
      name: s.name,
      projected,
      actual,
      error,
      directionHeld: Math.sign(Number(projected)) === Math.sign(Number(actual)),
      projectedRecentres: was.recentres,
      actualRecentres: recentres(r),
    });
    void timeInRange;
  }

  return {
    chainId,
    pool: published.pool,
    pair: published.pair,
    token0Symbol: published.token0Symbol,
    projectedWindow: {
      fromBlock: published.fromBlock,
      toBlock: published.toBlock,
      hours: published.hours,
      swaps: published.swaps,
    },
    actualWindow: {
      fromBlock: history.fromBlock.toString(),
      toBlock: history.toBlock.toString(),
      hours: Number(((last.timestamp - first.timestamp) / 3600).toFixed(2)),
      swaps: history.ticks.length,
      complete: history.complete,
    },
    rows,
    directionsHeld: rows.filter((r) => r.directionHeld).length,
    observedAt: new Date().toISOString(),
    reproduce: "npm run grade",
    refusedBecause: null,
  };
}
