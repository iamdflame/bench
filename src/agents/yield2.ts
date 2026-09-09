/**
 * Yield Router II, higher hysteresis, fewer moves.
 *
 * Yield Router I already refuses to chase a spread it cannot pay for. This
 * variant is stricter still: it needs the expected gain over the term to clear
 * six times the cost of moving, keeps a larger gas reserve, and will not deploy
 * a position smaller than a floor, because a dust supply earns dust and still
 * costs a full round trip to unwind. The result is a router that moves rarely
 * and only on a spread wide enough to survive being wrong about it.
 */

import type { Abi, Address } from "viem";
import { marketClient } from "@/lib/chain/market";
import { idle, type AgentContext, type Decision, type Strategy } from "./types";

const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36" as const;
const BLOCKS_PER_YEAR = 28_800_000;

const VBNB_ABI = [
  { type: "function", name: "supplyRatePerBlock", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOfUnderlying", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mint", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "redeemUnderlying", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

/** Six times the cost of moving, versus Yield Router I's three. */
const WORTH_MOVING = 6;
/** Keep more back for gas than I does; a conservative router never runs dry. */
const RESERVE_BNB = 0.0005;
/** Do not deploy less than this, dust earns dust and still costs a round trip. */
const MIN_DEPLOY_BNB = 0.01;

export const yieldConservativeStrategy: Strategy = {
  id: "yield-optimisation",
  name: "Yield Router II",

  describe() {
    return `Deploys idle capital to Venus only when the expected gain over the term clears ${WORTH_MOVING}× the cost of moving and the position is at least ${MIN_DEPLOY_BNB} BNB, a high-hysteresis router that moves rarely and only on a spread worth the risk of being wrong.`;
  },

  async evaluate(ctx: AgentContext): Promise<Decision> {
    const [ratePerBlock, supplied] = await Promise.all([
      marketClient.readContract({ address: VBNB, abi: VBNB_ABI, functionName: "supplyRatePerBlock" }) as Promise<bigint>,
      marketClient.readContract({ address: VBNB, abi: VBNB_ABI, functionName: "balanceOfUnderlying", args: [ctx.wallet] }).catch(() => 0n) as Promise<bigint>,
    ]);

    const apr = (Number(ratePerBlock) / 1e18) * BLOCKS_PER_YEAR;
    const suppliedBnb = Number(supplied) / 1e18;
    const idleBnb = ctx.valuation.parts.find((p) => p.asset === "BNB")?.amount ?? 0;
    const deployable = Math.max(0, Math.min(idleBnb - RESERVE_BNB, Number(ctx.capWei) / 1e18));

    if (deployable < MIN_DEPLOY_BNB) {
      return idle(`Venus pays ${(apr * 100).toFixed(2)}% APR; ${suppliedBnb.toFixed(6)} BNB supplied, only ${deployable.toFixed(6)} idle beyond reserve, under the ${MIN_DEPLOY_BNB} BNB floor, so it stays put`, ctx.state);
    }

    const moveCost = 0.00003;
    const termDays = 1;
    const expectedGain = deployable * apr * (termDays / 365);

    if (expectedGain < moveCost * WORTH_MOVING) {
      return idle(`Venus pays ${(apr * 100).toFixed(2)}% APR, ${deployable.toFixed(6)} BNB would earn ${expectedGain.toFixed(8)} over ${termDays}d against ${moveCost.toFixed(8)} to move; short of the ${WORTH_MOVING}× bar, so no`, ctx.state);
    }

    return {
      observed: `Venus pays ${(apr * 100).toFixed(2)}% APR; ${deployable.toFixed(6)} BNB idle would earn ${expectedGain.toFixed(8)} over ${termDays}d, clearing the ${WORTH_MOVING}× conservative bar`,
      state: { ...ctx.state, lastApr: apr },
      actions: [{
        kind: "supply", reason: `supply ${deployable.toFixed(6)} BNB to Venus at ${(apr * 100).toFixed(2)}% APR`,
        expect: `vBNB balance rises and idle BNB falls to about ${RESERVE_BNB}`,
        value: BigInt(Math.floor(deployable * 1e18)),
        call: { address: VBNB as Address, abi: VBNB_ABI as unknown as Abi, functionName: "mint", args: [] },
      }],
    };
  },
};
