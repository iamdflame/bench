/**
 * One BSC transport for every read and write in this codebase.
 *
 * Every judge-facing chain read used to go through a single provider: the
 * market client, the book, the diagnose multicalls and the ledger page each
 * built their own `http(MARKET_RPC_URL)` and died with it. A public BSC node
 * rate-limiting at 2am would have blanked `/diagnose` for anyone who tried it.
 *
 * This module builds one rotating transport over several providers. A
 * provider that fails to answer is skipped for a minute, so a dead endpoint
 * costs one failed call and then nothing. `health()` times every provider
 * against the plan's 800 ms bar and `/status` prints the result.
 *
 * The list is ordered: operator-configured endpoints first, then the public
 * ones that were measured to answer. Set `MARKET_RPC_URL` and `BSC_RPC_URL` to
 * two different providers and there are two paid-tier endpoints ahead of the
 * public fallbacks.
 */

import { createPublicClient, custom, http, type PublicClient, type Transport } from "viem";
import { bsc, bscTestnet, foundry } from "viem/chains";

const CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_MARKET_CHAIN_ID ?? process.env.MARKET_CHAIN_ID ?? process.env.CHAIN_ID ?? 56,
);

export const chain = CHAIN_ID === 56 ? bsc : CHAIN_ID === 97 ? bscTestnet : foundry;

const PUBLIC_MAINNET = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc.drpc.org",
  "https://bsc-dataseed1.bnbchain.org",
  "https://bsc-dataseed2.bnbchain.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed.bnbchain.org",
];

const PUBLIC_TESTNET = [
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
];

/** Every endpoint this deployment may read from, deduplicated, in priority order. */
export function rpcUrls(): string[] {
  const configured = [
    process.env.NEXT_PUBLIC_MARKET_RPC_URL,
    process.env.MARKET_RPC_URL,
    process.env.BSC_RPC_URL,
  ].filter((u): u is string => typeof u === "string" && u.length > 0 && !u.startsWith("ws"));
  const pub = CHAIN_ID === 56 ? PUBLIC_MAINNET : CHAIN_ID === 97 ? PUBLIC_TESTNET : ["http://127.0.0.1:8545"];
  return [...new Set([...configured, ...pub])];
}

export interface TransportOptions {
  timeout?: number;
  batch?: boolean;
  retryCount?: number;
}

/**
 * A rotating transport with a penalty box.
 *
 * viem's own `fallback({ rank })` re-measures providers on a timer, and that
 * timer keeps a one-shot script alive forever; without `rank` it forgets a
 * failure the moment the call returns, so a hanging provider costs its full
 * timeout on every request. This does neither: each request goes to the first
 * provider not in the box, a failure to answer puts that provider in the box
 * for `PENALTY_MS`, and the next request skips it. No timers, nothing to
 * clean up, and a provider that hangs is paid for once a minute at most.
 *
 * A revert or a bad parameter is the caller's business and is returned as is.
 * A provider that failed to answer, or answered that it does not serve this
 * kind of request, is passed over for the next one (see `classify`).
 */
const PENALTY_MS = 60_000;
const boxed = new Map<string, number>();

function inBox(url: string): boolean {
  const until = boxed.get(url);
  if (!until) return false;
  if (Date.now() >= until) {
    boxed.delete(url);
    return false;
  }
  return true;
}

/**
 * What a failed call says about the provider, as opposed to about the call.
 *
 *   "transport"  the provider did not answer properly: timeout, refused
 *                connection, rate limit, 5xx. Skip it and box it for a minute.
 *   "capability" the provider answered and declined this kind of request:
 *                publicnode's "Archive requests require a personal token", a
 *                method it does not serve, state it has pruned. Skip it for
 *                this call only; it still serves ordinary reads.
 *   "caller"     a revert or a bad parameter. Every provider would say the
 *                same, so it is returned as is.
 */
function classify(e: unknown): "transport" | "capability" | "caller" {
  const err = e as { name?: string; code?: number; message?: string; details?: string };
  if (err?.name === "TimeoutError" || err?.name === "HttpRequestError") return "transport";
  const msg = `${err?.message ?? ""} ${err?.details ?? ""}`.toLowerCase();
  if (
    msg.includes("archive") ||
    msg.includes("personal token") ||
    msg.includes("missing trie node") ||
    msg.includes("header not found") ||
    msg.includes("pruned") ||
    msg.includes("method not found") ||
    msg.includes("not supported") ||
    msg.includes("does not exist/is not available")
  ) {
    return "capability";
  }
  if (
    msg.includes("fetch failed") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("limit exceeded") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("econnre") ||
    msg.includes("enotfound") ||
    msg.includes("socket")
  ) {
    return "transport";
  }
  return "caller";
}

export function bscTransport(opts: TransportOptions = {}): Transport {
  const timeout = opts.timeout ?? 15_000;
  const urls = rpcUrls();
  const inner = urls.map((url) =>
    http(url, {
      timeout,
      retryCount: opts.retryCount ?? 0,
      batch: opts.batch === false ? false : { wait: 12 },
    }),
  );
  return custom(
    {
      async request(args: { method: string; params?: unknown }) {
        let lastError: unknown;
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < urls.length; i++) {
            if (pass === 0 && inBox(urls[i])) continue;
            const t = inner[i]({ chain });
            try {
              return await t.request(args as never);
            } catch (e) {
              lastError = e;
              const kind = classify(e);
              if (kind === "caller") throw e;
              if (kind === "transport") boxed.set(urls[i], Date.now() + PENALTY_MS);
            }
          }
          // Every provider is boxed: second pass ignores the box.
        }
        throw lastError;
      },
    },
    { name: "rotating-bsc", key: "rotating-bsc", retryCount: 0 },
  );
}

/** Providers currently in the penalty box, for `/status`. */
export function boxedProviders(): { url: string; untilMs: number }[] {
  return [...boxed.entries()].filter(([u]) => inBox(u)).map(([url, untilMs]) => ({ url, untilMs }));
}

let shared: PublicClient | undefined;

/** The one public client the app should read through. */
export function bscClient(): PublicClient {
  if (!shared) {
    shared = createPublicClient({ chain, transport: bscTransport() });
  }
  return shared;
}

export interface ProviderHealth {
  url: string;
  ok: boolean;
  ms: number;
  block?: number;
  error?: string;
}

/**
 * Times `eth_blockNumber` on every provider, in parallel, with the plan's
 * 800 ms bar. This is the "kill RPC #1" drill made visible: `/status` prints
 * it so a reader can see which providers are carrying the site right now.
 */
export async function health(timeoutMs = 800): Promise<ProviderHealth[]> {
  return Promise.all(
    rpcUrls().map(async (url) => {
      const started = Date.now();
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
          signal: controller.signal,
        });
        clearTimeout(t);
        const body = (await res.json()) as { result?: string; error?: { message?: string } };
        if (!body.result) return { url, ok: false, ms: Date.now() - started, error: body.error?.message ?? `HTTP ${res.status}` };
        return { url, ok: true, ms: Date.now() - started, block: Number(body.result) };
      } catch (e) {
        return { url, ok: false, ms: Date.now() - started, error: (e as Error).name === "AbortError" ? `no answer in ${timeoutMs} ms` : (e as Error).message };
      }
    }),
  );
}
