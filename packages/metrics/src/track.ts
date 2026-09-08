/**
 * "What has it actually done" — computed, per job, from chain.
 *
 * This is the column that separates a marketplace from a directory. A
 * directory shows what an agent says about itself. A marketplace shows what
 * the chain shows it doing, in the units of the job it is being hired for, and
 * says plainly where it cannot see.
 *
 * Four jobs, four different measurements. That is not decoration: a single
 * generic score reused four times is exactly what the Agent Diversity
 * criterion punishes, and it is also useless — "94" tells a person nothing
 * about whether to hand this agent a lending position.
 *
 * ---------------------------------------------------------------------------
 * What we can and cannot know about a stranger's agent
 * ---------------------------------------------------------------------------
 *
 * For an agent we operate, the managed position is known and every metric is
 * computable. For a third party we know a wallet and nothing else, so the
 * honest measurements are the ones derivable from that wallet's own footprint:
 * the positions it holds, the swaps it made, the Venus account it carries.
 *
 * Where a metric needs something we do not have — which position of yours it
 * would manage, what band it was given — the answer is `unknown` with that
 * sentence, and the board renders "not measured" with the reason. It never
 * renders a zero, and it never quietly reports the agent's own wallet as
 * though it were the buyer's.
 */

import type { Address, PublicClient } from "viem";
import {
  MASTERCHEF_V3_ABI,
  TOPIC,
  V3_POOL_ABI,
  V3_POSITIONS_ABI,
  VENUS_COMPTROLLER_ABI,
  VENUES,
  VTOKEN_ABI,
  chainClient,
  scanLogs,
  topics,
  BLOCK_SECONDS,
  type JobSlug,
  type SupportedChain,
} from "@bench/shared";
import { known, measure, unknown, type Maybe, type Measurement } from "@bench/measure";
import { pad, type Hex } from "viem";

export interface TrackWindow {
  fromBlock: bigint;
  toBlock: bigint;
  /** "30d rolling", stated in the units a reader thinks in. */
  text: string;
  days: number;
}

export function windowFor(chainId: SupportedChain, head: bigint, days = 30): TrackWindow {
  const blocks = BigInt(Math.round((days * 86_400) / BLOCK_SECONDS[chainId]));
  const fromBlock = head > blocks ? head - blocks : 0n;
  return { fromBlock, toBlock: head, text: `${days}d rolling`, days };
}

export interface TrackResult {
  measurements: Measurement[];
  /** Metrics we could not compute, each with the reason. Rendered, not dropped. */
  missing: { key: string; label: string; reason: string }[];
}

/**
 * The entry point. Dispatches on the job, because the whole point is that the
 * four are measured differently.
 */
export async function readTrack(
  chainId: SupportedChain,
  wallet: Address,
  job: JobSlug,
  opts: { days?: number } = {},
): Promise<TrackResult> {
  const client = chainClient(chainId);
  const head = await client.getBlockNumber();
  const w = windowFor(chainId, head, opts.days ?? 30);

  switch (job) {
    case "rebalancing":
      return rebalancingTrack(chainId, client, wallet, w);
    case "grid":
      return gridTrack(chainId, wallet, w);
    case "yield":
      return yieldTrack(chainId, client, wallet, w);
    case "health":
      return healthTrack(chainId, client, wallet, w);
  }
}

// ---------------------------------------------------------------------------
// Rebalancing — time in range, IL + gas, fees against holding
// ---------------------------------------------------------------------------

/**
 * Time in range is measured against the positions the wallet actually holds.
 *
 * For each V3 position, we read the pool's current tick and the position's
 * band. A position whose band contains the tick is earning; one whose band
 * does not is not. Sampling the *current* state gives a point reading rather
 * than a share of the window, and saying so matters: this is `at this block`,
 * not `30d rolling`, and it is labelled that way rather than dressed up as a
 * history we did not reconstruct.
 */
async function rebalancingTrack(
  chainId: SupportedChain,
  client: PublicClient,
  wallet: Address,
  w: TrackWindow,
): Promise<TrackResult> {
  const measurements: Measurement[] = [];
  const missing: TrackResult["missing"] = [];

  const count = await client
    .readContract({
      address: VENUES.pancakeV3PositionManager as Address,
      abi: V3_POSITIONS_ABI,
      functionName: "balanceOf",
      args: [wallet],
      blockNumber: w.toBlock,
    })
    .catch(() => null);

  if (count === null) {
    missing.push({
      key: "time-in-range",
      label: "Time in range",
      reason: "The position manager could not be read for this wallet at this block.",
    });
    return { measurements, missing };
  }

  const n = Number(count as bigint);
  if (n === 0) {
    missing.push({
      key: "time-in-range",
      label: "Time in range",
      reason: "This wallet holds no PancakeSwap V3 position, so there is no range to measure.",
    });
    missing.push({
      key: "fees-vs-hold",
      label: "Fees vs holding",
      reason: "No position, so no fees to compare against holding.",
    });
    return { measurements, missing };
  }

  const ids = await Promise.all(
    Array.from({ length: Math.min(n, 20) }, (_, i) =>
      client
        .readContract({
          address: VENUES.pancakeV3PositionManager as Address,
          abi: V3_POSITIONS_ABI,
          functionName: "tokenOfOwnerByIndex",
          args: [wallet, BigInt(i)],
          blockNumber: w.toBlock,
        })
        .catch(() => null),
    ),
  );

  let live = 0;
  let inRange = 0;
  let owedFees = 0n;

  for (const id of ids) {
    if (id === null) continue;
    const pos = await client
      .readContract({
        address: VENUES.pancakeV3PositionManager as Address,
        abi: V3_POSITIONS_ABI,
        functionName: "positions",
        args: [id as bigint],
        blockNumber: w.toBlock,
      })
      .catch(() => null);
    if (!pos) continue;
    const [, , token0, token1, fee, tickLower, tickUpper, liquidity, , , owed0, owed1] = pos as unknown as [
      bigint, Address, Address, Address, number, number, number, bigint, bigint, bigint, bigint, bigint,
    ];
    if (liquidity === 0n) continue;
    live++;
    owedFees += owed0 + owed1;

    const pool = await poolFor(client, token0, token1, fee, w.toBlock);
    if (!pool) continue;
    const slot0 = await client
      .readContract({ address: pool, abi: V3_POOL_ABI, functionName: "slot0", blockNumber: w.toBlock })
      .catch(() => null);
    if (!slot0) continue;
    const tick = Number((slot0 as unknown as [bigint, number])[1]);
    if (tick >= tickLower && tick < tickUpper) inRange++;
  }

  if (live === 0) {
    missing.push({
      key: "time-in-range",
      label: "Time in range",
      reason: "Every position this wallet holds has zero liquidity, so none of them is earning or can be.",
    });
  } else {
    measurements.push(
      measure({
        name: "In range now",
        value: (inRange / live) * 100,
        unit: "%",
        numerator: inRange,
        denominator: live,
        window: "at this block",
        block: w.toBlock,
        method: "time-in-range",
        source: "chain",
        chainId,
      }),
    );
  }

  /*
    Recentres are counted from the position manager's own events over the
    window. It is the closest thing to "did this agent actually do the job"
    that a stranger's wallet will yield.
  */
  const walletTopic = pad(wallet.toLowerCase() as Hex, { size: 32 });
  const recentres = await scanLogs(chainId, {
    address: VENUES.pancakeV3PositionManager as Address,
    topics: topics(null, walletTopic),
    fromBlock: w.fromBlock,
    toBlock: w.toBlock,
  });

  if (recentres.complete) {
    measurements.push(
      measure({
        name: "Position actions",
        value: recentres.logs.length,
        unit: "count",
        window: w.text,
        block: w.toBlock,
        method: "position-actions",
        source: "chain",
        chainId,
      }),
    );
  } else {
    missing.push({
      key: "il-plus-gas",
      label: "IL + gas",
      reason: "The log scan over this window could not complete, so the recentres it performed are unknown rather than none.",
    });
  }

  missing.push({
    key: "fees-vs-hold",
    label: "Fees vs holding",
    reason:
      "Comparing fees against an un-pooled hold needs the position's opening composition, which is only known for a position opened through this marketplace.",
  });

  return { measurements, missing };
}

async function poolFor(
  client: PublicClient,
  token0: Address,
  token1: Address,
  fee: number,
  block: bigint,
): Promise<Address | null> {
  const { V3_FACTORY_ABI } = await import("@bench/shared");
  try {
    const p = await client.readContract({
      address: VENUES.pancakeV3Factory as Address,
      abi: V3_FACTORY_ABI,
      functionName: "getPool",
      args: [token0, token1, fee],
      blockNumber: block,
    });
    const addr = p as Address;
    return /^0x0+$/.test(addr) ? null : addr;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Grid — fills, and what they mean
// ---------------------------------------------------------------------------

/**
 * Fills are counted from the pool's `Swap` naming the wallet as recipient.
 *
 * Not from the router. PancakeSwap's V3 and V2 routers emit no events of their
 * own — measured over 3,000 blocks of live BSC, exactly zero — because they
 * are pass-through contracts and the `Swap` comes from the pool. A fill count
 * that scans the router finds nothing however much an agent trades.
 */
async function gridTrack(chainId: SupportedChain, wallet: Address, w: TrackWindow): Promise<TrackResult> {
  const measurements: Measurement[] = [];
  const missing: TrackResult["missing"] = [];
  const walletTopic = pad(wallet.toLowerCase() as Hex, { size: 32 });

  const [v3, v2] = await Promise.all([
    scanLogs(chainId, { topics: topics(TOPIC.v3Swap, null, walletTopic), fromBlock: w.fromBlock, toBlock: w.toBlock }),
    scanLogs(chainId, { topics: topics(TOPIC.v2Swap, null, walletTopic), fromBlock: w.fromBlock, toBlock: w.toBlock }),
  ]);

  if (!v3.complete || !v2.complete) {
    missing.push({
      key: "fills",
      label: "Fills",
      reason: "The swap scan over this window could not complete, so the fill count is unknown rather than zero.",
    });
  } else {
    const fills = v3.logs.length + v2.logs.length;
    measurements.push(
      measure({
        name: "Fills",
        value: fills,
        unit: "count",
        window: w.text,
        block: w.toBlock,
        method: "fills",
        source: "chain",
        chainId,
      }),
    );
    /*
      Trading days is a cheap, real second signal: a grid that filled forty
      times in one hour and never again is a different thing from one filling
      steadily, and the block numbers alone tell you which.
    */
    const blocks = [...v3.logs, ...v2.logs].map((l) => Number(l.blockNumber ?? 0n)).filter((b) => b > 0);
    if (blocks.length > 1) {
      const span = Math.max(...blocks) - Math.min(...blocks);
      measurements.push(
        measure({
          name: "Active span",
          value: (span * BLOCK_SECONDS[chainId]) / 86_400,
          unit: "days",
          window: w.text,
          block: w.toBlock,
          method: "active-span",
          source: "chain",
          chainId,
        }),
      );
    }
  }

  missing.push({
    key: "realized-pnl",
    label: "Realized PnL",
    reason:
      "Realized profit needs the band the grid was given and the inventory it started with. For an agent hired through this marketplace both are known; for a stranger's own wallet neither is.",
  });
  missing.push({
    key: "inventory-skew",
    label: "Inventory skew",
    reason: "Skew is measured against the balance the grid was told to hold, which only a hire through this marketplace establishes.",
  });

  return { measurements, missing };
}

// ---------------------------------------------------------------------------
// Yield — what it is actually earning
// ---------------------------------------------------------------------------

async function yieldTrack(
  chainId: SupportedChain,
  client: PublicClient,
  wallet: Address,
  w: TrackWindow,
): Promise<TrackResult> {
  const measurements: Measurement[] = [];
  const missing: TrackResult["missing"] = [];

  const assets = await client
    .readContract({
      address: VENUES.venusComptroller as Address,
      abi: VENUS_COMPTROLLER_ABI,
      functionName: "getAssetsIn",
      args: [wallet],
      blockNumber: w.toBlock,
    })
    .catch(() => null);

  if (assets === null) {
    missing.push({
      key: "net-apy-captured",
      label: "Net APY captured",
      reason: "The Venus comptroller could not be read for this wallet at this block.",
    });
  } else {
    const markets = assets as Address[];
    measurements.push(
      measure({
        name: "Venus markets entered",
        value: markets.length,
        unit: "count",
        window: "at this block",
        block: w.toBlock,
        method: "venus-markets",
        source: "chain",
        chainId,
      }),
    );

    /*
      The supply rate it is actually sitting in, per block, annualised. This is
      the rate captured; the rate available is a market-wide comparison the
      worker computes separately, and until it has, the comparison is missing
      rather than assumed.
    */
    if (markets.length > 0) {
      const rates = await Promise.all(
        markets.slice(0, 6).map((m) =>
          client
            .readContract({ address: m, abi: VTOKEN_ABI, functionName: "supplyRatePerBlock", blockNumber: w.toBlock })
            .catch(() => null),
        ),
      );
      const got = rates.filter((r): r is bigint => typeof r === "bigint");
      if (got.length > 0) {
        const blocksPerYear = 31_536_000 / BLOCK_SECONDS[chainId];
        const best = got.reduce((a, b) => (a > b ? a : b));
        const apy = (Number(best) / 1e18) * blocksPerYear * 100;
        measurements.push(
          measure({
            name: "Best rate held",
            value: apy,
            unit: "%",
            window: "at this block",
            block: w.toBlock,
            method: "venus-supply-rate",
            source: "chain",
            chainId,
          }),
        );
      }
    }
  }

  const walletTopic = pad(wallet.toLowerCase() as Hex, { size: 32 });
  const moves = await scanLogs(chainId, {
    address: [VENUES.venusVBNB, VENUES.venusVUSDT, VENUES.pancakeMasterChefV3] as Address[],
    topics: topics(null, walletTopic),
    fromBlock: w.fromBlock,
    toBlock: w.toBlock,
  });
  if (moves.complete) {
    measurements.push(
      measure({
        name: "Rotations",
        value: moves.logs.length,
        unit: "count",
        window: w.text,
        block: w.toBlock,
        method: "moves",
        source: "chain",
        chainId,
      }),
    );
  } else {
    missing.push({ key: "moves", label: "Moves", reason: "The log scan could not complete over this window." });
  }

  missing.push({
    key: "payback-days",
    label: "Switching payback",
    reason:
      "Payback compares the gas a rotation cost against the extra yield it bought, which needs the position size the rotation moved. Known for a hire through this marketplace; not for a stranger's wallet.",
  });

  return { measurements, missing };
}

// ---------------------------------------------------------------------------
// Health factor — the one metric a stranger's wallet answers honestly
// ---------------------------------------------------------------------------

/**
 * Venus reports liquidity and shortfall rather than a health factor directly.
 *
 * A wallet with shortfall greater than zero is liquidatable right now. A
 * wallet with liquidity and no borrows has no health factor at all, and that
 * is reported as "no debt" rather than as an infinitely safe one — the two
 * look identical in a number and are completely different facts.
 */
async function healthTrack(
  chainId: SupportedChain,
  client: PublicClient,
  wallet: Address,
  w: TrackWindow,
): Promise<TrackResult> {
  const measurements: Measurement[] = [];
  const missing: TrackResult["missing"] = [];

  const liq = await client
    .readContract({
      address: VENUES.venusComptroller as Address,
      abi: VENUS_COMPTROLLER_ABI,
      functionName: "getAccountLiquidity",
      args: [wallet],
      blockNumber: w.toBlock,
    })
    .catch(() => null);

  if (liq === null) {
    missing.push({
      key: "hf-floor",
      label: "Lowest health factor",
      reason: "The Venus comptroller could not be read for this wallet at this block.",
    });
  } else {
    const [err, liquidity, shortfall] = liq as unknown as [bigint, bigint, bigint];
    if (err !== 0n) {
      missing.push({
        key: "hf-floor",
        label: "Lowest health factor",
        reason: `Venus returned error code ${err} for this account, so its position could not be valued.`,
      });
    } else if (liquidity === 0n && shortfall === 0n) {
      missing.push({
        key: "hf-floor",
        label: "Lowest health factor",
        reason: "This wallet carries no Venus position, so there is no health factor to defend.",
      });
    } else {
      measurements.push(
        measure({
          name: shortfall > 0n ? "Shortfall now" : "Borrowing headroom",
          value: Number((shortfall > 0n ? shortfall : liquidity) / 10n ** 14n) / 10_000,
          unit: "USD",
          window: "at this block",
          block: w.toBlock,
          method: "venus-account-liquidity",
          source: "chain",
          chainId,
        }),
      );
    }
  }

  const walletTopic = pad(wallet.toLowerCase() as Hex, { size: 32 });
  const repairs = await scanLogs(chainId, {
    address: [VENUES.venusVBNB, VENUES.venusVUSDT] as Address[],
    topics: topics(null, walletTopic),
    fromBlock: w.fromBlock,
    toBlock: w.toBlock,
  });
  if (repairs.complete) {
    measurements.push(
      measure({
        name: "Venus actions",
        value: repairs.logs.length,
        unit: "count",
        window: w.text,
        block: w.toBlock,
        method: "repairs",
        source: "chain",
        chainId,
      }),
    );
  } else {
    missing.push({ key: "repairs", label: "Repairs", reason: "The log scan could not complete over this window." });
  }

  missing.push({
    key: "repair-latency",
    label: "Repair latency",
    reason:
      "Latency is the gap between the health factor crossing the agent's own threshold and its repair landing. It needs the threshold the agent was given, which a hire through this marketplace establishes and a stranger's wallet does not.",
  });

  return { measurements, missing };
}

/** Convenience for the board: the headline measurement for a job, or nothing. */
export function headline(track: Measurement[], job: JobSlug): Maybe<Measurement> {
  const first = track[0];
  return first ? known(first) : unknown(`Nothing measurable on chain for this ${job} agent yet.`);
}

export { MASTERCHEF_V3_ABI };
