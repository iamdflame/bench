/**
 * Replay strategies against a position somebody actually holds.
 *
 * The difference between this and the scheduled run in the worker is the
 * opening position: that one opens a synthetic band and asks "what would these
 * agents have done to a position like this", while this one takes the band,
 * the liquidity and the uncollected fees off the chain and asks the question
 * the plan is built around.
 *
 * ---------------------------------------------------------------------------
 * Why the window is short here and long there
 * ---------------------------------------------------------------------------
 *
 * A day of history is about 39 log requests and half a minute of walking. That
 * is fine on a schedule and far too slow for a page somebody is waiting on — a
 * hire screen that takes thirty seconds has already lost the person it was
 * built for.
 *
 * So this defaults to a couple of hours, says the window it used in the result
 * rather than implying a longer one, and points at the scheduled run for the
 * deeper number. A short honest window beats a long one nobody waits for, and
 * both beat a figure with no window attached.
 *
 * The result is cached by `(pool, fromBlock, toBlock)`. Two people asking about
 * positions in the same pool within the same block window are asking the same
 * question of the chain, and the answer does not change between them.
 */

import { blocksForDays, readHistory } from "./history";
import { readCostModel } from "./cost";
import { replay, recentres, timeInRange } from "./replay";
import { REFERENCE_STRATEGIES, holdPosition } from "./strategies";
import type { History, OwnedPosition, Strategy } from "./index";

/**
 * Roughly an hour of BNB Chain.
 *
 * Measured rather than picked: two hours of a busy 1% pool took thirty-two
 * seconds to walk cold behind the page, because the adaptive walker narrows
 * every request that would exceed the provider's result cap and a busy pool
 * hits that cap often. An hour halves the work, still covers hundreds of swaps,
 * and the result says how long it actually was.
 */
const DEFAULT_HOURS = 1;

export interface PositionReplayRow {
  strategy: string;
  name: string;
  describes: string;
  timeInRangePercent: number;
  recentres: number;
  /** Net change against the position as it stands, in token1 units. */
  net1: bigint;
  /** The same, measured against leaving the position alone. The number that matters. */
  vsHold1: bigint;
  gasWei: bigint;
}

export interface PositionReplay {
  tokenId: string;
  pool: string;
  feePips: number;
  hours: number;
  swaps: number;
  complete: boolean;
  shortenedBecause: string | null;
  via: string | null;
  fromBlock: string;
  toBlock: string;
  rows: PositionReplayRow[];
  /** Set when the position is big enough to move the pool it is measured in. */
  dilution: string | null;
  /** Said on the page: this is a short window, and why. */
  windowNote: string;
}

const cache = new Map<string, { at: number; value: PositionReplay }>();
const CACHE_MS = 5 * 60_000;

/**
 * Replay every reference strategy against one owned position.
 *
 * Returns null when the pool has too little history in the window to say
 * anything — which the caller must render as "we could not look", not as a
 * result of zero.
 */
export async function replayForPosition(
  chainId: 56 | 97,
  owned: OwnedPosition,
  client: { getBlockNumber: () => Promise<bigint>; getBlock: never; getGasPrice: never },
  opts: { hours?: number } = {},
): Promise<PositionReplay | null> {
  const hours = opts.hours ?? DEFAULT_HOURS;
  const head = await client.getBlockNumber();
  const span = blocksForDays(chainId, hours / 24);
  const fromBlock = head - span;

  const key = `${owned.pool}:${fromBlock / 1000n}:${owned.tokenId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const history: History = await readHistory(chainId, owned.pool, fromBlock, head);
  if (history.ticks.length < 2) return null;

  const first = history.ticks[0]!;
  const cost = await readCostModel(client as never, first.block);

  const strategies: Strategy<unknown>[] = [holdPosition, ...REFERENCE_STRATEGIES];
  const results = strategies.map((s) => ({ s, r: replay(history, s, owned.position, cost) }));

  /*
    Everything is expressed in token1 rather than converted to a fiat figure.
    A dollar number would need a price for token1, which would need an oracle,
    which would be a fourth source of error in a result that already has three.
    The page names the token.
  */
  const Q96 = 1n << 96n;
  const last = history.ticks[history.ticks.length - 1]!;
  const price0In1 = (last.sqrtPriceX96 * last.sqrtPriceX96) / Q96;
  const net1 = (r: (typeof results)[number]["r"]) =>
    ((r.end.amount0 - r.start.amount0) * price0In1) / Q96 +
    (r.end.amount1 - r.start.amount1) -
    r.gasWei;

  const holdNet = net1(results[0]!.r);

  const value: PositionReplay = {
    tokenId: owned.tokenId,
    pool: owned.pool,
    feePips: owned.feePips,
    hours: Number(((last.timestamp - first.timestamp) / 3600).toFixed(2)),
    swaps: history.ticks.length,
    complete: history.complete,
    shortenedBecause: history.shortenedBecause,
    via: history.via,
    fromBlock: history.fromBlock.toString(),
    toBlock: history.toBlock.toString(),
    rows: results.map(({ s, r }) => ({
      strategy: s.slug,
      name: s.name,
      describes: s.describes,
      timeInRangePercent: Number(timeInRange(r).toFixed(1)),
      recentres: recentres(r),
      net1: net1(r),
      vsHold1: net1(r) - holdNet,
      gasWei: r.gasWei,
    })),
    dilution: results.find(({ r }) => r.dilution)?.r.dilution ?? null,
    windowNote: `Replayed over about ${hours} hours, because walking a full day of this pool takes half a minute and a page you are waiting on should not. The deeper run is on /data, and it is a different window rather than a longer view of this one.`,
  };

  cache.set(key, { at: Date.now(), value });
  return value;
}
