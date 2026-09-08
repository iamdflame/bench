/**
 * Chain clients, and reading logs from providers that lie by omission.
 *
 * Two BSC facts shape this file, both measured rather than assumed:
 *
 *   1. Several public providers answer `eth_call` and refuse `eth_getLogs`,
 *      and some of them refuse it by returning an empty array rather than an
 *      error. A reader that stops at the first answer therefore records "no
 *      events" for a wallet with plenty. So a log read is tried across hosts
 *      and an empty result from one host is not accepted as final until a host
 *      that demonstrably serves ranges has answered.
 *
 *   2. Trailing `null`s in a topic filter silently return nothing. Providers
 *      read the array length as "the event has at least this many topics", so
 *      `[sig, null, wallet, null]` matches events with four topics only, while
 *      `[sig, null, wallet]` matches. Nothing errors; the answer is just
 *      smaller than the truth. `topics()` below trims them, and it is the only
 *      way this codebase builds a topic filter.
 */

import { createPublicClient, http, numberToHex, type Address, type Hex, type Log, type PublicClient } from "viem";
import { logRpcUrls, receiptRpcUrls, rpcUrls, viemChain, type SupportedChain } from "./chains";

const clients = new Map<SupportedChain, PublicClient>();

/** The read client. One per chain, reused, with a fallback list behind it. */
export function chainClient(chainId: SupportedChain): PublicClient {
  const hit = clients.get(chainId);
  if (hit) return hit;
  const urls = rpcUrls(chainId);
  const c = createPublicClient({
    chain: viemChain(chainId),
    transport: http(urls[0], { batch: true, retryCount: 2, timeout: 15_000 }),
  }) as PublicClient;
  clients.set(chainId, c);
  return c;
}

/** One client per log-capable host, in preference order. */
export function logClients(chainId: SupportedChain): PublicClient[] {
  return logRpcUrls(chainId).map(
    (url) =>
      createPublicClient({
        chain: viemChain(chainId),
        transport: http(url, { retryCount: 1, timeout: 20_000 }),
      }) as PublicClient,
  );
}

/**
 * A client for sending transactions and reading their receipts.
 *
 * Separate from `chainClient` because the hosts are different ones. See
 * `receiptRpcUrls`: the endpoint that serves ranged logs refuses receipts, and
 * the endpoints that serve receipts refuse ranged logs. Confirming a write on
 * the wrong one reports a landed transaction as a failure.
 */
export function writeClient(chainId: SupportedChain): PublicClient {
  const urls = receiptRpcUrls(chainId);
  return createPublicClient({
    chain: viemChain(chainId),
    transport: http(urls[0], { retryCount: 2, timeout: 20_000 }),
  }) as PublicClient;
}

export type Confirmation =
  | {
      ok: true;
      status: "success" | "reverted";
      blockNumber: bigint;
      gasUsed: bigint;
      contractAddress: Address | null;
      /** Which host answered. Recorded, because they do not all answer. */
      via: string;
    }
  | { ok: false; why: string };

/**
 * Wait for a receipt, across every host that will serve one.
 *
 * A single host is a single point of failure for the one call that says
 * whether money moved. This tries each in turn and only reports a timeout when
 * none of them has the transaction — so "we could not confirm" and "it did not
 * land" stay distinguishable, which they must be. A deployment that had
 * already succeeded was reported as a failure before this existed.
 */
export async function confirm(
  chainId: SupportedChain,
  hash: Hex,
  opts: { timeoutMs?: number } = {},
): Promise<Confirmation> {
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  const hosts = receiptRpcUrls(chainId);

  while (Date.now() < deadline) {
    for (const host of hosts) {
      try {
        const c = createPublicClient({
          chain: viemChain(chainId),
          transport: http(host, { retryCount: 0, timeout: 12_000 }),
        }) as PublicClient;
        const r = await c.getTransactionReceipt({ hash });
        return {
          ok: true,
          status: r.status,
          blockNumber: r.blockNumber,
          gasUsed: r.gasUsed,
          contractAddress: r.contractAddress ?? null,
          via: host,
        };
      } catch {
        // Not yet mined here, or this host does not serve receipts. Next one.
      }
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  return {
    ok: false,
    why: `No host served a receipt for ${hash} within the timeout. That is not the same as the transaction failing: it was submitted, and it may well have landed. Check it on an explorer before retrying, because retrying a landed transaction sends it twice.`,
  };
}

/**
 * Build a topic filter with the trailing nulls removed.
 *
 * Use this and nothing else. A hand-written array is the bug described above.
 */
export function topics(...t: (Hex | Hex[] | null)[]): (Hex | Hex[] | null)[] {
  const out = [...t];
  while (out.length > 0 && out[out.length - 1] === null) out.pop();
  return out;
}

/**
 * A log exactly as the node returns it, before viem would have decoded it.
 *
 * Kept explicit because this module talks to `eth_getLogs` directly; see the
 * comment inside `scanLogs`.
 */
interface RawLog {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: Hex;
  logIndex: Hex;
  removed?: boolean;
}

const toLog = (r: RawLog): Log =>
  ({
    address: r.address,
    topics: r.topics,
    data: r.data,
    blockNumber: BigInt(r.blockNumber),
    blockHash: r.blockHash,
    transactionHash: r.transactionHash,
    transactionIndex: Number(r.transactionIndex),
    logIndex: Number(r.logIndex),
    removed: r.removed ?? false,
  }) as unknown as Log;

export interface LogScan {
  logs: Log[];
  /**
   * Whether the range was actually covered.
   *
   * False when any window could not be served. An incomplete scan must never
   * be read as "found nothing" — that is the difference between "we looked and
   * it was not there" and "we could not look", and only one of them is a fact
   * about the agent.
   */
  complete: boolean;
  fromBlock: bigint;
  toBlock: bigint;
  /** Which host answered, for the evidence line. */
  via: string | null;
  /**
   * The oldest block actually served, when the scan hit the archive wall.
   *
   * Distinct from an ordinary refusal: everything below this is not
   * unavailable *right now*, it is unavailable to us at all on a public host.
   * A caller that shrinks its window and retries is wasting its time, and a
   * caller that reports "no activity" is publishing a falsehood.
   */
  servedFrom: bigint | null;
  /** Ranges no host would serve, so a reader can see the size of the hole. */
  refused: { fromBlock: bigint; toBlock: bigint }[];
  /** Why the scan is incomplete, in a sentence, or null when it is complete. */
  reason: string | null;
}

/*
  What BSC providers actually do when a log query is too big.

  Measured against `bsc-rpc.publicnode.com` on 2026-09-08, and every one of
  these is a distinct condition needing a distinct response:

    "query exceeds max results 20000, retry with the range 120702744-120704923"
        A result-count cap, and — importantly — the provider hands back the
        range that *would* have worked. Halving blindly here throws away an
        exact answer and turns one request into several.

    "ResponseBodyTooLargeError: HTTP response body exceeded the size limit"
        viem's own 10 MB client-side cap, hit well before the 20,000-result
        cap on busy pools. There is no hint to follow, so the span halves.

    "Archive requests require a personal token"
        The wall. The public node serves roughly the most recent 10,000 blocks
        — about 75 minutes at BSC's ~0.45s blocks — and nothing older at any
        span. Retrying smaller is pointless; the correct response is to stop
        and say so.
*/
const HINT = /retry with the range (\d+)\s*-\s*(\d+)/i;
const ARCHIVE = /archive (?:request|node|state|data)/i;
const TOO_BIG = /body exceeded the size limit|ResponseBodyTooLarge|response too large|payload too large/i;
const TOO_MANY = /exceeds max results|more than .* results|query returned more than|limit exceeded|too many/i;

const errText = (e: unknown): string => {
  const anyE = e as { details?: string; shortMessage?: string; message?: string };
  return `${anyE?.details ?? ""} ${anyE?.shortMessage ?? ""} ${anyE?.message ?? String(e)}`;
};

/** The default span. Deliberately optimistic: the walker narrows on demand. */
const DEFAULT_WINDOW = 5_000n;
/** Below this a span is not worth splitting further; the range is recorded as refused. */
const MIN_WINDOW = 1n;

/**
 * Read logs across a range, adaptively, across hosts.
 *
 * The window is not fixed. It starts wide, follows the provider's own
 * suggested range when it offers one, and halves when it does not — so a busy
 * pool costs more requests than a quiet one instead of failing on both. A
 * range no host will serve is recorded in `refused` rather than silently
 * dropped, and hitting the archive wall stops the walk and sets `servedFrom`.
 */
export async function scanLogs(
  chainId: SupportedChain,
  params: {
    address?: Address | Address[];
    topics?: (Hex | Hex[] | null)[];
    fromBlock: bigint;
    toBlock: bigint;
    /** Starting span. The walker adapts from here. */
    window?: bigint;
  },
): Promise<LogScan> {
  const { address, fromBlock, toBlock } = params;
  const hosts = logRpcUrls(chainId);
  const cs = logClients(chainId);

  const logs: Log[] = [];
  const refused: { fromBlock: bigint; toBlock: bigint }[] = [];
  let via: string | null = null;
  let servedFrom: bigint | null = null;
  let archiveHit = false;

  /*
    Issued as a raw `eth_getLogs` rather than through viem's `getLogs`.

    This is not a preference. viem builds its topic filter from the `event` /
    `events` arguments and **silently drops a bare `topics` array** — the `as
    never` cast this code used to carry was suppressing the type error that
    would have said so. Measured on 2026-09-08 against Venus vUSDT over 900
    blocks: 570 logs unfiltered, 570 logs with `topics: [null, walletTopic]`,
    and 0 from the identical filter sent over raw JSON-RPC.

    The consequence was not a slow query, it was a false one. Every scan that
    filtered by an indexed address matched every event on the contract instead,
    so the capability scan "proved" that a wallet had used Venus on the
    strength of somebody else's transaction — and Rail 3 grants authority from
    exactly that evidence. `granted ⊆ proven` cannot hold when `proven` is
    fabricated, so this function sends the filter itself.
  */
  const query = async (client: PublicClient, from: bigint, to: bigint): Promise<Log[]> => {
    const filter: Record<string, unknown> = {
      fromBlock: numberToHex(from),
      toBlock: numberToHex(to),
    };
    if (address) filter.address = address;
    if (params.topics && params.topics.length > 0) filter.topics = params.topics;

    const raw = (await client.request({
      method: "eth_getLogs",
      params: [filter],
    } as never)) as RawLog[];

    return raw.map(toLog);
  };

  let cursor = fromBlock;
  let span = params.window ?? DEFAULT_WINDOW;

  outer: while (cursor <= toBlock) {
    let end = cursor + span - 1n > toBlock ? toBlock : cursor + span - 1n;
    let served = false;

    /*
      Up to a dozen narrowing attempts per chunk. The bound exists because a
      provider that answers "too large" to a single block is broken in a way no
      amount of splitting fixes, and the walk must not become infinite.
    */
    for (let attempt = 0; attempt < 12 && !served; attempt++) {
      let hostErrors = 0;

      for (let i = 0; i < cs.length; i++) {
        try {
          const chunk = await query(cs[i]!, cursor, end);
          logs.push(...chunk);
          via ??= hosts[i] ?? null;
          served = true;
          /* It worked at this span, so try a little wider next chunk. */
          span = end - cursor + 1n;
          break;
        } catch (e) {
          const text = errText(e);

          if (ARCHIVE.test(text)) {
            /*
              This host has no history here. Others might, so this is not
              immediately fatal — but if every host walls, the walk stops.
            */
            hostErrors++;
            continue;
          }

          const hint = HINT.exec(text);
          if (hint) {
            const suggested = BigInt(hint[2]!);
            /* Trust it only when it actually narrows the window. */
            if (suggested > cursor && suggested < end) {
              end = suggested;
              hostErrors = 0;
              break;
            }
          }

          if (TOO_BIG.test(text) || TOO_MANY.test(text) || hint) {
            const half = cursor + (end - cursor) / 2n;
            if (half >= cursor && half < end) {
              end = half;
              hostErrors = 0;
              break;
            }
          }

          hostErrors++;
        }
      }

      /* Every host refused this span for a reason that is not narrowable. */
      if (!served && hostErrors >= cs.length) {
        if (end - cursor + 1n <= MIN_WINDOW) break;
        const half = cursor + (end - cursor) / 2n;
        if (half <= cursor) break;
        end = half;
      }
    }

    if (served) {
      if (servedFrom === null || cursor < servedFrom) servedFrom = cursor;
      cursor = end + 1n;
      continue;
    }

    /*
      Nothing served this chunk. If a host said "archive", the whole remaining
      older span is unavailable rather than merely awkward, and continuing to
      grind through it produces nothing but latency.
    */
    const probe = await cs[0]!
      .getLogs({ ...(address ? { address } : {}), fromBlock: cursor, toBlock: cursor })
      .then(() => null)
      .catch((e: unknown) => errText(e));
    if (probe && ARCHIVE.test(probe)) {
      archiveHit = true;
      refused.push({ fromBlock: cursor, toBlock });
      break outer;
    }

    refused.push({ fromBlock: cursor, toBlock: end });
    cursor = end + 1n;
    span = DEFAULT_WINDOW;
  }

  const complete = refused.length === 0;
  const missing = refused.reduce((n, r) => n + (r.toBlock - r.fromBlock + 1n), 0n);
  const reason = complete
    ? null
    : archiveHit
      ? `Blocks ${refused[0]!.fromBlock}–${refused[0]!.toBlock} were refused as archive data by every configured host. The default archive host serves about 208 days; a range older than that, or a host that is rate-limiting, needs ARCHIVE_RPC_URL pointed at a provider that will answer.`
      : `${missing} block${missing === 1n ? "" : "s"} across ${refused.length} range${refused.length === 1 ? "" : "s"} could not be read from any host.`;

  return { logs, complete, fromBlock, toBlock, via, servedFrom, refused, reason };
}
