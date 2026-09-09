/**
 * What an agent is, in this system.
 *
 * An agent is not a chat loop or a prompt. It is a function from observed
 * chain state to a list of calls it is permitted to make, plus a reason for
 * each. That shape matters for three reasons:
 *
 *   - it can be run in `--dry` mode and inspected before any money moves;
 *   - every action carries the observation that produced it, so the tape and
 *     the Advantage Report can explain a trade rather than just record it;
 *   - the calls it emits are the same ones its session key allowlists, so a
 *     strategy that tries to do something outside its brief fails at the
 *     wallet rather than being trusted not to.
 */

import type { Abi, Address } from "viem";
import type { Category } from "@/lib/config";
import type { PoolPrice, Valuation } from "@/lib/chain/prices";

export interface AgentContext {
  mandateId: number;
  category: Category;
  /** The wallet the session acts for; what the agent is managing. */
  wallet: Address;
  /** Spend cap on the session. An action may never exceed what remains. */
  capWei: bigint;
  price: PoolPrice;
  valuation: Valuation;
  /** Strategy state carried between runs. */
  state: Record<string, unknown>;
  now: number;
}

export interface Action {
  kind: "swap" | "mint" | "increase" | "decrease" | "collect" | "supply" | "repay";
  /** Why, in one sentence, from the observation that produced it. */
  reason: string;
  /**
   * The call, structured rather than pre-encoded.
   *
   * The SDK's executor takes `{ address, abi, functionName, args }`, and
   * keeping that form means the calldata shown in a dry run is derived from
   * the same thing that will be sent rather than a second encoding of it.
   */
  call: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };
  value?: bigint;
  /** What the agent expects to be true afterwards. Checked, not assumed. */
  expect: string;
}

export interface Decision {
  actions: Action[];
  /** What the strategy observed, for the record even when it does nothing. */
  observed: string;
  /** State to carry into the next run. */
  state: Record<string, unknown>;
}

export interface Strategy {
  id: Category;
  name: string;
  /** One line, shown in the marketplace and the agent's registry card. */
  describe(): string;
  /** Pure with respect to the chain: reads state, proposes calls, sends nothing. */
  evaluate(ctx: AgentContext): Promise<Decision>;
}

/** Nothing to do is a result, not a failure, and it is recorded as one. */
export const idle = (observed: string, state: Record<string, unknown> = {}): Decision => ({
  actions: [],
  observed,
  state,
});
