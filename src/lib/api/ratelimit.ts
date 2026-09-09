/**
 * A token bucket, per caller, in memory.
 *
 * The public API is free and unauthenticated, which means the only thing
 * standing between it and a single client consuming the whole assay budget is
 * this. Deliberately simple: no store, no dependency, no shared state to get
 * wrong. A restart forgets everyone, which is the right failure — it opens the
 * door rather than closing it on people who did nothing wrong.
 *
 * Every response carries its own limits, so a caller never has to guess and
 * never has to be told off twice for the same thing.
 */

interface Bucket {
  tokens: number;
  last: number;
}

const buckets = new Map<string, Bucket>();

export interface Limit {
  /** Requests allowed per window. */
  capacity: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface Decision {
  ok: boolean;
  remaining: number;
  /** Seconds until one more request is allowed. Zero when there is room now. */
  retryAfter: number;
  limit: Limit;
}

export function take(key: string, limit: Limit, cost = 1): Decision {
  const now = Date.now();
  const rate = limit.capacity / limit.windowMs;
  const bucket = buckets.get(key) ?? { tokens: limit.capacity, last: now };

  bucket.tokens = Math.min(limit.capacity, bucket.tokens + (now - bucket.last) * rate);
  bucket.last = now;

  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    buckets.set(key, bucket);
    return { ok: true, remaining: Math.floor(bucket.tokens), retryAfter: 0, limit };
  }

  buckets.set(key, bucket);
  const deficit = cost - bucket.tokens;
  return {
    ok: false,
    remaining: 0,
    retryAfter: Math.ceil(deficit / rate / 1000),
    limit,
  };
}

/**
 * Who is calling.
 *
 * Behind a proxy the socket address is the proxy's, so the forwarded header is
 * used where present. It is trivially spoofable — which is fine here, because
 * the limit protects a free read, not a secret.
 */
export function callerOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "anonymous";
}

export function limitHeaders(d: Decision): Record<string, string> {
  return {
    "x-ratelimit-limit": String(d.limit.capacity),
    "x-ratelimit-remaining": String(d.remaining),
    "x-ratelimit-window": `${Math.round(d.limit.windowMs / 1000)}s`,
    ...(d.retryAfter > 0 ? { "retry-after": String(d.retryAfter) } : {}),
  };
}

/** CORS, open. An API nobody else can call from a browser is not public. */
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};
