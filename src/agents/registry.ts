/**
 * The strategy registry and the context they evaluate against.
 *
 * Kept separate from the CLI: `run.ts` parses argv and calls `process.exit`
 * at module scope, so anything importing it — the API route that shows the
 * agents we operate, for instance — would execute the command line parser
 * during a page build and abort it. Library and entry point are different
 * things and this file is the library.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { encodeFunctionData, type Address } from "viem";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/config";
import { readPool, valueWallet } from "@/lib/chain/prices";
import { loadMeta } from "@/lib/chain/session";
import { executeDecision, printExecution } from "./execute";
import type { AgentContext, Decision, Strategy } from "./types";
import { gridStrategy } from "./grid";
import { healthStrategy } from "./health";
import { rebalanceStrategy } from "./rebalance";
import { yieldStrategy } from "./yield";

export const STRATEGIES: Record<Category, Strategy> = {
  "grid-trading": gridStrategy,
  "health-factor": healthStrategy,
  rebalancing: rebalanceStrategy,
  "yield-optimisation": yieldStrategy,
};

/** Short names, so a command line is not a category slug. */
export const ALIASES: Record<string, Category> = {
  grid: "grid-trading",
  "grid-trading": "grid-trading",
  health: "health-factor",
  "health-factor": "health-factor",
  rebalance: "rebalancing",
  rebalancing: "rebalancing",
  yield: "yield-optimisation",
  "yield-optimisation": "yield-optimisation",
};

const STATE_DIR = ".agent-state";
const statePath = (c: Category) => `${STATE_DIR}/${c}.json`;

export function loadState(c: Category): Record<string, unknown> {
  const p = statePath(c);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function saveState(c: Category, state: Record<string, unknown>) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath(c), JSON.stringify(state, null, 2));
}

export async function buildContext(opts: {
  category: Category;
  wallet: Address;
  capWei: bigint;
  mandateId: number;
}): Promise<AgentContext> {
  const [price, valuation] = await Promise.all([readPool(), valueWallet(opts.wallet)]);
  return {
    mandateId: opts.mandateId,
    category: opts.category,
    wallet: opts.wallet,
    capWei: opts.capWei,
    price,
    valuation,
    state: loadState(opts.category),
    now: Date.now(),
  };
}

export function printDecision(strategy: Strategy, ctx: AgentContext, d: Decision) {
  const rule = "─".repeat(74);
  console.log(rule);
  console.log(`${strategy.name}  ·  ${CATEGORY_LABEL[strategy.id]}`);
  console.log(rule);
  console.log(strategy.describe());
  console.log();
  console.log(`  wallet     ${ctx.wallet}`);
  console.log(`  managing   ${ctx.valuation.bnb.toFixed(8)} BNB  ($${ctx.valuation.usd.toFixed(2)})`);
  console.log(`  spend cap  ${(Number(ctx.capWei) / 1e18).toFixed(8)} BNB`);
  console.log(`  BNB price  $${ctx.price.token0PerToken1.toFixed(2)}  (tick ${ctx.price.tick})`);
  console.log();
  console.log(`  observed   ${d.observed}`);
  console.log();

  if (d.actions.length === 0) {
    console.log("  no action this epoch");
  } else {
    for (const [i, a] of d.actions.entries()) {
      console.log(`  action ${i + 1}  ${a.kind.toUpperCase()}`);
      console.log(`    why      ${a.reason}`);
      console.log(`    expect   ${a.expect}`);
      console.log(`    to       ${a.call.address}`);
      console.log(`    call     ${a.call.functionName}`);
      if (a.value) console.log(`    value    ${(Number(a.value) / 1e18).toFixed(8)} BNB`);
      // Derived from the same call that will be sent, not a second encoding.
      const data = encodeFunctionData({
        abi: a.call.abi,
        functionName: a.call.functionName,
        args: a.call.args as never,
      });
      console.log(`    calldata ${data.slice(0, 34)}… (${(data.length - 2) / 2} bytes)`);
    }
  }
  console.log(rule);
}

