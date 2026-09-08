/**
 * Rail 3's gate: has the chain ever seen this wallet at this job's venue?
 *
 * A session key is standing authority over a live position. Granting one on
 * the strength of the word "rebalancing" appearing in a self-description is
 * the take-my-word-for-it this whole product exists to refuse, so the
 * allowlist is derived from evidence rather than checked against it
 * afterwards:
 *
 *     granted = the job's canonical calls ∩ the venues the chain shows it using
 *
 * Two bugs make this harder than it looks, and both were found by measuring
 * rather than by reading documentation. They are handled here because the next
 * person will hit them:
 *
 *   ROUTERS EMIT NOTHING. Measured over 3,000 blocks of live BSC, PancakeSwap's
 *   V3 SwapRouter and V2 Router emit zero events. They are pass-through
 *   contracts; the `Swap` comes from the pool. So a scan looking for logs
 *   emitted *by* the contract you called finds nothing however much an agent
 *   trades, and every grid agent is silently unprovable forever. The grid probe
 *   therefore looks for a pool's `Swap` naming the wallet as recipient.
 *
 *   TRAILING NULLS RETURN NOTHING. `[sig, null, wallet, null]` returns zero
 *   results where `[sig, null, wallet]` returns the log, because providers read
 *   the array length as "the event has at least this many topics". Nothing
 *   errors; the answers are just smaller than the truth, which is the worst way
 *   for a check like this to be wrong. `topics()` in @bench/shared trims them
 *   and is the only way this codebase builds a filter.
 *
 * And one rule that outranks both: an incomplete scan is refused, not narrowed.
 * A provider timing out must never become a silent denial dressed up as a
 * policy decision.
 */

import { pad, type Address, type Hex } from "viem";
import {
  BLOCK_SECONDS,
  PUBLIC_LOG_WINDOW,
  hasArchive,
  POOL_ADDRESSES,
  TOPIC,
  VENUES,
  VENUE_LABEL,
  chainClient,
  scanLogs,
  topics,
  type JobSlug,
  type SupportedChain,
} from "@bench/shared";

/**
 * How far back a capability scan looks.
 *
 * This used to be a flat 400,000 blocks, described as "long enough to be
 * evidence, short enough to serve". Only the first half was true. Public BNB
 * Chain hosts serve logs for roughly the last 10,000 blocks and answer
 * "Archive requests require a personal token" for everything older, so a
 * 400,000-block scan spent eighty requests being refused and then reported an
 * incomplete scan — which Rail 3 correctly treats as *unknown*, and therefore
 * refuses to grant on. The rail was not broken; it was being fed a window that
 * could never be filled.
 *
 * So the window is now what the configured hosts can actually serve. With an
 * archive host it is a real evidence window; without one it is 75 minutes, and
 * the scan says so rather than implying the wallet has done nothing.
 */
export const ARCHIVE_LOOKBACK = 400_000n;
export const lookbackFor = (): bigint => (hasArchive() ? ARCHIVE_LOOKBACK : PUBLIC_LOG_WINDOW);

/** @deprecated Reads the configured window; kept because callers import it by name. */
export const DEFAULT_LOOKBACK = lookbackFor();

/**
 * What counts as evidence for each job.
 *
 * `contracts` are scanned as log emitters — useful for venues that actually
 * emit. `eventProbes` are for the ones that do not: a signature, the indexed
 * position the wallet sits in, and the venue the hit is attributed to.
 */
interface JobEvidence {
  contracts: string[];
  eventProbes: {
    topic0: Hex;
    position: 1 | 2 | 3;
    venue: string;
    label: string;
    /**
     * Which contracts to look at.
     *
     * Not optional in practice. Free BSC providers refuse an `eth_getLogs`
     * with no `address` — measured on every host — so a topic-only probe
     * errors everywhere and reports nothing found. Combined with a scan that
     * cannot complete, that would deny every grid agent forever for a reason
     * having nothing to do with the agent.
     */
    at: string[];
  }[];
}

const EVIDENCE: Record<JobSlug, JobEvidence> = {
  rebalancing: {
    contracts: [VENUES.pancakeV3PositionManager, VENUES.pancakeMasterChefV3],
    eventProbes: [
      {
        topic0: TOPIC.transfer,
        position: 2,
        venue: VENUES.pancakeV3PositionManager,
        label: "a V3 position NFT transferred to the wallet",
        at: [VENUES.pancakeV3PositionManager],
      },
    ],
  },
  grid: {
    contracts: [],
    eventProbes: [
      {
        topic0: TOPIC.v3Swap,
        position: 2,
        venue: VENUES.pancakeV3Router,
        label: "a PancakeSwap V3 pool swap naming the wallet as recipient",
        at: POOL_ADDRESSES,
      },
    ],
  },
  yield: {
    contracts: [VENUES.pancakeMasterChefV3, VENUES.venusComptroller, VENUES.venusVBNB, VENUES.venusVUSDT, VENUES.aaveV3Pool],
    eventProbes: [],
  },
  health: {
    contracts: [VENUES.venusComptroller, VENUES.venusVBNB, VENUES.venusVUSDT, VENUES.aaveV3Pool],
    eventProbes: [],
  },
};

export interface CapabilityScan {
  wallet: Address;
  job: JobSlug;
  /** Venue addresses the chain showed it using. Lowercased. */
  proven: string[];
  /** Human labels for those venues, for the evidence drawer. */
  provenLabels: string[];
  /** One line per hit: what was found and where. */
  evidence: { label: string; txHash: string; block: string }[];
  /**
   * Did the scan actually cover its range?
   *
   * False means unknown, not empty. Nothing may grant on an incomplete scan.
   */
  complete: boolean;
  fromBlock: bigint;
  toBlock: bigint;
  /** "about 3.5 days", for the sentence under the result. */
  windowText: string;
  /** Has this wallet ever sent a transaction at all? Settles a lot for free. */
  nonce: number | null;
}

/**
 * Scan for evidence that a wallet has used a job's venues.
 *
 * Runs the nonce check first: a wallet with nonce zero has provably never
 * interacted with anything, which settles capability without a single log
 * query. That is not an optimisation, it is the cheapest true answer.
 */
export async function scanCapability(
  chainId: SupportedChain,
  wallet: Address,
  job: JobSlug,
  opts: { lookback?: bigint } = {},
): Promise<CapabilityScan> {
  const client = chainClient(chainId);
  const head = await client.getBlockNumber();
  const lookback = opts.lookback ?? lookbackFor();
  const fromBlock = head > lookback ? head - lookback : 0n;
  const seconds = Number(lookback) * BLOCK_SECONDS[chainId];
  const span =
    seconds < 7_200
      ? `about ${Math.round(seconds / 60)} minutes`
      : `about ${(seconds / 86_400).toFixed(1)} days`;
  const windowText = hasArchive()
    ? `${span} of BNB Smart Chain, blocks ${fromBlock} to ${head}`
    : `${span} of BNB Smart Chain, blocks ${fromBlock} to ${head} — the whole of what a public host will serve, since logs older than about 10,000 blocks need an archive token`;

  const base: CapabilityScan = {
    wallet,
    job,
    proven: [],
    provenLabels: [],
    evidence: [],
    complete: true,
    fromBlock,
    toBlock: head,
    windowText,
    nonce: null,
  };

  const nonce = await client.getTransactionCount({ address: wallet }).catch(() => null);
  base.nonce = nonce;
  if (nonce === 0) return base; // Never transacted. Nothing to find, and we know it.

  const spec = EVIDENCE[job];
  const walletTopic = pad(wallet.toLowerCase() as Hex, { size: 32 });
  const proven = new Set<string>();
  const evidence: CapabilityScan["evidence"] = [];
  let complete = true;

  /*
    Venues that do emit: any log from the contract naming the wallet in an
    indexed position. Scanned as one address filter rather than one query per
    contract, because the provider charges by request and not by address.
  */
  if (spec.contracts.length > 0) {
    const scan = await scanLogs(chainId, {
      address: spec.contracts as Address[],
      topics: topics(null, walletTopic),
      fromBlock,
      toBlock: head,
    });
    if (!scan.complete) complete = false;
    for (const log of scan.logs) {
      const addr = log.address.toLowerCase();
      proven.add(addr);
      if (evidence.length < 8 && log.transactionHash) {
        evidence.push({
          label: `${VENUE_LABEL[addr] ?? addr} emitted an event naming this wallet`,
          txHash: log.transactionHash,
          block: String(log.blockNumber ?? ""),
        });
      }
    }

    // The wallet can also appear in the third indexed slot (owner, to, etc.).
    const scan2 = await scanLogs(chainId, {
      address: spec.contracts as Address[],
      topics: topics(null, null, walletTopic),
      fromBlock,
      toBlock: head,
    });
    if (!scan2.complete) complete = false;
    for (const log of scan2.logs) {
      const addr = log.address.toLowerCase();
      proven.add(addr);
      if (evidence.length < 8 && log.transactionHash) {
        evidence.push({
          label: `${VENUE_LABEL[addr] ?? addr} emitted an event naming this wallet`,
          txHash: log.transactionHash,
          block: String(log.blockNumber ?? ""),
        });
      }
    }
  }

  /*
    Venues that emit nothing: look for the trace the action leaves elsewhere.
    No address filter — the log comes from a pool we do not enumerate — so this
    is a topic-only scan across the range.
  */
  for (const probe of spec.eventProbes) {
    const slot: (Hex | null)[] = [probe.topic0, null, null, null];
    slot[probe.position] = walletTopic;
    const scan = await scanLogs(chainId, {
      address: probe.at as Address[],
      topics: topics(...slot),
      fromBlock,
      toBlock: head,
    });
    if (!scan.complete) complete = false;
    if (scan.logs.length > 0) {
      proven.add(probe.venue);
      const first = scan.logs[0]!;
      if (evidence.length < 8 && first.transactionHash) {
        evidence.push({ label: probe.label, txHash: first.transactionHash, block: String(first.blockNumber ?? "") });
      }
    }
  }

  return {
    ...base,
    proven: [...proven],
    provenLabels: [...proven].map((a) => VENUE_LABEL[a] ?? a),
    evidence,
    complete,
  };
}
