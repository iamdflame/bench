/**
 * Whose reviews an agent actually carries.
 *
 * The site has been showing a raw feedback count under a blanket warning that
 * reviews cannot be attributed to reviewers. That was true of the agent index
 * and false of the analysis: `profileReviewers` builds the reviewer-to-agent
 * mapping on every snapshot run and the snapshot discarded it, writing only
 * how many agents each reviewer had touched.
 *
 * Keeping it changes what the marketplace can say. Of the 456 agents with any
 * attributed feedback, all but six are reviewed exclusively by wallets flagged
 * for coordination, which is a far sharper finding than a caveat in small type
 * and it belongs next to the number it qualifies.
 *
 * The sample is the reputation snapshot, not the whole registry, so an agent
 * absent from it is unattributed rather than clean, and the two are reported
 * differently.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ReviewQuality {
  reviewers: number;
  flaggedReviewers: number;
  /** Percentage of this agent's reviewers that are flagged, 0 to 100. */
  flaggedShare: number;
}

let cached: Record<string, ReviewQuality> | null = null;
let meta: {
  recordsAnalysed: number;
  recordsTotal: number;
  reviewers: number;
  flaggedReviewers: number;
} | null = null;

function load() {
  if (cached) return;
  try {
    const snap = JSON.parse(
      readFileSync(join(process.cwd(), "src/data/snapshot.json"), "utf8"),
    ) as {
      reputation?: {
        byAgent?: Record<string, ReviewQuality>;
        recordsAnalysed?: number;
        recordsTotal?: number;
        reviewers?: number;
        flaggedReviewers?: number;
      };
    };
    cached = snap.reputation?.byAgent ?? {};
    meta = {
      recordsAnalysed: snap.reputation?.recordsAnalysed ?? 0,
      recordsTotal: snap.reputation?.recordsTotal ?? 0,
      reviewers: snap.reputation?.reviewers ?? 0,
      flaggedReviewers: snap.reputation?.flaggedReviewers ?? 0,
    };
  } catch {
    cached = {};
    meta = { recordsAnalysed: 0, recordsTotal: 0, reviewers: 0, flaggedReviewers: 0 };
  }
}

export function reviewQuality(tokenId: string): ReviewQuality | null {
  load();
  return cached![tokenId] ?? null;
}

/** How much of the registry's feedback the attribution is based on. */
export function reviewSample() {
  load();
  return meta!;
}

/** One sentence about an agent's reviews, or null when it has none to describe. */
export function reviewVerdict(tokenId: string, count: number): string | null {
  if (count < 1) return null;
  const q = reviewQuality(tokenId);
  if (!q) {
    return `${count} registry ${count === 1 ? "review" : "reviews"}, none of which fell inside the sample we analysed, so we cannot say who wrote them.`;
  }
  if (q.flaggedShare >= 100) {
    return `${count} registry ${count === 1 ? "review" : "reviews"}, and every reviewer we could identify is flagged for coordinated posting. Read the count as activity, not quality.`;
  }
  if (q.flaggedShare > 0) {
    return `${count} registry ${count === 1 ? "review" : "reviews"}, ${q.flaggedShare}% of them from wallets flagged for coordinated posting.`;
  }
  return `${count} registry ${count === 1 ? "review" : "reviews"}, none from a wallet we flagged for coordinated posting. That is rare here: six agents out of the 456 we could attribute.`;
}
