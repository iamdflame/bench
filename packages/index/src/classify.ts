/**
 * Which of the four jobs is this agent claiming to do?
 *
 * The registry ships `categories: []` and `tags: []` for effectively every
 * agent on BSC, so the four categories the brief requires do not exist in the
 * data. Every marketplace in this field has to derive them, and how it derives
 * them is a data-quality decision rather than an implementation detail.
 *
 * This derives them from the agent's own words — name, description, declared
 * skills — and returns the phrases that drove the decision, so the label is
 * never a black box. It is a claim, and it is labelled as one: the probe says
 * whether the endpoint answers, and the capability scan says whether the chain
 * has ever seen this wallet at the venue the label implies. Three different
 * questions, three different answers, never blended into a score.
 *
 * The matching rule is a prefix test at a word boundary rather than a
 * substring test, and that is not fussiness. A bare substring test reads `dca`
 * out of "podcast" and "broadcaster", and `apr` out of "AuraPro816" — both
 * observed on live registry entries, both filing an unrelated agent under a
 * category a buyer would then be shown it for.
 */

import { JOB_SLUGS, type JobSlug } from "@bench/shared";
import { known, unknown, type Maybe } from "@bench/measure";

interface Signal {
  phrase: string;
  weight: number;
  /**
   * Require the phrase to end at a word boundary too, give or take a plural.
   *
   * Set on the acronyms, which are short enough to be the opening of ordinary
   * words that mean nothing like them: `apr` begins "April", `ltv` is rare
   * enough to be safe but cheap to guard. The trailing "s" stays allowed,
   * because "the best APYs" is the plural of the signal and not a different
   * word.
   */
  whole?: boolean;
}

const SIGNALS: Record<JobSlug, Signal[]> = {
  rebalancing: [
    { phrase: "rebalanc", weight: 5 },
    { phrase: "lp range", weight: 5 },
    { phrase: "liquidity range", weight: 5 },
    { phrase: "concentrated liquidity", weight: 4 },
    { phrase: "position manager", weight: 3 },
    { phrase: "impermanent loss", weight: 3 },
    { phrase: "reset position", weight: 4 },
    { phrase: "out of range", weight: 4 },
    { phrase: "tick range", weight: 4 },
    { phrase: "recentre", weight: 4 },
    { phrase: "recenter", weight: 4 },
    { phrase: "liquidity provider", weight: 2 },
    { phrase: "v3 position", weight: 3 },
  ],
  grid: [
    { phrase: "grid trad", weight: 6 },
    { phrase: "grid bot", weight: 6 },
    { phrase: "grid order", weight: 5 },
    { phrase: "grid strateg", weight: 5 },
    { phrase: "dca", weight: 2, whole: true },
    { phrase: "limit order", weight: 2 },
    { phrase: "range trad", weight: 3 },
    { phrase: "market making", weight: 3 },
    { phrase: "spread", weight: 2 },
    { phrase: "buy low sell high", weight: 2 },
  ],
  yield: [
    { phrase: "yield optim", weight: 6 },
    { phrase: "yield farm", weight: 5 },
    { phrase: "apr", weight: 3, whole: true },
    { phrase: "apy", weight: 3, whole: true },
    { phrase: "auto-compound", weight: 5 },
    { phrase: "autocompound", weight: 5 },
    { phrase: "compounding", weight: 3 },
    { phrase: "highest yield", weight: 5 },
    { phrase: "best rate", weight: 4 },
    { phrase: "vault", weight: 2 },
    { phrase: "staking reward", weight: 3 },
    { phrase: "route liquidity", weight: 4 },
    { phrase: "harvest", weight: 3 },
  ],
  health: [
    { phrase: "health factor", weight: 7 },
    { phrase: "liquidation", weight: 5 },
    { phrase: "collateral ratio", weight: 5 },
    { phrase: "ltv", weight: 3, whole: true },
    { phrase: "loan-to-value", weight: 4 },
    { phrase: "lending position", weight: 4 },
    { phrase: "borrow position", weight: 4 },
    { phrase: "margin call", weight: 3 },
    { phrase: "undercollateral", weight: 4 },
    { phrase: "venus", weight: 2 },
    { phrase: "aave", weight: 2 },
  ],
};

export interface Classification {
  job: Maybe<JobSlug>;
  /** 0..1. Blends absolute strength with separation from the runner-up. */
  confidence: number;
  /** The phrases that fired, for the evidence drawer. */
  matched: string[];
  scores: Record<JobSlug, number>;
}

function matches(haystack: string, signal: Signal): boolean {
  const phrase = signal.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tail = signal.whole ? "s?(?![a-z0-9])" : "";
  return new RegExp(`(?<![a-z0-9])${phrase}${tail}`).test(haystack);
}

export function classify(input: {
  name?: string | null;
  description?: string | null;
  skills?: string[] | null;
  tags?: string[] | null;
}): Classification {
  const haystack = [input.name ?? "", input.description ?? "", ...(input.skills ?? []), ...(input.tags ?? [])]
    .join(" \n ")
    .toLowerCase();

  const scores = {} as Record<JobSlug, number>;
  const matchedBy = {} as Record<JobSlug, string[]>;

  for (const slug of JOB_SLUGS) {
    let score = 0;
    const hits: string[] = [];
    for (const signal of SIGNALS[slug]) {
      if (matches(haystack, signal)) {
        score += signal.weight;
        hits.push(signal.phrase);
      }
    }
    scores[slug] = score;
    matchedBy[slug] = hits;
  }

  const ranked = JOB_SLUGS.map((s) => [s, scores[s]] as const).sort((a, b) => b[1] - a[1]);
  const top = ranked[0]!;
  const runnerUp = ranked[1]?.[1] ?? 0;

  if (top[1] === 0) {
    return {
      job: unknown(
        haystack.trim().length === 0
          ? "Its registration carries no name, description or skills to classify from."
          : "Nothing in its own description matches any of the four jobs this marketplace hires for.",
      ),
      confidence: 0,
      matched: [],
      scores,
    };
  }

  const strength = Math.min(top[1] / 10, 1);
  const separation = (top[1] - runnerUp) / top[1];
  const confidence = Number((strength * 0.6 + separation * 0.4).toFixed(3));

  /*
    A tie is not a classification.

    An agent whose text trips two categories equally has told us it does both
    or neither, and picking the first alphabetically would put it on a board a
    buyer is filtering deliberately. Refusing is cheap; a wrong row is not.
  */
  if (top[1] === runnerUp) {
    return {
      job: unknown(
        `Its description matches ${ranked
          .filter((r) => r[1] === top[1])
          .map((r) => r[0])
          .join(" and ")} equally, so we will not file it under one.`,
      ),
      confidence,
      matched: matchedBy[top[0]],
      scores,
    };
  }

  return { job: known(top[0]), confidence, matched: matchedBy[top[0]], scores };
}

/** Pulls skill strings out of an agent card's `services` blob, whatever shape it takes. */
export function extractSkills(services: unknown): string[] {
  if (!services || typeof services !== "object") return [];
  const out: string[] = [];
  for (const service of Object.values(services as Record<string, unknown>)) {
    if (!service || typeof service !== "object") continue;
    const skills = (service as { skills?: unknown }).skills;
    if (!Array.isArray(skills)) continue;
    for (const skill of skills) {
      if (typeof skill === "string") out.push(skill);
      else if (skill && typeof skill === "object") {
        const s = skill as { name?: unknown; description?: unknown };
        if (typeof s.name === "string") out.push(s.name);
        if (typeof s.description === "string") out.push(s.description);
      }
    }
  }
  return out;
}
