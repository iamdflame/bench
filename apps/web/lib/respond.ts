/**
 * The shape every public API answer takes, and the limits on getting one.
 *
 * The API is open, unauthenticated and CORS-open because a measurement nobody
 * else can obtain is indistinguishable from one nobody else can falsify. That
 * is an argument for openness, not for being free to abuse, so every route is
 * paced and every answer carries the block it was read at.
 *
 * Rate limiting is in memory and resets when an instance recycles. That is the
 * wrong tool for a bank and the right one here: it costs nothing, it needs no
 * service, and the thing it protects is a JSON file read.
 */

import { NextResponse } from "next/server";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
} as const;

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

interface Limit {
  capacity: number;
  windowMs: number;
}

const buckets = new Map<string, number[]>();

const callerOf = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "anon";

export function gate(
  req: Request,
  limit: Limit,
  route: string,
): { allowed: true } | { allowed: false; response: NextResponse } {
  const key = `${route}:${callerOf(req)}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < limit.windowMs);
  if (hits.length >= limit.capacity) {
    const retry = Math.ceil((limit.windowMs - (now - hits[0]!)) / 1000);
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: "rate_limited",
          message: `This route allows ${limit.capacity} requests per ${Math.round(limit.windowMs / 1000)} seconds. It is open and unauthenticated, which is why it is paced.`,
          retryAfterSeconds: retry,
        },
        { status: 429, headers: { ...CORS, "retry-after": String(retry) } },
      ),
    };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true };
}

/**
 * A successful answer, with its provenance attached.
 *
 * `observedAt` and `block` are not optional. An API that returns figures
 * without them is asking a caller to trust a number they cannot date, which is
 * the thing this whole product objects to.
 */
export function ok(data: unknown, meta: { block: string; observedAt: string; chainId: number }) {
  return NextResponse.json(
    {
      data,
      meta: {
        ...meta,
        source: "https://github.com/iamdflame/bench",
        note: "Every figure here carries the block it was read at. An unknown is an object with a reason, never a zero.",
      },
    },
    { headers: { ...CORS, "cache-control": "public, s-maxage=30, stale-while-revalidate=120" } },
  );
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: "refused", message }, { status, headers: CORS });
}

/**
 * bigint does not survive JSON.stringify, and every block in this product is
 * one. Rather than dropping them, they become decimal strings — a caller can
 * still check the number, which is the entire point of publishing it.
 */
export function serialise<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as T;
}
