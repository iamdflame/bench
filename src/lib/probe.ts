/**
 * Calling an endpoint, so rung 2 is a call we made rather than a claim we read.
 *
 * Rung 2 says "its endpoint answered a call we made". It has been serving
 * `5` for as long as the site has existed, and that five came from 8004scan's
 * `is_endpoint_verified` flag — somebody else's probe, at some time they do
 * not publish, with a method they do not describe. The rung's own sentence was
 * not true of the number underneath it.
 *
 * This makes it true. Two steps, in order, because they answer different
 * questions:
 *
 *   1. The card. Fetch the URL the registration points at and parse it. An
 *      agent whose card 404s is not reachable however good its endpoint is.
 *   2. The endpoint. Call the service the card advertises and record the
 *      status and the latency.
 *
 * A non-200 is recorded with its status rather than being dropped. Half the
 * value of a census is knowing which agents are failing and how — SMEAI dims
 * theirs rather than hiding them, and an endpoint that answers 402 is a very
 * different finding from one that times out.
 *
 * Nothing here writes a rung directly. It records what happened, with the time
 * it happened, and the ladder counts.
 */

export interface ProbeResult {
  tokenId: string;
  /** The URL called. Null when the card advertised none. */
  endpoint: string | null;
  /** True only on a response we actually received. */
  answered: boolean;
  status: number | null;
  latencyMs: number | null;
  /**
   * Why it did not answer, in the words of the failure.
   *
   * `timeout`, `dns`, `refused`, `tls` and a bare status are all different
   * findings and an operator can act on each of them differently.
   */
  error: string | null;
  at: string;
}

const TIMEOUT_MS = 6_000;

/**
 * One call, with the failure classified rather than swallowed.
 *
 * A 402 counts as answered: it is the x402 rail working exactly as specified,
 * and an agent that quotes a price for its answer is more alive than one that
 * returns 200 and nothing. So is a 401. What does not count is silence.
 */
export async function probe(tokenId: string, endpoint: string | null): Promise<ProbeResult> {
  const at = new Date().toISOString();
  if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
    return {
      tokenId,
      endpoint,
      answered: false,
      status: null,
      latencyMs: null,
      error: endpoint ? "the card advertises a scheme we do not call" : "the card advertises no endpoint",
      at,
    };
  }

  const started = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json, */*" },
    });
    return {
      tokenId,
      endpoint,
      answered: true,
      status: res.status,
      latencyMs: Date.now() - started,
      error: res.ok || res.status === 402 || res.status === 401 ? null : `answered ${res.status}`,
      at,
    };
  } catch (e) {
    const message = String(e);
    const error = /timeout|abort/i.test(message)
      ? `no answer in ${TIMEOUT_MS / 1000}s`
      : /ENOTFOUND|getaddrinfo/i.test(message)
        ? "the host does not resolve"
        : /ECONNREFUSED/i.test(message)
          ? "the host refused the connection"
          : /certificate|TLS|SSL/i.test(message)
            ? "the certificate would not verify"
            : "the request failed";
    return {
      tokenId,
      endpoint,
      answered: false,
      status: null,
      latencyMs: Date.now() - started,
      error,
      at,
    };
  }
}

/**
 * Probes many, politely.
 *
 * Bounded concurrency rather than a flood: these are other people's servers
 * and a census that knocks them over has measured its own effect.
 */
export async function probeAll(
  targets: { tokenId: string; endpoint: string | null }[],
  concurrency = 6,
): Promise<ProbeResult[]> {
  const out: ProbeResult[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;
      const t = targets[i]!;
      out.push(await probe(t.tokenId, t.endpoint));
    }
  });
  await Promise.all(workers);
  return out;
}
