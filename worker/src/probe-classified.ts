/**
 * Calling the agents that claim one of the four jobs.
 *
 * Resolution gave 191 of the 245 a URL. A URL is still a claim: the registry
 * said the agent is there, the card said where, and neither of them has been
 * asked to answer. This asks.
 *
 * What it records is deliberately narrow. Whether the endpoint answered at
 * all, how long it took, whether what came back was a payment challenge we
 * could settle on this chain, and — where it answered — a hash of the body so
 * a later pass can tell a live service from a static file that happens to
 * return 200. Nothing here is a judgement about whether the agent is any good.
 * That is what the bond is for.
 *
 * The four states are alive, degraded, dead and never-probed, and the third
 * and fourth are different sentences. "We called it and nothing answered" is a
 * fact about the agent; "we have not called it" is a fact about us. A board
 * that renders those the same way is lying about which one it knows.
 */

import { probeEndpoint, parseChallenge, type Challenge } from "@bench/probe";
import type { SupportedChain } from "@bench/shared";
import { readResolved, type Resolved } from "./resolve";
import { writeAtomicJson, readJson, DATA_DIR } from "./store";
import { join } from "node:path";

/**
 * Is this URL a static agent card rather than a service?
 *
 * It matters because the prober's identity check sends three different
 * questions and calls an endpoint fake when all three come back byte-identical.
 * That is the right test for a *service*, and exactly the wrong test for a
 * *card*: a `.well-known/agent-card.json` is a static document and returning
 * the same bytes whatever you ask it is precisely what it is supposed to do.
 *
 * Running the check anyway marked 85 agents dead. Called by hand, every one of
 * them answered 200 with a valid A2A card. The finding was about our test, not
 * about them — which is the error this codebase exists to refuse, and it very
 * nearly went out as "182 dead".
 */
function isCardUrl(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return (
      p.endsWith("/.well-known/agent-card.json") ||
      p.endsWith("/.well-known/agent.json") ||
      p.endsWith("/agent-card.json") ||
      p.endsWith("/agent.json")
    );
  } catch {
    return false;
  }
}

/** How an endpoint behaved when we called it. */
export type Liveness = "alive" | "degraded" | "dead" | "never";

export interface Probed {
  tokenId: string;
  endpoint: string | null;
  liveness: Liveness;
  /** HTTP status, when there was one. */
  status: number | null;
  latencyMs: number | null;
  /** Why it is not alive, in words. Null only when it is. */
  refusal: string | null;
  /** A payment challenge we could actually settle on this chain. */
  payable: boolean;
  /** What the challenge asked for, when it made one. */
  challenge: { network: string | null; asset: string | null; amount: string | null } | null;
  /** Set when the endpoint answers but not with anything an agent would. */
  mismatch: string | null;
  probedAt: string;
}

export interface ProbeIndex {
  version: 1;
  chainId: SupportedChain;
  observedAt: string;
  probed: Probed[];
}

export const probedPath = (chainId: SupportedChain) => join(DATA_DIR, `probed-${chainId}.json`);

export function readProbed(chainId: SupportedChain): ProbeIndex | null {
  return readJson<ProbeIndex>(probedPath(chainId));
}

/**
 * Degraded is the state most of this registry is actually in.
 *
 * An endpoint that answers 500, or answers 200 with an error page, or redirects
 * to a marketing site, is not dead — something is there — and it is not alive
 * either, because nothing an agent could use came back. Collapsing it into
 * either neighbour loses the most common truth about this population.
 */
function livenessOf(status: number | null, refusal: string | null): { liveness: Liveness; why: string | null } {
  if (refusal === "no-endpoint") {
    return { liveness: "never", why: "Its card names no endpoint, so there was nothing to call." };
  }
  /*
    Answering the same bytes to three different questions is not death. It is
    an endpoint that serves a document rather than a service, and the honest
    label is degraded: something is there, and it is not something an agent
    could be hired through.
  */
  if (refusal === "identical-bytes") {
    return {
      liveness: "degraded",
      why: "It answered, with the same bytes for three different questions — a document rather than a service.",
    };
  }
  if (refusal) return { liveness: "dead", why: refusalFor(refusal) };
  if (status === null) return { liveness: "dead", why: "It did not answer." };
  if (status === 402) return { liveness: "alive", why: null };
  if (status >= 200 && status < 300) return { liveness: "alive", why: null };
  if (status >= 300 && status < 400) {
    return { liveness: "degraded", why: `It redirected (${status}) rather than answering.` };
  }
  if (status === 404) return { liveness: "dead", why: "Its endpoint answered 404 — nothing is served there." };
  if (status >= 500) return { liveness: "degraded", why: `Its endpoint answered ${status}.` };
  return { liveness: "degraded", why: `Its endpoint answered ${status}.` };
}

/** The prober's short codes, written out for a person. */
function refusalFor(code: string): string {
  switch (code) {
    case "timeout":
      return "It did not answer within the time we waited.";
    case "dns":
      return "Its hostname does not resolve.";
    case "refused":
      return "Its host refused the connection.";
    case "tls":
      return "Its certificate could not be verified.";
    case "blocked":
      return "Its address is one we refuse to call for safety reasons.";
    default:
      return `It could not be called: ${code}.`;
  }
}

export interface ProbeReport {
  chainId: SupportedChain;
  attempted: number;
  alive: number;
  degraded: number;
  dead: number;
  never: number;
  payable: number;
  seconds: number;
}

export async function probeClassified(
  chainId: SupportedChain,
  opts: { limit?: number; concurrency?: number; onProgress?: (m: string) => void } = {},
): Promise<ProbeReport> {
  const started = Date.now();
  const say = opts.onProgress ?? (() => {});
  const concurrency = opts.concurrency ?? 8;

  const resolved = readResolved(chainId);
  if (!resolved) throw new Error("Nothing has been resolved. Run `npm run resolve` first.");

  const targets: Resolved[] = resolved.resolved.slice(0, opts.limit ?? resolved.resolved.length);
  say(`calling ${targets.length} agents`);

  const out: Probed[] = [];
  let cursor = 0;
  let done = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;
      const r = targets[i]!;

      if (!r.endpoint) {
        out.push({
          tokenId: r.tokenId,
          endpoint: null,
          liveness: "never",
          status: null,
          latencyMs: null,
          refusal: r.refusal ?? "Its card names no endpoint, so there was nothing to call.",
          payable: false,
          challenge: null,
          mismatch: null,
          probedAt: new Date().toISOString(),
        });
        done++;
        continue;
      }

      /*
        The identity check is off for a card URL, because a card is meant to be
        identical every time it is read. Leaving it on tests the endpoint for
        being a service and then reports the answer as if it were a test of
        being alive.
      */
      /*
        An endpoint still carrying `{agentId}` is a registration nobody
        finished, and it is common enough here to deserve its own sentence.
        Reporting it as a 404 an eight-second timeout later tells a reader the
        host is down when the truth is the URL was never filled in.
      */
      if (/\{[^}]*\}/.test(r.endpoint)) {
        out.push({
          tokenId: r.tokenId,
          endpoint: r.endpoint,
          liveness: "dead",
          status: null,
          latencyMs: null,
          refusal:
            "Its endpoint still contains an unsubstituted template placeholder, so it was never a real address.",
          payable: false,
          challenge: null,
          mismatch: null,
          probedAt: new Date().toISOString(),
        });
        done++;
        continue;
      }

      const card = isCardUrl(r.endpoint);
      const probe = await probeEndpoint(r.endpoint, { timeoutMs: 8_000, identityCheck: !card });
      const { liveness, why } = livenessOf(probe.status, probe.refusal);

      /*
        A 402 is the only status that is interesting beyond liveness, because
        it is the one that says how to pay. Parsed against our own chain: a
        challenge asking for USDC on Base is a well-formed challenge and it is
        not one this deployment can settle, and those are different findings.
      */
      let challenge: Challenge | null = null;
      if (probe.status === 402 && probe.sample) {
        challenge = parseChallenge(probe.sample, chainId);
      }

      out.push({
        tokenId: r.tokenId,
        endpoint: r.endpoint,
        liveness,
        status: probe.status,
        latencyMs: probe.latencyMs,
        refusal: why,
        payable: Boolean(challenge?.payable),
        /*
          The route we would actually take, not the whole challenge. A
          well-formed challenge asking for USDC on Base is a real finding and
          it is not one this deployment can settle; `unpayableReason` carries
          which, in words.
        */
        challenge: challenge
          ? {
              network: challenge.best?.networkRaw ?? challenge.routes[0]?.networkRaw ?? null,
              asset: challenge.best?.assetSymbol ?? challenge.routes[0]?.assetSymbol ?? null,
              amount:
                challenge.best?.amount != null
                  ? String(challenge.best.amount)
                  : challenge.routes[0]?.amount != null
                    ? String(challenge.routes[0]!.amount)
                    : null,
            }
          : null,
        mismatch: challenge && !challenge.payable ? challenge.unpayableReason : null,
        probedAt: probe.at,
      });

      done++;
      if (done % 25 === 0) say(`  ${done}/${targets.length}`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  writeAtomicJson(probedPath(chainId), {
    version: 1,
    chainId,
    observedAt: new Date().toISOString(),
    probed: out,
  } satisfies ProbeIndex);

  const count = (l: Liveness) => out.filter((p) => p.liveness === l).length;
  return {
    chainId,
    attempted: out.length,
    alive: count("alive"),
    degraded: count("degraded"),
    dead: count("dead"),
    never: count("never"),
    payable: out.filter((p) => p.payable).length,
    seconds: (Date.now() - started) / 1000,
  };
}
