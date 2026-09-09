/**
 * Re-derives the duplication figure the register publishes at rung 1.
 *
 * The register says its rows are not all distinct products. This is the
 * command that checks it: it reads the same index the site reads, collapses it
 * the same way, and prints the counts and the clusters behind them.
 *
 * It also prints the same measurement keyed with the owner included, because
 * that is the key most people would reach for first and it is the wrong one —
 * seeing both is the fastest way to understand why. One product minted once
 * per user wallet has a different owner on every copy, so adding the owner to
 * the key makes every copy unique and reports a clean register.
 *
 *   npm run dedup
 */

import { collapse, productKey } from "@/lib/dedup";
import { getAgentIndex } from "@/lib/data/agents";

const TOP = Number(process.argv[2] ?? 10);

const index = getAgentIndex();
const agents = index.agents;

if (agents.length === 0) {
  console.error("The index is empty. Run `npm run index` first.");
  process.exit(1);
}

const d = collapse(agents);

console.log(`index captured            : ${index.capturedAt}`);
console.log(`rows read                 : ${agents.length.toLocaleString()}`);
console.log(`  of a registry of         : ${index.registry.registered.toLocaleString()}`);
console.log("");
console.log(`rows measured             : ${d.counted.toLocaleString()}`);
console.log(`  skipped, no name or desc: ${d.unnamed.toLocaleString()}`);
console.log(`distinct products         : ${d.distinct.toLocaleString()}`);
console.log(`duplicate rows            : ${d.duplicateRows.toLocaleString()}  (${pct(d.duplicateRows, d.counted)})`);
console.log(`collapse ratio            : ${d.collapse.toFixed(2)}x`);
console.log(`products registered twice+: ${d.clusters.length.toLocaleString()}`);

/*
  The comparison that settles the key.

  Keyed with the owner, the same rows report an almost clean register. The gap
  between these two numbers is the finding, not a detail of implementation.
*/
const withOwner = new Map<string, number>();
for (const a of agents) {
  const k = productKey(a);
  if (k === null) continue;
  const key = `${k}|${(a.owner ?? "").trim().toLowerCase()}`;
  withOwner.set(key, (withOwner.get(key) ?? 0) + 1);
}
const ownerDistinct = withOwner.size;
const ownerDupes = d.counted - ownerDistinct;

console.log("\nkey comparison, same rows:");
console.log(
  `  name + description        : ${String(d.distinct).padStart(6)} distinct   ${d.collapse.toFixed(2)}x   ${pct(d.duplicateRows, d.counted).padStart(6)} duplicate`,
);
console.log(
  `  name + description + owner: ${String(ownerDistinct).padStart(6)} distinct   ${(d.counted / ownerDistinct).toFixed(2)}x   ${pct(ownerDupes, d.counted).padStart(6)} duplicate`,
);
console.log("  the owner is what the copies differ by, so keying on it hides them.");

console.log(`\ntop ${TOP} products by registrations:`);
for (const c of d.clusters.slice(0, TOP)) {
  const name = (c.name ?? "(unnamed)").slice(0, 44);
  console.log(
    `  ${String(c.count).padStart(4)}x  ${String(c.owners).padStart(4)} owners  ${name.padEnd(44)}  ids ${c.tokenIds.slice(0, 3).join(", ")}${c.tokenIds.length > 3 ? ", …" : ""}`,
  );
}

/*
  A cluster whose registrations all share one owner is a different thing from
  one spread across many, and only the second is a product minted per user.
  Printed separately so the two are never read as the same finding.
*/
const singleOwner = d.clusters.filter((c) => c.owners === 1);
if (singleOwner.length > 0) {
  console.log(
    `\n${singleOwner.length} of ${d.clusters.length} repeated products are one owner registering the same card more than once:`,
  );
  for (const c of singleOwner.slice(0, 5)) {
    console.log(`  ${String(c.count).padStart(4)}x  ${(c.name ?? "(unnamed)").slice(0, 52)}`);
  }
}

function pct(a: number, b: number) {
  return b === 0 ? "0%" : `${((a / b) * 100).toFixed(1)}%`;
}
