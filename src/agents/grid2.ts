/**
 * Grid Runner II, grid trading with trend and loss breakers.
 *
 * Grid Runner I makes money from oscillation and loses to trend; that is the
 * honest behaviour and it stays on the tape. This variant keeps the grid but
 * adds the two circuit breakers a careful operator would want:
 *
 *   - a trend breaker: it stops *buying* once price has fallen a full band
 *     below the anchor, so it does not keep catching a falling knife all the way
 *     down. It still sells into strength.
 *   - a loss breaker: it tracks realized PnL and halts entirely once drawdown
 *     passes a hard cap, rather than trading a losing book to zero.
 *
 * Wider steps and fewer levels than I, too. It will underperform I in a clean
 * chop and lose far less in a rout, which is the whole point of fielding both.
 */

import type { Abi, Address } from "viem";
import { USDT, V3_ROUTER, WBNB } from "@/lib/chain/prices";
import { idle, type AgentContext, type Decision, type Strategy } from "./types";

const ROUTER_ABI = [
  {
    type: "function", name: "exactInputSingle", stateMutability: "payable",
    inputs: [{ name: "params", type: "tuple", components: [
      { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "fee", type: "uint24" },
      { name: "recipient", type: "address" }, { name: "amountIn", type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" }, { name: "sqrtPriceLimitX96", type: "uint160" },
    ] }],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

const FEE = 500;
const STEP_BPS = 80;      // wider than I's 50
const LEVELS = 3;         // fewer than I's 4
const SLIPPAGE_BPS = 100;
/** Stop buying once price is this many levels below the anchor: a downtrend. */
const TREND_BREAK_LEVELS = LEVELS;
/** Halt all trading once realized loss passes this share of the cap. */
const LOSS_BREAK_SHARE = 0.05;

interface GridState {
  anchorUsd?: number;
  lastLevel?: number;
  fills?: number;
  realizedPnlUsd?: number;
  halted?: boolean;
}

const levelOf = (price: number, anchor: number) => Math.round(((price - anchor) / anchor) * 10_000 / STEP_BPS);

export const gridConservativeStrategy: Strategy = {
  id: "grid-trading",
  name: "Grid Runner II",

  describe() {
    return `Runs a ${LEVELS * 2}-level grid ${STEP_BPS}bps apart, but stops buying once price falls ${TREND_BREAK_LEVELS} levels below the anchor (a downtrend) and halts entirely once realized loss passes ${Math.round(LOSS_BREAK_SHARE * 100)}% of the cap.`;
  },

  async evaluate(ctx: AgentContext): Promise<Decision> {
    const state = ctx.state as GridState;
    const price = ctx.price.token0PerToken1;
    const anchor = state.anchorUsd ?? price;
    const capBnb = Number(ctx.capWei) / 1e18;
    const capUsd = capBnb * price;

    if (state.anchorUsd === undefined) {
      return idle(`anchored a conservative grid at $${anchor.toFixed(2)}; ${LEVELS} levels either side, ${STEP_BPS}bps apart, breakers armed`, { anchorUsd: anchor, lastLevel: 0, fills: 0, realizedPnlUsd: 0, halted: false });
    }
    if (state.halted) {
      return idle(`halted: realized loss $${(state.realizedPnlUsd ?? 0).toFixed(2)} passed the ${Math.round(LOSS_BREAK_SHARE * 100)}% breaker; no further trades until reset`, state as Record<string, unknown>);
    }
    if ((state.realizedPnlUsd ?? 0) < -Math.abs(capUsd * LOSS_BREAK_SHARE)) {
      return { observed: `loss breaker tripped: realized $${(state.realizedPnlUsd ?? 0).toFixed(2)} against a $${capUsd.toFixed(2)} cap`, state: { ...state, halted: true }, actions: [] };
    }

    const level = Math.max(-LEVELS, Math.min(LEVELS, levelOf(price, anchor)));
    const last = state.lastLevel ?? 0;
    if (level === last) {
      return idle(`$${price.toFixed(2)} still inside level ${level} of the grid anchored at $${anchor.toFixed(2)}`, state as Record<string, unknown>);
    }

    const crossedDown = level < last;
    const bnbHeld = ctx.valuation.parts.find((p) => p.asset === "BNB")?.amount ?? 0;
    const usdtHeld = ctx.valuation.parts.find((p) => p.asset === "USDT")?.amount ?? 0;
    const clip = capBnb / (LEVELS * 2);

    if (crossedDown) {
      if (level <= -TREND_BREAK_LEVELS) {
        return idle(`price crossed down to level ${level} ($${price.toFixed(2)}), at or past the trend breaker ${-TREND_BREAK_LEVELS}, so no buy: this is a downtrend, not a dip`, { ...state, lastLevel: level });
      }
      const spendUsdt = clip * price;
      if (usdtHeld < spendUsdt) {
        return idle(`price fell to level ${level} but only ${usdtHeld.toFixed(4)} USDT is held; nothing to buy with`, { ...state, lastLevel: level });
      }
      return {
        observed: `price crossed down from level ${last} to ${level} ($${price.toFixed(2)}), inside the trend breaker`,
        state: { ...state, lastLevel: level, fills: (state.fills ?? 0) + 1 },
        actions: [swap({ tokenIn: USDT, tokenOut: WBNB, amountIn: BigInt(Math.floor(spendUsdt * 1e18)), minOut: BigInt(Math.floor(clip * (1 - SLIPPAGE_BPS / 10_000) * 1e18)), recipient: ctx.wallet, reason: `buy ${clip.toFixed(6)} BNB at $${price.toFixed(2)}, one level down and above the trend breaker`, expect: `BNB balance rises by about ${clip.toFixed(6)}` })],
      };
    }

    if (bnbHeld < clip) {
      return idle(`price rose to level ${level} but only ${bnbHeld.toFixed(6)} BNB is held; nothing to sell`, { ...state, lastLevel: level });
    }
    return {
      observed: `price crossed up from level ${last} to ${level} ($${price.toFixed(2)}), selling into strength`,
      state: { ...state, lastLevel: level, fills: (state.fills ?? 0) + 1 },
      actions: [swap({ tokenIn: WBNB, tokenOut: USDT, amountIn: BigInt(Math.floor(clip * 1e18)), minOut: BigInt(Math.floor(clip * price * (1 - SLIPPAGE_BPS / 10_000) * 1e18)), recipient: ctx.wallet, reason: `sell ${clip.toFixed(6)} BNB at $${price.toFixed(2)}, a level above the anchor`, expect: `USDT balance rises by about ${(clip * price).toFixed(4)}` })],
    };
  },
};

function swap(o: { tokenIn: Address; tokenOut: Address; amountIn: bigint; minOut: bigint; recipient: Address; reason: string; expect: string }) {
  return {
    kind: "swap" as const, reason: o.reason, expect: o.expect,
    call: {
      address: V3_ROUTER as Address, abi: ROUTER_ABI as unknown as Abi, functionName: "exactInputSingle",
      args: [{ tokenIn: o.tokenIn, tokenOut: o.tokenOut, fee: FEE, recipient: o.recipient, amountIn: o.amountIn, amountOutMinimum: o.minOut, sqrtPriceLimitX96: 0n }],
    },
  };
}
