/**
 * The ladder as it stood at any past block.
 *
 * The only way to show that this register is *derived* rather than *authored*
 * is to re-derive it against history and let anyone watch it move. A snapshot
 * cannot do that; a page that re-runs its own arithmetic against a block
 * somebody else chose can.
 *
 * ---------------------------------------------------------------------------
 * What can be replayed, and what cannot
 * ---------------------------------------------------------------------------
 *
 * Re-deriving *state* at a past block needs an archive node, and BSC's public
 * endpoints serve about fifty seconds of it. Re-deriving from *events* is a
 * different capability, and at least one public endpoint does serve those. So
 * the rungs split:
 *
 *   REPLAYABLE. Rung 0, from the identity registry's mint events — token ids
 *   are assigned in sequence, so the highest one minted at or before a block
 *   is the registration count at that block. Rungs 5 and 6 from the market's
 *   own events, which are few and bounded.
 *
 *   NOT REPLAYABLE, AND NOT PRETENDED OTHERWISE. Rungs 1 through 3 were never
 *   on chain. "Its card parses", "its endpoint answered", "its wallet touched
 *   the protocol" are things we probed off chain at a moment in time, and we
 *   kept no historical record of the probe. They are reported as unavailable
 *   with the reason, rather than back-filled from today's answer — which would
 *   be authoring history, precisely the accusation this feature exists to
 *   answer.
 */

import { createPublicClient, http, parseAbiItem, type Address, type Log, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import { IDENTITY_REGISTRY, RUNG_NAMES } from "@/lib/config";
import { MARKET_ADDRESS } from "@/lib/chain/market";
import { scanLogs } from "@/lib/chain/logs";

/**
 * The endpoint that actually serves historical logs.
 *
 * Measured, not assumed: of five public BSC endpoints, four refuse a
 * ninety-thousand-block-old range outright ("Request exceeds defined limit",
 * "Invalid parameters"). This one answers.
 */
export const LOG_RPC = process.env.LOG_RPC_URL ?? "https://bsc.rpc.blxrbdn.com";

const ZERO = "0x0000000000000000000000000000000000000000";

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);
const SETTLED = parseAbiItem(
  "event EpochSettled(uint256 indexed mandateId, uint32 indexed epoch, address indexed agent, int256 realizedAlphaBps, uint96 feePaid, uint96 slashed)",
);
const AWARDED = parseAbiItem(
  "event MandateAwarded(uint256 indexed mandateId, address indexed agent, uint96 bond)",
);

export interface ReplayedRung {
  n: number;
  name: string;
  /** Null when the rung cannot be re-derived at this block. */
  population: number | null;
  /** How it was derived, or why it could not be. */
  method: string;
  replayable: boolean;
}

export interface Replay {
  blockNumber: string;
  blockTime: string | null;
  rungs: ReplayedRung[];
  /** Endpoints tried and what happened, so a failure is never silent. */
  notes: string[];
  at: string;
}

function client(url = LOG_RPC): PublicClient {
  return createPublicClient({
    chain: bsc,
    transport: http(url, { timeout: 30_000, retryCount: 1 }),
  }) as PublicClient;
}

/**
 * The registration count at a block.
 *
 * Token ids are assigned in sequence, so the highest id minted at or before
 * the block is the count at that block. Found by walking back in windows until
 * a mint appears, rather than scanning three hundred thousand events from
 * genesis — the answer is the same and it costs two or three queries.
 */
async function registeredAt(
  c: PublicClient,
  block: bigint,
  notes: string[],
): Promise<number | null> {
  const WINDOW = 2_000n;
  for (let back = 0n; back < 40_000n; back += WINDOW) {
    const to = block - back;
    const from = to > WINDOW ? to - WINDOW : 0n;
    try {
      const logs = await c.getLogs({
        address: IDENTITY_REGISTRY as Address,
        event: TRANSFER,
        args: { from: ZERO as Address },
        fromBlock: from,
        toBlock: to,
      });
      if (logs.length === 0) continue;
      const highest = logs.reduce((m, l) => {
        const id = (l.args as { tokenId?: bigint }).tokenId ?? 0n;
        return id > m ? id : m;
      }, 0n);
      notes.push(
        `Rung 0 is the highest token id minted by block ${to.toLocaleString()}. The registry issues ids in sequence, so the newest id is the population — read from ${logs.length} mint events in the ${(Number(to - from)).toLocaleString()} blocks before it.`,
      );
      return Number(highest);
    } catch (e) {
      notes.push(`log query ${from}–${to} refused: ${(e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 80)}`);
      return null;
    }
  }
  notes.push("no mint events found within 40,000 blocks before the target");
  return null;
}

/** Distinct agents that had been awarded a mandate, and had settled an epoch. */
async function marketAt(
  c: PublicClient,
  block: bigint,
  notes: string[],
): Promise<{ bonded: number | null; settled: number | null }> {
  const deploy = BigInt(
    process.env.NEXT_PUBLIC_MARKET_DEPLOY_BLOCK ?? process.env.MARKET_DEPLOY_BLOCK ?? "0",
  );
  if (deploy === 0n || !MARKET_ADDRESS) {
    notes.push("rungs 5 and 6 need the market deploy block; none is configured");
    return { bonded: null, settled: null };
  }
  if (block < deploy) {
    notes.push(`the market did not exist at block ${block} (deployed at ${deploy})`);
    return { bonded: 0, settled: 0 };
  }

  const bonded = new Set<string>();
  const settled = new Set<string>();

  /*
    This walked the range itself, one chunk at a time, against the single
    client it was handed — and that client is the read node, which refuses
    `eth_getLogs` outright. So the page printed the provider's own words at the
    reader: "market log scan refused: Invalid parameters were provided to the
    RPC method". The shared scanner tries every provider that serves logs and
    walks the ranges several at once.
  */
  const { logs, complete, refused, ranges } = await scanLogs<
    Log<bigint, number, false, undefined, undefined, [typeof AWARDED, typeof SETTLED]>
  >({
    address: MARKET_ADDRESS,
    events: [AWARDED, SETTLED],
    fromBlock: deploy,
    toBlock: block,
  });

  for (const l of logs) {
    const a = (l.args as { agent?: string }).agent;
    if (!a || /^0x0+$/.test(a)) continue;
    // Awarded puts an agent on rung 5; a settled epoch puts it on rung 6.
    if (l.eventName === "MandateAwarded") bonded.add(a.toLowerCase());
    if (l.eventName === "EpochSettled") settled.add(a.toLowerCase());
  }

  if (!complete) {
    // A hole in the history is stated as a hole. Reporting a count derived
    // from part of the range as though it were the whole one is the failure
    // this page exists to make impossible.
    notes.push(
      `rungs 5 and 6 are incomplete: ${refused} of ${ranges} block ranges went unanswered by every provider, so no count is drawn`,
    );
    return { bonded: null, settled: null };
  }

  notes.push(
    `Rungs 5 and 6 are counted from the market's own Awarded and EpochSettled events, across every deployment, between block ${deploy.toLocaleString()} and block ${block.toLocaleString()}.`,
  );
  return { bonded: bonded.size, settled: settled.size };
}

const NEVER_ON_CHAIN =
  "never on chain — this rung was probed off chain at a moment in time and no historical record of the probe was kept. Back-filling it from today's answer would be authoring history.";

/** Re-derives the ladder as it stood at `block`. */
export async function ladderAt(block: bigint, rpc = LOG_RPC): Promise<Replay> {
  const c = client(rpc);
  const notes: string[] = [];

  let blockTime: string | null = null;
  try {
    const b = await c.getBlock({ blockNumber: block });
    blockTime = new Date(Number(b.timestamp) * 1000).toISOString();
  } catch {
    notes.push("the block header could not be read; only the number is shown");
  }

  const [registered, market] = await Promise.all([
    registeredAt(c, block, notes),
    marketAt(c, block, notes),
  ]);

  const rungs: ReplayedRung[] = [
    {
      n: 0,
      name: RUNG_NAMES[0],
      population: registered,
      method: registered === null ? "mint events could not be read at this block" : "identity registry mint events",
      replayable: true,
    },
    { n: 1, name: RUNG_NAMES[1], population: null, method: NEVER_ON_CHAIN, replayable: false },
    { n: 2, name: RUNG_NAMES[2], population: null, method: NEVER_ON_CHAIN, replayable: false },
    { n: 3, name: RUNG_NAMES[3], population: null, method: NEVER_ON_CHAIN, replayable: false },
    {
      n: 4,
      name: RUNG_NAMES[4],
      population: null,
      method:
        "the published fineness is contract state, not an event, so re-reading it at a past block needs an archive node",
      replayable: false,
    },
    {
      n: 5,
      name: RUNG_NAMES[5],
      population: market.bonded,
      method: market.bonded === null ? "market events could not be read" : "distinct agents awarded a mandate on or before this block",
      replayable: true,
    },
    {
      n: 6,
      name: RUNG_NAMES[6],
      population: market.settled,
      method: market.settled === null ? "market events could not be read" : "distinct agents with a settled epoch on or before this block",
      replayable: true,
    },
  ];

  return { blockNumber: block.toString(), blockTime, rungs, notes, at: new Date().toISOString() };
}
