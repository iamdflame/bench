/**
 * What authority our own agent could be granted today, per category.
 *
 *   npm run scope-audit
 *
 * The four registered sessions were granted before `granted ⊆ proven` existed,
 * from a hardcoded per-category allowlist. This re-derives each one under the
 * rule and prints what it would actually get now. It is published because the
 * answer is unflattering, and a product that argues nobody should be believed
 * without evidence does not get to exempt itself.
 */

import type { Address } from "viem";
import { walletFor } from "@/lib/chain/market";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/config";
import { isRefused, scopeFromChain } from "@/lib/chain/scope";
import { readPublicIndex } from "@/lib/chain/session";

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
const agent = walletFor(norm(process.env.AGENT_A_KEY)).account!.address as Address;

const sessions = readPublicIndex();
const granted = new Map<Category, number>();
for (const [id, s] of Object.entries(sessions)) granted.set(s.category as Category, Number(id));

console.log(`\n  agent ${agent}\n`);
console.log(`  ${"category".padEnd(22)} ${"session".padEnd(9)} derived today`);
console.log(`  ${"-".repeat(22)} ${"-".repeat(9)} ${"-".repeat(46)}`);

let refusedCount = 0;
for (const category of CATEGORIES) {
  const mandate = granted.get(category);
  const scope = await scopeFromChain(agent, category);
  const label = CATEGORY_LABEL[category].padEnd(22);
  const held = (mandate === undefined ? "—" : `mandate ${mandate}`).padEnd(9);
  if (isRefused(scope)) {
    refusedCount++;
    console.log(`  ${label} ${held} REFUSED — ${scope.reason.slice(0, 44)}`);
  } else {
    console.log(`  ${label} ${held} ${scope.calls.length}/${scope.calls.length + scope.withheld.length} calls`);
  }
}

console.log(
  `\n  ${refusedCount} of ${CATEGORIES.length} categories would be refused for this agent today.`,
);
console.log(
  `  The live sessions predate the invariant. It governs grants from here on,`,
);
console.log(`  and it refuses most of ours — which is the correct answer.\n`);
