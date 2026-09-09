/**
 * Migrates the committed snapshot into Postgres.
 *
 *   npm run db:seed
 *
 * The worker has always written to Postgres and the site has always read a
 * file, so the database was a write-only store and the snapshot was the truth.
 * This is the step that inverts it: everything already indexed goes in, and
 * from then on the worker keeps it fresh and the site reads the table.
 *
 * Idempotent. Re-running updates rather than duplicating, so a half-finished
 * migration is fixed by running it again rather than by cleaning up first.
 */

import { db, hasDb, schema } from "@/lib/db/client";
import { getAgentIndex } from "@/lib/data/agents";
import { CHAIN_ID } from "@/lib/config";

if (!hasDb || !db) {
  console.error("\n  DATABASE_URL is not set, so there is nothing to migrate into.\n");
  process.exit(1);
}

const index = getAgentIndex();
const agents = index.agents;
console.log(`\n  snapshot: ${agents.length} agents, captured ${index.capturedAt}`);

let written = 0;
const BATCH = 200;
for (let i = 0; i < agents.length; i += BATCH) {
  const slice = agents.slice(i, i + BATCH);
  const rows = slice.map((a) => ({
    chainId: CHAIN_ID,
    tokenId: a.tokenId,
    agentId: `${CHAIN_ID}:${a.tokenId}`,
    name: a.name,
    description: a.description,
    imageUrl: a.imageUrl,
    ownerAddress: a.owner,
    registryScore: a.registryScore,
    registryFeedbacks: a.feedbacks,
    registryAvgScore: a.avgScore,
    isEndpointVerified: Boolean(a.endpointVerified),
    supportedProtocols: a.protocols,
    x402Supported: a.x402,
    registeredAt: a.createdAt ? new Date(a.createdAt) : null,
    category: a.category,
    categoryConfidence: a.confidence,
    // `lastSeen` is what the snapshot knows about freshness; carrying it means
    // a migrated row is not silently presented as fetched just now.
    updatedAt: a.lastSeen && a.lastSeen !== "unknown" ? new Date(a.lastSeen) : new Date(index.capturedAt),
  }));

  await db
    .insert(schema.agents)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.agents.chainId, schema.agents.tokenId],
      set: {
        name: schema.agents.name,
        description: schema.agents.description,
        isEndpointVerified: schema.agents.isEndpointVerified,
        category: schema.agents.category,
        categoryConfidence: schema.agents.categoryConfidence,
        updatedAt: schema.agents.updatedAt,
      },
    });
  written += rows.length;
  process.stdout.write(`\r  written ${written}/${agents.length}`);
}

process.stdout.write("\r".padEnd(40) + "\r");
console.log(`  migrated ${written} agents into Postgres\n`);
