/**
 * Health Shield II, defends the loan by adding collateral, not shrinking it.
 *
 * Health Shield I repays the borrow to restore headroom, which works but leaves
 * the principal with a smaller position than they wanted. This variant prefers
 * to *supply more collateral*, it tops up the vToken with idle BNB, so the
 * loan stays the size the principal chose and the health factor still rises. It
 * only falls back to repaying when the position is already liquidatable (a
 * shortfall exists) or there is nothing idle to supply. More conservative about
 * the principal's intent; identically aggressive about liquidation.
 */

import type { Abi, Address } from "viem";
import { marketClient } from "@/lib/chain/market";
import { idle, type AgentContext, type Decision, type Strategy } from "./types";

const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384" as const;
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36" as const;

const COMPTROLLER_ABI = [
  { type: "function", name: "getAccountLiquidity", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
] as const;
const VBNB_ABI = [
  { type: "function", name: "repayBorrow", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "mint", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "borrowBalanceStored", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const HEADROOM_FLOOR = 0.3;   // acts a touch earlier than I's 0.25
const SUPPLY_SHARE = 0.25;    // top up collateral by this share of the borrow
const REPAY_SHARE = 0.2;

export const healthConservativeStrategy: Strategy = {
  id: "health-factor",
  name: "Health Shield II",

  describe() {
    return `Reads Venus account liquidity each epoch and, when headroom falls below ${Math.round(HEADROOM_FLOOR * 100)}% of the borrow, supplies more collateral to restore it, keeping the loan the size the principal chose, and only repays when a shortfall already exists or nothing is idle to supply.`;
  },

  async evaluate(ctx: AgentContext): Promise<Decision> {
    const [liq, borrow] = await Promise.all([
      marketClient.readContract({ address: COMPTROLLER, abi: COMPTROLLER_ABI, functionName: "getAccountLiquidity", args: [ctx.wallet] }) as Promise<readonly [bigint, bigint, bigint]>,
      marketClient.readContract({ address: VBNB, abi: VBNB_ABI, functionName: "borrowBalanceStored", args: [ctx.wallet] }) as Promise<bigint>,
    ]);
    const [, liquidity, shortfall] = liq;
    const liquidityUsd = Number(liquidity) / 1e18;
    const shortfallUsd = Number(shortfall) / 1e18;
    const borrowBnb = Number(borrow) / 1e18;
    const borrowUsd = borrowBnb * ctx.price.token0PerToken1;
    const idleBnb = ctx.valuation.parts.find((p) => p.asset === "BNB")?.amount ?? 0;
    const capBnb = Number(ctx.capWei) / 1e18;

    if (borrowUsd === 0) {
      return idle(`no borrow outstanding on Venus; headroom $${liquidityUsd.toFixed(2)}, nothing to protect`, ctx.state);
    }
    const headroomRatio = liquidityUsd / borrowUsd;

    // Already liquidatable, repay immediately, exactly like Health Shield I.
    if (shortfallUsd > 0) {
      const repayBnb = Math.min(borrowBnb * REPAY_SHARE, capBnb);
      return {
        observed: `SHORTFALL $${shortfallUsd.toFixed(2)}, the position is already liquidatable; repaying takes priority over preserving size`,
        state: ctx.state,
        actions: [repay(repayBnb, `repay ${repayBnb.toFixed(6)} BNB to clear a $${shortfallUsd.toFixed(2)} shortfall`)],
      };
    }

    if (headroomRatio < HEADROOM_FLOOR) {
      const wantSupplyBnb = Math.min(borrowBnb * SUPPLY_SHARE, capBnb, Math.max(0, idleBnb - 0.0003));
      if (wantSupplyBnb > 0) {
        return {
          observed: `headroom $${liquidityUsd.toFixed(2)} is ${(headroomRatio * 100).toFixed(1)}% of a $${borrowUsd.toFixed(2)} borrow, below the ${Math.round(HEADROOM_FLOOR * 100)}% floor, topping up collateral to keep the loan intact`,
          state: ctx.state,
          actions: [{
            kind: "supply", reason: `supply ${wantSupplyBnb.toFixed(6)} BNB of collateral to restore headroom without shrinking the loan`,
            expect: "collateral rises, health factor rises, borrow unchanged",
            value: BigInt(Math.floor(wantSupplyBnb * 1e18)),
            call: { address: VBNB as Address, abi: VBNB_ABI as unknown as Abi, functionName: "mint", args: [] },
          }],
        };
      }
      // Nothing idle to supply, fall back to repaying, like I.
      const repayBnb = Math.min(borrowBnb * REPAY_SHARE, capBnb);
      return {
        observed: `headroom is ${(headroomRatio * 100).toFixed(1)}% of the borrow and nothing is idle to add as collateral, so falling back to a repay of ${repayBnb.toFixed(6)} BNB`,
        state: ctx.state,
        actions: [repay(repayBnb, `repay ${repayBnb.toFixed(6)} BNB, no idle collateral to add`)],
      };
    }

    return idle(`headroom $${liquidityUsd.toFixed(2)} is ${(headroomRatio * 100).toFixed(1)}% of a $${borrowUsd.toFixed(2)} borrow, comfortable, no action`, ctx.state);
  },
};

const repay = (bnb: number, reason: string) => ({
  kind: "repay" as const, reason,
  expect: `borrow balance falls by about ${bnb.toFixed(6)} BNB and headroom rises`,
  value: BigInt(Math.floor(bnb * 1e18)),
  call: { address: VBNB as Address, abi: VBNB_ABI as unknown as Abi, functionName: "repayBorrow", args: [] },
});
