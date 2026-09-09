/**
 * Grid trading on PancakeSwap V3.
 *
 * The strategy is deliberately the plain one: anchor a set of price levels
 * around a reference, buy the asset as price crosses down through a level and
 * sell as it crosses up through one. It makes money from oscillation and loses
 * to trend, which is exactly the honest behaviour to put in front of a
 * benchmark — a grid that beats hold in a chop and trails it in a rally is a
 * real result, and inventing something that always wins was the thing this
 * whole rebuild exists to stop doing.
 *
 * Every swap is `exactInputSingle` on the V3 router, which is the one selector
 * this category's session key is allowed to call.
 */

import type { Abi, Address } from "viem";
import { USDT, V3_ROUTER, WBNB } from "@/lib/chain/prices";
import { idle, type AgentContext, type Decision, type Strategy } from "./types";

const ROUTER_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

const FEE = 500; // the 0.05% WBNB/USDT pool, the deepest one
/** Levels are this far apart, in basis points of the anchor. */
const STEP_BPS = 50;
/** How many levels each side of the anchor. */
const LEVELS = 4;
/** Tolerated slippage on a fill. */
const SLIPPAGE_BPS = 100;

interface GridState {
  anchorUsd?: number;
  /** Index of the level the price last sat in, so we only act on a crossing. */
  lastLevel?: number;
  fills?: number;
}

const levelOf = (price: number, anchor: number) =>
  Math.round(((price - anchor) / anchor) * 10_000 / STEP_BPS);

export const gridStrategy: Strategy = {
  id: "grid-trading",
  name: "Grid",

  describe() {
    return `Places ${LEVELS * 2} levels ${STEP_BPS}bps apart around an anchor on the PancakeSwap V3 WBNB/USDT pool, buying as price crosses down through a level and selling as it crosses up.`;
  },

  async evaluate(ctx: AgentContext): Promise<Decision> {
    const state = ctx.state as GridState;
    const price = ctx.price.token0PerToken1; // USDT per WBNB
    const anchor = state.anchorUsd ?? price;

    // First run: set the anchor and take no position. An agent that trades on
    // its first observation is trading on no information.
    if (state.anchorUsd === undefined) {
      return idle(
        `anchored the grid at $${anchor.toFixed(2)}; ${LEVELS} levels either side, ${STEP_BPS}bps apart`,
        { anchorUsd: anchor, lastLevel: 0, fills: 0 },
      );
    }

    const level = Math.max(-LEVELS, Math.min(LEVELS, levelOf(price, anchor)));
    const last = state.lastLevel ?? 0;

    if (level === last) {
      return idle(
        `$${price.toFixed(2)} is still inside level ${level} of the grid anchored at $${anchor.toFixed(2)}`,
        state as Record<string, unknown>,
      );
    }

    // Crossing down means the asset got cheaper: buy. Crossing up: sell.
    const crossedDown = level < last;
    const bnbHeld = ctx.valuation.parts.find((p) => p.asset === "BNB")?.amount ?? 0;
    const usdtHeld = ctx.valuation.parts.find((p) => p.asset === "USDT")?.amount ?? 0;

    // One level's worth of the working budget per fill, so a run of crossings
    // scales in rather than betting the cap on the first one.
    const capBnb = Number(ctx.capWei) / 1e18;
    const clip = capBnb / (LEVELS * 2);

    if (crossedDown) {
      const spendUsdt = clip * price;
      if (usdtHeld < spendUsdt) {
        return idle(
          `price fell to level ${level} ($${price.toFixed(2)}) but only ${usdtHeld.toFixed(4)} USDT is held; nothing to buy with`,
          { ...state, lastLevel: level },
        );
      }
      return {
        observed: `price crossed down from level ${last} to ${level} ($${price.toFixed(2)} against a $${anchor.toFixed(2)} anchor)`,
        state: { ...state, lastLevel: level, fills: (state.fills ?? 0) + 1 },
        actions: [
          swap({
            tokenIn: USDT,
            tokenOut: WBNB,
            amountIn: BigInt(Math.floor(spendUsdt * 1e18)),
            minOut: BigInt(Math.floor((clip * (1 - SLIPPAGE_BPS / 10_000)) * 1e18)),
            recipient: ctx.wallet,
            reason: `buy ${clip.toFixed(6)} BNB at $${price.toFixed(2)}, a level below the anchor`,
            expect: `BNB balance rises by about ${clip.toFixed(6)}`,
          }),
        ],
      };
    }

    if (bnbHeld < clip) {
      return idle(
        `price rose to level ${level} ($${price.toFixed(2)}) but only ${bnbHeld.toFixed(6)} BNB is held; nothing to sell`,
        { ...state, lastLevel: level },
      );
    }
    return {
      observed: `price crossed up from level ${last} to ${level} ($${price.toFixed(2)} against a $${anchor.toFixed(2)} anchor)`,
      state: { ...state, lastLevel: level, fills: (state.fills ?? 0) + 1 },
      actions: [
        swap({
          tokenIn: WBNB,
          tokenOut: USDT,
          amountIn: BigInt(Math.floor(clip * 1e18)),
          minOut: BigInt(Math.floor(clip * price * (1 - SLIPPAGE_BPS / 10_000) * 1e18)),
          recipient: ctx.wallet,
          reason: `sell ${clip.toFixed(6)} BNB at $${price.toFixed(2)}, a level above the anchor`,
          expect: `USDT balance rises by about ${(clip * price).toFixed(4)}`,
        }),
      ],
    };
  },
};

function swap(o: {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minOut: bigint;
  recipient: Address;
  reason: string;
  expect: string;
}) {
  return {
    kind: "swap" as const,
    reason: o.reason,
    expect: o.expect,
    call: {
      address: V3_ROUTER as Address,
      abi: ROUTER_ABI as unknown as Abi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: o.tokenIn,
          tokenOut: o.tokenOut,
          fee: FEE,
          recipient: o.recipient,
          amountIn: o.amountIn,
          amountOutMinimum: o.minOut,
          sqrtPriceLimitX96: 0n,
        },
      ],
    },
  };
}
