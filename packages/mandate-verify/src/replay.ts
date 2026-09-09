/**
 * Re-derives the trust ladder at a past block, from event logs alone.
 *
 * Deliberately a second implementation. The application derives this too, and
 * a verifier that shared its code would be checking our arithmetic against our
 * arithmetic. Nothing here imports anything but viem — enforced, not promised.
 *
 * What can be replayed and what cannot is a property of where the data lives,
 * not of effort. Registrations and market awards are events, and events are
 * kept. "Its endpoint answered" was a probe made off chain at a moment in
 * time, and no historical record of that probe exists — so it is reported as
 * unavailable rather than back-filled from today's answer.
 */

import { createPublicClient, http, parseAbiItem, type Address, type PublicClient } from "viem";
import { bsc } from "viem/chains";

const IDENTITY_REGISTRY = "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * Endpoints that actually serve historical logs, tried in order.
 *
 * Measured rather than assumed: most public BSC endpoints refuse a range more
 * than a few thousand blocks old outright. Confined to the same allowlist the
 * isolation check enforces, so this package can still only reach public nodes.
 */
export const LOG_RPCS = ["https://bsc.rpc.blxrbdn.com", "https://bsc-dataseed1.binance.org"];

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);
const SETTLED = parseAbiItem(
  "event EpochSettled(uint256 indexed mandateId, uint32 indexed epoch, address indexed agent, int256 realizedAlphaBps, uint96 feePaid, uint96 slashed)",
);
const AWARDED = parseAbiItem(
  "event MandateAwarded(uint256 indexed mandateId, address indexed agent, uint96 bond)",
);

export interface ReplayRung {
  n: number;
  name: string;
  population: number | null;
  method: string;
}

export interface ReplayResult {
  block: bigint;
  blockTime: string | null;
  rungs: ReplayRung[];
  notes: string[];
  /** False when no endpoint would serve the history. */
  derived: boolean;
}

const NAMES = ["Registered", "Resolvable", "Live", "Capable", "Assayed", "Bonded", "Settled"];
const OFF_CHAIN =
  "never on chain: probed off chain at a moment in time, with no historical record of the probe kept";

/** The registration count at a block: ids are sequential, so the highest mint wins. */
async function registeredAt(c: PublicClient, block: bigint, notes: string[]) {
  const WINDOW = 2_000n;
  for (let back = 0n; back < 40_000n; back += WINDOW) {
    const to = block - back;
    if (to <= 0n) break;
    const from = to > WINDOW ? to - WINDOW : 0n;
    try {
      const logs = await c.getLogs({
        address: IDENTITY_REGISTRY as Address,
        event: TRANSFER,
        args: { from: ZERO },
        fromBlock: from,
        toBlock: to,
      });
      if (logs.length === 0) continue;
      let highest = 0n;
      for (const l of logs) {
        const id = (l.args as { tokenId?: bigint }).tokenId ?? 0n;
        if (id > highest) highest = id;
      }
      notes.push(`rung 0 from ${logs.length} mints in ${from}–${to}`);
      return Number(highest);
    } catch {
      return null;
    }
  }
  return null;
}

async function marketAt(
  c: PublicClient,
  market: Address | null,
  deploy: bigint,
  block: bigint,
  notes: string[],
) {
  if (!market || deploy === 0n) {
    notes.push("rungs 5 and 6 need a market address and deploy block");
    return { bonded: null as number | null, settled: null as number | null };
  }
  if (block < deploy) return { bonded: 0, settled: 0 };

  const bonded = new Set<string>();
  const settled = new Set<string>();
  const SPAN = 4_000n;
  try {
    for (let cursor = deploy; cursor <= block; cursor += SPAN) {
      const to = cursor + SPAN - 1n > block ? block : cursor + SPAN - 1n;
      const [awards, epochs] = await Promise.all([
        c.getLogs({ address: market, event: AWARDED, fromBlock: cursor, toBlock: to }),
        c.getLogs({ address: market, event: SETTLED, fromBlock: cursor, toBlock: to }),
      ]);
      for (const l of awards) {
        const a = (l.args as { agent?: string }).agent;
        if (a && !/^0x0+$/.test(a)) bonded.add(a.toLowerCase());
      }
      for (const l of epochs) {
        const a = (l.args as { agent?: string }).agent;
        if (a && !/^0x0+$/.test(a)) settled.add(a.toLowerCase());
      }
    }
    notes.push(`rungs 5 and 6 from market events, ${deploy}–${block}`);
    return { bonded: bonded.size, settled: settled.size };
  } catch {
    notes.push("the market log scan was refused");
    return { bonded: null, settled: null };
  }
}

export async function replayFrom(opts: {
  block: bigint;
  market?: Address | null;
  deployBlock?: bigint;
  rpcs?: string[];
}): Promise<ReplayResult> {
  const notes: string[] = [];
  const rpcs = opts.rpcs ?? LOG_RPCS;

  for (const url of rpcs) {
    const c = createPublicClient({
      chain: bsc,
      transport: http(url, { timeout: 30_000, retryCount: 0 }),
    }) as PublicClient;

    let blockTime: string | null = null;
    try {
      const b = await c.getBlock({ blockNumber: opts.block });
      blockTime = new Date(Number(b.timestamp) * 1000).toISOString();
    } catch {
      continue;
    }

    const registered = await registeredAt(c, opts.block, notes);
    if (registered === null) {
      notes.push(`${url} would not serve historical mint logs`);
      continue;
    }
    const market = await marketAt(
      c,
      opts.market ?? null,
      opts.deployBlock ?? 0n,
      opts.block,
      notes,
    );

    notes.push(`derived via ${url}`);
    return {
      block: opts.block,
      blockTime,
      derived: true,
      rungs: [
        { n: 0, name: NAMES[0]!, population: registered, method: "identity registry mint events" },
        { n: 1, name: NAMES[1]!, population: null, method: OFF_CHAIN },
        { n: 2, name: NAMES[2]!, population: null, method: OFF_CHAIN },
        { n: 3, name: NAMES[3]!, population: null, method: OFF_CHAIN },
        {
          n: 4,
          name: NAMES[4]!,
          population: null,
          method: "published fineness is contract state, not an event; re-reading it needs archive",
        },
        { n: 5, name: NAMES[5]!, population: market.bonded, method: "agents awarded a mandate by this block" },
        { n: 6, name: NAMES[6]!, population: market.settled, method: "agents with a settled epoch by this block" },
      ],
      notes,
    };
  }

  notes.push("no endpoint would serve the history for that block");
  return { block: opts.block, blockTime: null, derived: false, rungs: [], notes };
}
