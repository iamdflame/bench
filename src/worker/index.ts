/**
 * The indexer.
 *
 * Runs continuously on Railway. Crawls the ERC-8004 registry and the BSC chain,
 * assays what it finds, and materialises the result into Postgres so the web
 * app never touches an upstream on the request path.
 *
 * Three properties matter more than throughput here:
 *
 *   1. Resumable. Cursors live in the database, so a restart continues rather
 *      than starting the 301,000-agent crawl again.
 *   2. Polite. The 8004scan limit is 30 req/min anonymous, 500/min with a key;
 *      the client paces itself and this loop does not try to outrun it.
 *   3. Honest under failure. When the upstream returns DATABASE_ERROR — which
 *      it does under load — the cycle logs and retreats rather than writing
 *      partial state as though it were complete.
 */

import { and, eq, sql as raw } from "drizzle-orm";
import { db, hasDb, schema } from "@/lib/db/client";
import { CHAIN_ID } from "@/lib/config";
import {
  countAgents,
  listAgents,
  listFeedbacks,
  type ScanFeedback,
} from "@/lib/sources/scan";
import { assayAgent } from "@/lib/assay";
import { detectCoordination, profileReviewers } from "@/lib/sybil/detect";
import { beat } from "@/lib/heartbeat";

const AGENTS_PER_CYCLE = Number(process.env.AGENTS_PER_CYCLE ?? 40);
const FEEDBACK_PAGES = Number(process.env.FEEDBACK_PAGES ?? 45);
const CYCLE_MS = Number(process.env.CYCLE_MS ?? 15 * 60_000);

const log = (...a: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...a);

if (!hasDb || !db) {
  console.error(
    "DATABASE_URL is not set. The indexer writes to Postgres; the web app can " +
      "run from the committed snapshot without it, but this process cannot.",
  );
  process.exit(1);
}
const database = db;

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log(`${sig} — finishing the current cycle`);
    stopping = true;
  });
}

async function readCursor(name: string) {
  const [row] = await database
    .select()
    .from(schema.cursors)
    .where(eq(schema.cursors.name, name))
    .limit(1);
  return row?.offset ?? 0;
}

async function writeCursor(name: string, offset: number, total: number, note?: string) {
  await database
    .insert(schema.cursors)
    .values({ name, offset, total, note, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.cursors.name,
      set: { offset, total, note, updatedAt: new Date() },
    });
}

async function recordStat(key: string, value: number, detail?: unknown) {
  await database
    .insert(schema.stats)
    .values({ chainId: CHAIN_ID, key, value, detail, capturedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.stats.chainId, schema.stats.key],
      set: { value, detail, capturedAt: new Date() },
    });
}

/** The three numbers the landing page is built on. */
async function refreshFunnel() {
  const registered = await countAgents({ chainId: CHAIN_ID });
  const withEndpoint = await countAgents({ chainId: CHAIN_ID, isEndpointVerified: true });
  const withFeedback = await countAgents({ chainId: CHAIN_ID, minFeedbacks: 1 });
  await recordStat("registered", registered);
  await recordStat("with_endpoint", withEndpoint);
  await recordStat("with_feedback", withFeedback);
  log(`funnel: ${registered} registered · ${withFeedback} rated · ${withEndpoint} reachable`);
  return { registered, withEndpoint, withFeedback };
}

/** Rebuilds the reviewer graph and the coordination verdicts over it. */
async function refreshReputation() {
  const feedbacks: ScanFeedback[] = [];
  for (let i = 0; i < FEEDBACK_PAGES; i++) {
    const page = await listFeedbacks({ chainId: CHAIN_ID, limit: 100, offset: i * 100 });
    const items = page.items ?? [];
    feedbacks.push(...items);
    if (items.length < 100) break;
  }
  if (!feedbacks.length) return;

  const rows = feedbacks.map((f) => ({
    id: f.id,
    feedbackId: f.feedback_id,
    chainId: CHAIN_ID,
    agentTokenId: String(f.agent?.token_id ?? ""),
    reviewerAddress: f.user_address?.toLowerCase() ?? null,
    score: f.score,
    value: f.value,
    tag1: f.tag1,
    tag2: f.tag2,
    txHash: f.transaction_hash,
    blockNumber: f.block_number,
    isRevoked: f.is_revoked,
    submittedAt: f.submitted_at ? new Date(f.submitted_at) : null,
  }));

  for (const chunk of batch(rows, 500)) {
    await database
      .insert(schema.feedbacks)
      .values(chunk)
      .onConflictDoUpdate({
        target: schema.feedbacks.id,
        set: { isRevoked: raw`excluded.is_revoked` },
      });
  }

  const profiles = profileReviewers(feedbacks);
  const flags = detectCoordination(profiles);

  // Ring membership: reviewers joined by a co-review edge share a ring id.
  const list = [...profiles.values()];
  const ringOf = new Map<string, number>();
  let ring = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      let shared = 0;
      for (const v of a.agents) if (b.agents.has(v)) shared++;
      const union = a.agents.size + b.agents.size - shared;
      const similarity = union === 0 ? 0 : shared / union;
      if (similarity < 0.35) continue;

      await database
        .insert(schema.reviewerEdges)
        .values({
          chainId: CHAIN_ID,
          a: a.address,
          b: b.address,
          similarity,
          sharedAgents: shared,
        })
        .onConflictDoUpdate({
          target: [schema.reviewerEdges.chainId, schema.reviewerEdges.a, schema.reviewerEdges.b],
          set: { similarity, sharedAgents: shared },
        });

      const existing = ringOf.get(a.address) ?? ringOf.get(b.address);
      const id = existing ?? ++ring;
      ringOf.set(a.address, id);
      ringOf.set(b.address, id);
    }
  }

  for (const p of list) {
    const reasons = flags[p.address] ?? [];
    const gaps: number[] = [];
    for (let i = 1; i < p.times.length; i++) gaps.push(p.times[i] - p.times[i - 1]);
    gaps.sort((x, y) => x - y);
    await database
      .insert(schema.reviewers)
      .values({
        chainId: CHAIN_ID,
        address: p.address,
        feedbackCount: p.feedbackCount,
        agentCount: p.agents.size,
        maxPerAgent: p.maxPerAgent,
        medianGapMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
        firstSeen: p.times.length ? new Date(p.times[0]) : null,
        lastSeen: p.times.length ? new Date(p.times[p.times.length - 1]) : null,
        isFlagged: reasons.length > 0,
        flagReasons: reasons,
        ringId: ringOf.get(p.address) ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.reviewers.chainId, schema.reviewers.address],
        set: {
          feedbackCount: p.feedbackCount,
          agentCount: p.agents.size,
          maxPerAgent: p.maxPerAgent,
          isFlagged: reasons.length > 0,
          flagReasons: reasons,
          ringId: ringOf.get(p.address) ?? null,
        },
      });
  }

  const flagged = Object.keys(flags).length;
  const clean = feedbacks.filter((f) => {
    const a = f.user_address?.toLowerCase();
    return a ? !flags[a]?.length : false;
  }).length;

  await recordStat("records_analysed", feedbacks.length);
  await recordStat("reviewers", profiles.size);
  await recordStat("reviewers_flagged", flagged);
  await recordStat("records_clean", clean);

  log(
    `reputation: ${feedbacks.length} records · ${profiles.size} wallets · ` +
      `${flagged} flagged · ${clean} survive`,
  );
}

/** Assays the next slice of the registry and stores the certificates. */
async function assaySlice() {
  const cursor = await readCursor("agents");
  const page = await listAgents({
    chainId: CHAIN_ID,
    limit: AGENTS_PER_CYCLE,
    offset: cursor,
    sortBy: "created_at",
    sortOrder: "desc",
  });
  const items = page.items ?? [];
  if (!items.length) {
    log("agent cursor reached the end; wrapping to the newest registrations");
    await writeCursor("agents", 0, page.total ?? 0, "wrapped");
    return;
  }

  let done = 0;
  for (const summary of items) {
    if (stopping) break;
    try {
      const report = await assayAgent(CHAIN_ID, summary.token_id);
      await database
        .insert(schema.agents)
        .values({
          chainId: CHAIN_ID,
          tokenId: report.tokenId,
          agentId: report.agentId,
          name: report.name,
          description: summary.description,
          imageUrl: summary.image_url,
          ownerAddress: report.ownerAddress,
          agentWallet: report.agentWallet,
          registryScore: report.registryScore,
          registryFeedbacks: summary.total_feedbacks ?? 0,
          registryAvgScore: summary.average_score,
          custodyIsShared:
            Boolean(report.agentWallet) &&
            report.agentWallet?.toLowerCase() === report.ownerAddress?.toLowerCase(),
          category: report.category,
          categoryConfidence: report.categoryConfidence,
          fineness: report.fineness,
          hallmark: report.hallmark.mark,
          results: report.results,
          assayedAt: new Date(report.assayedAt),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.agents.chainId, schema.agents.tokenId],
          set: {
            name: report.name,
            registryScore: report.registryScore,
            category: report.category,
            fineness: report.fineness,
            hallmark: report.hallmark.mark,
            results: report.results,
            assayedAt: new Date(report.assayedAt),
            updatedAt: new Date(),
          },
        });
      done++;
    } catch (error) {
      log(`  assay failed for ${summary.token_id}: ${String(error).slice(0, 110)}`);
    }
  }

  await writeCursor("agents", cursor + items.length, page.total ?? 0);
  log(`assayed ${done}/${items.length} agents (offset ${cursor} of ${page.total})`);
}

function* batch<T>(items: T[], size: number) {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

async function cycle() {
  const started = Date.now();
  try {
    await refreshFunnel();
    await refreshReputation();
    await assaySlice();
    /*
      Stamped after the work, never before it.

      The floor reads this to say whether anything is running between page
      loads. A stamp written at the top of the cycle would report a crawl that
      then aborted, which is the opposite of what the row is for.
    */
    await beat("worker", ++cycles, {
      seconds: Math.round((Date.now() - started) / 1000),
    });
    log(`cycle complete in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (error) {
    // A failed cycle leaves the last good state in place rather than
    // half-writing a new one.
    log(`cycle aborted: ${String(error).slice(0, 200)}`);
  }
}

const ONCE = process.argv.includes("--once");
let cycles = 0;

log(`indexer starting · chain ${CHAIN_ID} · cycle ${CYCLE_MS / 60000}min${ONCE ? " · one cycle" : ""}`);
await cycle();

if (ONCE) {
  log("one cycle done");
  process.exit(0);
}

while (!stopping) {
  await new Promise((r) => setTimeout(r, CYCLE_MS));
  if (stopping) break;
  await cycle();
}

log("indexer stopped");
process.exit(0);
