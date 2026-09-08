/**
 * B402 Bazaar — Binance's own discovery index for paid endpoints.
 *
 * A merchant opts in by attaching a metadata blob to an ordinary V2 settle
 * call, and the Bazaar indexes them within about thirty seconds of the first
 * confirmed settle carrying it. No registration, no contract, no signup. The
 * blob shape matches Coinbase's CDP x402 Bazaar extension field for field.
 *
 * It matters here for one reason: it is the only source of *paid, live*
 * services on BNB Smart Chain that exists independently of the ERC-8004
 * registry, and at the time of writing it lists 979 of them — an order of
 * magnitude more callable supply than the registry's handful of answering
 * endpoints. Rail 1 has real inventory because of this file.
 *
 * ---------------------------------------------------------------------------
 * Two things this module refuses to do
 * ---------------------------------------------------------------------------
 *
 * 1. **It does not report usage statistics.** Binance's documentation
 *    describes `l30DaysTotalCalls`, `l30DaysUniquePayers` and `fail_rate_24h`
 *    on a Bazaar resource, and `l30DaysUniquePayers` would be the single best
 *    trust signal available on this chain — a count of distinct wallets that
 *    actually paid a service, which is neither a self-report nor a review.
 *
 *    The public discovery responses do not carry those fields. Measured
 *    against `/bazaar/resources`, `/bazaar/search` and `/bazaar/merchant`, the
 *    union of keys on every returned item is exactly `resource`, `type`,
 *    `x402Version`, `description`, `accepts` and `lastUpdated`. So the product
 *    shows `lastUpdated`, which is real, and says that payer counts are
 *    documented but not served — rather than rendering a zero, or quietly
 *    dropping the claim.
 *
 * 2. **It does not treat a listing as a fact.** The index entry is what the
 *    merchant declared. What the endpoint actually answers is frequently
 *    different: entries advertising USD1 on chain 56 whose live challenge asks
 *    for USDC on Base, and entries that 404 outright. Both were observed in
 *    the first forty sampled. So a Bazaar row opens the Call rail only after
 *    our own probe gets a challenge we could actually pay from BNB Chain, and
 *    where the two disagree the row says so.
 */

import { getAddress, type Address } from "viem";
import type { BazaarService } from "@bench/shared";
import { hostOf } from "./origins";

/**
 * The production discovery host.
 *
 * Overridable, because a Binance BAPI path is not a stable public contract and
 * the failure mode of a moved path should be a config change rather than a
 * deploy.
 */
const BASE = process.env.B402_BAZAAR_URL ?? "https://www.binance.com/bapi/ramp/v1/public/ramp/b402";

/** Chain 56 in the CAIP-2 form the Bazaar uses. */
const BSC_CAIP = "eip155:56";

export interface BazaarAccept {
  scheme: string;
  network: string;
  asset: string;
  maxAmountRequired?: string;
  amount?: string;
  payTo: string;
  extra?: Record<string, unknown>;
}

export interface BazaarItem {
  resource: string;
  type: string;
  x402Version: number;
  description: string;
  accepts: BazaarAccept[];
  lastUpdated: number;
}

interface BapiEnvelope<T> {
  code: string;
  message: string | null;
  data: T;
  success?: boolean;
}

export class BazaarUnavailable extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "BazaarUnavailable";
  }
}

async function bapi<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
    if (!res.ok) throw new BazaarUnavailable(`B402 Bazaar answered ${res.status}.`);
    const body = (await res.json()) as BapiEnvelope<T>;
    if (body.code && body.code !== "000000") {
      throw new BazaarUnavailable(`B402 Bazaar refused the request: ${body.message ?? body.code}.`);
    }
    return body.data;
  } catch (e) {
    if (e instanceof BazaarUnavailable) throw e;
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new BazaarUnavailable(
      aborted ? "B402 Bazaar did not answer within twelve seconds." : "B402 Bazaar could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Walk the whole catalogue.
 *
 * Paginated at 100, which is the documented maximum, and bounded by `maxPages`
 * so a runaway index cannot become an unbounded crawl. The total is reported
 * alongside so a caller can tell a short answer from a short catalogue.
 */
export async function listBazaar(
  opts: { maxPages?: number } = {},
): Promise<{ items: BazaarItem[]; total: number; complete: boolean }> {
  const maxPages = opts.maxPages ?? 20;
  const items: BazaarItem[] = [];
  let total = 0;
  let complete = false;

  for (let page = 0; page < maxPages; page++) {
    const data = await bapi<{ items: BazaarItem[]; pagination?: { total?: number } }>("/bazaar/resources", {
      limit: 100,
      offset: page * 100,
    });
    const batch = data.items ?? [];
    total = data.pagination?.total ?? total;
    items.push(...batch);
    if (batch.length < 100 || items.length >= total) {
      complete = true;
      break;
    }
  }

  return { items, total: total || items.length, complete };
}

export async function searchBazaar(query: string, limit = 20): Promise<BazaarItem[]> {
  const data = await bapi<{ resources: BazaarItem[] }>("/bazaar/search", {
    query: query.slice(0, 400),
    limit: Math.min(limit, 20),
  });
  return data.resources ?? [];
}

export async function bazaarByMerchant(payTo: string, limit = 50): Promise<BazaarItem[]> {
  const data = await bapi<{ resources: BazaarItem[] }>("/bazaar/merchant", { payTo, limit });
  return data.resources ?? [];
}

const asAddress = (v: string): Address | null => {
  try {
    return /^0x[0-9a-fA-F]{40}$/.test(v) ? getAddress(v) : null;
  } catch {
    return null;
  }
};

/**
 * Turn an index entry into an unprobed board record.
 *
 * The Call rail starts closed with `not-probed`. Nothing here opens it: only
 * a live challenge we could settle from BNB Chain does that, and that happens
 * in `@bench/probe`. An index entry that advertises a BSC price is a claim,
 * and this product's whole argument is that a claim is not a listing.
 */
export function toService(item: BazaarItem, cohort: Map<string, number>): BazaarService {
  const host = hostOf(item.resource) ?? "";
  const advertised = item.accepts
    .map((a) => {
      const asset = asAddress(a.asset);
      const payTo = asAddress(a.payTo);
      if (!asset || !payTo) return null;
      return {
        scheme: a.scheme,
        network: a.network,
        asset,
        maxAmountRequired: a.maxAmountRequired ?? a.amount ?? "0",
        payTo,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return {
    resource: item.resource,
    description: item.description ?? "",
    advertised,
    lastUpdatedMs: item.lastUpdated ?? 0,
    originHost: host,
    originCohortSize: cohort.get(host) ?? 1,
    probe: null,
    call: { available: false, reason: "not-probed" },
    advertisedMismatch: null,
    job: { known: false, reason: "Not yet classified." },
    updatedAt: new Date().toISOString(),
  };
}

/** Does this listing claim it can be paid on BNB Smart Chain at all? */
export const advertisesBsc = (s: BazaarService): boolean =>
  s.advertised.some((a) => a.network === BSC_CAIP || a.network === "56" || a.network === "bsc");

/**
 * What the index does not tell us, stated once and rendered on /data.
 *
 * Kept here, next to the code that would use these fields if they arrived, so
 * that the day they do arrive the note and the implementation are in the same
 * file rather than in a doc nobody updates.
 */
export const BAZAAR_LIMITATIONS = [
  "B402 Bazaar's documentation describes l30DaysTotalCalls, l30DaysUniquePayers and fail_rate_24h on a resource. The public discovery responses do not carry them: across /bazaar/resources, /bazaar/search and /bazaar/merchant the union of returned keys is resource, type, x402Version, description, accepts and lastUpdated. Payer counts are therefore shown as not served rather than as zero.",
  "A Bazaar listing states what a merchant declared, not what the endpoint answers. Where our own call gets a different network or asset than the listing advertises, the row shows the challenge we actually received and flags the disagreement.",
  "Resources with a 24-hour failure rate above 50% are filtered out by the Bazaar before we see them, so this catalogue is already survivorship-biased in the merchant's favour. Our own probe is the correction.",
] as const;
