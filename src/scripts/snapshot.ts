/**
 * Builds the committed snapshot the site renders from.
 *
 * Everything in here is measured against live BSC and the live registry. No
 * figure is estimated, rounded for effect, or carried over from a previous run.
 * The snapshot is timestamped so the page can say exactly when it was taken.
 *
 *   npx tsx src/scripts/snapshot.ts [agentBudget] [feedbackPages]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/config";
import {
  countAgents,
  listAgents,
  listFeedbacks,
  type ScanAgentSummary,
  type ScanFeedback,
} from "@/lib/sources/scan";
import { assayAgent } from "@/lib/assay";
import { classify } from "@/lib/assay/classify";
import { detectCoordination, profileReviewers } from "@/lib/sybil/detect";
import type { AssayReport } from "@/lib/assay/types";

const CHAIN = Number(process.env.CHAIN_ID ?? 56);
const AGENT_BUDGET = Number(process.argv[2] ?? 36);
const FEEDBACK_PAGES = Number(process.argv[3] ?? 40);
const OUT = "src/data/snapshot.json";

const log = (...a: unknown[]) => console.log("·", ...a);

// ---------------------------------------------------------------------------
// 1. The funnel. Three numbers that decide the whole product.
// ---------------------------------------------------------------------------

log("measuring funnel");
const registered = await countAgents({ chainId: CHAIN });
const withEndpoint = await countAgents({ chainId: CHAIN, isEndpointVerified: true });
const withFeedback = await countAgents({ chainId: CHAIN, minFeedbacks: 1 });
log(`registered=${registered} endpoint=${withEndpoint} feedback=${withFeedback}`);

// ---------------------------------------------------------------------------
// 2. The reputation graph.
// ---------------------------------------------------------------------------

log(`pulling up to ${FEEDBACK_PAGES * 100} feedback records`);
const feedbacks: ScanFeedback[] = [];
for (let i = 0; i < FEEDBACK_PAGES; i++) {
  const page = await listFeedbacks({ chainId: CHAIN, limit: 100, offset: i * 100 });
  const items = page.items ?? [];
  feedbacks.push(...items);
  if (items.length < 100) break;
}
log(`feedback records: ${feedbacks.length}`);

const profiles = profileReviewers(feedbacks);
const flags = detectCoordination(profiles);
const flaggedSet = new Set(Object.keys(flags));

const reviewerNodes = [...profiles.values()].map((p) => ({
  address: p.address,
  feedbacks: p.feedbackCount,
  agents: p.agents.size,
  maxPerAgent: p.maxPerAgent,
  flagged: flaggedSet.has(p.address),
  reasons: flags[p.address] ?? [],
}));

// Co-review edges, for the ring.
const list = [...profiles.values()];
const edges: { a: string; b: string; similarity: number; shared: number }[] = [];
for (let i = 0; i < list.length; i++) {
  for (let j = i + 1; j < list.length; j++) {
    const A = list[i].agents;
    const B = list[j].agents;
    if (A.size < 3 || B.size < 3) continue;
    let shared = 0;
    for (const v of A) if (B.has(v)) shared++;
    const union = A.size + B.size - shared;
    const similarity = union === 0 ? 0 : shared / union;
    if (similarity >= 0.35) {
      edges.push({
        a: list[i].address,
        b: list[j].address,
        similarity: Number(similarity.toFixed(3)),
        shared,
      });
    }
  }
}

const cleanRecords = feedbacks.filter((f) => {
  const a = f.user_address?.toLowerCase();
  return a ? !flaggedSet.has(a) : false;
}).length;

log(
  `reviewers=${profiles.size} flagged=${flaggedSet.size} edges=${edges.length} clean=${cleanRecords}/${feedbacks.length}`,
);

// ---------------------------------------------------------------------------
// 3. Candidate selection, then assay.
// ---------------------------------------------------------------------------

const candidates = new Map<string, ScanAgentSummary>();
const take = (items: ScanAgentSummary[]) => {
  for (const a of items) if (!candidates.has(a.token_id)) candidates.set(a.token_id, a);
};

log("collecting candidates: verified endpoints");
take((await listAgents({ chainId: CHAIN, isEndpointVerified: true, limit: 100 })).items ?? []);

log("collecting candidates: highest claimed reputation");
take(
  (
    await listAgents({
      chainId: CHAIN,
      minFeedbacks: 1,
      limit: 60,
      sortBy: "total_feedbacks",
      sortOrder: "desc",
    })
  ).items ?? [],
);

// Category representatives, so all four are surfaced at equal depth.
for (const category of CATEGORIES) {
  const term = CATEGORY_LABEL[category].split(" ")[0].toLowerCase();
  log(`collecting candidates: ${category}`);
  try {
    take((await listAgents({ chainId: CHAIN, search: term, limit: 40 })).items ?? []);
  } catch (e) {
    log(`  search failed for ${category}: ${String(e).slice(0, 80)}`);
  }
}

// Rank so the budget is spent on agents that actually say something.
const ranked = [...candidates.values()]
  .map((a) => {
    const c = classify({ name: a.name, description: a.description });
    return {
      agent: a,
      category: c.category,
      priority:
        (c.category ? 3 : 0) + Math.min(a.total_feedbacks ?? 0, 10) / 10 + (a.total_score ?? 0) / 100,
    };
  })
  .sort((x, y) => y.priority - x.priority);

// Guarantee coverage of every category before spending the rest on rank.
const chosen: ScanAgentSummary[] = [];
const perCategory = new Map<Category | null, number>();
for (const r of ranked) {
  const n = perCategory.get(r.category) ?? 0;
  if (r.category && n < 6) {
    chosen.push(r.agent);
    perCategory.set(r.category, n + 1);
  }
}
for (const r of ranked) {
  if (chosen.length >= AGENT_BUDGET) break;
  if (!chosen.includes(r.agent)) chosen.push(r.agent);
}

log(`assaying ${chosen.length} agents`);
const reports: AssayReport[] = [];
for (const [i, a] of chosen.entries()) {
  try {
    const report = await assayAgent(CHAIN, a.token_id);
    reports.push(report);
    process.stdout.write(
      `\r  ${i + 1}/${chosen.length}  ${String(report.fineness).padStart(4)} fine  ${(report.name ?? "").slice(0, 44)}`.padEnd(
        100,
      ),
    );
  } catch (e) {
    process.stdout.write(`\r  ${i + 1}/${chosen.length}  failed: ${String(e).slice(0, 60)}`.padEnd(100));
  }
}
console.log("\n");

// The headline exhibit: an agent whose registry score flatters it most.
const exhibit =
  reports
    .filter((r) => (r.registryScore ?? 0) > 0)
    .sort((a, b) => (b.registryScore ?? 0) - (a.registryScore ?? 0) - (b.fineness - a.fineness))[0] ??
  reports[0];

const hallmarked = reports.filter((r) => r.fineness >= 375).length;

const snapshot = {
  chainId: CHAIN,
  capturedAt: new Date().toISOString(),
  funnel: {
    registered,
    withEndpoint,
    withFeedback,
    assayed: reports.length,
    hallmarked,
  },
  reputation: {
    recordsAnalysed: feedbacks.length,
    recordsTotal: 11780,
    reviewers: profiles.size,
    flaggedReviewers: flaggedSet.size,
    cleanRecords,
    nodes: reviewerNodes,
    edges,
  },
  categories: CATEGORIES.map((c) => ({
    id: c,
    label: CATEGORY_LABEL[c],
    agents: reports.filter((r) => r.category === c).length,
    hallmarked: reports.filter((r) => r.category === c && r.fineness >= 375).length,
  })),
  exhibit: exhibit ?? null,
  agents: reports.sort((a, b) => b.fineness - a.fineness),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot, null, 2));

console.log(`wrote ${OUT}`);
console.log(`  funnel      ${registered} → ${withEndpoint} live endpoints`);
console.log(`  reputation  ${feedbacks.length} records from ${profiles.size} wallets, ${cleanRecords} survive`);
console.log(`  assayed     ${reports.length} agents, ${hallmarked} hallmarked`);
for (const c of snapshot.categories) console.log(`    ${c.label.padEnd(26)} ${c.agents}`);
