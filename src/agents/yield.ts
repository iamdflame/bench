/**
 * Yield routing between venues.
 *
 * Reads the supply rate actually being paid on Venus and compares it against
 * the position's current placement, moving only when the difference clears the
 * cost of moving. That last clause is the whole strategy: a router that chases
 * every basis point of headline APR pays more in gas and slippage than the
 * spread it captured, which is the most common way yield optimisers lose money
 * while reporting that they are winning.
 *
 * Venus quotes `supplyRatePerBlock` in 1e18 units per block. BSC produces
 * roughly 28.8m blocks a year at 1.095s, which is the multiplier used here.
 */

import type { Abi, Address } from "viem";
import { marketClient } from "@/lib/chain/market";
import { idle, type AgentContext, type Decision, type Strategy } from "./types";

const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36" as const;
const BLOCKS_PER_YEAR = 28_800_000;

const VBNB_ABI = [
  {
    type: "function",
    name: "supplyRatePerBlock",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOfUnderlying",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "mint", stateMutability: "payable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "redeemUnderlying",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Only move when the gain over a term beats this multiple of the move's cost. */
const WORTH_MOVING = 3;

export const yieldStrategy: Strategy = {
  id: "yield-optimisation",
  name: "Yield Router",

  describe() {
    return `Compares idle capital against the supply rate Venus is actually paying and deploys only when the expected gain over the remaining term is ${WORTH_MOVING}x the cost of moving.`;
  },

  async evaluate(ctx: AgentContext): Promise<Decision> {
    const [ratePerBlock, supplied] = await Promise.all([
      marketClient.readContract({
        address: VBNB,
        abi: VBNB_ABI,
        functionName: "supplyRatePerBlock",
      }) as Promise<bigint>,
      marketClient.readContract({
        address: VBNB,
        abi: VBNB_ABI,
        functionName: "balanceOfUnderlying",
        args: [ctx.wallet],
      }).catch(() => 0n) as Promise<bigint>,
    ]);

    const apr = (Number(ratePerBlock) / 1e18) * BLOCKS_PER_YEAR;
    const suppliedBnb = Number(supplied) / 1e18;
    const idleBnb = ctx.valuation.parts.find((p) => p.asset === "BNB")?.amount ?? 0;

    // Keep a gas reserve; a strategy that supplies its last wei cannot act again.
    const reserve = 0.0002;
    const deployable = Math.max(0, Math.min(idleBnb - reserve, Number(ctx.capWei) / 1e18));

    if (deployable <= 0) {
      return idle(
        `Venus pays ${(apr * 100).toFixed(2)}% APR; ${suppliedBnb.toFixed(6)} BNB already supplied and nothing idle beyond the gas reserve`,
        ctx.state,
      );
    }

    // A rough cost of the round trip at current gas, in BNB.
    const moveCost = 0.00003;
    const termDays = 1;
    const expectedGain = deployable * apr * (termDays / 365);

    if (expectedGain < moveCost * WORTH_MOVING) {
      return idle(
        `Venus pays ${(apr * 100).toFixed(2)}% APR — ${deployable.toFixed(6)} BNB would earn ${expectedGain.toFixed(8)} BNB over ${termDays}d against ${moveCost.toFixed(8)} to move; not worth it`,
        ctx.state,
      );
    }

    return {
      observed: `Venus pays ${(apr * 100).toFixed(2)}% APR; ${deployable.toFixed(6)} BNB idle would earn ${expectedGain.toFixed(8)} BNB over ${termDays}d, clearing the ${WORTH_MOVING}x cost bar`,
      state: { ...ctx.state, lastApr: apr },
      actions: [
        {
          kind: "supply",
          reason: `supply ${deployable.toFixed(6)} BNB to Venus at ${(apr * 100).toFixed(2)}% APR`,
          expect: `vBNB balance rises and idle BNB falls to about ${reserve}`,
          value: BigInt(Math.floor(deployable * 1e18)),
          call: {
            address: VBNB as Address,
            abi: VBNB_ABI as unknown as Abi,
            functionName: "mint",
            args: [],
          },
        },
      ],
    };
  },
};
