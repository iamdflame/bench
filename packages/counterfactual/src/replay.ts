/**
 * Drive a strategy across a price series, and record what it would have cost.
 *
 * The loop is deliberately dull: for each observation, accrue fees, ask the
 * strategy, apply what it proposed, charge for it. All the care is in what the
 * strategy is *not* given.
 *
 * ---------------------------------------------------------------------------
 * The one rule that makes this honest
 * ---------------------------------------------------------------------------
 *
 * `decide` receives `ticks[i]` and nothing else from the series. Not the array,
 * not an index, not a slice. A strategy physically cannot read `ticks[i + 1]`
 * because it never holds `ticks`. Lookahead is the single easiest way to make a
 * counterfactual flatter than reality — one peek at tomorrow and every strategy
 * beats every benchmark — and it is also the hardest thing to spot afterwards,
 * because the output looks like a very good agent.
 *
 * The type prevents it; `tools/checks/no-lookahead.ts` proves it, by replaying,
 * corrupting every tick after a decision block, replaying again, and failing
 * the build if any decision moved.
 *
 * ---------------------------------------------------------------------------
 * Costs are charged, not netted out later
 * ---------------------------------------------------------------------------
 *
 * A recentre burns a position and mints another. That costs gas, and it crosses
 * the spread on whatever has to be swapped to rebalance the two sides. Both are
 * charged at the moment they happen, at the price observed in that same block,
 * because a strategy that recentres twenty times has to be allowed to lose to
 * one that recentres four times. An engine that forgets gas will always prefer
 * the busiest agent, which is precisely the agent a person should be warned
 * about.
 */

import { getSqrtRatioAtTick, positionAmounts } from "@bench/metrics";
import { chargeRecentre, type CostModel } from "./cost";
import { accrue, dilutionWarning, inRange, liquidityFor, valueAt } from "./simulate";
import type { Action, Decision, History, Position, Strategy, Tick } from "./types";

/** One thing the strategy did, kept so the result can be explained. */
export interface Event {
  block: bigint;
  timestamp: number;
  action: Action;
  /** Gas charged, in wei of the native token. */
  gasWei: bigint;
  /** Value given up to the spread on the rebalancing swap, in token1 units. */
  slippage1: bigint;
}

export interface ReplayResult {
  strategy: string;
  /** Where the position ended, at the last observed price. */
  final: Position;
  /** Value at the end, in the pool's two tokens, fees included. */
  end: { amount0: bigint; amount1: bigint };
  /** Value at the start, at the first observed price. */
  start: { amount0: bigint; amount1: bigint };
  events: Event[];
  /** How many observations the price sat inside the band. */
  inRangeTicks: number;
  observations: number;
  /** Total gas charged across every action, in wei. */
  gasWei: bigint;
  /** Total given up to the spread, in token1 units. */
  slippage1: bigint;
  /** Non-null when the position is large enough to distort its own measurement. */
  dilution: string | null;
  /** The window actually replayed. */
  fromBlock: bigint;
  toBlock: bigint;
  seconds: number;
}

/**
 * Replay one strategy over one history.
 *
 * `open` is the position as it stood at the start of the window. The strategy
 * inherits it; it does not get to choose its entry, because choosing an entry
 * with hindsight is lookahead wearing a different hat.
 */
export function replay<S>(
  history: History,
  strategy: Strategy<S>,
  open: Position,
  cost: CostModel,
): ReplayResult {
  const ticks = history.ticks;
  if (ticks.length === 0) {
    return {
      strategy: strategy.slug,
      final: open,
      end: { amount0: 0n, amount1: 0n },
      start: { amount0: 0n, amount1: 0n },
      events: [],
      inRangeTicks: 0,
      observations: 0,
      gasWei: 0n,
      slippage1: 0n,
      dilution: null,
      fromBlock: history.fromBlock,
      toBlock: history.toBlock,
      seconds: 0,
    };
  }

  const first = ticks[0]!;
  const start = valueAt(open, first);

  let position: Position = { ...open };
  let state: S | null = null;
  const events: Event[] = [];
  let inRangeTicks = 0;
  let gasWei = 0n;
  let slippage1 = 0n;
  let dilution: string | null = null;

  for (let i = 0; i < ticks.length; i++) {
    const at = ticks[i]!;

    /* Fees first: the swap at this observation happened before any reaction to it. */
    position = accrue(position, at, history.feePips);
    if (inRange(at, position)) inRangeTicks++;
    dilution ??= dilutionWarning(position, at);

    /*
      The strategy sees one tick. `at` is a value, not a reference into the
      series, so nothing it does can reach the rest of the array.
    */
    const decision: Decision<S> = strategy.decide({
      chainId: history.chainId,
      pool: history.pool,
      feePips: history.feePips,
      at: { ...at },
      position: { ...position },
      state,
    });
    state = decision.state;

    for (const action of decision.actions) {
      if (action.kind === "hold") continue;

      if (action.kind === "collect") {
        /*
          Collecting realises fees into the wallet. It changes nothing about the
          value already counted — `valueAt` includes owed fees — so the only
          consequence that matters here is the gas.
        */
        const charged = cost.collectGasWei;
        gasWei += charged;
        events.push({ block: at.block, timestamp: at.timestamp, action, gasWei: charged, slippage1: 0n });
        continue;
      }

      /* A recentre: burn, rebalance, mint. */
      const held = valueAt(position, at);
      const sqrtLower = getSqrtRatioAtTick(action.tickLower);
      const sqrtUpper = getSqrtRatioAtTick(action.tickUpper);

      /*
        The ratio the new band needs, measured rather than assumed: the amounts
        one unit of liquidity requires in this band at this price. The rebalance
        aims at that ratio, which is what makes a recentre into an out-of-range
        band cost a real swap and an in-proportion one cost only gas.
      */
      const UNIT = 10n ** 18n;
      const unit = positionAmounts({
        liquidity: UNIT,
        tickLower: action.tickLower,
        tickUpper: action.tickUpper,
        sqrtPriceX96: at.sqrtPriceX96,
      });
      const charge = chargeRecentre(held, at, history.feePips, cost, {
        unit0: unit.amount0,
        unit1: unit.amount1,
      });
      gasWei += charge.gasWei;
      slippage1 += charge.slippage1;
      const liquidity = liquidityFor({
        amount0: charge.amount0,
        amount1: charge.amount1,
        tickLower: action.tickLower,
        tickUpper: action.tickUpper,
        sqrtPriceX96: at.sqrtPriceX96,
        sqrtLower,
        sqrtUpper,
      });

      position = {
        tickLower: action.tickLower,
        tickUpper: action.tickUpper,
        liquidity,
        owed0: 0n,
        owed1: 0n,
      };
      events.push({
        block: at.block,
        timestamp: at.timestamp,
        action,
        gasWei: charge.gasWei,
        slippage1: charge.slippage1,
      });
    }
  }

  const last = ticks[ticks.length - 1]!;
  return {
    strategy: strategy.slug,
    final: position,
    end: valueAt(position, last),
    start,
    events,
    inRangeTicks,
    observations: ticks.length,
    gasWei,
    slippage1,
    dilution,
    fromBlock: history.fromBlock,
    toBlock: history.toBlock,
    seconds: last.timestamp - first.timestamp,
  };
}

/** Percentage of observations the price spent inside the band. */
export const timeInRange = (r: ReplayResult): number =>
  r.observations === 0 ? 0 : (r.inRangeTicks / r.observations) * 100;

/** How many times the strategy moved its band. */
export const recentres = (r: ReplayResult): number =>
  r.events.filter((e) => e.action.kind === "recentre").length;

export type { Tick };
