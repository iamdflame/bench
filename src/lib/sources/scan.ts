/**
 * 8004scan client.
 *
 * Two things make this harder than a fetch wrapper, and both are measured facts:
 *   1. The anonymous limit is 30 req/min (Pro tier: 500/min). Crawling 301,160
 *      BSC agents means the limiter is the critical path, not the network.
 *   2. The upstream returns `{"success":false,"error":{"code":"DATABASE_ERROR"}}`
 *      with HTTP 200 under load. A naive client treats that as data.
 */

import { SCAN_API_KEY, SCAN_BASE_URL } from "@/lib/config";
import { memo } from "@/lib/cache";

/** Conservative unless a key is present. Pro tier is 500/min. */
const RATE_PER_MIN = SCAN_API_KEY ? 450 : 25;
const MIN_INTERVAL_MS = Math.ceil(60_000 / RATE_PER_MIN);

let lastCall = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Serialises every request through one spaced queue. */
function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fn();
  });
  // Keep the chain alive even when a link rejects.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run as Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ScanError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ScanError";
  }
}

async function request<T>(path: string, attempt = 0): Promise<T> {
  const url = path.startsWith("http") ? path : `${SCAN_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "assay/0.1 (+https://assay.bnb)",
  };
  if (SCAN_API_KEY) headers["x-api-key"] = SCAN_API_KEY;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(45_000) });
  } catch (cause) {
    if (attempt < 4) {
      await sleep(backoff(attempt));
      return request<T>(path, attempt + 1);
    }
    throw new ScanError(`network failure: ${String(cause)}`, 0, true);
  }

  // Explicit rate-limit response carries a retry_after in seconds.
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const after = Number((body as { retry_after?: number }).retry_after ?? 60);
    if (attempt < 4) {
      await sleep(Math.min(after, 90) * 1000);
      return request<T>(path, attempt + 1);
    }
    throw new ScanError("rate limited", 429, true);
  }

  if (res.status >= 500) {
    if (attempt < 4) {
      await sleep(backoff(attempt));
      return request<T>(path, attempt + 1);
    }
    throw new ScanError(`upstream ${res.status}`, res.status, true);
  }

  if (!res.ok) {
    throw new ScanError(`http ${res.status} for ${path}`, res.status, false);
  }

  const json = (await res.json()) as unknown;

  // A 200 that is actually an error. This is the one that bites.
  if (
    json &&
    typeof json === "object" &&
    "success" in json &&
    (json as { success: boolean }).success === false
  ) {
    const err = (json as { error?: { code?: string; message?: string } }).error;
    const retryable = err?.code === "DATABASE_ERROR";
    if (retryable && attempt < 4) {
      await sleep(backoff(attempt));
      return request<T>(path, attempt + 1);
    }
    throw new ScanError(
      `upstream error ${err?.code ?? "unknown"}: ${err?.message ?? ""}`,
      200,
      retryable,
    );
  }

  return json as T;
}

const backoff = (attempt: number) =>
  Math.min(1000 * 2 ** attempt, 20_000) + Math.random() * 400;

const get = <T>(path: string) => schedule(() => request<T>(path));

// ---------------------------------------------------------------------------
// Shapes. Only the fields the assays actually consume.
// ---------------------------------------------------------------------------

export interface ScanPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ScanAgentSummary {
  id: string;
  agent_id: string;
  token_id: string;
  chain_id: number;
  contract_address: string;
  owner_address: string | null;
  name: string | null;
  description: string | null;
  image_url: string | null;
  supported_protocols: string[] | null;
  x402_supported: boolean | null;
  total_score: number | null;
  total_feedbacks: number | null;
  average_score: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ScanAgentDetail extends ScanAgentSummary {
  /** The wallet the agent transacts from. Equal to owner_address surprisingly often. */
  agent_wallet: string | null;
  creator_address: string | null;
  is_endpoint_verified: boolean | null;
  endpoint_verified_domain: string | null;
  endpoint_verification_error: string | null;
  endpoint_last_checked_at: string | null;
  health_score: number | null;
  health_status: Record<string, unknown> | null;
  services: Record<string, unknown> | null;
  categories: string[] | null;
  tags: string[] | null;
  created_block_number: number | null;
  created_tx_hash: string | null;
  a2a_endpoint: string | null;
  mcp_server: string | null;
  agent_url: string | null;
  total_validations: number | null;
  raw_metadata: Record<string, unknown> | null;
  scores: Record<string, number | null> | null;
  is_active: boolean | null;
}

export interface ScanFeedback {
  id: string;
  feedback_id: string;
  chain_id: number;
  /** The reviewer's wallet. This is the input to the whole Sybil engine. */
  user_address: string | null;
  transaction_hash: string | null;
  block_number: number | null;
  score: number | null;
  value: number | null;
  comment: string | null;
  feedback_uri: string | null;
  tag1: string | null;
  tag2: string | null;
  is_revoked: boolean;
  submitted_at: string | null;
  agent: { token_id?: string; chain_id?: number; name?: string } | null;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

const qs = (params: Record<string, string | number | boolean | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export function listAgents(params: {
  chainId: number;
  limit?: number;
  offset?: number;
  isEndpointVerified?: boolean;
  minFeedbacks?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const q = qs({
    chain_id: params.chainId,
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
    is_endpoint_verified: params.isEndpointVerified,
    min_feedbacks: params.minFeedbacks,
    search: params.search,
    sort_by: params.sortBy,
    sort_order: params.sortOrder,
  });
  return get<ScanPage<ScanAgentSummary>>(`/agents?${q}`);
}

/**
 * One agent's registration record.
 *
 * Memoised, because the certificate page reads it and the live assay reads it
 * again for the same agent on the same request — two calls through a queue
 * that only drains every 2.4 seconds. With several pages open the queue was
 * minutes deep and the assay simply never finished: the stream emitted
 * "reading registry claim" and stopped there.
 */
export const getAgent = (chainId: number, tokenId: string) =>
  memo(
    `scan:agent:${chainId}:${tokenId}`,
    { freshMs: 60_000, staleMs: 10 * 60_000 },
    () => get<ScanAgentDetail>(`/agents/${chainId}/${tokenId}`),
  );

export function listFeedbacks(params: {
  chainId: number;
  limit?: number;
  offset?: number;
  agentTokenId?: string;
  userAddress?: string;
  includeRevoked?: boolean;
}) {
  const q = qs({
    chain_id: params.chainId,
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
    agent_token_id: params.agentTokenId,
    user_address: params.userAddress,
    include_revoked: params.includeRevoked ?? true,
    sort_by: "submitted_at",
    sort_order: "asc",
  });
  /*
    Feedback pages are memoised on the exact query.

    The reputation autopsy walks twelve registry-wide pages and five for the
    agent itself. Every visitor to every agent page walks the same twelve, and
    each walk is a place in the same 25-per-minute queue. Keyed on the query
    string, one walk serves them all.
  */
  return memo(
    `scan:feedbacks:${q}`,
    { freshMs: 5 * 60_000, staleMs: 30 * 60_000 },
    () => get<ScanPage<ScanFeedback>>(`/feedbacks?${q}`),
  );
}

/** Cheapest possible way to read a filtered total: ask for one row, read `total`. */
export async function countAgents(
  params: Parameters<typeof listAgents>[0],
): Promise<number> {
  const page = await listAgents({ ...params, limit: 1, offset: 0 });
  return page.total ?? 0;
}

/** Walks a paginated endpoint to exhaustion, yielding pages as they land. */
export async function* paginate<T>(
  fetchPage: (offset: number) => Promise<ScanPage<T>>,
  opts: { pageSize?: number; max?: number } = {},
): AsyncGenerator<{ items: T[]; offset: number; total: number }> {
  const size = opts.pageSize ?? 100;
  let offset = 0;
  let total = Infinity;
  while (offset < Math.min(total, opts.max ?? Infinity)) {
    const page = await fetchPage(offset);
    total = page.total ?? 0;
    const items = page.items ?? [];
    if (items.length === 0) return;
    yield { items, offset, total };
    offset += size;
  }
}
