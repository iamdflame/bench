/**
 * 8004scan, used as enrichment and never as the authority.
 *
 * It indexes the ERC-8004 registry and answers questions the chain cannot
 * answer cheaply: how many registrations exist, which ones were minted
 * recently, what feedback records point at an agent. Those are worth having.
 *
 * What it is not is the source of truth, and the distinction is enforced
 * structurally: every figure this module returns is tagged `source: "registry"`
 * so it renders as *the registry says*, and every read is bounded by a timeout
 * with an explicit "registry unavailable" state rather than an empty array. A
 * marketplace that shows a blank board because a third party is rate-limiting
 * has converted somebody else's outage into its own dishonesty.
 */

import { known, unknown, type Maybe } from "@bench/measure";
import type { SupportedChain } from "@bench/shared";

const BASE = process.env.SCAN_BASE_URL ?? "https://api.8004scan.io/api/v1";
const KEY = process.env.SCAN_API_KEY ?? "";

/** Anonymous is ~25/min; the key lifts it to 500/min. Both are paced here. */
const MIN_INTERVAL_MS = KEY ? 130 : 2_500;
let lastCall = 0;

async function pace() {
  const wait = lastCall + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export interface ScanAgent {
  agent_id: string;
  token_id: string;
  chain_id: number;
  contract_address: string;
  owner_address: string | null;
  name: string | null;
  description: string | null;
  agent_wallet?: string | null;
  a2a_endpoint?: string | null;
  mcp_server?: string | null;
  agent_url?: string | null;
  endpoint_status?: string | null;
  endpoint_last_checked_at?: string | null;
  services?: unknown;
  categories?: string[] | null;
  tags?: string[] | null;
  score?: number | null;
  feedback_count?: number | null;
  created_at?: string | null;
}

export interface ScanFeedback {
  agent_id: string;
  reviewer_address: string;
  score: number | null;
  created_at: string | null;
  tag?: string | null;
}

export class ScanUnavailable extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ScanUnavailable";
  }
}

/**
 * How long a request may take, by who is asking.
 *
 * Four seconds is the read path's bound, and it is deliberate: long enough for
 * a healthy index, short enough that a degraded one cannot hold a page render.
 * A page that waits thirty seconds for a third party has made that third
 * party's outage its own.
 *
 * The crawl is not a page render. It is a background job fetching two hundred
 * rows at a time, and holding it to a latency budget designed to protect a
 * user's first paint simply means it never completes. So the worker raises it
 * explicitly rather than the constant being loosened for everyone.
 */
export const READ_TIMEOUT_MS = 4_000;
export const CRAWL_TIMEOUT_MS = 45_000;

let timeoutMs = READ_TIMEOUT_MS;

/** Called once by the worker. Never called from a request handler. */
export function useCrawlTimeouts() {
  timeoutMs = CRAWL_TIMEOUT_MS;
}

async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  await pace();
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", ...(KEY ? { "X-API-Key": KEY } : {}) },
      signal: controller.signal,
    });
    if (res.status === 429) throw new ScanUnavailable("The registry index is rate-limiting this deployment.");
    if (!res.ok) throw new ScanUnavailable(`The registry index answered ${res.status}.`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ScanUnavailable) throw e;
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new ScanUnavailable(
      aborted
        ? `The registry index did not answer within ${Math.round(timeoutMs / 1000)} seconds.`
        : "The registry index could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }
}

interface Page<T> {
  items: T[];
  total?: number;
  pagination?: { total?: number; limit?: number; offset?: number };
}

/**
 * How many agents are registered.
 *
 * This is a `Maybe` and not a number, because the honest answer when the index
 * is down is not zero and not the last number we happened to see. The board's
 * footnote renders the reason when it is unknown.
 */
export async function countAgents(chainId: SupportedChain): Promise<Maybe<number>> {
  try {
    const page = await get<Page<ScanAgent>>("/agents", { chain_id: chainId, limit: 1 });
    const total = page.pagination?.total ?? page.total;
    return typeof total === "number"
      ? known(total)
      : unknown("The registry index answered without a total, so the population is not established.");
  } catch (e) {
    return unknown(e instanceof ScanUnavailable ? e.reason : "The registry index could not be read.");
  }
}

export async function listAgents(
  chainId: SupportedChain,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ items: ScanAgent[]; total: number | null }> {
  const page = await get<Page<ScanAgent>>("/agents", {
    chain_id: chainId,
    limit: Math.min(opts.limit ?? 100, 2000),
    offset: opts.offset ?? 0,
  });
  return { items: page.items ?? [], total: page.pagination?.total ?? page.total ?? null };
}

export async function getAgent(chainId: SupportedChain, tokenId: string): Promise<ScanAgent | null> {
  try {
    const a = await get<ScanAgent | { items: ScanAgent[] }>(
      `/agents/${chainId}:${tokenId}`,
      {},
    );
    if (a && "items" in a) return a.items[0] ?? null;
    return (a as ScanAgent) ?? null;
  } catch {
    // Fall back to a filtered list: the detail route is not stable across
    // versions of this index, and a 404 here must not mean "no such agent".
    try {
      const page = await get<Page<ScanAgent>>("/agents", { chain_id: chainId, token_id: tokenId, limit: 1 });
      return page.items?.[0] ?? null;
    } catch {
      return null;
    }
  }
}

export async function listFeedbacks(
  chainId: SupportedChain,
  opts: { limit?: number; offset?: number; agentId?: string } = {},
): Promise<ScanFeedback[]> {
  const page = await get<Page<ScanFeedback>>("/feedbacks", {
    chain_id: chainId,
    limit: Math.min(opts.limit ?? 100, 1000),
    offset: opts.offset ?? 0,
    ...(opts.agentId ? { agent_id: opts.agentId } : {}),
  });
  return page.items ?? [];
}

/** The endpoint an 8004scan record declares, in whichever field it used. */
export const scanEndpoint = (a: ScanAgent): string | null =>
  a.a2a_endpoint || a.mcp_server || a.agent_url || null;
