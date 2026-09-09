/**
 * Runs an agent from the command line.
 *
 *   npm run agent -- grid --dry          observe and print, send nothing
 *   npm run agent -- grid --mandate 2 --live
 *
 * Dry is the default. A strategy that has never been read in dry mode should
 * not be trusted with a session key, and the output is deliberately verbose
 * about *why* each action was chosen — that reasoning is what the tape and the
 * Advantage Report quote later.
 */

import type { Address } from "viem";
import { CATEGORIES, type Category } from "@/lib/config";
import { loadMeta } from "@/lib/chain/session";
import { ALIASES, STRATEGIES, buildContext, printDecision, saveState } from "./registry";
import { executeDecision, printExecution } from "./execute";

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const which = process.argv[2];
const dry = !process.argv.includes("--live");
const mandateId = Number(arg("--mandate") ?? 0);

if (!which || which.startsWith("--")) {
  console.error("usage: npm run agent -- <grid|health|rebalance|yield> [--mandate N] [--live]");
  console.error(`  strategies: ${CATEGORIES.join(", ")}`);
  process.exit(1);
}

const category = ALIASES[which];
if (!category) {
  console.error(`unknown strategy "${which}". one of: ${Object.keys(ALIASES).join(", ")}`);
  process.exit(1);
}

const strategy = STRATEGIES[category as Category];

// The wallet the agent manages: the mandate's session wallet if one has been
// granted, otherwise the principal's own address for observation.
const session = mandateId ? loadMeta(mandateId) : null;
const wallet = (session?.walletAddress ??
  process.env.AGENT_A_ADDR ??
  "0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90") as Address;
const capWei = session ? BigInt(session.capWei) : BigInt(process.env.AGENT_CAP_WEI ?? "500000000000000");

if (session) {
  const left = session.expiry - Math.floor(Date.now() / 1000);
  console.log(
    `session for mandate ${mandateId}: key ${session.sessionKey.slice(0, 12)}… · ` +
      `${session.allowlist.length} allowed calls · expires in ${Math.max(0, Math.round(left / 60))}min` +
      `${session.registered ? " · registered in KeyStore" : " · ephemeral"}\n`,
  );
} else if (mandateId) {
  console.log(`no session on file for mandate ${mandateId}; observing only\n`);
}

const ctx = await buildContext({ category, wallet, capWei, mandateId });
const decision = await strategy.evaluate(ctx);
printDecision(strategy, ctx, decision);
saveState(category, decision.state);

if (dry) {
  console.log("\ndry run — nothing was sent. add --live with a granted session to act.\n");
  process.exit(0);
}

if (!session) {
  console.error("refusing to act: --live needs a granted session (--mandate N).");
  process.exit(1);
}

if (session.expiry <= Math.floor(Date.now() / 1000)) {
  console.error("refusing to act: this session has expired. grant a new one.");
  process.exit(1);
}

const report = await executeDecision(mandateId, wallet, decision);
printExecution(report);
console.log();
