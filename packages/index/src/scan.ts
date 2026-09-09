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
  next_cursor?: string | null;
  has_more?: boolean;
  pagination?: { total?: number; limit?: number; offset?: number };
}

/**
 * The largest page this index will serve.
 *
 * Asking for more is not merely capped — it is rejected, with a 422 whose body
 * carries `detail` and no `items` at all. Read through `page.items ?? []` that
 * arrives as an empty page rather than an error, which is indistinguishable
 * from "the registry is empty" and is how a crawl silently reads nothing. The
 * constant exists so no caller can pick a number the server will refuse.
 */
export const SCAN_PAGE_MAX = 100;

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

/**
 * How many agents match a filter.
 *
 * The index answers this in the `total` of a one-row page, which makes a
 * population count cost one request instead of a walk. It is the mechanism the
 * whole funnel is built on: six filters, six requests, no crawl.
 *
 * Unknown rather than zero when the index cannot be read — the distinction
 * this codebase exists to keep. "No agents match" and "we could not ask" are
 * different sentences and only one of them is about the registry.
 */
export async function countWhere(
  chainId: SupportedChain,
  params: Record<string, string | number | boolean> = {},
): Promise<Maybe<number>> {
  try {
    const page = await get<Page<ScanAgent>>("/agents", {
      chain_id: chainId,
      limit: 1,
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
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
    limit: Math.min(opts.limit ?? SCAN_PAGE_MAX, SCAN_PAGE_MAX),
    offset: opts.offset ?? 0,
  });
  return { items: page.items ?? [], total: page.pagination?.total ?? page.total ?? null };
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

/**
 * Where a walk had got to. Everything needed to resume one, and nothing else.
 *
 * `cursor` is the index's own opaque token. It encodes the sort and the point
 * reached, so a resumed walk continues from that row rather than re-reading
 * from the head and drifting as new registrations land above it. Offset paging
 * cannot promise that: rows shift under it while the walk runs.
 */
export interface WalkState {
  cursor: string | null;
  /** Rows yielded so far by this walk, across every page. */
  fetched: number;
  /** Pages fetched. Useful only for reporting the shape of a run. */
  pages: number;
  /** The population the index claims, read from the first page. */
  total: number | null;
  /** False once the index says there is nothing after the current cursor. */
  more: boolean;
  /**
   * The token that ended the walk early, when `until` matched.
   *
   * Null means the walk ended because the index ran out of rows, or because
   * `max` was reached. The distinction matters to a caller deciding whether it
   * has read the whole population or merely the part it asked for.
   */
  stopped: string | null;
}

export interface WalkOptions {
  /** Page size. Clamped to what the server will actually serve. */
  limit?: number;
  /** Resume point from a previous run's `WalkState`. */
  cursor?: string | null;
  /** Stop after this many rows. For smoke runs; a full walk omits it. */
  max?: number;
  /** How many times to retry a page before giving up on the walk. */
  attempts?: number;
  /**
   * Which field orders the walk, and from which end.
   *
   * A cursor is a position *within a query*, not a standalone bookmark: the
   * index encodes the filters and the sort into it and refuses any page whose
   * request does not carry the same ones back — "cursor filters do not match
   * the request". So the sort is repeated on every request, not just the
   * first, and the same is true of `filters`.
   *
   * Offset paging is not an alternative for a deep walk: it is capped at
   * 10,000, so it cannot reach past the newest three per cent of the registry.
   * The cursor is the only way through, which is why getting its contract
   * right matters more here than it looks.
   */
  sortBy?: "created_at" | "token_id";
  sortOrder?: "asc" | "desc";
  /**
   * Extra filters, sent verbatim on the opening request.
   *
   * The index filters server-side — `has_a2a`, `has_mcp`, `x402_supported`,
   * `created_after` and the rest — which is what makes it possible to walk a
   * cohort of thirty thousand instead of a registry of three hundred
   * thousand. They are sent on every request, because the cursor is scoped to
   * them and the index rejects a page whose filters have drifted.
   */
  filters?: Record<string, string | number | boolean>;
  /**
   * Stop when a row is reached that this returns true for.
   *
   * The row that triggers it is still yielded, so the caller can see what
   * stopped the walk. Two uses: an incremental pass that stops at the first
   * token it already holds, and a two-ended backfill where each side stops at
   * the other's frontier.
   */
  until?: (a: ScanAgent) => boolean;
}

/**
 * One page of the walk, with the state that would resume it.
 *
 * The state is yielded *with* the rows rather than returned at the end, so a
 * caller can checkpoint after every page. A walk of three thousand requests
 * that loses its place on the last one has done seven minutes of work for
 * nothing, and rate limits make that the expected case rather than the
 * unlucky one.
 */
export interface WalkPage {
  items: ScanAgent[];
  state: WalkState;
}

/**
 * Read the whole registry, a page at a time.
 *
 * The index holds every registration and will hand over all of them; nothing
 * here needs the chain. That matters because walking the chain backwards from
 * the head reads a few hundred rows before it becomes uneconomic, and a
 * marketplace that has read a few hundred of three hundred thousand
 * registrations is not describing the population it claims to describe.
 *
 * A 429 is not a failure here. At five hundred requests a minute a full walk
 * is a few thousand requests, and being asked to slow down is the ordinary
 * condition of that. So the walk backs off and retries the same cursor rather
 * than abandoning the run — but it gives up after `attempts`, because retrying
 * for ever against an index that is down is how a worker appears to be working
 * while reading nothing.
 */
export async function* walkAgents(
  chainId: SupportedChain,
  opts: WalkOptions = {},
): AsyncGenerator<WalkPage> {
  const limit = Math.min(opts.limit ?? SCAN_PAGE_MAX, SCAN_PAGE_MAX);
  const attempts = opts.attempts ?? 5;

  const state: WalkState = {
    cursor: opts.cursor ?? null,
    fetched: 0,
    pages: 0,
    total: null,
    more: true,
    stopped: null,
  };

  while (state.more) {
    if (opts.max !== undefined && state.fetched >= opts.max) break;

    let page: Page<ScanAgent> | null = null;
    let lastReason = "";

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        // Back off, then try the same cursor again. Doubling from a second
        // keeps a transient limit cheap and a sustained one bounded.
        await new Promise((r) => setTimeout(r, 1_000 * 2 ** (attempt - 1)));
      }
      try {
        page = await get<Page<ScanAgent>>("/agents", {
          chain_id: chainId,
          limit,
          // The sort is carried inside the cursor once one exists, so it is
          // sent only to open the walk. Sending it again alongside a cursor
          // risks the two disagreeing.
          // Every filter and the sort go on *every* request, beside the
          // cursor. The index validates that the two agree and refuses the
          // page otherwise — "cursor filters do not match the request" — so a
          // cursor is a position within a query, never a substitute for it.
          ...Object.fromEntries(
            Object.entries(opts.filters ?? {}).map(([k, v]) => [k, String(v)]),
          ),
          ...(opts.sortBy ? { sort_by: opts.sortBy } : {}),
          ...(opts.sortOrder ? { sort_order: opts.sortOrder } : {}),
          ...(state.cursor ? { cursor: state.cursor } : {}),
        });
        break;
      } catch (e) {
        lastReason = e instanceof ScanUnavailable ? e.reason : "The registry index could not be read.";
      }
    }

    if (!page) throw new ScanUnavailable(lastReason || "The registry index stopped answering mid-walk.");

    let items = page.items ?? [];

    // A stop condition truncates the page at the row that matched, keeping
    // that row. Everything after it belongs to the other side of the walk, or
    // was read on a previous pass.
    if (opts.until) {
      const hit = items.findIndex(opts.until);
      if (hit !== -1) {
        items = items.slice(0, hit + 1);
        state.stopped = items[hit]?.token_id ?? null;
      }
    }

    if (state.total === null) {
      const total = page.pagination?.total ?? page.total;
      state.total = typeof total === "number" ? total : null;
    }

    state.pages += 1;
    state.fetched += items.length;
    state.cursor = page.next_cursor ?? null;

    // Three ways a walk ends, and all of them must end it. The index says
    // there is no more; it stops issuing a cursor; or it returns a page with
    // nothing on it, which would otherwise spin against the same cursor for
    // ever.
    state.more =
      state.stopped === null &&
      page.has_more === true &&
      state.cursor !== null &&
      items.length > 0;

    yield { items, state: { ...state } };
  }
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
