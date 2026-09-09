/**
 * Resolves the field from the chain and writes the committed index.
 *
 * These are other people's agents, read from ERC-8004 on BSC — `ownerOf` for
 * the holder, `tokenURI` for the card, an IPFS gateway or an HTTP fetch for
 * the card itself. No API key, no index, nothing that can be rate-limited
 * away, and nothing that depends on a competitor's service still being up.
 *
 * Written to a file rather than read per request for the same reason the
 * agent index is: sixty-one chain reads and sixty-one card fetches is not
 * something to put on a page load. Every row carries the block it was read at
 * and the file carries when it was written, so a stale field says so.
 *
 *   npx tsx src/scripts/index-field.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readRegistryEntry } from "@/lib/sources/registry";
import { classify } from "@/lib/assay/classify";
import { FIELD_SOURCES, type FieldAgent, type FieldIndex } from "@/lib/data/field";
import { CHAIN_ID } from "@/lib/config";

async function main() {
  const rows: FieldAgent[] = [];
  const owners = new Map<string, number>();

  for (const src of FIELD_SOURCES) {
    for (const tokenId of src.tokenIds) {
      const e = await readRegistryEntry(tokenId).catch(() => null);
      if (!e) {
        console.log(`  ${tokenId}  not minted — skipped`);
        continue;
      }

      /*
        The office is derived from the card's language, never from the label
        the card gives itself. Agripinaa's manifests say "grid"; that is their
        word for it, and it is weighed as one phrase among the rest.
      */
      const c = classify({
        name: e.name,
        description: e.description,
        tags: e.claimedCategory ? [e.claimedCategory] : null,
        skills: e.services.map((s) => s.name),
      });

      owners.set(e.owner.toLowerCase(), (owners.get(e.owner.toLowerCase()) ?? 0) + 1);

      rows.push({
        tokenId,
        owner: e.owner,
        name: e.name,
        description: e.description,
        category: c.category,
        confidence: c.confidence,
        matched: c.matched,
        services: e.services,
        x402Endpoint: e.x402Endpoint,
        cardSource: e.cardSource,
        cardError: e.cardError,
        siblings: 0,
        operator: src.operator,
        blockNumber: e.blockNumber,
      });

      console.log(
        `  ${tokenId}  ${e.owner.slice(0, 10)}…  ${c.category ?? "unclassified"}  ${e.name ?? "(no card)"}`,
      );
    }
  }

  // A wallet's registration count is only known once every row is in.
  for (const r of rows) r.siblings = owners.get(r.owner.toLowerCase()) ?? 1;

  const index: FieldIndex = {
    capturedAt: new Date().toISOString(),
    chainId: CHAIN_ID,
    agents: rows,
  };

  const out = join(process.cwd(), "src/data/field.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(index, null, 2) + "\n");

  const resolved = rows.filter((r) => r.name).length;
  const classified = rows.filter((r) => r.category).length;
  console.log(
    `\n${rows.length} identities · ${resolved} cards resolved · ${classified} classified · ${owners.size} distinct owners`,
  );
  console.log(`written to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
