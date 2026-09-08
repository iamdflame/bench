/**
 * The listing gate: we call it before we list it.
 *
 * A directory lists what a registration claims. A marketplace lists what it
 * has checked, because the moment there is a Hire button next to a row, the
 * row is a representation and someone is about to spend money on it.
 *
 * Four things happen here, in ascending order of what they cost and what they
 * prove:
 *
 *   1. REACH.     Does the host answer at all? Status, latency, body.
 *   2. IDENTITY.  Send three genuinely different inputs. If the bytes coming
 *                 back are identical every time, the endpoint is not reading
 *                 the request, and a single 200 would have read as healthy.
 *                 This is the check that separates a service from a stub, and
 *                 the field has live examples: agents answering byte-identical
 *                 payloads to everything, indexed everywhere as "reachable".
 *   3. CHALLENGE. Is there a 402 with a payment challenge we can parse?
 *   4. PAYABLE.   Is that challenge settleable from BNB Smart Chain, in an
 *                 asset we hold? A challenge asking for USDC on Base is a real
 *                 challenge and an unusable one, and saying so is the whole
 *                 job.
 *
 * A probe that fails is recorded with the condition that failed. There is no
 * boolean "healthy" anywhere in this file.
 */

import { createHash } from "node:crypto";
import { safeFetch, type RailRefusal, type ProbeResult } from "@bench/shared";

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/**
 * Three inputs that a real service would answer differently.
 *
 * They are deliberately ordinary — a real endpoint should not fail on them —
 * and deliberately unalike, so that identical responses cannot be explained by
 * the inputs being similar.
 */
const IDENTITY_PROBES = [
  { q: "What is the current health factor of 0x0000000000000000000000000000000000000001 on Venus?" },
  { q: "Rebalance a PancakeSwap V3 BNB/USDT position at tick 0." },
  { q: "zzzz" },
] as const;

export interface EndpointProbe extends ProbeResult {
  /** The body of the first call, capped. Kept for the evidence drawer. */
  sample: string | null;
  /** Final URL after redirects. A row should link where it actually went. */
  finalUrl: string | null;
  /** Response headers we care about, for the drawer. */
  contentType: string | null;
}

export async function probeEndpoint(
  url: string | null,
  opts: { timeoutMs?: number; identityCheck?: boolean } = {},
): Promise<EndpointProbe> {
  const at = new Date().toISOString();
  const base: EndpointProbe = {
    at,
    latencyMs: 0,
    status: null,
    bodyHash: null,
    identicalAcrossInputs: null,
    refusal: null,
    sample: null,
    finalUrl: null,
    contentType: null,
  };

  if (!url) return { ...base, refusal: "no-endpoint" };

  const timeoutMs = opts.timeoutMs ?? 8_000;
  let first = await safeFetch(url, { timeoutMs, maxBytes: 128 * 1024 });

  /*
    A timeout is retried once, with more patience, before it becomes a verdict.

    The board's whole claim is that nothing is listed until we have called it,
    and the corollary is that a refusal has to be about the agent rather than
    about us. It was not. Sweeping the full B402 catalogue recorded
    `endpoint-timeout` against `mpp.hyreagent.fun/bsc/defi/tvl` — the endpoint
    this marketplace has an on-chain receipt for paying — because that host
    serves eleven of the catalogue's listings and the identity check makes
    three more requests apiece, so a bounded pool still queued a dozen calls at
    one origin. Called on its own a moment later it answered 402 in 0.5s.

    Publishing "this agent did not answer" when the truth is "we asked too many
    things at once" is the same class of error as the topic filter that proved
    capability from a stranger's transaction: quiet, plausible, and wrong. One
    serial retry costs a few seconds on the small number of endpoints that
    actually stall, and it is the difference between a measurement and an
    artefact of our own scheduling.
  */
  if (!first.ok && first.refusal === "timeout") {
    first = await safeFetch(url, { timeoutMs: timeoutMs * 2, maxBytes: 128 * 1024 });
  }

  if (!first.ok) {
    const refusal: RailRefusal =
      first.refusal === "timeout"
        ? "endpoint-timeout"
        : first.refusal === "blocked-host" || first.refusal === "blocked-scheme"
          ? "blocked-host"
          : "endpoint-error";
    return { ...base, latencyMs: first.latencyMs, refusal };
  }

  const result: EndpointProbe = {
    ...base,
    latencyMs: first.latencyMs,
    status: first.status,
    bodyHash: sha(first.body),
    sample: first.body.slice(0, 2_000),
    finalUrl: first.url,
    contentType: first.headers["content-type"] ?? null,
  };

  if (first.status === 404) return { ...result, refusal: "endpoint-404" };

  /*
    The identity check is skipped for a 402.

    A payment challenge is *supposed* to be identical whatever you send: it is
    the price, not the answer. Running the three-input test against one would
    flag every correctly-implemented paid endpoint on the chain as a stub,
    which is precisely the kind of check that looks rigorous and is wrong.
  */
  if (first.status === 402) return result;

  if (opts.identityCheck === false) return result;

  const hashes = await Promise.all(
    IDENTITY_PROBES.map(async (body) => {
      const r = await safeFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs,
        maxBytes: 128 * 1024,
      });
      return r.ok ? sha(r.body) : null;
    }),
  );

  const got = hashes.filter((h): h is string => h !== null);
  if (got.length >= 3) {
    const identical = got.every((h) => h === got[0]);
    result.identicalAcrossInputs = identical;
    if (identical) return { ...result, refusal: "identical-bytes" };
  } else {
    // Not enough answers to run the test. Unknown, not passed.
    result.identicalAcrossInputs = null;
  }

  return result;
}
