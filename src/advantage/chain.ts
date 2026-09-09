/**
 * The RPC layer the Advantage Report measures through.
 *
 * The report needs two things free BSC endpoints mostly refuse: state at a
 * past block, and logs over a range. Probed across thirteen public endpoints,
 * almost none serve either — most answer `missing trie node`, `limit
 * exceeded`, or ask for a paid plan. Three do, and they are different three:
 *
 *   archive state   bsc.drpc.org · bsc-mainnet.public.blastapi.io
 *   eth_getLogs     bsc.rpc.blxrbdn.com
 *
 * So the two capabilities get separate provider lists, each tried in order
 * with backoff. A provider that rate-limits is retried on the next one rather
 * than being allowed to look like an empty answer — a silent zero is the worst
 * possible failure in a document whose whole claim is that its numbers are
 * measured.
 */

import { decodeAbiParameters, type AbiParameter } from "viem";

export const ARCHIVE_RPCS = [
  process.env.ARCHIVE_RPC_URL,
  "https://bsc.drpc.org",
  "https://bsc-mainnet.public.blastapi.io",
].filter(Boolean) as string[];

export const LOG_RPCS = [
  process.env.LOG_RPC_URL,
  "https://bsc.rpc.blxrbdn.com",
  "https://bsc-rpc.publicnode.com",
].filter(Boolean) as string[];

export const HEAD_RPCS = ["https://bsc-dataseed1.binance.org", "https://bsc.blockrazor.xyz"];

/** Providers cap log ranges; measured to accept 4,000. */
export const LOG_SPAN = 4_000n;

export const hex = (n: bigint | number) => `0x${BigInt(n).toString(16)}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Stats {
  calls: number;
  retries: number;
  failures: number;
  ms: number;
}

export const stats: Stats = { calls: 0, retries: 0, failures: 0, ms: 0 };

/**
 * One JSON-RPC call, across a pool of providers.
 *
 * Rotates on failure and backs off on rate limits. Throws only once every
 * provider has refused, so a caller never mistakes exhaustion for an answer.
 */
export async function rpc(
  pool: string[],
  method: string,
  params: unknown[],
  attempts = 4,
): Promise<unknown> {
  const started = Date.now();
  let last: Error | null = null;
  for (let round = 0; round < attempts; round++) {
    for (const url of pool) {
      try {
        stats.calls++;
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(25_000),
        });
        const text = await res.text();
        let body: { result?: unknown; error?: { message?: string } };
        try {
          body = JSON.parse(text);
        } catch {
          throw new Error(`${res.status} ${text.slice(0, 60)}`);
        }
        if (body.error) throw new Error(body.error.message ?? "rpc error");
        stats.ms += Date.now() - started;
        return body.result;
      } catch (e) {
        last = e instanceof Error ? e : new Error(String(e));
        stats.retries++;
      }
    }
    // Rate limits clear with time; exhausting the pool faster does not help.
    await sleep(700 * 2 ** round);
  }
  stats.failures++;
  stats.ms += Date.now() - started;
  throw new Error(`all providers refused ${method}: ${last?.message ?? "unknown"}`);
}

/** A contract read at a specific block, from a provider that serves archive state. */
export async function callAt<T extends readonly unknown[]>(
  to: string,
  data: string,
  block: bigint | "latest",
  outputs: readonly AbiParameter[],
): Promise<T> {
  const raw = (await rpc(ARCHIVE_RPCS, "eth_call", [
    { to, data },
    block === "latest" ? "latest" : hex(block),
  ])) as `0x${string}`;
  if (!raw || raw === "0x") throw new Error(`empty return from ${to}`);
  return decodeAbiParameters(outputs, raw) as unknown as T;
}

export interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

/**
 * Logs across a block range, walked in provider-sized windows.
 *
 * `onWindow` reports progress because this is the slow part and a report that
 * appears to hang is a report nobody finishes running.
 */
export async function getLogs(opts: {
  address?: string;
  topics?: (string | string[] | null)[];
  fromBlock: bigint;
  toBlock: bigint;
  onWindow?: (done: number, total: number, found: number) => void;
}): Promise<RawLog[]> {
  const out: RawLog[] = [];
  const total = Number((opts.toBlock - opts.fromBlock) / LOG_SPAN) + 1;
  let done = 0;
  for (let cursor = opts.fromBlock; cursor <= opts.toBlock; cursor += LOG_SPAN) {
    const end = cursor + LOG_SPAN - 1n > opts.toBlock ? opts.toBlock : cursor + LOG_SPAN - 1n;
    const filter: Record<string, unknown> = { fromBlock: hex(cursor), toBlock: hex(end) };
    if (opts.address) filter.address = opts.address;
    if (opts.topics) filter.topics = opts.topics;
    const logs = (await rpc(LOG_RPCS, "eth_getLogs", [filter])) as RawLog[];
    out.push(...logs);
    done++;
    opts.onWindow?.(done, total, out.length);
  }
  return out;
}

export async function blockTimestamp(block: bigint): Promise<number> {
  const b = (await rpc([...HEAD_RPCS, ...ARCHIVE_RPCS], "eth_getBlockByNumber", [
    hex(block),
    false,
  ])) as { timestamp: string };
  return Number(b.timestamp);
}

export async function headBlock(): Promise<bigint> {
  return BigInt((await rpc(HEAD_RPCS, "eth_blockNumber", [])) as string);
}

/** One storage slot at a block. Used where a proxy exposes no getter. */
export async function storageAt(address: string, slot: number, block: bigint): Promise<bigint> {
  const raw = (await rpc(ARCHIVE_RPCS, "eth_getStorageAt", [
    address,
    hex(slot),
    hex(block),
  ])) as string;
  return BigInt(raw);
}
