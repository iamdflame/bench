/**
 * Fills in the agents the indexer got nothing for, by reading the chain.
 *
 *   npm run backfill:cards
 *
 * The catalog is built from 8004scan, which is fast and occasionally returns a
 * registration with no name and no description. Twenty-three of four thousand
 * came back empty that way, and among them were every one of a competitor's
 * four agents. So the marketplace was quietly missing exactly the listings that
 * make the strongest argument for it being a marketplace at all, and it was
 * missing them for an indexing reason rather than a real one.
 *
 * `readRegistryEntry` goes to the ERC-8004 contract instead: `ownerOf` for the
 * holder, `tokenURI` for the card, then the card itself. Slower, no API key,
 * nothing that can be rate-limited away. Only the empty rows are re-read, so
 * this stays cheap.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readRegistryEntry } from "@/lib/sources/registry";
import { classify } from "@/lib/assay/classify";
import type { AgentIndex } from "@/lib/data/agents";

const OUT = join(process.cwd(), "src/data/agents.json");
const CONCURRENCY = 6;
const log = (...a: unknown[]) => console.log("·", ...a);

async function main() {
  const index = JSON.parse(readFileSync(OUT, "utf8")) as AgentIndex;

  const blank = index.agents.filter((a) => !(a.description ?? "").trim());
  log(`${blank.length} of ${index.agents.length} rows have no description; re-reading from chain`);
  if (!blank.length) return;

  const queue = [...blank];
  let filled = 0;
  let stillBlank = 0;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const row = queue.shift();
        if (!row) return;
        const e = await readRegistryEntry(row.tokenId).catch(() => null);
        if (!e || !(e.description ?? "").trim()) {
          stillBlank += 1;
          continue;
        }
        row.name = e.name ?? row.name;
        row.description = e.description;
        if (e.x402Endpoint) row.x402 = true;
        if (e.owner) row.owner = e.owner;

        // Classified from the card's own language, exactly as the indexer
        // would have done if it had been given the card.
        const c = classify({ name: e.name, description: e.description });
        if (c.category) {
          row.category = c.category;
          row.confidence = c.confidence;
          row.matched = c.matched;
        }
        filled += 1;
        log(`  ${row.tokenId} ${(e.name ?? "").slice(0, 34)} → ${c.category ?? "unclassified"}`);
      }
    }),
  );

  const classified = index.agents.filter((a) => a.category).length;
  index.counts.classified = classified;
  for (const key of Object.keys(index.counts.byCategory)) {
    index.counts.byCategory[key as keyof typeof index.counts.byCategory] = index.agents.filter(
      (a) => a.category === key,
    ).length;
  }

  writeFileSync(OUT, JSON.stringify(index));
  log(`filled ${filled}, still blank ${stillBlank}, classified now ${classified}`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
