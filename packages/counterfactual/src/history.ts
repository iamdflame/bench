/**
 * The price series, reconstructed from the pool's own events.
 *
 * A PancakeSwap V3 pool emits `Swap` on every trade, carrying `sqrtPriceX96`
 * and `tick` *after* the swap. Walking those logs is therefore a complete
 * record of where the price went and when — no archive node required for state,
 * only log access, which is the whole reason this is buildable.
 *
 * ---------------------------------------------------------------------------
 * The nine-field signature
 * ---------------------------------------------------------------------------
 *
 * PancakeSwap's V3 `Swap` is **not** Uniswap's. It carries two extra fields,
 * `protocolFeesToken0` and `protocolFeesToken1`:
 *
 *     Swap(address indexed sender, address indexed recipient,
 *          int256 amount0, int256 amount1, uint160 sqrtPriceX96,
 *          uint128 liquidity, int24 tick,
 *          uint128 protocolFeesToken0, uint128 protocolFeesToken1)
 *
 * A different field list is a different topic hash, so a scan built from
 * Uniswap's ABI silently matches nothing — no error, just an empty series that
 * reads exactly like a quiet pool. That cost a day on the worked examples
 * before, and it is why the topic here is derived from the signature above
 * rather than pasted.
 *
 * ---------------------------------------------------------------------------
 * How far back this can see
 * ---------------------------------------------------------------------------
 *
 * Thirty days at BNB Chain's 0.45s blocks is 5.76 million blocks, and the
 * default archive host caps a request at 5,000 — about 1,152 requests for a
 * full window. That is a batch job, not a request path, which is why callers
 * are expected to cache by `(pool, fromBlock, toBlock)`.
 *
 * When the walk cannot cover the range it says so twice: `complete` goes false
 * and the window is **shortened to what was actually served** rather than left
 * spanning a hole. A gap in the middle of a price series is worse than a
 * shorter series, because a replay would interpolate across it silently.
 */

import {
  BLOCK_SECONDS,
  chainClient,
  scanLogs,
  type SupportedChain,
} from "@bench/shared";
import {
  decodeEventLog,
  parseAbiItem,
  toEventSelector,
  type Address,
  type Hex,
} from "viem";
import type { History, Tick } from "./types";

/** PancakeSwap V3's `Swap`, with the two protocol-fee fields Uniswap does not have. */
export const V3_SWAP = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)",
);

/** Derived, never pasted. See the note above about the nine-field signature. */
export const V3_SWAP_TOPIC = toEventSelector(V3_SWAP) as Hex;

const POOL_ABI = [
  parseAbiItem("function token0() view returns (address)"),
  parseAbiItem("function token1() view returns (address)"),
  parseAbiItem("function fee() view returns (uint24)"),
] as const;

/** Blocks in a window of `days`, at the measured block time. */
export const blocksForDays = (chainId: SupportedChain, days: number): bigint =>
  BigInt(Math.round((days * 86_400) / BLOCK_SECONDS[chainId]));

/**
 * Timestamps, by interpolation between the ends rather than a header per block.
 *
 * A header read per swap would be tens of thousands of round trips for a
 * thirty-day window. Block time on this chain is 0.450s and was identical to
 * three decimals across every span sampled from a thousand blocks to five
 * million, so interpolating between two real headers is accurate to well under
 * a second — far finer than anything a strategy decides on.
 *
 * The two anchors are real reads. Nothing here invents a timestamp outside
 * them.
 */
function interpolateTimestamps(
  ticks: Omit<Tick, "timestamp">[],
  anchorLow: { block: bigint; timestamp: number },
  anchorHigh: { block: bigint; timestamp: number },
): Tick[] {
  const span = anchorHigh.block - anchorLow.block;
  const seconds = anchorHigh.timestamp - anchorLow.timestamp;
  return ticks.map((t) => ({
    ...t,
    timestamp:
      span === 0n
        ? anchorLow.timestamp
        : anchorLow.timestamp +
          Math.round((Number(t.block - anchorLow.block) / Number(span)) * seconds),
  }));
}

/**
 * Walk a pool's swaps into a price series.
 *
 * `fromBlock`/`toBlock` are inclusive. The result is sorted by block and then
 * by log index, so two swaps in one block keep the order the chain gave them —
 * which matters, because the last one is the price the block closed at.
 */
export async function readHistory(
  chainId: SupportedChain,
  pool: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<History> {
  const client = chainClient(chainId);

  const [token0, token1, fee] = await Promise.all([
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "token0" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "token1" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "fee" }),
  ]);

  const scan = await scanLogs(chainId, {
    address: pool,
    topics: [V3_SWAP_TOPIC],
    fromBlock,
    toBlock,
  });

  const raw: {
    block: bigint;
    logIndex: number;
    tick: number;
    sqrtPriceX96: bigint;
    amount0: bigint;
    amount1: bigint;
    liquidity: bigint;
  }[] = [];
  for (const log of scan.logs) {
    if (log.blockNumber === null || log.blockNumber === undefined) continue;
    try {
      const decoded = decodeEventLog({
        abi: [V3_SWAP],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      }) as {
        args: {
          sqrtPriceX96: bigint;
          tick: number;
          amount0: bigint;
          amount1: bigint;
          liquidity: bigint;
        };
      };
      raw.push({
        block: log.blockNumber,
        logIndex: log.logIndex ?? 0,
        tick: Number(decoded.args.tick),
        sqrtPriceX96: decoded.args.sqrtPriceX96,
        amount0: decoded.args.amount0,
        amount1: decoded.args.amount1,
        liquidity: decoded.args.liquidity,
      });
    } catch {
      /*
        A log that will not decode against this signature is not ours. It is
        skipped rather than guessed at, and it does not make the scan
        incomplete: incompleteness is about ranges we could not read, not about
        events we could read and did not want.
      */
    }
  }
  raw.sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1));

  /*
    The window is narrowed to what was actually served.

    `scanLogs` reports the oldest block it managed to read. If the walk hit the
    archive wall part way, the honest window starts there — not at the block we
    hoped for. Leaving `fromBlock` where it was would describe a series as
    covering days it never saw.
  */
  const servedFrom = scan.servedFrom ?? fromBlock;
  const effectiveFrom = servedFrom > fromBlock ? servedFrom : fromBlock;
  const shortened =
    effectiveFrom > fromBlock
      ? `Asked for blocks ${fromBlock}–${toBlock} and was served from ${effectiveFrom}. ${scan.reason ?? "The older part of the range was refused."} The window below is the part that was actually read.`
      : scan.complete
        ? null
        : (scan.reason ?? "Part of the range could not be read.");

  const usable = raw.filter((t) => t.block >= effectiveFrom);

  let ticks: Tick[] = [];
  if (usable.length > 0) {
    const [lo, hi] = await Promise.all([
      client.getBlock({ blockNumber: usable[0]!.block }),
      client.getBlock({ blockNumber: usable[usable.length - 1]!.block }),
    ]);
    ticks = interpolateTimestamps(
      usable.map(({ logIndex: _drop, ...t }) => t),
      { block: lo.number!, timestamp: Number(lo.timestamp) },
      { block: hi.number!, timestamp: Number(hi.timestamp) },
    );
  }

  return {
    chainId,
    pool,
    feePips: Number(fee),
    token0: token0 as Address,
    token1: token1 as Address,
    ticks,
    fromBlock: effectiveFrom,
    toBlock,
    complete: scan.complete,
    shortenedBecause: shortened,
    via: scan.via,
  };
}
