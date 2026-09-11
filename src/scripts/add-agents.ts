/**
 * Adds newly registered agents to the committed index, from the chain.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/add-agents.ts <tokenId> [tokenId ...]
 *
 * The index is a snapshot of the registry. A token minted after the last crawl
 * is not in it, so it cannot appear in the catalog or be called by the census.
 * This reads each token the way the crawler would, `ownerOf` and `tokenURI`
 * from the registry and the registration file behind it, and writes the entry.
 * The category is the one the agent declares, accepted only if it is one of
 * ours; nothing about its quality is filled in, because nothing has been
 * measured yet.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readRegistryEntry } from "@/lib/sources/registry";
import { CATEGORIES } from "@/lib/config";

const FILE = join(process.cwd(), "src/data/agents.json");

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
  if (!ids.length) throw new Error("give one or more token ids");
  const index = JSON.parse(readFileSync(FILE, "utf8")) as { agents: Record<string, unknown>[]; counts?: Record<string, unknown> };
  for (const id of ids) {
    const e = await readRegistryEntry(id);
    if (!e) {
      console.log(`#${id}: not minted`);
      continue;
    }
    const category = e.claimedCategory && (CATEGORIES as readonly string[]).includes(e.claimedCategory) ? e.claimedCategory : null;
    const entry = {
      tokenId: id,
      name: e.name,
      description: e.description,
      owner: e.owner.toLowerCase(),
      imageUrl: e.image ?? null,
      protocols: [...new Set(e.services.map((s) => s.name))],
      x402: Boolean(e.x402Endpoint),
      endpointVerified: false,
      registryScore: null,
      feedbacks: 0,
      avgScore: 0,
      createdAt: e.at,
      category,
      confidence: category ? 1 : 0,
      matched: category ? ["declared in its own registration file"] : [],
      lastSeen: e.at,
    };
    const i = index.agents.findIndex((a) => a.tokenId === id);
    if (i >= 0) index.agents[i] = { ...index.agents[i], ...entry };
    else index.agents.push(entry);
    console.log(`#${id}: ${e.name} (${category ?? "unclassified"}), owner ${e.owner}, ${e.services.length} services, card ${e.cardSource}`);
  }
  writeFileSync(FILE, JSON.stringify(index));
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
