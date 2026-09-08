/**
 * The registry sweep, read from the chain rather than from an index.
 *
 * This exists because the alternative failed in the way third parties fail:
 * the public ERC-8004 index answered `DATABASE_ERROR` on most page sizes and
 * took thirty seconds on the ones it served, measured directly, mid-build. A
 * marketplace whose inventory disappears when somebody else's database is
 * unhappy is not a front door.
 *
 * So the authority is the registry contract. Registrations are mints, and a
 * mint is a `Transfer` from the zero address, which means the population is
 * enumerable from logs without any index at all. `ownerOf` and `tokenURI` fill
 * in the rest, and the card is fetched through the SSRF guard because it is a
 * URL a stranger wrote into a public contract.
 *
 * ---------------------------------------------------------------------------
 * Recency first, and why that is the right bias
 * ---------------------------------------------------------------------------
 *
 * The sweep walks backwards from the head in windows. That is not a
 * convenience: an agent registered eighteen months ago whose endpoint has been
 * dead for a year is not inventory, and a marketplace that spends its crawl
 * budget on the oldest rows first will have the least useful board. Walking
 * back from the head finds what is live now, and the cursor lets successive
 * runs go deeper without repeating work.
 *
 * The depth reached is reported. "Read back to block N, about D days" is a
 * fact the board states rather than implying it has seen everything.
 */

import { parseAbiItem, type Address } from "viem";
import {
  BLOCK_SECONDS,
  IDENTITY_ABI,
  IDENTITY_REGISTRY,
  chainClient,
  logClients,
  type SupportedChain,
} from "@bench/shared";
import { fetchCard, type AgentCard } from "./registry";

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * Pacing, because exactly one free provider serves ranged `eth_getLogs` here.
 *
 * Measured against ten public BSC hosts: only `publicnode` answers a
 * 5,000-block filtered range. The rest reject the range outright, reject the
 * indexed-argument filter, or 429. So the crawl has one lane, and hammering it
 * gets every window after the first few refused — which the first deep pass
 * demonstrated by reporting 1,600 unread windows.
 *
 * The delay is small and the backoff is what actually matters: a refused
 * window is retried after a pause before it is written off, because "the
 * provider was busy" and "there were no registrations here" must never become
 * the same answer.
 */
const PACE_MS = 90;
const RETRY_PAUSES_MS = [400, 1_500];

/**
 * Where the free providers stop serving logs, measured rather than assumed.
 *
 * `bsc-rpc.publicnode.com` — the only free BSC host of ten tested that serves a
 * ranged, filtered `eth_getLogs` at all — answers for the most recent window
 * and returns "Invalid parameters" for anything older. Measured directly at
 * offsets of 10k, 100k, 500k, 1M, 2M, 5M and 10M blocks: every one refused,
 * the head window served.
 *
 * So without an archive node this crawl is a *tail* reader. It sees new
 * registrations as they are minted and accumulates them across cycles; it
 * cannot walk back through history. That is a real limit on this deployment
 * and it is reported on /data rather than disguised as an empty registry.
 *
 * Setting `ARCHIVE_RPC_URL` lifts it: the same code walks as deep as that node
 * will serve, and `boundedByProvider` goes false.
 */
const CONSECUTIVE_FAILURES_MEAN_BOUNDARY = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ChainRegistration {
  tokenId: string;
  owner: Address;
  block: bigint;
  txHash: string;
  tokenURI: string | null;
  card: AgentCard | null;
  cardRefusal: string | null;
}

export interface ChainSweepResult {
  registrations: ChainRegistration[];
  /** The oldest block this run reached. The next run continues below it. */
  reachedBlock: bigint;
  headBlock: bigint;
  /** How far back the whole crawl has now seen, in days. Stated, not implied. */
  depthDays: number;
  /** Windows the providers would not serve. Named, never silently skipped. */
  unreadWindows: { from: string; to: string }[];
  /**
   * True when the walk stopped because the provider stopped serving history,
   * rather than because it ran out of budget.
   *
   * The distinction matters to the cursor: there is no point continuing past
   * a boundary, so a bounded pass restarts at the head next time instead of
   * marching further into a range nothing will answer for.
   */
  boundedByProvider: boolean;
}

/**
 * Collect mints, walking backwards from `fromBlock`.
 *
 * `maxTokens` bounds the run so a cycle stays short and resumable; `windows`
 * bounds how far back it walks when the registry is quiet. Both matter: the
 * registry currently mints a handful per thousand blocks, so a token budget
 * alone would walk for hours on a slow day.
 */
export async function sweepChain(
  chainId: SupportedChain,
  opts: { fromBlock?: bigint; maxTokens?: number; windows?: number; windowSize?: bigint; withCards?: boolean } = {},
): Promise<ChainSweepResult> {
  const client = chainClient(chainId);
  const readers = logClients(chainId);
  const registry = IDENTITY_REGISTRY[chainId];
  const head = await client.getBlockNumber();

  const windowSize = opts.windowSize ?? 5_000n;
  const maxTokens = opts.maxTokens ?? 60;
  const maxWindows = opts.windows ?? 30;
  let cursor = opts.fromBlock ?? head;

  const found: { tokenId: string; owner: Address; block: bigint; txHash: string }[] = [];
  const unreadWindows: ChainSweepResult["unreadWindows"] = [];
  let consecutiveFailures = 0;
  let boundedByProvider = false;

  for (let i = 0; i < maxWindows && found.length < maxTokens && cursor > 0n; i++) {
    const to = cursor;
    const from = to > windowSize ? to - windowSize + 1n : 0n;

    let served = false;
    // One pass over the hosts, then two paced retries. A window is only
    // written off as unread when all three have failed.
    for (let attempt = 0; attempt <= RETRY_PAUSES_MS.length && !served; attempt++) {
      if (attempt > 0) await sleep(RETRY_PAUSES_MS[attempt - 1]!);
      for (const reader of readers) {
        try {
          const logs = await reader.getLogs({
            address: registry,
            event: TRANSFER,
            args: { from: ZERO },
            fromBlock: from,
            toBlock: to,
          });
          for (const l of logs) {
            const tokenId = l.args.tokenId;
            const owner = l.args.to;
            if (tokenId === undefined || !owner) continue;
            found.push({
              tokenId: tokenId.toString(),
              owner,
              block: l.blockNumber ?? to,
              txHash: l.transactionHash ?? "",
            });
          }
          served = true;
          break;
        } catch {
          // Next host. Providers decline ranges, and one declining is normal.
        }
      }
    }
    if (served) {
      consecutiveFailures = 0;
    } else {
      unreadWindows.push({ from: from.toString(), to: to.toString() });
      consecutiveFailures++;
      /*
        Several windows in a row refused is the provider's history boundary,
        not a blip. Continuing would spend the whole cycle asking questions
        nothing will answer, and would report hundreds of unread windows that
        all mean the same single thing.
      */
      if (consecutiveFailures >= CONSECUTIVE_FAILURES_MEAN_BOUNDARY) {
        boundedByProvider = true;
        cursor = from;
        break;
      }
    }
    await sleep(PACE_MS);

    if (from === 0n) {
      cursor = 0n;
      break;
    }
    cursor = from - 1n;
  }

  /*
    Newest first, then capped. A mint's block is its registration date, and a
    buyer looking at a board cares far more about the agent registered this
    week than the one registered last spring.
  */
  found.sort((a, b) => (b.block > a.block ? 1 : b.block < a.block ? -1 : 0));
  const picked = found.slice(0, maxTokens);

  const registrations: ChainRegistration[] = [];
  for (const f of picked) {
    await sleep(PACE_MS);
    const uri = await client
      .readContract({
        address: registry,
        abi: IDENTITY_ABI,
        functionName: "tokenURI",
        args: [BigInt(f.tokenId)],
      })
      .catch(() => null);

    let card: AgentCard | null = null;
    let cardRefusal: string | null = null;
    if (typeof uri === "string" && uri.length > 0) {
      if (opts.withCards === false) {
        cardRefusal = "The card was not fetched on this pass.";
      } else {
        const r = await fetchCard(uri);
        if (r.card) card = r.card;
        else cardRefusal = r.reason;
      }
    } else {
      cardRefusal = "The registry returns no tokenURI for this id.";
    }

    registrations.push({
      tokenId: f.tokenId,
      owner: f.owner,
      block: f.block,
      txHash: f.txHash,
      tokenURI: typeof uri === "string" ? uri : null,
      card,
      cardRefusal,
    });
  }

  const reached = cursor > 0n ? cursor : 0n;
  const depthBlocks = Number(head - reached);
  return {
    registrations,
    reachedBlock: reached,
    headBlock: head,
    depthDays: (depthBlocks * BLOCK_SECONDS[chainId]) / 86_400,
    unreadWindows,
    boundedByProvider,
  };
}

/**
 * How many registrations exist, counted from the chain.
 *
 * There is no `totalSupply` on the deployed registry — it reverts — so the
 * population cannot be read in one call. The highest token id ever minted is
 * the closest cheap proxy, and it is reported as exactly that rather than as a
 * count: ids are sequential in practice but nothing in the contract promises
 * it, and burns would make the two differ.
 */
export async function highestTokenId(chainId: SupportedChain): Promise<{ tokenId: string; block: bigint } | null> {
  const client = chainClient(chainId);
  const readers = logClients(chainId);
  const head = await client.getBlockNumber();
  const registry = IDENTITY_REGISTRY[chainId];

  for (let back = 0n; back < 200_000n; back += 5_000n) {
    const to = head - back;
    const from = to > 5_000n ? to - 4_999n : 0n;
    for (const reader of readers) {
      try {
        const logs = await reader.getLogs({
          address: registry,
          event: TRANSFER,
          args: { from: ZERO },
          fromBlock: from,
          toBlock: to,
        });
        if (logs.length > 0) {
          const max = logs.reduce((m, l) => {
            const id = l.args.tokenId ?? 0n;
            return id > m.id ? { id, block: l.blockNumber ?? to } : m;
          }, { id: 0n, block: to });
          return { tokenId: max.id.toString(), block: max.block };
        }
        break;
      } catch {
        // try the next reader for this window
      }
    }
  }
  return null;
}
