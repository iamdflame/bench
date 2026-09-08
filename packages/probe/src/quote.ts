/**
 * Rail 2's gate: ask for a quote, and see whether a signed one comes back.
 *
 * ERC-8183 is a negotiation followed by an escrow. The buyer sends a
 * `NegotiationRequest` — a task, the deliverables expected, and the quality
 * standards that are not negotiable — and the seller answers with a
 * `NegotiationResponse`: accepted with a price and an expiry, or rejected with
 * one of the standard reason codes. The accepted response is signed by the
 * provider's account and hashed, and that hash goes on chain inside
 * `job.description`, so neither side can rewrite the terms afterwards.
 *
 * That round trip is the only honest test of hireability. A card that says
 * "I do rebalancing" is a claim; an endpoint that answers a 200 is reachable;
 * a *signed quote for this specific job* is the seller committing to terms.
 * So the Hire rail opens on a signed quote and on nothing else.
 *
 * A rejection is not a failure of the probe. `PRICE_TOO_LOW`, `BUSY` and
 * `INCAPABLE` are the protocol working, and the row says which one came back
 * rather than reporting the agent as broken.
 */

import { safeFetch, type RailRefusal, type SupportedChain, TOKENS } from "@bench/shared";
import type { Job } from "@bench/shared";

/** The standard rejection codes, in the words a buyer would want. */
export const REASON_CODE_TEXT: Record<string, string> = {
  "0x01": "it wants more than the budget offered",
  "0x02": "the deadline is too tight for it",
  "0x03": "it says it cannot do this job",
  "0x04": "it found the terms ambiguous",
  "0x05": "it is busy",
  "0x06": "it does not support this kind of job",
  "0x07": "the task text exceeds the on-chain description cap",
};

/**
 * Where a seller's negotiation endpoint lives.
 *
 * `bag`-built agents serve `/negotiate` off their agent URL, and the declared
 * endpoint in a registration is sometimes the base and sometimes already the
 * full path. Both are tried, in that order, and the one that answers is
 * recorded — so the agent page can show the URL that actually worked rather
 * than the one we guessed.
 */
function candidatePaths(endpoint: string): string[] {
  const trimmed = endpoint.replace(/\/+$/, "");
  if (/\/negotiate$/.test(trimmed)) return [trimmed];
  return [`${trimmed}/negotiate`, `${trimmed}/erc8183/negotiate`, `${trimmed}/api/negotiate`, trimmed];
}

export interface QuoteProbe {
  at: string;
  /** The URL that answered, when one did. */
  url: string | null;
  /** True only when a well-formed, accepted, unexpired, signed quote arrived. */
  accepted: boolean;
  /** Raw units of the quoted currency. */
  price: bigint | null;
  currency: string | null;
  /** Unix seconds. A quote that arrives expired is not a quote. */
  quoteExpiresAt: number | null;
  estimatedCompletionSeconds: number | null;
  /** The provider's signature over the negotiation digest, when present. */
  providerSig: string | null;
  negotiationHash: string | null;
  /** The full result, kept verbatim: it becomes the on-chain description. */
  result: Record<string, unknown> | null;
  reasonCode: string | null;
  reason: string | null;
  refusal: RailRefusal | null;
  latencyMs: number;
}

/**
 * Build the request body without importing the SDK's class hierarchy.
 *
 * The wire format is a documented v1 JSON schema with snake_case keys, and the
 * shape is small. Constructing it by hand keeps this package free of a heavy
 * dependency that would otherwise be pulled into the worker and the API route
 * for one object literal, and it is the format the seller parses either way.
 */
export function negotiationRequest(job: Job, budget: bigint, currency: string) {
  return {
    request: {
      task_description: `${job.title}: ${job.line} Report what you would do for a BNB Smart Chain position in this job, and what it would cost.`,
      terms: {
        deliverables:
          "A written assessment of the position named in the request, stating the action you would take now and why, with the on-chain values it is based on.",
        quality_standards:
          "Every figure cites the block it was read at. State plainly where a value could not be read rather than substituting a default.",
        success_criteria: [
          "The response names a specific action or explicitly states that no action is warranted.",
          "Every numeric claim carries the block it was read at.",
        ],
        price: budget.toString(),
        currency,
        evaluation_required: false,
        evaluator_type: "optimistic",
      },
      context_urls: [],
    },
  };
}

export async function probeQuote(
  endpoint: string | null,
  job: Job,
  opts: { chainId: SupportedChain; budget?: bigint; timeoutMs?: number } = { chainId: 56 },
): Promise<QuoteProbe> {
  const at = new Date().toISOString();
  const uToken = TOKENS[opts.chainId].U;
  const budget = opts.budget ?? 500_000_000_000_000_000n; // 0.5 $U
  const base: QuoteProbe = {
    at,
    url: null,
    accepted: false,
    price: null,
    currency: null,
    quoteExpiresAt: null,
    estimatedCompletionSeconds: null,
    providerSig: null,
    negotiationHash: null,
    result: null,
    reasonCode: null,
    reason: null,
    refusal: null,
    latencyMs: 0,
  };

  if (!endpoint) return { ...base, refusal: "no-endpoint" };

  const body = JSON.stringify(negotiationRequest(job, budget, uToken.address));
  let lastRefusal: RailRefusal = "no-8183-seller";
  let latency = 0;

  for (const url of candidatePaths(endpoint)) {
    const res = await safeFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      timeoutMs: opts.timeoutMs ?? 10_000,
      maxBytes: 256 * 1024,
    });
    latency += res.ok ? res.latencyMs : res.latencyMs;

    if (!res.ok) {
      lastRefusal = res.refusal === "timeout" ? "endpoint-timeout" : "endpoint-error";
      continue;
    }
    if (res.status === 404 || res.status === 405) {
      lastRefusal = "no-8183-seller";
      continue;
    }
    if (res.status >= 500) {
      lastRefusal = "endpoint-error";
      continue;
    }

    const parsed = parseQuoteBody(res.body);
    if (!parsed) {
      lastRefusal = "quote-unparseable";
      continue;
    }

    const now = Math.floor(Date.now() / 1000);
    const expired = parsed.quoteExpiresAt !== null && parsed.quoteExpiresAt <= now;

    return {
      ...base,
      ...parsed,
      url,
      latencyMs: latency,
      refusal: !parsed.accepted ? "quote-refused" : expired ? "quote-expired" : null,
      accepted: parsed.accepted && !expired,
    };
  }

  return { ...base, latencyMs: latency, refusal: lastRefusal };
}

type ParsedQuote = Omit<QuoteProbe, "at" | "url" | "refusal" | "latencyMs">;

/**
 * Read a negotiation response in either of the two shapes it arrives in.
 *
 * A `NegotiationResult` carries `response`, `response_hash`, `provider_sig`
 * and `negotiation_hash`. A bare `NegotiationResponse` envelope carries only
 * `response` and `response_hash`. Both are accepted; only the first can be
 * anchored on chain, and the caller is told which it got by whether
 * `providerSig` is present.
 */
export function parseQuoteBody(text: string): ParsedQuote | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const responseNode = (o.response ?? o) as Record<string, unknown>;
  if (typeof responseNode.accepted !== "boolean") return null;

  const terms = (responseNode.terms ?? null) as Record<string, unknown> | null;
  let price: bigint | null = null;
  try {
    const p = terms?.price;
    price = typeof p === "string" || typeof p === "number" ? BigInt(p) : null;
  } catch {
    price = null;
  }

  return {
    accepted: responseNode.accepted === true,
    price,
    currency: typeof terms?.currency === "string" ? terms.currency : null,
    quoteExpiresAt:
      typeof responseNode.quote_expires_at === "number"
        ? responseNode.quote_expires_at
        : typeof responseNode.quoteExpiresAt === "number"
          ? responseNode.quoteExpiresAt
          : null,
    estimatedCompletionSeconds:
      typeof responseNode.estimated_completion_seconds === "number"
        ? responseNode.estimated_completion_seconds
        : null,
    providerSig: typeof o.provider_sig === "string" ? o.provider_sig : null,
    negotiationHash: typeof o.negotiation_hash === "string" ? o.negotiation_hash : null,
    result: o.response ? o : null,
    reasonCode: typeof responseNode.reason_code === "string" ? responseNode.reason_code : null,
    reason: typeof responseNode.reason === "string" ? responseNode.reason : null,
  };
}
