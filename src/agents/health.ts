/**
 * Health factor monitoring on Venus.
 *
 * Watches a lending position's distance to liquidation and acts before the
 * liquidators do. Most of the time the correct action is none, and the value
 * of the agent is entirely in the epochs where it is not: this is the category
 * where doing nothing well matters more than trading often.
 *
 * Venus reports `getAccountLiquidity` as (error, liquidity, shortfall) in USD
 * with 18 decimals. Liquidity is the borrowing headroom left; shortfall is
 * non-zero only once the position is already liquidatable, which is too late.
 * So the trigger is headroom falling below a fraction of the borrow, not
 * shortfall appearing.
 */

import type { Abi, Address } from "viem";
import { marketClient } from "@/lib/chain/market";
import { idle, type AgentContext, type Decision, type Strategy } from "./types";

const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384" as const;
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36" as const;

const COMPTROLLER_ABI = [
  {
    type: "function",
    name: "getAccountLiquidity",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
  },
] as const;

const VBNB_ABI = [
  { type: "function", name: "repayBorrow", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "mint", stateMutability: "payable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "borrowBalanceStored",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Act once headroom falls below this share of the outstanding borrow. */
const HEADROOM_FLOOR = 0.25;
/** Repay this share of the borrow when intervening. */
const REPAY_SHARE = 0.2;

export const healthStrategy: Strategy = {
  id: "health-factor",
  name: "Health Factor",

  describe() {
    return `Reads Venus account liquidity each epoch and repays ${Math.round(REPAY_SHARE * 100)}% of the borrow when headroom falls below ${Math.round(HEADROOM_FLOOR * 100)}% of it — before shortfall appears, because shortfall means liquidation is already available.`;
  },

  async evaluate(ctx: AgentContext): Promise<Decision> {
    const [liq, borrow] = await Promise.all([
      marketClient.readContract({
        address: COMPTROLLER,
        abi: COMPTROLLER_ABI,
        functionName: "getAccountLiquidity",
        args: [ctx.wallet],
      }) as Promise<readonly [bigint, bigint, bigint]>,
      marketClient.readContract({
        address: VBNB,
        abi: VBNB_ABI,
        functionName: "borrowBalanceStored",
        args: [ctx.wallet],
      }) as Promise<bigint>,
    ]);

    const [, liquidity, shortfall] = liq;
    const liquidityUsd = Number(liquidity) / 1e18;
    const shortfallUsd = Number(shortfall) / 1e18;
    const borrowBnb = Number(borrow) / 1e18;
    const borrowUsd = borrowBnb * ctx.price.token0PerToken1;

    if (borrowUsd === 0) {
      return idle(
        `no borrow outstanding on Venus; headroom $${liquidityUsd.toFixed(2)}, nothing to protect`,
        ctx.state,
      );
    }

    const headroomRatio = borrowUsd > 0 ? liquidityUsd / borrowUsd : Infinity;

    if (shortfallUsd > 0) {
      // Already liquidatable. Repay as much as the cap allows, immediately.
      const repayBnb = Math.min(borrowBnb * REPAY_SHARE, Number(ctx.capWei) / 1e18);
      return {
        observed: `SHORTFALL $${shortfallUsd.toFixed(2)} — the position is already liquidatable`,
        state: ctx.state,
        actions: [repay(repayBnb, `repay ${repayBnb.toFixed(6)} BNB to clear a $${shortfallUsd.toFixed(2)} shortfall`)],
      };
    }

    if (headroomRatio < HEADROOM_FLOOR) {
      const repayBnb = Math.min(borrowBnb * REPAY_SHARE, Number(ctx.capWei) / 1e18);
      return {
        observed: `headroom $${liquidityUsd.toFixed(2)} is ${(headroomRatio * 100).toFixed(1)}% of a $${borrowUsd.toFixed(2)} borrow, below the ${Math.round(HEADROOM_FLOOR * 100)}% floor`,
        state: ctx.state,
        actions: [
          repay(
            repayBnb,
            `repay ${repayBnb.toFixed(6)} BNB to restore headroom before liquidation becomes available`,
          ),
        ],
      };
    }

    return idle(
      `headroom $${liquidityUsd.toFixed(2)} is ${(headroomRatio * 100).toFixed(1)}% of a $${borrowUsd.toFixed(2)} borrow — comfortable, no action`,
      ctx.state,
    );
  },
};

const repay = (bnb: number, reason: string) => ({
  kind: "repay" as const,
  reason,
  expect: `borrow balance falls by about ${bnb.toFixed(6)} BNB and headroom rises`,
  value: BigInt(Math.floor(bnb * 1e18)),
  call: {
    address: VBNB as Address,
    abi: VBNB_ABI as unknown as Abi,
    functionName: "repayBorrow",
    args: [],
  },
});
