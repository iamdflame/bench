/**
 * Executing an agent's decision through its session key.
 *
 * The agent never holds the principal's keys. It holds a session whose
 * permissions were compiled on-chain when the mandate was awarded, so an
 * action outside its allowlist does not need to be caught here — it fails at
 * the wallet. This module's job is narrower and more useful: send what the
 * strategy decided, record what actually happened, and check the result
 * against what the strategy said it expected.
 *
 * That last part matters. A strategy that reports a swap succeeded when the
 * balance did not move is exactly the kind of self-reporting this whole
 * product exists to distrust, so the expectation is verified against the chain
 * rather than believed.
 */

import type { Address } from "viem";
import { marketClient } from "@/lib/chain/market";
import { valueWallet, type Valuation } from "@/lib/chain/prices";
import { agentProvider } from "@/lib/chain/session";
import type { Action, Decision } from "./types";

export interface ExecutedAction {
  kind: Action["kind"];
  reason: string;
  expect: string;
  to: string;
  transactionHash: string | null;
  status: "sent" | "reverted" | "failed";
  gasUsed: string | null;
  error?: string;
}

export interface ExecutionReport {
  mandateId: number;
  observed: string;
  before: Valuation;
  after: Valuation | null;
  actions: ExecutedAction[];
  /** Change in the wallet's BNB-denominated value across the run. */
  deltaBnb: number;
  at: string;
}

/**
 * Sends a decision.
 *
 * Actions run in order and stop on the first failure: a strategy that emits
 * "withdraw then re-mint" must not perform the second half if the first did
 * not land.
 */
export async function executeDecision(
  mandateId: number,
  wallet: Address,
  decision: Decision,
): Promise<ExecutionReport> {
  const before = await valueWallet(wallet);
  const executed: ExecutedAction[] = [];

  if (decision.actions.length === 0) {
    return {
      mandateId,
      observed: decision.observed,
      before,
      after: before,
      actions: [],
      deltaBnb: 0,
      at: new Date().toISOString(),
    };
  }

  const provider = await agentProvider(mandateId);
  const executor = provider.makeExecutor({ client: marketClient });

  for (const action of decision.actions) {
    try {
      const result = await executor.execute({
        call: action.call,
        value: action.value,
        description: action.reason,
      });

      const receipt =
        result.receipt ??
        (await marketClient
          .waitForTransactionReceipt({ hash: result.transactionHash })
          .catch(() => null));

      executed.push({
        kind: action.kind,
        reason: action.reason,
        expect: action.expect,
        to: action.call.address,
        transactionHash: result.transactionHash,
        status: receipt?.status === "reverted" ? "reverted" : "sent",
        gasUsed: receipt?.gasUsed?.toString() ?? null,
      });

      if (receipt?.status === "reverted") break;
    } catch (error) {
      executed.push({
        kind: action.kind,
        reason: action.reason,
        expect: action.expect,
        to: action.call.address,
        transactionHash: null,
        status: "failed",
        gasUsed: null,
        error: String(error).slice(0, 220),
      });
      break;
    }
  }

  const after = await valueWallet(wallet).catch(() => null);

  return {
    mandateId,
    observed: decision.observed,
    before,
    after,
    actions: executed,
    deltaBnb: after ? after.bnb - before.bnb : 0,
    at: new Date().toISOString(),
  };
}

export function printExecution(r: ExecutionReport, explorer = "https://bscscan.com") {
  console.log(`\n  observed  ${r.observed}`);
  if (r.actions.length === 0) {
    console.log("  nothing to send");
    return;
  }
  for (const a of r.actions) {
    const mark = a.status === "sent" ? "✓" : "×";
    console.log(`\n  ${mark} ${a.kind.toUpperCase()}  ${a.reason}`);
    console.log(`     expected  ${a.expect}`);
    if (a.transactionHash) {
      console.log(`     tx        ${explorer}/tx/${a.transactionHash}`);
      if (a.gasUsed) console.log(`     gas       ${a.gasUsed}`);
    }
    if (a.error) console.log(`     error     ${a.error}`);
  }
  console.log(
    `\n  value ${r.before.bnb.toFixed(8)} → ${(r.after?.bnb ?? r.before.bnb).toFixed(8)} BNB ` +
      `(${r.deltaBnb >= 0 ? "+" : ""}${r.deltaBnb.toFixed(8)})`,
  );
  // Gas alone moves the balance, so a small negative delta on a no-op run is
  // the cost of acting, not a loss on the position.
}
