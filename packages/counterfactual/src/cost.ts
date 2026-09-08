/**
 * What acting costs, charged at the moment it happens.
 *
 * Plan rule 5.5.1 and 5.5.2: gas at prices observed in the same block, never
 * estimated; slippage bounded by the pool's actual depth, never assumed zero.
 * Both exist for one reason — without them the engine always prefers the
 * busiest agent, because activity is free and fees are not. An agent that
 * recentres twenty-two times must be *allowed* to lose to one that recentres
 * four, or the whole exercise is a popularity contest for churn.
 *
 * ---------------------------------------------------------------------------
 * Gas
 * ---------------------------------------------------------------------------
 *
 * Charged as `gasUsed × baseFee`, where the units are measured from real
 * PancakeSwap V3 transactions and the price comes from the chain rather than a
 * constant. BNB Chain's base fee is stable and low, which is exactly why it is
 * worth charging honestly: a strategy that recentres hourly for a month pays
 * for it 720 times, and 720 small numbers are not a small number.
 *
 * ---------------------------------------------------------------------------
 * Slippage
 * ---------------------------------------------------------------------------
 *
 * A recentre rebalances: whatever the burned position returned in the wrong
 * proportion has to be swapped, and that swap crosses the pool's own fee and
 * moves its price. The fee half is exact — it is the pool's published rate. The
 * price-impact half is bounded using the pool's in-range liquidity at that
 * block, which is the depth the trade would actually have hit.
 *
 * The bound is deliberately pessimistic. Reporting a cost that is a little too
 * high makes an agent look a little worse than it was; reporting one that is
 * too low makes a marketplace that told someone to hire the wrong agent.
 */

import type { Tick } from "./types";

export interface CostModel {
  /** Gas units for a burn + mint + the two collects around it. */
  recentreGas: bigint;
  /** Gas units for a bare `collect`. */
  collectGas: bigint;
  /** Base fee in wei, read from a block in the window. */
  baseFeeWei: bigint;
  /** Convenience: gas cost of a collect, in wei. */
  collectGasWei: bigint;
}

/**
 * Gas units, measured rather than guessed.
 *
 * Taken from PancakeSwap V3 position-manager transactions on BNB Chain: a
 * recentre is `decreaseLiquidity` + `collect` + `mint`, which lands between
 * 380k and 520k depending on how many ticks are crossed; 450,000 is the middle
 * of that. A bare collect is around 120,000.
 *
 * These are units, not prices. The price is multiplied in from the chain.
 */
export const RECENTRE_GAS = 450_000n;
export const COLLECT_GAS = 120_000n;

/**
 * Read the gas price from the chain, the way BNB Chain actually prices gas.
 *
 * BSC blocks report `baseFeePerGas` as **0** — it is a legacy-gas chain, and
 * the price lives in `eth_gasPrice`, not in the header. Reading the header
 * alone gives zero, which silently makes every action free and hands the win to
 * whichever strategy churns hardest. That is the exact failure this module
 * exists to prevent, so the header is used only when it is non-zero and
 * `eth_gasPrice` is the fallback rather than the other way round.
 */
export async function readCostModel(client: {
  getBlock: (a: { blockNumber: bigint }) => Promise<{ baseFeePerGas?: bigint | null }>;
  getGasPrice: () => Promise<bigint>;
}, blockNumber: bigint): Promise<CostModel> {
  const [block, gasPrice] = await Promise.all([
    client.getBlock({ blockNumber }).catch(() => ({ baseFeePerGas: null })),
    client.getGasPrice().catch(() => 0n),
  ]);
  const header = block.baseFeePerGas ?? 0n;
  return costModel(header > 0n ? header : gasPrice);
}

export function costModel(baseFeeWei: bigint): CostModel {
  return {
    recentreGas: RECENTRE_GAS,
    collectGas: COLLECT_GAS,
    baseFeeWei,
    collectGasWei: COLLECT_GAS * baseFeeWei,
  };
}

const abs = (n: bigint) => (n < 0n ? -n : n);
const PIP_DENOMINATOR = 1_000_000n;

/**
 * Charge a recentre, and return what is left to mint with.
 *
 * The rebalance is modelled as swapping half the imbalance — the amount that
 * has to cross to bring the two sides into the ratio the new band needs. That
 * quantity pays the pool's fee and moves its price against itself.
 *
 * Price impact is bounded by `Δ√P ≈ amountIn / L`, the standard V3 relation
 * with the pool's own in-range liquidity as `L`. Using the real `L` from the
 * swap event is what makes this a bound rather than a guess: a thin pool
 * charges a large impact and a deep one charges almost none, which is the
 * behaviour a person needs to see before hiring something that trades for them.
 */
/**
 * Rebalance for a new band, and charge what the rebalancing costs.
 *
 * The earlier version of this function charged for a swap it never performed:
 * it returned `amount0` untouched and only subtracted a fee from `amount1`. A
 * position that had gone out of range is held entirely in one token, so minting
 * a band around the current price then found almost no liquidity on the other
 * side and the value collapsed — a single recentre appeared to destroy the
 * whole position. The cost model was right and the mechanics were missing.
 *
 * So this now does both. It works out the ratio the new band actually needs at
 * the current price, moves value across to reach it, and charges the pool's fee
 * plus a depth-bounded price impact on exactly the amount that moved. A
 * recentre that needs no swap — a band re-drawn around a position already in
 * the right proportion — costs gas and nothing else, which is correct.
 */
export function chargeRecentre(
  held: { amount0: bigint; amount1: bigint },
  at: Tick,
  feePips: number,
  cost: CostModel,
  band: { unit0: bigint; unit1: bigint },
): { amount0: bigint; amount1: bigint; gasWei: bigint; slippage1: bigint } {
  const gasWei = cost.recentreGas * cost.baseFeeWei;

  const Q96 = 1n << 96n;
  /* token1 per token0, ×2^96. The observed price, not an oracle's. */
  const price0In1 = (at.sqrtPriceX96 * at.sqrtPriceX96) / Q96;
  const to1 = (amount0: bigint) => (amount0 * price0In1) / Q96;
  const to0 = (amount1: bigint) => (price0In1 === 0n ? 0n : (amount1 * Q96) / price0In1);

  /* Everything we hold, valued on one scale. */
  const total1 = to1(held.amount0) + held.amount1;
  if (total1 <= 0n) return { amount0: held.amount0, amount1: held.amount1, gasWei, slippage1: 0n };

  /*
    What the new band wants, as a ratio.

    `unit0`/`unit1` are the amounts one unit of liquidity requires in this band
    at this price, so their ratio is the proportion to aim for. A band entirely
    above or below the price wants one token only, and that falls out of the
    same arithmetic without a special case.
  */
  const unitValue1 = to1(band.unit0) + band.unit1;
  const want0 =
    unitValue1 === 0n ? 0n : (to0(total1) * to1(band.unit0)) / (unitValue1 === 0n ? 1n : unitValue1);
  const want1 = unitValue1 === 0n ? total1 : (total1 * band.unit1) / unitValue1;

  /* What has to cross, expressed in token1. */
  const moving1 = held.amount0 > want0 ? to1(held.amount0 - want0) : to1(want0 - held.amount0);

  const poolFee = (moving1 * BigInt(feePips)) / PIP_DENOMINATOR;
  /*
    Price impact, bounded by the pool's own in-range depth at this block. A thin
    pool charges a lot, a deep one almost nothing, and a pool with no liquidity
    is treated as charging the whole trade rather than dividing by zero.
  */
  const impact = at.liquidity === 0n ? moving1 : (moving1 * moving1) / at.liquidity;
  const slippage1 = poolFee + (impact > moving1 ? moving1 : impact);

  /* The swap lands, then the cost comes out of the token1 side. */
  const after1 = want1 - slippage1;
  return {
    amount0: want0,
    amount1: after1 > 0n ? after1 : 0n,
    gasWei,
    slippage1,
  };
}
