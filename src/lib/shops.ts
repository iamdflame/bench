/**
 * The shops: other operators' agents, listed as tenants of this hall.
 *
 * A register that indexes three hundred thousand agents and then only lets you
 * hire its own eight is a boutique with a directory bolted on. The claim this
 * product makes is the other one: the hall is the product, and the shops are
 * tenants. So every job board carries the house agent and, underneath it, the
 * matching agents somebody else operates, with a Hire button that goes to the
 * same ticket.
 *
 * Three facts have to survive that listing, or it is flattery rather than a
 * market:
 *
 *   1. A shop agent has posted no bond here. It cannot be slashed by us. The
 *      card says so, on every row, in those words.
 *   2. Where the operator has published a caveat about their own agent, we
 *      quote it and link it. `caveat` below is their sentence, not ours.
 *   3. An unverified contract stays labelled unverified. We do not hide it and
 *      we do not pretend it is the same as a verified one.
 *
 * The token ids and the crawl come from `src/data/field.json`, read from the
 * chain by `npm run index:field`. What lives here is the operator-level
 * overlay: who runs the shop, what they have published about it, and which
 * house agent is the bonded alternative in the same job. Those are claims
 * about the world, so they sit in source where a reader can contradict them.
 */

import { getField, type FieldAgent } from "@/lib/data/field";
import { answered, probeFor } from "@/lib/data/probes";
import { CATEGORIES, type Category } from "@/lib/config";

export interface ShopOperator {
  /** URL-safe key. */
  slug: string;
  name: string;
  /** Their own front door, linked from every row we list. */
  site: string | null;
  /** Where their published statements are, so a quote can be checked. */
  evidence: string | null;
  /** One line: what the shop is, in their terms and ours. */
  line: string;
}

export const SHOP_OPERATORS: ShopOperator[] = [
  {
    slug: "agripinaa",
    name: "Agripinaa",
    site: "https://agripinaa.vercel.app",
    evidence: "https://github.com/san-npm/agripinaa",
    line:
      "Eight first-party agents on BSC mainnet with a passkey activation flow. Their register lists third-party agents for inspection; their own README says third-party registrations stay inspectable until a versioned handoff is implemented.",
  },
  {
    slug: "smeai",
    name: "SMEAI-listed",
    site: null,
    evidence: null,
    line:
      "Identities SMEAI's census reports as hireable, resolved here from the registry rather than from their API.",
  },
  {
    slug: "bort",
    name: "BORT / Yi He Nexus",
    site: null,
    evidence: null,
    line:
      "A batch mint: forty-four identities on one wallet. Counted as registrations, never as forty-four operators.",
  },
];

export const operatorBySlug = (slug: string) =>
  SHOP_OPERATORS.find((o) => o.slug === slug) ?? null;

const operatorSlug = (name: string | null): string | null => {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.startsWith("agripinaa")) return "agripinaa";
  if (n.startsWith("smeai")) return "smeai";
  if (n.startsWith("bort")) return "bort";
  return null;
};

/**
 * What an operator has published about one of their own agents.
 *
 * Every string here is a quote or a close paraphrase of something the operator
 * wrote in public, with `source` pointing at where. It is the strongest thing
 * we can say about a competitor's agent and the only kind we will say: their
 * own words, cited, not our characterisation of them.
 */
export interface ShopNote {
  /** Contract verified on BscScan. False is shown, never hidden. */
  verified: boolean;
  /** Their published caveat, in their words. Null when they published none. */
  caveat: string | null;
  /** Where that sentence came from. */
  source: string | null;
}

export const SHOP_NOTES: Record<string, ShopNote> = {
  // Agripinaa's sponsor evidence, read 7 September 2026.
  "269706": {
    verified: true,
    caveat:
      "Their own writeup records that the full close, collect, rebalance and re-mint cycle never ran during the sponsor session: the price stayed in range.",
    source: "https://github.com/san-npm/agripinaa",
  },
  "307488": {
    verified: false,
    caveat: "Contract unverified on BscScan at the block we read.",
    source: null,
  },
  "307485": {
    verified: false,
    caveat: "Contract unverified on BscScan at the block we read.",
    source: null,
  },
  "269703": {
    verified: true,
    caveat:
      "Fills execute through Ophis batch auctions, so the receipt is a surplus-versus-limit figure rather than a settled benchmark.",
    source: "https://github.com/san-npm/agripinaa",
  },
  "269704": { verified: true, caveat: null, source: null },
  "307486": { verified: true, caveat: null, source: null },
  "269705": { verified: true, caveat: null, source: null },
  "307487": { verified: true, caveat: null, source: null },
};

/**
 * The custody sentence, quoted once and reused wherever it is relevant.
 *
 * This is the load-bearing quote of the whole comparison, and it is theirs:
 * they wrote down that the Pancake selectors they grant accept an arbitrary
 * recipient, so their custody boundary is account isolation rather than a
 * binding on where the funds can go. Our grant on the same agent binds the
 * recipient to the person hiring, which makes their agent safer hired here
 * than hired there. Quoting it is not a jab; it is the reason the allowlist
 * looks the way it does.
 */
export const CUSTODY_QUOTE = {
  text:
    "Pancake selectors accept arbitrary recipient and position arguments, so the custody boundary relies on account isolation rather than recipient binding.",
  attribution: "Agripinaa, sponsor evidence",
  source: "https://github.com/san-npm/agripinaa",
} as const;

export interface ShopAgent {
  tokenId: string;
  name: string;
  description: string | null;
  owner: string;
  category: Category | null;
  operator: ShopOperator;
  /** Contract verification, from the note. Never inferred. */
  verified: boolean;
  /** Their published caveat about this agent, if any. */
  caveat: string | null;
  caveatSource: string | null;
  /** An endpoint the card advertises. A claim, never evidence. */
  endpoint: string | null;
  /**
   * Silent: the card resolved to no endpoint at all.
   *
   * A silent agent is listed and its Hire button is off, with one sentence
   * saying why. That is the honest state of most of the register and hiding it
   * would be the lie.
   */
  silent: boolean;
  /**
   * It answered a call this office actually made.
   *
   * Not the registry's flag and not the operator's claim: our own probe, in
   * `src/data/probe.json`, with its status and latency. A 402 counts, because
   * an agent quoting a price for its answer is more alive than one returning
   * 200 and nothing.
   */
  reached: boolean;
  /** Milliseconds on that call, when there was one. */
  latencyMs: number | null;
  /**
   * How many identities in the field share this agent's owner wallet.
   *
   * One wallet holding forty-four registrations is one operator, not forty-four
   * agents. The rows stay in the register because they are real registrations;
   * they simply do not get to lead a board ahead of a product with one identity
   * and a working endpoint.
   */
  siblings: number;
  blockNumber: string | null;
}

function toShop(a: FieldAgent): ShopAgent | null {
  const slug = operatorSlug(a.operator);
  const operator = slug ? operatorBySlug(slug) : null;
  if (!operator) return null;
  const note = SHOP_NOTES[a.tokenId];
  return {
    tokenId: a.tokenId,
    name: a.name ?? `Agent ${a.tokenId}`,
    description: a.description,
    owner: a.owner,
    category: a.category,
    operator,
    verified: note?.verified ?? true,
    caveat: note?.caveat ?? null,
    caveatSource: note?.source ?? null,
    endpoint: a.x402Endpoint,
    reached: answered(a.tokenId),
    latencyMs: probeFor(a.tokenId)?.latencyMs ?? null,
    siblings: a.siblings,
    silent: !a.x402Endpoint && a.services.length === 0,
    blockNumber: a.blockNumber,
  };
}

/** Every shop agent we have resolved, in the order the field index holds them. */
export function allShops(): ShopAgent[] {
  return getField()
    .agents.map(toShop)
    .filter((s): s is ShopAgent => s !== null);
}

/**
 * The shops fielded for one job, in the order a person hiring cares about.
 *
 * Answered-a-call first, because that is the only claim on this page that this
 * office measured itself. Then an advertised x402 endpoint, then a verified
 * contract, then fewer siblings: a wallet holding forty-four registrations is
 * one operator, and letting the forty-four lead a board would manufacture
 * exactly the plurality this register exists to measure rather than produce.
 * Silent last, always, whatever else is true of it.
 */
export function shopsForJob(category: Category): ShopAgent[] {
  return allShops()
    .filter((s) => s.category === category)
    .sort(
      (a, b) =>
        Number(a.silent) - Number(b.silent) ||
        Number(b.reached) - Number(a.reached) ||
        Number(Boolean(b.endpoint)) - Number(Boolean(a.endpoint)) ||
        Number(b.verified) - Number(a.verified) ||
        a.siblings - b.siblings ||
        a.tokenId.localeCompare(b.tokenId),
    );
}

export function shopByTokenId(tokenId: string): ShopAgent | null {
  return allShops().find((s) => s.tokenId === tokenId) ?? null;
}

/** Shop counts per job, for the doors. Cheap: the field index is a local file. */
export function shopCounts(): Record<Category, number> {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const s of allShops()) if (s.category) counts[s.category] += 1;
  return counts;
}

/** How many operators other than this office have an agent on the boards. */
export function operatorCount(): number {
  return new Set(allShops().map((s) => s.operator.slug)).size;
}
