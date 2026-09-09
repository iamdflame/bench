/**
 * Agent standings, derived from chain history.
 *
 * The point of making an agent post a bond is that its record stops being a
 * story it tells. So the record here is not stored, reported or self-declared:
 * it is reconstructed from the contract's own logs — every award, every
 * settlement, every slash, every dismissal — and it cannot be edited by the
 * agent it describes.
 *
 * This is the half of the brief a directory cannot answer honestly. "See how
 * they have performed" means nothing when performance is a field an agent
 * writes for itself.
 */

import { parseAbiItem, type Address, type Log } from "viem";
import { logClients, marketClient, MARKET_ADDRESS } from "./market";
import { DEPLOYMENTS } from "./deployments";
import { scanLogs } from "./logs";

const AWARDED = parseAbiItem(
  "event MandateAwarded(uint256 indexed mandateId, address indexed agent, uint96 bond)",
);
const SETTLED = parseAbiItem(
  "event EpochSettled(uint256 indexed mandateId, uint32 indexed epoch, address indexed agent, int256 realizedAlphaBps, uint96 feePaid, uint96 slashed)",
);
const DISMISSED = parseAbiItem(
  "event AgentDismissed(uint256 indexed mandateId, address indexed agent, string reason)",
);

export interface Standing {
  agent: Address;
  /** Mandates ever awarded to this agent. */
  mandatesHeld: number;
  /** Epochs it has been settled over. */
  epochs: number;
  /** Sum of realized alpha in bps across every epoch it was responsible for. */
  totalAlphaBps: number;
  /** Mean alpha per epoch, in bps. The headline number. */
  meanAlphaBps: number;
  /** Epochs beating the benchmark. */
  wins: number;
  /** Fees earned, in wei. */
  feesWei: string;
  /** Own capital lost to slashing, in wei. This is the number that cannot be faked. */
  slashedWei: string;
  /** Times dismissed mid-mandate. */
  dismissals: number;
  /** Most recent reason it was dismissed, if ever. */
  lastDismissalReason: string | null;
}

type AnyLog = Log & {
  eventName?: "MandateAwarded" | "EpochSettled" | "AgentDismissed";
  args?: Record<string, unknown>;
};

/**
 * Reads the full log history in chunks.
 *
 * Providers cap `eth_getLogs` spans and the cap varies, so the range is walked
 * rather than requested whole. A chunk the provider refuses is skipped and
 * counted, and the result says whether coverage was complete — a partial read
 * must never be presented as a full record.
 */
/**
 * Reads the full log history across every deployment.
 *
 * The walk itself lives in `chain/logs`, because the replay page needed the
 * same thing and had its own copy — one that ran against a single client which
 * refuses `eth_getLogs` outright, so it printed the provider's refusal at the
 * reader instead of a ladder.
 */
async function collect(
  fromBlock: bigint,
  toBlock: bigint,
  span: bigint,
): Promise<{ logs: AnyLog[]; complete: boolean }> {
  const { logs, complete } = await scanLogs<AnyLog>({
    // Every deployment, not just the canonical one. The book on the floor
    // spans all three and counts the grid mandate that lost 21%; a standings
    // table built from one contract would quietly drop the worst result this
    // office has produced, which is the precise move it exists to catch.
    address: MARKET_ADDRESSES,
    events: [AWARDED, SETTLED, DISMISSED],
    fromBlock,
    toBlock,
    span,
  });
  return { logs, complete };
}

export interface StandingsResult {
  standings: Standing[];
  complete: boolean;
  fromBlock: string;
  toBlock: string;
}

/**
 * The block the market was deployed in.
 *
 * Without this the scan guessed a lookback, which on a real chain meant
 * walking half a million blocks in 9k chunks for a contract that had existed
 * for an hour: around sixty sequential RPC round trips, and the request timed
 * out before it returned anything. History starts where the contract does.
 */
const DEPLOY_BLOCK = BigInt(
  process.env.MARKET_DEPLOY_BLOCK ?? process.env.NEXT_PUBLIC_MARKET_DEPLOY_BLOCK ?? 0,
);

/** Every market this office has run, so the record spans all of them. */
const MARKET_ADDRESSES = DEPLOYMENTS.map((d) => d.address);

export async function readStandings(
  opts: { lookback?: bigint; span?: bigint } = {},
): Promise<StandingsResult> {
  if (!MARKET_ADDRESS) {
    return { standings: [], complete: false, fromBlock: "0", toBlock: "0" };
  }

  const head = await marketClient.getBlockNumber();
  const lookback = opts.lookback ?? 200_000n;
  const floor = head > lookback ? head - lookback : 0n;
  const from = DEPLOY_BLOCK > 0n ? DEPLOY_BLOCK : floor;
  const { logs, complete } = await collect(from, head, opts.span ?? 4_000n);

  const byAgent = new Map<string, Standing>();
  const get = (agent: string): Standing => {
    const key = agent.toLowerCase();
    let s = byAgent.get(key);
    if (!s) {
      s = {
        agent: key as Address,
        mandatesHeld: 0,
        epochs: 0,
        totalAlphaBps: 0,
        meanAlphaBps: 0,
        wins: 0,
        feesWei: "0",
        slashedWei: "0",
        dismissals: 0,
        lastDismissalReason: null,
      };
      byAgent.set(key, s);
    }
    return s;
  };

  // Logs arrive ordered by block then index, so a later dismissal reason wins.
  for (const log of logs) {
    const args = log.args ?? {};
    const agent = args.agent as string | undefined;
    if (!agent) continue;
    const s = get(agent);

    if (log.eventName === "MandateAwarded") {
      s.mandatesHeld += 1;
    } else if (log.eventName === "EpochSettled") {
      const alpha = Number(args.realizedAlphaBps ?? 0n);
      s.epochs += 1;
      s.totalAlphaBps += alpha;
      if (alpha > 0) s.wins += 1;
      s.feesWei = (BigInt(s.feesWei) + BigInt((args.feePaid as bigint) ?? 0n)).toString();
      s.slashedWei = (
        BigInt(s.slashedWei) + BigInt((args.slashed as bigint) ?? 0n)
      ).toString();
    } else if (log.eventName === "AgentDismissed") {
      s.dismissals += 1;
      s.lastDismissalReason = (args.reason as string) ?? null;
    }
  }

  const standings = [...byAgent.values()].map((s) => ({
    ...s,
    meanAlphaBps: s.epochs > 0 ? Math.round(s.totalAlphaBps / s.epochs) : 0,
  }));

  // Ranked by mean alpha, but an agent with no settled epochs has no record
  // and sorts last rather than at zero alongside genuine break-even results.
  standings.sort((a, b) => {
    if (a.epochs === 0 && b.epochs > 0) return 1;
    if (b.epochs === 0 && a.epochs > 0) return -1;
    return b.meanAlphaBps - a.meanAlphaBps;
  });

  return {
    standings,
    complete,
    fromBlock: from.toString(),
    toBlock: head.toString(),
  };
}
