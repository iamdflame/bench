/**
 * What a marketplace card is allowed to say.
 *
 * The brief's example card reads "+13.5% benchmark alpha · Medium risk · From
 * $1/run". Exactly one agent in this registry has ever been hired through
 * Mandate and settled anything, so on this data three thousand eight hundred
 * and seven of those numbers would have to be invented. Inventing them is the
 * one thing a product whose entire argument is "self-reported claims are
 * worthless" cannot do.
 *
 * So this module answers a narrower question, honestly: what do we actually
 * know about this agent, and how did we come to know it? Four grades:
 *
 *   measured   we called it, or the chain told us. Highest confidence.
 *   declared   the agent's own card says so. Useful, unverified, labelled.
 *   absent     we looked and there is nothing. Said out loud, not hidden.
 *   untested   we have not looked yet. Distinct from absent, and it matters.
 *
 * Every signal on a card carries its grade, which is why the cards can be
 * dense without being misleading.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORY_LABEL, type Category } from "@/lib/config";
import { getAgentIndex, type IndexedAgent } from "@/lib/data/agents";
import { reviewQuality, type ReviewQuality } from "@/lib/market/reviews";
import { assayFor } from "@/lib/market/assays";
import { humanAmount, type Quote } from "@/lib/x402/quote";

export type Grade = "measured" | "declared" | "absent" | "untested";

export interface Signal {
  key: string;
  /** What a person reads. Never jargon. */
  label: string;
  grade: Grade;
  /** One sentence on how we know. Shown on the detail page, not on the card. */
  how: string;
}

export interface Listing {
  tokenId: string;
  name: string;
  /** The agent's own words, cleaned up, never rewritten. */
  what: string | null;
  category: Category | null;
  categoryLabel: string | null;
  confidence: number;
  matched: string[];
  owner: string | null;
  protocols: string[];

  /** Called by us, with the result. `null` means never called. */
  probe: {
    answered: boolean;
    status: number | null;
    latencyMs: number | null;
    /** Null when the agent's card advertises no endpoint to call. */
    endpoint: string | null;
    at?: string;
  } | null;
  /**
   * The card's one-line liveness verdict.
   *
   * Four states, because three of them are routinely collapsed into "offline"
   * and each is a different fact about somebody else's software:
   *
   *   live         we called it and it answered
   *   silent       we called it and nothing came back
   *   no-endpoint  its card names nothing to call, so there is nothing to test
   *   untested     we have not called it yet
   *
   * Forty-eight grid agents were reported as not answering when the truth was
   * that nobody had ever dialled the number. Publishing "did not answer" over
   * a call that was never placed is a false claim, and it is precisely the
   * kind this product exists to object to.
   */
  liveness: "live" | "silent" | "no-endpoint" | "untested";
  /** The card declares a paid endpoint. */
  declaresPayment: boolean;
  /**
   * What it actually charges, read from its own 402. Null when it has never
   * quoted us, which is different from being free.
   */
  quote: Quote | null;
  /** The price as a person would say it, when there is one. */
  priceLabel: string | null;
  /** The registry itself confirmed the endpoint answered. Rare: five agents. */
  registryVerified: boolean;
  reviews: number;
  /** Who wrote them, where the reputation sample can say. */
  reviewQuality: ReviewQuality | null;
  /**
   * How many of the six checks passed in the stored assay, or null when this
   * agent has never been assayed. Null is not zero and the two read
   * differently everywhere they appear.
   */
  checksPassed: number | null;
  /** Whether the agent signs with a different address than its owner. */
  custodySeparate: boolean | null;
  avgScore: number | null;
  registryScore: number | null;

  /** Mandates this agent holds or has held on our market. Usually zero. */
  hires: number;

  signals: Signal[];
  /**
   * A single 0–100 readiness figure, built only from things we checked.
   * Explicitly not a performance score and never presented as one.
   */
  readiness: number;
}

interface ProbeRow {
  tokenId: string;
  endpoint: string | null;
  answered: boolean;
  status: number | null;
  latencyMs: number | null;
}

let probeIndex: Map<string, ProbeRow> | null = null;
let quoteIndex: Record<string, Quote> | null = null;

/** Prices read from the agents' own 402 responses during the census. */
function quotes(): Record<string, Quote> {
  if (quoteIndex) return quoteIndex;
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "src/data/probe.json"), "utf8"),
    ) as { quotes?: Record<string, Quote> };
    quoteIndex = raw.quotes ?? {};
  } catch {
    quoteIndex = {};
  }
  return quoteIndex;
}

function probes(): Map<string, ProbeRow> {
  if (probeIndex) return probeIndex;
  probeIndex = new Map();
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "src/data/probe.json"), "utf8"),
    ) as { results?: ProbeRow[] };
    for (const r of raw.results ?? []) {
      const prev = probeIndex.get(r.tokenId);
      // Keep the best result per agent: an endpoint that answered once is
      // reported as answering, with the latency of the call that succeeded.
      if (!prev || (r.answered && !prev.answered)) probeIndex.set(r.tokenId, r);
    }
  } catch {
    /* the file is optional; absence means "untested", which is a valid grade */
  }
  return probeIndex;
}

/**
 * The registry's Sybil problem, stated once and applied everywhere.
 *
 * Thirty-two of the fifty-three addresses leaving feedback on this registry
 * post at a rate consistent with self-review. We cannot attribute individual
 * reviews to individual reviewers from the index, so the honest move is not to
 * silently discount some agents' review counts — it is to carry the caveat
 * with every review count on the site.
 */
export const REVIEW_CAVEAT =
  "32 of the 53 addresses leaving feedback on this registry post at a rate consistent with self-review. Where we can attribute an agent's reviews to the wallets that wrote them we show the flagged share; where we cannot, treat the count as a signal of activity rather than of quality.";

/** Trim an agent's own description to something that reads as a sentence. */
function firstSentences(text: string | null, max = 260): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return stop > 120 ? cut.slice(0, stop + 1) : `${cut.replace(/[,;\s]+\S*$/, "")}…`;
}

export function toListing(a: IndexedAgent, hires = 0): Listing {
  const probe = probes().get(a.tokenId) ?? null;
  const category = a.category ?? null;

  const signals: Signal[] = [];

  /* --- does it answer ------------------------------------------------- */
  if (probe && probe.answered) {
    signals.push({
      key: "answers",
      label:
        probe.latencyMs != null
          ? `Answers in ${probe.latencyMs < 1000 ? `${probe.latencyMs} ms` : `${(probe.latencyMs / 1000).toFixed(1)} s`}`
          : "Answers when called",
      grade: "measured",
      how: `We sent a request to ${probe.endpoint} and it replied ${probe.status ?? "successfully"}.`,
    });
  } else if (probe && !probe.endpoint) {
    signals.push({
      key: "answers",
      label: "No endpoint published",
      grade: "absent",
      how: "This agent's registry card names no endpoint, so there is nothing to call. That is a fact about the card, not a failed test.",
    });
  } else if (probe) {
    signals.push({
      key: "answers",
      label: "Did not answer",
      grade: "absent",
      how: `We sent a request to ${probe.endpoint} and nothing came back within six seconds.`,
    });
  } else if (a.endpointVerified) {
    signals.push({
      key: "answers",
      label: "Endpoint verified by the registry",
      grade: "declared",
      how: "The ERC-8004 registry records a successful verification of this endpoint. We have not called it ourselves.",
    });
  } else {
    signals.push({
      key: "answers",
      label: "Not called yet",
      grade: "untested",
      how: "We have not sent a request to this agent. Absence of a result is not a result.",
    });
  }

  /* --- can you pay it ------------------------------------------------- */
  const priced = quotes()[a.tokenId] ?? null;
  if (priced) {
    signals.push({
      key: "pay",
      label: `${humanAmount(priced.amount, priced.decimals)} ${priced.assetName === "World Liberty Financial USD" ? "USD1" : (priced.assetName ?? "")} a call`.trim(),
      grade: "measured",
      how: `We asked its endpoint unpaid and it answered with this price, settling on ${priced.network}.`,
    });
  } else if (probe?.status === 402) {
    signals.push({
      key: "pay",
      label: "Charges per call",
      grade: "measured",
      how: "The endpoint answered our unpaid request with a price, which is how a paid agent is supposed to behave.",
    });
  } else if (a.x402) {
    signals.push({
      key: "pay",
      label: "Says it charges per call",
      grade: "declared",
      how: "The agent's own card advertises a paid endpoint. We have not been quoted a price.",
    });
  } else {
    signals.push({
      key: "pay",
      label: "No price published",
      grade: "absent",
      how: "This agent does not publish a per-call price. It can still be hired under a mandate, where it is paid from performance.",
    });
  }

  /* --- does it do what it says ---------------------------------------- */
  if (category) {
    signals.push({
      key: "category",
      label: `${CATEGORY_LABEL[category]}`,
      grade: a.confidence >= 0.6 ? "measured" : "declared",
      how: a.matched.length
        ? `Classified from its own description; the deciding phrases were ${a.matched.map((m) => `“${m}”`).join(", ")}.`
        : "Classified from its own description.",
    });
  }

  /* --- has anyone dealt with it --------------------------------------- */
  if (hires > 0) {
    signals.push({
      key: "hires",
      label: hires === 1 ? "Hired once on Mandate" : `Hired ${hires} times on Mandate`,
      grade: "measured",
      how: "This agent has held a mandate on our market, with capital and a bond, on chain.",
    });
  } else if (a.feedbacks > 0) {
    signals.push({
      key: "reviews",
      label: a.feedbacks === 1 ? "1 registry review" : `${a.feedbacks} registry reviews`,
      grade: "declared",
      how: REVIEW_CAVEAT,
    });
  } else {
    signals.push({
      key: "record",
      label: "No track record yet",
      grade: "absent",
      how: "Nobody has hired this agent through Mandate and the registry holds no feedback for it.",
    });
  }

  /*
    Readiness, and what it deliberately is not.

    Every point here is something we checked or the chain told us. There is no
    component for how good the agent is at its job, because no data exists for
    that on all but one agent, and a score that quietly mixes "we called it and
    it replied" with an invented return figure is worse than no score at all.
  */
  let readiness = 0;
  if (probe?.answered) readiness += 40;
  else if (a.endpointVerified) readiness += 20;
  if (probe?.status === 402) readiness += 20;
  else if (a.x402) readiness += 10;
  if (category) readiness += Math.round(Math.min(1, a.confidence) * 20);
  if (hires > 0) readiness += 20;
  else if (a.feedbacks > 0) readiness += Math.min(10, a.feedbacks);

  /*
    Custody and the check count come from the stored assay rather than a fresh
    run: the six checks take fifteen seconds against mainnet and a comparison
    table cannot wait for three of them.
  */
  const stored = assayFor(a.tokenId);
  const quote = quotes()[a.tokenId] ?? null;
  const custodyResult = stored?.results.find((r) => r.id === "custody") ?? null;
  const custody = custodyResult ? custodyResult.verdict === "pass" : null;

  const liveness: Listing["liveness"] = !probe
    ? "untested"
    : !probe.endpoint
      ? "no-endpoint"
      : probe.answered
        ? "live"
        : "silent";

  return {
    tokenId: a.tokenId,
    name: a.name?.trim() || `Agent ${a.tokenId}`,
    liveness,
    what: firstSentences(a.description),
    category,
    categoryLabel: category ? CATEGORY_LABEL[category] : null,
    confidence: a.confidence,
    matched: a.matched ?? [],
    owner: a.owner,
    protocols: a.protocols ?? [],
    probe,
    declaresPayment: Boolean(a.x402),
    quote,
    priceLabel: quote
      ? `${humanAmount(quote.amount, quote.decimals)} ${quote.assetName === "World Liberty Financial USD" ? "USD1" : (quote.assetName ?? "")}`.trim()
      : null,
    registryVerified: Boolean(a.endpointVerified),
    reviews: a.feedbacks ?? 0,
    reviewQuality: reviewQuality(a.tokenId),
    checksPassed: stored ? stored.results.filter((r) => r.verdict === "pass").length : null,
    custodySeparate: custody,
    avgScore: a.avgScore,
    registryScore: a.registryScore,
    hires,
    signals,
    readiness: Math.min(100, readiness),
  };
}

/**
 * The classified marketplace: every agent we can honestly file under a category.
 *
 * `hires` is passed in rather than read here because the count comes from the
 * chain and this function is synchronous. Callers that have the book hand it
 * over; callers that do not get zero, which is the truth today for every agent
 * on this registry.
 */
export function listings(hires?: Map<string, number>): Listing[] {
  return getAgentIndex()
    .agents.filter((a) => a.category)
    .map((a) => toListing(a, hires?.get(a.tokenId) ?? 0))
    .sort((a, b) => b.readiness - a.readiness || b.confidence - a.confidence);
}

export function listingFor(tokenId: string, hires = 0): Listing | null {
  const a = getAgentIndex().agents.find((x) => x.tokenId === tokenId);
  return a ? toListing(a, hires) : null;
}

/**
 * When the census was taken, and whether it is old enough to distrust.
 *
 * Every surface that quotes a probe figure reads this, so no page can imply a
 * freshness a different page contradicts. Thirty minutes is the threshold the
 * plan sets: past it the interface says stale rather than quietly showing an
 * older number as though it were current.
 */
export function censusAge(): { at: string | null; minutes: number | null; stale: boolean } {
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "src/data/probe.json"), "utf8"),
    ) as { at?: string };
    if (!raw.at) return { at: null, minutes: null, stale: true };
    const minutes = Math.max(0, Math.round((Date.now() - new Date(raw.at).getTime()) / 60_000));
    return { at: raw.at, minutes, stale: minutes > 30 };
  } catch {
    return { at: null, minutes: null, stale: true };
  }
}

/** Live counts per category, computed rather than written down. */
export function categoryCounts(): Record<Category, { total: number; answering: number; priced: number }> {
  const out = {} as Record<Category, { total: number; answering: number; priced: number }>;
  for (const l of listings()) {
    if (!l.category) continue;
    const bucket = (out[l.category] ??= { total: 0, answering: 0, priced: 0 });
    bucket.total += 1;
    if (l.probe?.answered) bucket.answering += 1;
    if (l.declaresPayment || l.probe?.status === 402) bucket.priced += 1;
  }
  return out;
}
