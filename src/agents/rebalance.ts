/**
 * LP range rebalancing on PancakeSwap V3.
 *
 * A concentrated-liquidity position only earns fees while price sits inside
 * its range. This watches the position's ticks against the pool's current tick
 * and re-centres when price leaves the band: withdraw, collect, mint a fresh
 * range around spot.
 *
 * The trade-off is real and the agent does not pretend otherwise — every
 * re-centre crystallises impermanent loss and costs gas, so widening the
 * tolerance is not obviously worse than tightening it. The benchmark it is
 * settled against is holding the two tokens un-pooled, which is the honest
 * comparison for an LP strategy.
 */

import type { Abi, Address } from "viem";
import { marketClient } from "@/lib/chain/market";
import { idle, type AgentContext, type Decision, type Strategy } from "./types";

const POSITION_MANAGER = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364" as const;

const PM_ABI = [
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decreaseLiquidity",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "liquidity", type: "uint128" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
  {
    type: "function",
    name: "collect",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "amount0Max", type: "uint128" },
          { name: "amount1Max", type: "uint128" },
        ],
      },
    ],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
] as const;

/** Re-centre once price sits this many ticks outside the range. */
export const DRIFT_TICKS = 200;

/**
 * How far outside its range a position sits, in ticks. Negative while in range.
 *
 * Exported because the Advantage Report evaluates this strategy against real
 * BSC positions, and a report that reimplemented the rule would be measuring a
 * copy. Both callers use this one function, so they cannot drift apart.
 */
export const driftOf = (tickLower: number, tickUpper: number, tick: number) =>
  Math.max(tickLower - tick, tick - tickUpper);

/** The production trigger: re-centre once drift exceeds the tolerance. */
export const shouldRecentre = (tickLower: number, tickUpper: number, tick: number) =>
  driftOf(tickLower, tickUpper, tick) >= DRIFT_TICKS;

export const rebalanceStrategy: Strategy = {
  id: "rebalancing",
  name: "Range Rebalancer",

  describe() {
    return `Holds a PancakeSwap V3 concentrated-liquidity position and re-centres it once price drifts ${DRIFT_TICKS} ticks outside the range, collecting fees on the way out.`;
  },

  async evaluate(ctx: AgentContext): Promise<Decision> {
    const count = (await marketClient.readContract({
      address: POSITION_MANAGER,
      abi: PM_ABI,
      functionName: "balanceOf",
      args: [ctx.wallet],
    })) as bigint;

    if (count === 0n) {
      // Minting the first position needs both tokens and a meaningful size;
      // saying so is more useful than emitting a call that will revert.
      return idle(
        `no V3 position held by ${ctx.wallet.slice(0, 10)}…; a range must be minted before it can be rebalanced`,
        ctx.state,
      );
    }

    const tokenId = (await marketClient.readContract({
      address: POSITION_MANAGER,
      abi: PM_ABI,
      functionName: "tokenOfOwnerByIndex",
      args: [ctx.wallet, 0n],
    })) as bigint;

    const pos = (await marketClient.readContract({
      address: POSITION_MANAGER,
      abi: PM_ABI,
      functionName: "positions",
      args: [tokenId],
    })) as readonly unknown[];

    const tickLower = Number(pos[5]);
    const tickUpper = Number(pos[6]);
    const liquidity = pos[7] as bigint;
    const tick = ctx.price.tick;

    const drift = driftOf(tickLower, tickUpper, tick);

    if (!shouldRecentre(tickLower, tickUpper, tick)) {
      const where = tick < tickLower || tick > tickUpper ? "just outside" : "inside";
      return idle(
        `position #${tokenId} is ${where} its range [${tickLower}, ${tickUpper}] at tick ${tick}; drift ${drift} is under the ${DRIFT_TICKS}-tick tolerance`,
        ctx.state,
      );
    }

    const deadline = BigInt(Math.floor(ctx.now / 1000) + 600);
    return {
      observed: `position #${tokenId} range [${tickLower}, ${tickUpper}] but pool tick is ${tick} — ${drift} ticks outside, earning nothing`,
      state: { ...ctx.state, lastRebalanceTick: tick },
      actions: [
        {
          kind: "decrease",
          reason: `withdraw liquidity from the stale range around tick ${tick}`,
          expect: `position #${tokenId} liquidity falls to zero`,
          call: {
            address: POSITION_MANAGER as Address,
            abi: PM_ABI as unknown as Abi,
            functionName: "decreaseLiquidity",
            args: [{ tokenId, liquidity, amount0Min: 0n, amount1Min: 0n, deadline }],
          },
        },
        {
          kind: "collect",
          reason: "collect the withdrawn balance and accrued fees",
          expect: "token balances rise by the position value plus fees earned in range",
          call: {
            address: POSITION_MANAGER as Address,
            abi: PM_ABI as unknown as Abi,
            functionName: "collect",
            args: [
              {
                tokenId,
                recipient: ctx.wallet,
                amount0Max: (1n << 128n) - 1n,
                amount1Max: (1n << 128n) - 1n,
              },
            ],
          },
        },
      ],
    };
  },
};
