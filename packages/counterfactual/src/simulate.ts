/**
 * A concentrated-liquidity position, moved forward one swap at a time.
 *
 * ---------------------------------------------------------------------------
 * Fees are computed, never assumed
 * ---------------------------------------------------------------------------
 *
 * A position earns on a swap only when the price is inside its band, and then
 * it earns its share of the fee:
 *
 *     fee earned = feeRate × |amount in| × (our liquidity ÷ pool liquidity)
 *
 * Every term is in the `Swap` event — the amounts, and the pool's in-range
 * liquidity at that moment. So the yield here is derived from the trades that
 * actually happened rather than from an APR somebody typed in. That is the
 * difference between a counterfactual and a brochure.
 *
 * Two honest approximations, both stated rather than buried:
 *
 *   1. **In-range is judged at the price after the swap.** A swap that crosses
 *      the band boundary earns partly inside and partly outside; this counts it
 *      as wholly one or the other. Over thousands of swaps the error is
 *      symmetric and tiny, and modelling it exactly would require replaying
 *      tick-crossing arithmetic that the event does not carry.
 *
 *   2. **The pool's liquidity is read from the swap.** If our position were
 *      genuinely added to the pool it would raise that denominator slightly and
 *      dilute everyone including itself. For a position that is small relative
 *      to a pool holding millions, the difference is far below the fee itself;
 *      for a position that is not, `dilutionWarning` says so instead of
 *      pretending.
 *
 * The rule this file follows: when a shortcut is taken, the result carries a
 * sentence naming it. A number whose assumptions are invisible is worse than no
 * number.
 */

import { positionAmounts } from "@bench/metrics";
import type { Position, Tick } from "./types";

/** Fee denominators. V3 fees are in hundredths of a bip: 500 = 0.05%. */
const PIP_DENOMINATOR = 1_000_000n;

const abs = (n: bigint) => (n < 0n ? -n : n);

/** Whether the price sits inside a band. Boundaries count as inside. */
export function inRange(t: Tick, p: Position): boolean {
  return t.tick >= p.tickLower && t.tick <= p.tickUpper;
}

/**
 * Accrue one swap's fees onto a position.
 *
 * Returns a new position; nothing is mutated, because a replay that mutates its
 * inputs cannot be run twice and compared, and running it twice is exactly what
 * the no-lookahead check does.
 */
export function accrue(p: Position, t: Tick, feePips: number): Position {
  if (p.liquidity === 0n || t.liquidity === 0n || !inRange(t, p)) return p;

  const share = (amount: bigint): bigint =>
    (abs(amount) * BigInt(feePips) * p.liquidity) / (PIP_DENOMINATOR * t.liquidity);

  /*
    The fee is taken from whichever token the trader put *in*, which is the one
    with a positive delta from the pool's point of view.
  */
  return {
    ...p,
    owed0: p.owed0 + (t.amount0 > 0n ? share(t.amount0) : 0n),
    owed1: p.owed1 + (t.amount1 > 0n ? share(t.amount1) : 0n),
  };
}

/** What a position is worth right now, in the two tokens, fees included. */
export function valueAt(p: Position, t: Tick): { amount0: bigint; amount1: bigint } {
  const { amount0, amount1 } = positionAmounts({
    liquidity: p.liquidity,
    tickLower: p.tickLower,
    tickUpper: p.tickUpper,
    sqrtPriceX96: t.sqrtPriceX96,
  });
  return { amount0: amount0 + p.owed0, amount1: amount1 + p.owed1 };
}

/**
 * Liquidity for a band, given the two token amounts available at a price.
 *
 * The inverse of `positionAmounts`: how much liquidity can be minted from what
 * a burned position returned. Uniswap's formulae, with the two single-sided
 * cases handled separately because the interior case is the minimum of both.
 */
export function liquidityFor(params: {
  amount0: bigint;
  amount1: bigint;
  tickLower: number;
  tickUpper: number;
  sqrtPriceX96: bigint;
  sqrtLower: bigint;
  sqrtUpper: bigint;
}): bigint {
  const { amount0, amount1, sqrtPriceX96, sqrtLower, sqrtUpper } = params;
  const Q96 = 1n << 96n;
  if (sqrtUpper <= sqrtLower) return 0n;

  if (sqrtPriceX96 <= sqrtLower) {
    /* Entirely in token0. */
    return (amount0 * ((sqrtLower * sqrtUpper) / Q96)) / (sqrtUpper - sqrtLower);
  }
  if (sqrtPriceX96 >= sqrtUpper) {
    /* Entirely in token1. */
    return (amount1 * Q96) / (sqrtUpper - sqrtLower);
  }
  const l0 = (amount0 * ((sqrtPriceX96 * sqrtUpper) / Q96)) / (sqrtUpper - sqrtPriceX96);
  const l1 = (amount1 * Q96) / (sqrtPriceX96 - sqrtLower);
  return l0 < l1 ? l0 : l1;
}

/**
 * Is this position large enough to move the pool it is measured against?
 *
 * Returns a sentence when the position would be a material share of in-range
 * liquidity, and null when the approximation in this file's header is safe.
 * Ten percent is the line: below it the dilution is smaller than the rounding
 * already present, above it the number deserves a caveat a reader can see.
 */
export function dilutionWarning(p: Position, t: Tick): string | null {
  if (t.liquidity === 0n || p.liquidity === 0n) return null;
  const sharePercent = Number((p.liquidity * 1000n) / t.liquidity) / 10;
  if (sharePercent < 10) return null;
  return `This position would be about ${sharePercent.toFixed(0)}% of the pool's in-range liquidity. A position that size changes the fees it is measuring, so treat the yield below as an upper bound rather than a projection.`;
}
