/**
 * Replay the reference strategies against a real pool, on a schedule.
 *
 * A thirty-day window is about 1,152 log requests. That is a batch job, not a
 * request path — a hire screen that spends four minutes walking history is a
 * hire screen that times out — so this runs in the worker and the site reads
 * what it wrote.
 *
 * ---------------------------------------------------------------------------
 * What this is honest about
 * ---------------------------------------------------------------------------
 *
 * The opening position is **synthetic**: a stated amount of capital in a stated
 * band, opened at the first observed price. It is not anybody's real position,
 * and the record says so in a field the page renders rather than in a comment
 * nobody reads. Replaying against a viewer's own position is the next step and
 * needs a connected wallet; until then this answers "what would these agents
 * have done to a position like this", which is a smaller claim, honestly made.
 *
 * The window is whatever the archive host actually served. If it hit the wall
 * part way, `shortenedBecause` carries the sentence and the days are counted
 * from the blocks that were read, never from the blocks that were asked for.
 */

import {
  REFERENCE_STRATEGIES,
  blocksForDays,
  holdPosition,
  liquidityFor,
  readCostModel,
  readHistory,
  recentres,
  replay,
  timeInRange,
  type ReplayResult,
  type Strategy,
} from "@bench/counterfactual";
import { getSqrtRatioAtTick } from "@bench/metrics";
import { LIQUID_POOLS, TOKENS, chainClient, type SupportedChain } from "@bench/shared";
import { formatUnits, type Address } from "viem";

/** One strategy's outcome, in the shape the page renders. */
export interface CounterfactualRow {
  /** Matches a house agent's slug where one exists, so a row can find itself. */
  strategy: string;
  name: string;
  describes: string;
  timeInRangePercent: number;
  recentres: number;
  /** Gas charged across the window, in the pool's token0 units. */
  gasCost: string;
  /** Net change against the opening position, in token0 units. Negative is a loss. */
  net: string;
  /** The same figure against the do-nothing arm. This is the number that matters. */
  vsHold: string;
}

export interface CounterfactualRecord {
  chainId: number;
  pool: Address;
  pair: string;
  feePips: number;
  token0Symbol: string;
  fromBlock: string;
  toBlock: string;
  hours: number;
  swaps: number;
  complete: boolean;
  shortenedBecause: string | null;
  via: string | null;
  gasPriceWei: string;
  /** Said plainly, because the page shows it: this is not anyone's real position. */
  positionNote: string;
  bandHalfWidthTicks: number;
  rows: CounterfactualRow[];
  observedAt: string;
  reproduce: string;
  /** Set when the position would be large enough to move the pool it is measured in. */
  dilution: string | null;
}

/**
 * The symbol for a token address, from the addresses this repo already knows.
 *
 * Not from the pool's label. `LIQUID_POOLS` calls one pool "WBNB/USDT" while
 * its `token0` is USDT, so splitting the label on "/" and taking a side is
 * right for that pool by coincidence and wrong for the next one. The label is
 * for a reader; the address is the fact.
 */
function symbolFor(chainId: SupportedChain, token: Address, fallback: string): string {
  const known = TOKENS[chainId] as Record<string, { address: Address; symbol: string }>;
  for (const entry of Object.values(known)) {
    if (entry?.address?.toLowerCase() === token.toLowerCase()) return entry.symbol;
  }
  return fallback;
}

/**
 * Run every reference strategy over one pool's recent history.
 *
 * `days` is what is asked for; what comes back may be less, and the record says
 * which. `capital` is in token0 units — for a USDT-quoted pool that is dollars.
 */
export async function runCounterfactual(
  chainId: SupportedChain,
  opts: { poolIndex?: number; days?: number; capital?: bigint; halfWidth?: number } = {},
): Promise<CounterfactualRecord | null> {
  const pool = LIQUID_POOLS[opts.poolIndex ?? 3]!;
  const days = opts.days ?? 1;
  const halfWidth = opts.halfWidth ?? 60;
  const capital = opts.capital ?? 1_000n * 10n ** 18n;

  const client = chainClient(chainId);
  const head = await client.getBlockNumber();
  const span = blocksForDays(chainId, days);
  const history = await readHistory(chainId, pool.pool, head - span, head);
  if (history.ticks.length < 2) return null;

  const first = history.ticks[0]!;
  const last = history.ticks[history.ticks.length - 1]!;
  const cost = await readCostModel(client as never, first.block);

  const lower = Math.round((first.tick - halfWidth) / 10) * 10;
  const upper = Math.round((first.tick + halfWidth) / 10) * 10;

  /*
    Both sides are funded, because a position straddling the price needs both
    tokens. Supplying one and letting `liquidityFor` return zero is correct
    behaviour and a useless simulation.
  */
  const Q96 = 1n << 96n;
  const price0In1 = (first.sqrtPriceX96 * first.sqrtPriceX96) / Q96;
  const open = {
    tickLower: lower,
    tickUpper: upper,
    liquidity: liquidityFor({
      amount0: capital,
      amount1: (capital * price0In1) / Q96,
      tickLower: lower,
      tickUpper: upper,
      sqrtPriceX96: first.sqrtPriceX96,
      sqrtLower: getSqrtRatioAtTick(lower),
      sqrtUpper: getSqrtRatioAtTick(upper),
    }),
    owed0: 0n,
    owed1: 0n,
  };
  if (open.liquidity === 0n) return null;

  /* Value everything in token0 at the closing price, gas included. */
  const p1in0 = (Q96 * Q96) / ((last.sqrtPriceX96 * last.sqrtPriceX96) / Q96);
  const inToken0 = (a0: bigint, a1: bigint) => a0 + (a1 * p1in0) / Q96;
  const gasInToken0 = (wei: bigint) => (wei * p1in0) / Q96;

  /*
    Heterogeneous by design: each strategy remembers a different shape, and the
    replay engine is generic over that. `unknown` is the honest common type —
    the engine never inspects the memory, it only hands it back.
  */
  const strategies: Strategy<unknown>[] = [holdPosition, ...REFERENCE_STRATEGIES];

  const results = strategies.map((s) => ({ s, r: replay(history, s, open, cost) }));
  const netOf = (r: ReplayResult) =>
    inToken0(r.end.amount0 - r.start.amount0, r.end.amount1 - r.start.amount1) -
    gasInToken0(r.gasWei);
  const holdNet = netOf(results[0]!.r);

  const rows: CounterfactualRow[] = results.map(({ s, r }) => ({
    strategy: s.slug,
    name: s.name,
    describes: s.describes,
    timeInRangePercent: Number(timeInRange(r).toFixed(1)),
    recentres: recentres(r),
    gasCost: formatUnits(gasInToken0(r.gasWei), 18),
    net: formatUnits(netOf(r), 18),
    vsHold: formatUnits(netOf(r) - holdNet, 18),
  }));

  const hours = (last.timestamp - first.timestamp) / 3600;
  const symbol0 = symbolFor(chainId, history.token0, "token0");

  return {
    chainId,
    pool: pool.pool,
    pair: pool.pair,
    feePips: history.feePips,
    token0Symbol: symbol0,
    fromBlock: history.fromBlock.toString(),
    toBlock: history.toBlock.toString(),
    hours: Number(hours.toFixed(2)),
    swaps: history.ticks.length,
    complete: history.complete,
    shortenedBecause: history.shortenedBecause,
    via: history.via,
    gasPriceWei: cost.baseFeeWei.toString(),
    positionNote: `A synthetic position: ${formatUnits(capital, 18)} of ${symbol0} and the matching amount of the other side, opened in a ±${halfWidth}-tick band around the price at block ${history.fromBlock}. It is nobody's real position — connecting a wallet and replaying against one somebody actually holds is the next step.`,
    bandHalfWidthTicks: halfWidth,
    rows,
    observedAt: new Date().toISOString(),
    reproduce: `npm run counterfactual -- --days ${days} --half ${halfWidth}`,
    dilution: results.find(({ r }) => r.dilution)?.r.dilution ?? null,
  };
}
