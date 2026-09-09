/**
 * T5 and T6 — the two security tasks, which is TermiX's weighted category and
 * happens to be this marketplace's own competency.
 *
 * Neither task claims a human is slow. Both claim a human is *wrong*, and both
 * use as the no-agent arm the exact artifact a person is shown:
 *
 *   T5  the agent card. A name, a description, a list of declared skills, and
 *       no evidence for any of it. That is what the directory offers.
 *   T6  the reputation score the official explorer displays. Not a stand-in
 *       for what a person would conclude — it is what they are told.
 *
 * A speed comparison would have been easier and worth less. Being faster at
 * reaching a wrong answer is not an advantage.
 */

import { assayAgent } from "@/lib/assay";
import { isHallmarked, type AssayReport } from "@/lib/assay/types";
import { listAgents, listFeedbacks, type ScanFeedback } from "@/lib/sources/scan";
import { detectCoordination, profileReviewers, SYBIL_DEFAULTS } from "@/lib/sybil/detect";

export interface CardClaim {
  tokenId: string;
  name: string;
  /** What the card asserts it can do. */
  claims: string[];
  endpointVerifiedByExplorer: boolean;
}

export interface AssayOutcome {
  tokenId: string;
  name: string;
  fineness: number;
  hallmarked: boolean;
  /** Checks the chain settled against the card. */
  contradictions: string[];
  inconclusive: string[];
  ms: number;
}

export interface SecurityT5 {
  sampled: number;
  hireableByCard: number;
  hireableByAssay: number;
  contradicted: number;
  inconclusiveChecks: number;
  agentsWithInconclusive: number;
  totalMs: number;
  msPerAgent: number;
  outcomes: AssayOutcome[];
  cards: CardClaim[];
}

/**
 * Assays the sample and records where the chain contradicts the card.
 *
 * The loss declared in advance for this task is every inconclusive verdict:
 * where a provider refuses a scan the assay cannot answer and a person with an
 * explorer open can. Those are counted here, not omitted.
 */
export async function runT5(
  chainId: number,
  sampleSize: number,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<SecurityT5> {
  const page = await listAgents({
    chainId,
    limit: sampleSize,
    offset: 0,
    sortBy: "token_id",
    sortOrder: "asc",
  });
  const agents = (page.items ?? []).slice(0, sampleSize);

  const cards: CardClaim[] = agents.map((a) => ({
    tokenId: String(a.token_id),
    name: a.name ?? "unnamed",
    claims: claimsFrom(a as unknown as Record<string, unknown>),
    endpointVerifiedByExplorer: Boolean(
      (a as unknown as Record<string, unknown>).is_endpoint_verified,
    ),
  }));

  const outcomes: AssayOutcome[] = [];
  const started = Date.now();
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i]!;
    const tokenId = String(a.token_id);
    onProgress?.(i + 1, agents.length, tokenId);
    const t0 = Date.now();
    let report: AssayReport;
    try {
      report = await assayAgent(chainId, tokenId);
    } catch {
      outcomes.push({
        tokenId,
        name: a.name ?? "unnamed",
        fineness: 0,
        hallmarked: false,
        contradictions: [],
        inconclusive: ["the assay itself failed"],
        ms: Date.now() - t0,
      });
      continue;
    }
    const contradictions: string[] = [];
    const inconclusive: string[] = [];
    for (const r of report.results) {
      if (r.verdict === "fail") contradictions.push(`${r.title}: ${r.finding ?? "failed"}`);
      if (r.verdict === "inconclusive") inconclusive.push(r.title);
    }
    outcomes.push({
      tokenId,
      name: report.name ?? a.name ?? "unnamed",
      fineness: report.fineness,
      hallmarked: isHallmarked(report.fineness),
      contradictions,
      inconclusive,
      ms: Date.now() - t0,
    });
  }
  const totalMs = Date.now() - started;

  return {
    sampled: outcomes.length,
    // By the card alone, everything in a directory looks hireable. That is the
    // point of the comparison, not a rhetorical flourish.
    hireableByCard: cards.length,
    hireableByAssay: outcomes.filter((o) => o.hallmarked).length,
    contradicted: outcomes.filter((o) => o.contradictions.length > 0).length,
    inconclusiveChecks: outcomes.reduce((s, o) => s + o.inconclusive.length, 0),
    agentsWithInconclusive: outcomes.filter((o) => o.inconclusive.length > 0).length,
    totalMs,
    msPerAgent: outcomes.length ? totalMs / outcomes.length : 0,
    outcomes,
    cards,
  };
}

function claimsFrom(a: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  };
  push(a.description);
  const skills = a.skills ?? a.services ?? a.capabilities;
  if (Array.isArray(skills)) for (const s of skills) push(typeof s === "string" ? s : (s as Record<string, unknown>)?.name);
  return out.slice(0, 6);
}

export interface Sensitivity {
  jaccard: number;
  flagged: number;
  clean: number;
}

export interface SecurityT6 {
  feedbacksAnalysed: number;
  pagesRequested: number;
  pagesReturned: number;
  distinctReviewers: number;
  flaggedReviewers: number;
  cleanReviewers: number;
  /** Share of all feedback written by flagged wallets. */
  flaggedShareOfFeedback: number;
  topReviewers: { address: string; feedbacks: number; agents: number; maxPerAgent: number }[];
  sensitivity: Sensitivity[];
  defaults: typeof SYBIL_DEFAULTS;
  partial: boolean;
}

/**
 * Profiles the whole feedback corpus and publishes how sensitive the finding
 * is to the threshold that produced it.
 *
 * The sensitivity sweep is the part that matters. A coordination finding that
 * only appears at one setting of a constant is an artefact of the constant.
 */
export async function runT6(
  chainId: number,
  pages: number,
  pageSize: number,
  onProgress?: (fetched: number, total: number) => void,
): Promise<SecurityT6> {
  const all: ScanFeedback[] = [];
  let returned = 0;
  let partial = false;
  for (let i = 0; i < pages; i++) {
    let page: Awaited<ReturnType<typeof listFeedbacks>>;
    try {
      page = await listFeedbacks({ chainId, limit: pageSize, offset: i * pageSize });
    } catch {
      partial = true;
      break;
    }
    const items = page.items ?? [];
    all.push(...items);
    returned++;
    onProgress?.(all.length, page.total ?? 0);
    if (items.length < pageSize) break;
  }

  const profiles = profileReviewers(all);
  const flags = detectCoordination(profiles);
  const flagged = new Set(Object.keys(flags));

  let flaggedFeedback = 0;
  for (const [addr, p] of profiles) if (flagged.has(addr)) flaggedFeedback += p.feedbackCount;

  const top = [...profiles.values()]
    .sort((a, b) => b.feedbackCount - a.feedbackCount)
    .slice(0, 5)
    .map((p) => ({
      address: p.address,
      feedbacks: p.feedbackCount,
      agents: p.agents.size,
      maxPerAgent: p.maxPerAgent,
    }));

  // Does the finding survive moving the threshold that produced it?
  const sensitivity: Sensitivity[] = [];
  for (const jaccard of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    const f = detectCoordination(profiles, { jaccard });
    const n = Object.keys(f).length;
    sensitivity.push({ jaccard, flagged: n, clean: profiles.size - n });
  }

  return {
    feedbacksAnalysed: all.length,
    pagesRequested: pages,
    pagesReturned: returned,
    distinctReviewers: profiles.size,
    flaggedReviewers: flagged.size,
    cleanReviewers: profiles.size - flagged.size,
    flaggedShareOfFeedback: all.length ? (flaggedFeedback / all.length) * 100 : 0,
    topReviewers: top,
    sensitivity,
    defaults: SYBIL_DEFAULTS,
    partial,
  };
}
