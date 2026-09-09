/**
 * BSC ground truth.
 *
 * Everything in ASSAY that is a claim comes from 8004scan. Everything that is
 * a fact comes from here.
 *
 * The load-bearing optimisation: a wallet with nonce 0 has never sent a
 * transaction, so it cannot have interacted with any protocol, ever. That
 * settles both the Activity and Capability assays in two cheap calls and
 * skips log scanning entirely. Measured against the registry, this short
 * circuit applies to essentially every agent on BSC.
 */

import {
  createPublicClient,
  fallback,
  http,
  getAddress,
  pad,
  type Address,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { CHAIN_ID, IS_TESTNET, RPC_FALLBACKS, RPC_URL } from "@/lib/config";

export const publicClient = createPublicClient({
  chain: IS_TESTNET ? bscTestnet : bsc,
  transport: fallback(
    [RPC_URL, ...RPC_FALLBACKS].map((url) =>
      http(url, { timeout: 30_000, retryCount: 2, batch: { wait: 16 } }),
    ),
    { rank: false },
  ),
});

export const isAddress = (v: string | null | undefined): v is string =>
  typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);

export const normalise = (v: string) => v.toLowerCase() as Address;

export interface WalletFacts {
  address: string;
  /** Number of transactions this wallet has ever *sent*. 0 means it has never acted. */
  nonce: number;
  /** Native BNB balance in wei. */
  balanceWei: bigint;
  /** True when the wallet has code — an agent whose "wallet" is a contract. */
  isContract: boolean;
  /** Cheap composite: a wallet that has never sent a tx and holds nothing. */
  isDormant: boolean;
}

/** Three calls, batched by the transport into one round trip where supported. */
export async function getWalletFacts(address: string): Promise<WalletFacts> {
  const addr = getAddress(address) as Address;
  const [nonce, balanceWei, code] = await Promise.all([
    publicClient.getTransactionCount({ address: addr }),
    publicClient.getBalance({ address: addr }),
    publicClient.getCode({ address: addr }),
  ]);
  const isContract = Boolean(code && code !== "0x");
  return {
    address: address.toLowerCase(),
    nonce,
    balanceWei,
    isContract,
    isDormant: nonce === 0 && balanceWei === 0n,
  };
}

/** The subset of an eth_getLogs entry this scan consumes. */
interface RawLog {
  address: string;
  transactionHash?: string;
  blockNumber?: string;
  logIndex?: string;
}

export interface ProtocolTouch {
  protocol: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
}

/**
 * Looks for evidence that `wallet` has interacted with any of `protocols`
 * within a recent window.
 *
 * Agent wallets appear in protocol logs as an indexed topic (recipient, owner,
 * sender), so we scan the protocol contracts for logs carrying the wallet's
 * padded address in topics 1-3 rather than scanning the wallet itself.
 *
 * On window size: no free BSC provider serves deep history. Measured, the
 * public nodes cap `eth_getLogs` at 50 blocks (1rpc), ~2,000 (publicnode),
 * and 10,000 (drpc); anything wider is refused as an archive request. So the
 * assay asks a question the free tier can actually answer, and one that is
 * arguably sharper: not "has this agent ever acted", but "has it acted
 * recently". Every one of these agents claims to run continuously. A
 * rebalancer that has not touched a position manager in the last ten thousand
 * blocks is not rebalancing anything.
 *
 * Setting ARCHIVE_RPC_URL to a provider with history widens the window to a
 * lifetime lookback automatically.
 */
export const ARCHIVE_RPC = process.env.ARCHIVE_RPC_URL ?? "";
export const hasArchive = Boolean(ARCHIVE_RPC);

/**
 * Log-scanning clients, tried in order.
 *
 * There used to be one, pointed at drpc, and drpc rate-limits a public caller
 * within a handful of requests. Every capability scan then came back
 * "incomplete", which is honest but useless: the assay could never conclude
 * anything, and `granted ⊆ proven` refused every grant on the strength of an
 * infrastructure failure rather than a fact about the agent.
 *
 * Measured across public BSC endpoints: blxrbdn serves eth_getLogs over a
 * range, publicnode serves recent ranges only, and most refuse outright.
 */
const LOG_ENDPOINTS = [
  ARCHIVE_RPC,
  "https://bsc.rpc.blxrbdn.com",
  "https://bsc-rpc.publicnode.com",
  "https://bsc.drpc.org",
].filter(Boolean) as string[];

const logClients = LOG_ENDPOINTS.map((url) =>
  createPublicClient({
    chain: IS_TESTNET ? bscTestnet : bsc,
    transport: http(url, { timeout: 30_000, retryCount: 0 }),
  }),
);

/**
 * Trailing nulls in a topic filter are not neutral.
 *
 * Measured against a swap known to be in range: `[sig, null, wallet, null]`
 * returns nothing, `[sig, null, wallet]` returns the log. Providers read the
 * array's length as "the event has at least this many topics", so a padded
 * filter quietly excludes every event with fewer.
 *
 * This scanner built a four-element array and filled one slot, so every
 * capability query it has ever made carried trailing nulls — and silently
 * under-reported. Nothing errored; the answers were just smaller than the
 * truth, which is the worst way for a check like this to be wrong.
 */
/** How many refused windows before the scan is declared incomplete. */
const MAX_FAILED_WINDOWS = 6;

const trimTopics = (topics: (string | null)[]): (string | null)[] => {
  let end = topics.length;
  while (end > 0 && topics[end - 1] === null) end--;
  return topics.slice(0, end);
};

export async function findProtocolTouches(
  wallet: string,
  protocols: readonly string[],
  opts: {
    lookbackBlocks?: bigint;
    chunk?: bigint;
    maxHits?: number;
    /**
     * Probes for protocols that emit nothing themselves. A router is a
     * pass-through: the event comes from the pool. Without these, trading
     * through one is invisible however much of it you do.
     */
    eventProbes?: readonly {
      topic0: string;
      position: 1 | 2 | 3;
      protocol: string;
      label: string;
    }[];
  } = {},
): Promise<{ touches: ProtocolTouch[]; scannedBlocks: bigint; complete: boolean }> {
  // Measured, not assumed: blxrbdn serves 4,000-block address-filtered
  // queries reliably and refuses 9,500. The old default asked for 9,500,
  // succeeded on the first window and was refused on the second.
  const lookback = opts.lookbackBlocks ?? (hasArchive ? 2_000_000n : 120_000n);
  const chunk = opts.chunk ?? 4_000n;
  /** Measured: blxrbdn allows 5,000 blocks for a query with no address filter. */
  const probeChunk = chunk > 4_999n ? 4_999n : chunk;
  const maxHits = opts.maxHits ?? 12;

  const head = await publicClient.getBlockNumber();
  const floor = head > lookback ? head - lookback : 0n;
  const padded = pad(normalise(wallet), { size: 32 });
  const addresses = protocols.map((p) => normalise(p));

  const touches: ProtocolTouch[] = [];
  let to = head;
  let scanned = 0n;
  let failures = 0;

  while (to > floor && touches.length < maxHits) {
    const from = to - chunk > floor ? to - chunk : floor;
    // The wallet may occupy any indexed position, so probe each separately.
    // The wallet may occupy any indexed position, so all three are probed.
    // Sequentially this was three round trips per window and thirty windows
    // took forty-five seconds, which is too slow to run while someone watches
    // an agent page assay itself. They are independent queries, so they go
    // together.
    const positionResults = await Promise.all(
      ([1, 2, 3] as const).map(async (position) => {
        const topics: (string | null)[] = [null, null, null, null];
        topics[position] = padded;
        const trimmed = trimTopics(topics);
        // viem's typed getLogs models topics as an event-derived tuple, which
        // cannot express "any signature, this address in position N". The raw
        // RPC call can, so it is used directly.
        const request = {
          method: "eth_getLogs",
          params: [
            {
              address: addresses,
              fromBlock: `0x${from.toString(16)}`,
              toBlock: `0x${to.toString(16)}`,
              topics: trimmed,
            },
          ],
        };
        for (const client of logClients) {
          try {
            return (await client.request(request as never)) as unknown as RawLog[];
          } catch {
            continue;
          }
        }
        return null;
      }),
    );

    for (const logs of positionResults) {
      if (logs === null) {
        // Every provider refused this window. That is "unknown", never "no
        // evidence" — the distinction the whole assay rests on.
        //
        // It used to end the scan outright, which was right when there was one
        // provider and every wide range failed. With failover, one refused
        // window is usually a rate limit, and abandoning the scan turned a
        // momentary 429 into "this agent has no capability" — which, now that
        // `granted ⊆ proven` reads this, is a silent denial of authority.
        failures += 1;
        if (failures > MAX_FAILED_WINDOWS) {
          return { touches: dedupe(touches), scannedBlocks: scanned, complete: false };
        }
        continue;
      }
      for (const log of logs) {
        touches.push({
          protocol: String(log.address).toLowerCase(),
          txHash: log.transactionHash ?? "",
          blockNumber: Number(BigInt(log.blockNumber ?? "0x0")),
          logIndex: Number(BigInt(log.logIndex ?? "0x0")),
        });
      }
    }

    // Second pass: protocols that emit nothing of their own. Any emitter, but
    // a specific event signature with the wallet in a known indexed slot.
    const probeFrom = to - probeChunk > floor ? to - probeChunk : floor;
    const probeResults = await Promise.all(
      (opts.eventProbes ?? []).map(async (probe) => {
        const probeTopics: (string | null)[] = [probe.topic0, null, null, null];
        probeTopics[probe.position] = padded;
        const trimmedProbe = trimTopics(probeTopics);
        for (const client of logClients) {
          try {
            const r = (await client.request({
              method: "eth_getLogs",
              params: [
                {
                  fromBlock: `0x${probeFrom.toString(16)}`,
                  toBlock: `0x${to.toString(16)}`,
                  topics: trimmedProbe,
                },
              ],
            } as never)) as unknown as RawLog[];
            return { probe, logs: r };
          } catch {
            continue;
          }
        }
        return { probe, logs: null };
      }),
    );

    for (const { probe, logs: probeLogs } of probeResults) {
      if (probeLogs === null) {
        failures += 1;
        if (failures > MAX_FAILED_WINDOWS) {
          return { touches: dedupe(touches), scannedBlocks: scanned, complete: false };
        }
        continue;
      }
      for (const log of probeLogs) {
        // Attributed to the protocol the probe stands for, not to the pool
        // that happened to emit it.
        touches.push({
          protocol: probe.protocol.toLowerCase(),
          txHash: log.transactionHash ?? "",
          blockNumber: Number(BigInt(log.blockNumber ?? "0x0")),
          logIndex: Number(BigInt(log.logIndex ?? "0x0")),
        });
      }
    }

    scanned += to - from;
    to = from;
  }

  return {
    touches: dedupe(touches),
    scannedBlocks: scanned,
    complete: to <= floor && failures === 0,
  };
}

const dedupe = (touches: ProtocolTouch[]) => {
  const seen = new Set<string>();
  return touches.filter((t) => {
    const key = `${t.txHash}:${t.logIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Funding-graph edge: who paid for this wallet's first breath.
 *
 * Sybil rings are usually funded from one purse. Establishing that two
 * reviewer wallets share a funder is far stronger evidence of coordination
 * than behavioural similarity alone. Public RPC cannot list inbound transfers
 * cheaply, so this is best-effort and its absence is never treated as
 * exculpatory.
 */
export async function getFirstFunder(address: string): Promise<string | null> {
  const facts = await getWalletFacts(address);
  if (facts.nonce === 0 && facts.balanceWei === 0n) return null;
  // Requires an indexed source (BscScan API) to do properly. The Sybil engine
  // treats a null here as "unknown", not "clean".
  return null;
}

export const bnb = (wei: bigint, dp = 4) => {
  const s = (Number(wei) / 1e18).toFixed(dp);
  return s.replace(/\.?0+$/, "") || "0";
};

export const CHAIN = CHAIN_ID;
