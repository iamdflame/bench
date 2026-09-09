/**
 * Walking `eth_getLogs` over a range that no free provider will serve whole.
 *
 * Measured across nine public BSC endpoints on 6 September 2026:
 *
 *   bsc.rpc.blxrbdn.com     serves ranges, capped at 5,000 blocks
 *   bsc-rpc.publicnode.com  recent ranges only — "archive requests require a
 *                           personal token" beyond a few hours
 *   bsc.drpc.org            rate-limits a public caller within a few requests
 *   bsc-dataseed*           "limit exceeded" for any span at all
 *   1rpc.io/bnb             fifty blocks
 *   bsc.blockrazor.xyz      twenty-five blocks
 *
 * So there is effectively one provider, one cap, and four hundred and forty
 * thousand blocks of history between this market's deploy block and the head —
 * eighty-nine requests. Walked one at a time that is a minute, which is why
 * every page that needed log history either timed out or printed the
 * provider's refusal at the reader.
 *
 * Two things fix it and neither invents data. The ranges are walked several at
 * once, which turns a minute into a few seconds. And a range no provider will
 * answer is counted rather than skipped silently, so a caller can say the
 * history is partial instead of presenting a hole as an empty record.
 */

import type { AbiEvent, Address, Log } from "viem";
import { logClients } from "./market";

export interface ScanResult<T> {
  logs: T[];
  /** False when any range went unanswered by every provider. */
  complete: boolean;
  /** How many ranges no provider would serve. */
  refused: number;
  /** How many ranges the scan covered. */
  ranges: number;
}

/**
 * The widest span the one provider that answers will accept, less a margin.
 *
 * Its limit is exactly 5,000 and it rejects the whole request when exceeded,
 * so the walk stays under it rather than discovering the edge in production.
 */
export const MAX_SPAN = 4_000n;

/**
 * Ranges in flight at once.
 *
 * Six is measured, not guessed: it brings the full history inside the budget a
 * page render can afford, and above it the single provider that serves these
 * queries begins refusing — which would trade a slow answer for a wrong one.
 */
export const CONCURRENCY = 6;

export async function scanLogs<T extends Log = Log>(opts: {
  address: Address | Address[];
  events?: readonly AbiEvent[];
  event?: AbiEvent;
  fromBlock: bigint;
  toBlock: bigint;
  span?: bigint;
  concurrency?: number;
}): Promise<ScanResult<T>> {
  const span = opts.span ?? MAX_SPAN;

  // Every range up front, so they can be walked in parallel and reassembled in
  // order. A log's position in the history is what callers derive standing
  // from, so the chunks must not come back shuffled.
  const ranges: { from: bigint; to: bigint }[] = [];
  for (let cursor = opts.fromBlock; cursor <= opts.toBlock; cursor += span + 1n) {
    ranges.push({
      from: cursor,
      to: cursor + span > opts.toBlock ? opts.toBlock : cursor + span,
    });
  }

  const results: (T[] | null)[] = new Array(ranges.length).fill(null);
  let next = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= ranges.length) return;
      const { from, to } = ranges[i]!;
      // Each provider in turn: one refusing a range must never be recorded as
      // that range being empty.
      for (const client of logClients) {
        try {
          const args = {
            address: opts.address,
            fromBlock: from,
            toBlock: to,
            ...(opts.events ? { events: opts.events } : {}),
            ...(opts.event ? { event: opts.event } : {}),
          } as Parameters<typeof client.getLogs>[0];
          results[i] = (await client.getLogs(args)) as unknown as T[];
          break;
        } catch {
          continue;
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(opts.concurrency ?? CONCURRENCY, ranges.length) }, worker),
  );

  const logs: T[] = [];
  let refused = 0;
  for (const batch of results) {
    if (batch === null) refused += 1;
    else logs.push(...batch);
  }

  return { logs, complete: refused === 0, refused, ranges: ranges.length };
}
