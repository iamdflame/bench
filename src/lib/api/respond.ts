import { NextResponse } from "next/server";
import { CORS, limitHeaders, take, callerOf, type Limit } from "./ratelimit";

/**
 * One shape for every public response.
 *
 * Each carries the block it was read at and when. A public API for a product
 * whose argument is that unstamped numbers are claims cannot itself serve
 * unstamped numbers.
 */
export interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Where the answer came from and when, always. */
  observed: {
    chainId: number;
    blockNumber: string | null;
    at: string;
  };
  docs: string;
}

const DOCS = "https://mandate-coral.vercel.app/api";

export function ok<T>(
  data: T,
  observed: { chainId: number; blockNumber?: bigint | string | null; at?: string },
  extraHeaders: Record<string, string> = {},
) {
  const body: Envelope<T> = {
    ok: true,
    data,
    observed: {
      chainId: observed.chainId,
      blockNumber: observed.blockNumber?.toString() ?? null,
      at: observed.at ?? new Date().toISOString(),
    },
    docs: DOCS,
  };
  return NextResponse.json(body, { headers: { ...CORS, ...extraHeaders } });
}

export function fail(
  status: number,
  error: string,
  chainId: number,
  extraHeaders: Record<string, string> = {},
) {
  const body: Envelope<never> = {
    ok: false,
    error,
    observed: { chainId, blockNumber: null, at: new Date().toISOString() },
    docs: DOCS,
  };
  return NextResponse.json(body, { status, headers: { ...CORS, ...extraHeaders } });
}

/** Applies the limit and hands back either the headers to use or a refusal. */
export function gate(request: Request, limit: Limit, chainId: number, cost = 1) {
  const decision = take(callerOf(request), limit, cost);
  const headers = limitHeaders(decision);
  if (decision.ok) return { allowed: true as const, headers };
  return {
    allowed: false as const,
    headers,
    response: fail(
      429,
      `rate limited: ${limit.capacity} requests per ${Math.round(limit.windowMs / 1000)}s. Retry in ${decision.retryAfter}s.`,
      chainId,
      headers,
    ),
  };
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
