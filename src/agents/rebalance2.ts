/**
 * Range Keeper II, the conservative rebalancer.
 *
 * Same mechanism as Range Keeper I: hold a PancakeSwap V3 concentrated position
 * and re-centre it when price leaves the band. The difference is discipline.
 * Every re-centre crystallises impermanent loss and pays gas, so this variant
 * runs a *wider* band and a cooldown between re-centres. It gives up some fee
 * capture in a chop to lose far less to churn in a grind, the honest opposite
 * end of the same trade-off, and the reason we field two.
 *
 * It shares `driftOf` with Range Keeper I so the two cannot disagree about what
 * "outside the range" means; only the threshold and the cooldown differ.
 */

import type { Abi, Address } from "viem";
import { marketClient } from "@/lib/chain/market";
import { driftOf } from "./rebalance";
import { idle, type AgentContext, type Decision, type Strategy } from "./types";

const POSITION_MANAGER = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364" as const;

const PM_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenOfOwnerByIndex", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "positions", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" }, { name: "operator", type: "address" },
      { name: "token0", type: "address" }, { name: "token1", type: "address" },
      { name: "fee", type: "uint24" }, { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" }, { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" }, { name: "tokensOwed0", type: "uint128" }, { name: "tokensOwed1", type: "uint128" },
    ],
  },
  {
    type: "function", name: "decreaseLiquidity", stateMutability: "payable",
    inputs: [{ name: "params", type: "tuple", components: [
      { name: "tokenId", type: "uint256" }, { name: "liquidity", type: "uint128" },
      { name: "amount0Min", type: "uint256" }, { name: "amount1Min", type: "uint256" }, { name: "deadline", type: "uint256" },
    ] }],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
  {
    type: "function", name: "collect", stateMutability: "payable",
    inputs: [{ name: "params", type: "tuple", components: [
      { name: "tokenId", type: "uint256" }, { name: "recipient", type: "address" },
      { name: "amount0Max", type: "uint128" }, { name: "amount1Max", type: "uint128" },
    ] }],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
] as const;

/** Wider than Range Keeper I's 200: re-centre only on a real departure. */
export const DRIFT_TICKS_WIDE = 600;
/** No more than one re-centre per this many seconds, whatever price does. */
export const RECENTRE_COOLDOWN_S = 3600;

export const rebalanceConservativeStrategy: Strategy = {
  id: "rebalancing",
  name: "Range Keeper II",

  describe() {
    return `Holds a PancakeSwap V3 position and re-centres only once price drifts ${DRIFT_TICKS_WIDE} ticks outside the range, three times Range Keeper I's tolerance, and never more than once an hour, trading fee capture for far less impermanent-loss churn.`;
  },

  async evaluate(ctx: AgentContext): Promise<Decision> {
    const count = (await marketClient.readContract({
      address: POSITION_MANAGER, abi: PM_ABI, functionName: "balanceOf", args: [ctx.wallet],
    })) as bigint;
    if (count === 0n) {
      return idle(`no V3 position held by ${ctx.wallet.slice(0, 10)}…; a range must be minted before it can be kept`, ctx.state);
    }

    const tokenId = (await marketClient.readContract({
      address: POSITION_MANAGER, abi: PM_ABI, functionName: "tokenOfOwnerByIndex", args: [ctx.wallet, 0n],
    })) as bigint;
    const pos = (await marketClient.readContract({
      address: POSITION_MANAGER, abi: PM_ABI, functionName: "positions", args: [tokenId],
    })) as readonly unknown[];

    const tickLower = Number(pos[5]);
    const tickUpper = Number(pos[6]);
    const liquidity = pos[7] as bigint;
    const tick = ctx.price.tick;
    const drift = driftOf(tickLower, tickUpper, tick);

    const lastAt = Number(ctx.state.lastRebalanceAt ?? 0);
    const sinceLast = Math.floor(ctx.now / 1000) - lastAt;

    if (drift < DRIFT_TICKS_WIDE) {
      return idle(`position #${tokenId} drift ${drift} is under the ${DRIFT_TICKS_WIDE}-tick wide tolerance; holding`, ctx.state);
    }
    if (lastAt > 0 && sinceLast < RECENTRE_COOLDOWN_S) {
      return idle(`position #${tokenId} is ${drift} ticks out, but only ${sinceLast}s since the last re-centre, inside the ${RECENTRE_COOLDOWN_S}s cooldown, so it waits rather than churning`, ctx.state);
    }

    const deadline = BigInt(Math.floor(ctx.now / 1000) + 600);
    return {
      observed: `position #${tokenId} range [${tickLower}, ${tickUpper}] but pool tick is ${tick}, ${drift} ticks out, past the wide band, cooldown clear`,
      state: { ...ctx.state, lastRebalanceTick: tick, lastRebalanceAt: Math.floor(ctx.now / 1000) },
      actions: [
        {
          kind: "decrease",
          reason: `withdraw liquidity from the stale range; conservative re-centre after ${sinceLast}s`,
          expect: `position #${tokenId} liquidity falls to zero`,
          call: { address: POSITION_MANAGER as Address, abi: PM_ABI as unknown as Abi, functionName: "decreaseLiquidity", args: [{ tokenId, liquidity, amount0Min: 0n, amount1Min: 0n, deadline }] },
        },
        {
          kind: "collect",
          reason: "collect the withdrawn balance and accrued fees",
          expect: "token balances rise by the position value plus fees earned in range",
          call: { address: POSITION_MANAGER as Address, abi: PM_ABI as unknown as Abi, functionName: "collect", args: [{ tokenId, recipient: ctx.wallet, amount0Max: (1n << 128n) - 1n, amount1Max: (1n << 128n) - 1n }] },
        },
      ],
    };
  },
};
