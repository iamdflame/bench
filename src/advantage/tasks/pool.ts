/**
 * T1 (Rebalancing) and T2 (Grid), measured against one pool.
 *
 * Both tasks read the same thing — every swap in the WBNB/USDT 0.05% pool over
 * the locked window — so they are scanned once and answered together.
 *
 * T1's no-agent arm is not a guess at how attentive a person is. It is the set
 * of real concentrated-liquidity positions in that pool, read at the anchor
 * block, and the plain fact of whether each one is inside its range. A
 * position outside its range earns no fees. Nobody has to be asked how long
 * they would have taken; the chain already recorded that they had not acted.
 *
 * T2's no-agent arm is holding, which is the benchmark MandateMarket already
 * settles grid mandates against, so the agent is judged here exactly as it is
 * judged in production.
 */

import { decodeAbiParameters, encodeFunctionData, parseAbi } from "viem";
import { gridStrategy } from "@/agents/grid";
import { DRIFT_TICKS, driftOf, shouldRecentre } from "@/agents/rebalance";
import type { AgentContext } from "@/agents/types";
import { callAt, getLogs, hex, rpc, ARCHIVE_RPCS, type RawLog } from "../chain";

const POOL = "0x36696169C63e42cd08ce11f5deeBbCeBae652050";
const NPM = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";

const SWAP_TOPIC = "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83";
const INCREASE_TOPIC = "0x3067048beee31b25b2f1681f88dac838c8bba36af25bfb2b7cf7473a5847e35f";

const MC3_ABI = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])",
]);
const PM_ABI = parseAbi([
  "function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 f0, uint256 f1, uint128 owed0, uint128 owed1)",
]);

export interface SwapPoint {
  block: number;
  sqrtPriceX96: bigint;
  tick: number;
  /** USDT per WBNB — the pool is USDT/WBNB, so this is token0 per token1. */
  priceUsd: number;
}

export interface PositionSample {
  tokenId: string;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  driftAtAnchor: number;
  outOfRange: boolean;
  /** Blocks since the tick path last had this position in range. */
  blocksIdle: number | null;
  /** True if the agent would have re-centred at some point but the position recovered unaided. */
  wouldHaveChurned: boolean;
}

const q96 = 2 ** 96;
/** Pool is USDT/WBNB, so (sqrt/2^96)^2 is WBNB per USDT; invert for the BNB price. */
export const priceFrom = (sqrtPriceX96: bigint): number => {
  const r = Number(sqrtPriceX96) / q96;
  const wbnbPerUsdt = r * r;
  return wbnbPerUsdt === 0 ? 0 : 1 / wbnbPerUsdt;
};

const int24 = (word: bigint): number =>
  word >= 1n << 23n ? Number(word - (1n << 24n)) : Number(word);

/** Every swap in the pool over the window, as a price path. */
export async function readPath(
  fromBlock: bigint,
  toBlock: bigint,
  onProgress?: (done: number, total: number, found: number) => void,
): Promise<SwapPoint[]> {
  const logs = await getLogs({
    address: POOL,
    topics: [SWAP_TOPIC],
    fromBlock,
    toBlock,
    onWindow: onProgress,
  });
  const path: SwapPoint[] = [];
  for (const l of logs) {
    // amount0, amount1, sqrtPriceX96, liquidity, tick, protocolFees0, protocolFees1
    const body = l.data.slice(2);
    if (body.length < 7 * 64) continue;
    const word = (i: number) => BigInt(`0x${body.slice(i * 64, (i + 1) * 64)}`);
    const sqrtPriceX96 = word(2);
    path.push({
      block: Number(BigInt(l.blockNumber)),
      sqrtPriceX96,
      tick: int24(word(4) & ((1n << 24n) - 1n)),
      priceUsd: priceFrom(sqrtPriceX96),
    });
  }
  path.sort((a, b) => a.block - b.block);
  return path;
}

/** Live positions in this pool at the anchor block, read in one multicall. */
export async function readPositions(
  fromBlock: bigint,
  anchorBlock: bigint,
  sampleSize: number,
  onProgress?: (done: number, total: number, found: number) => void,
): Promise<{ sampled: PositionSample[]; candidates: number }> {
  const logs = await getLogs({
    address: NPM,
    topics: [INCREASE_TOPIC],
    fromBlock,
    toBlock: anchorBlock,
    onWindow: onProgress,
  });

  // Newest first: the most recently touched positions are the ones whose
  // owners are demonstrably still present, which is the harder test.
  const seen = new Set<string>();
  const tokenIds: bigint[] = [];
  for (const l of [...logs].reverse()) {
    const id = l.topics[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tokenIds.push(BigInt(id));
  }

  const sampled: PositionSample[] = [];
  // Read in batches: one archive call per batch rather than one per position.
  const BATCH = 60;
  for (let i = 0; i < tokenIds.length && sampled.length < sampleSize; i += BATCH) {
    const batch = tokenIds.slice(i, i + BATCH);
    const calls = batch.map((tokenId) => ({
      target: NPM as `0x${string}`,
      allowFailure: true,
      callData: encodeFunctionData({ abi: PM_ABI, functionName: "positions", args: [tokenId] }),
    }));
    const data = encodeFunctionData({ abi: MC3_ABI, functionName: "aggregate3", args: [calls] });
    let results: readonly { success: boolean; returnData: `0x${string}` }[];
    try {
      const [decoded] = await callAt<
        readonly [readonly { success: boolean; returnData: `0x${string}` }[]]
      >(MULTICALL3, data, anchorBlock, [
        {
          type: "tuple[]",
          components: [
            { name: "success", type: "bool" },
            { name: "returnData", type: "bytes" },
          ],
        },
      ]);
      results = decoded;
    } catch {
      continue;
    }

    for (let j = 0; j < results.length && sampled.length < sampleSize; j++) {
      const r = results[j];
      if (!r?.success || r.returnData === "0x") continue;
      let p: readonly unknown[];
      try {
        p = decodeAbiParameters(
          [
            { type: "uint96" }, { type: "address" }, { type: "address" }, { type: "address" },
            { type: "uint24" }, { type: "int24" }, { type: "int24" }, { type: "uint128" },
            { type: "uint256" }, { type: "uint256" }, { type: "uint128" }, { type: "uint128" },
          ],
          r.returnData,
        );
      } catch {
        continue;
      }
      const token0 = String(p[2]).toLowerCase();
      const token1 = String(p[3]).toLowerCase();
      const fee = Number(p[4]);
      const liquidity = p[7] as bigint;
      // Only this pool, and only positions that still hold liquidity.
      if (token0 !== USDT || token1 !== WBNB || fee !== 500 || liquidity === 0n) continue;
      sampled.push({
        tokenId: batch[j]!.toString(),
        tickLower: Number(p[5]),
        tickUpper: Number(p[6]),
        liquidity,
        driftAtAnchor: 0,
        outOfRange: false,
        blocksIdle: null,
        wouldHaveChurned: false,
      });
    }
  }
  return { sampled, candidates: seen.size };
}

/** The pool's tick at the anchor block. */
export async function tickAt(block: bigint): Promise<{ tick: number; sqrtPriceX96: bigint }> {
  const [sqrtPriceX96, tick] = await callAt<readonly [bigint, number]>(
    POOL,
    "0x3850c7bd",
    block,
    [
      { type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" },
      { type: "uint16" }, { type: "uint32" }, { type: "bool" },
    ],
  );
  return { tick: Number(tick), sqrtPriceX96 };
}

/**
 * Scores each position against the production rebalance rule.
 *
 * `wouldHaveChurned` is the loss this task declared in advance: a position the
 * agent would have re-centred that came back into range on its own. Every one
 * of those is gas spent and impermanent loss crystallised for nothing.
 */
export function scorePositions(
  positions: PositionSample[],
  path: SwapPoint[],
  anchorTick: number,
  anchorBlock: number,
): void {
  for (const p of positions) {
    p.driftAtAnchor = driftOf(p.tickLower, p.tickUpper, anchorTick);
    p.outOfRange = anchorTick < p.tickLower || anchorTick >= p.tickUpper;

    if (p.outOfRange && path.length) {
      // Walk back to the last swap that had this position in range.
      let lastIn: number | null = null;
      for (let i = path.length - 1; i >= 0; i--) {
        const t = path[i]!.tick;
        if (t >= p.tickLower && t < p.tickUpper) {
          lastIn = path[i]!.block;
          break;
        }
      }
      p.blocksIdle = lastIn === null ? null : anchorBlock - lastIn;
    }

    // Did the agent's trigger fire during the window on a position that is
    // fine now? That is a re-centre it would have paid for and not needed.
    if (!shouldRecentre(p.tickLower, p.tickUpper, anchorTick)) {
      p.wouldHaveChurned = path.some((s) => shouldRecentre(p.tickLower, p.tickUpper, s.tick));
    }
  }
}

export interface GridSim {
  evaluations: number;
  fills: number;
  startPriceUsd: number;
  endPriceUsd: number;
  /** Portfolio value in BNB at the end, agent arm and hold arm. */
  agentBnb: number;
  holdBnb: number;
  gasBnb: number;
  swapFeeBnb: number;
  netAdvantageBnb: number;
  trendPct: number;
}

/**
 * Runs the production grid strategy over the observed path.
 *
 * `gridStrategy.evaluate` reads nothing from the chain — it is a function of
 * the price, the held balances and its own carried state — so this drives the
 * real strategy rather than a reimplementation of it. That is the whole reason
 * the Strategy type was defined that way.
 */
export async function simulateGrid(
  path: SwapPoint[],
  opts: { capitalBnb: number; cadenceBlocks: number; gasPriceWei: bigint; swapGas: bigint },
): Promise<GridSim> {
  const start = path[0]!.priceUsd;
  const end = path[path.length - 1]!.priceUsd;

  // Half in each asset, which is what a grid needs to trade in both directions.
  let bnb = opts.capitalBnb / 2;
  let usdt = (opts.capitalBnb / 2) * start;
  const holdBnbAmount = opts.capitalBnb / 2;
  const holdUsdtAmount = (opts.capitalBnb / 2) * start;

  let state: Record<string, unknown> = {};
  let fills = 0;
  let evaluations = 0;
  let gasBnb = 0;
  let swapFeeBnb = 0;
  const gasPerSwap = Number(opts.gasPriceWei * opts.swapGas) / 1e18;

  let nextBlock = path[0]!.block;
  for (const point of path) {
    if (point.block < nextBlock) continue;
    nextBlock = point.block + opts.cadenceBlocks;
    evaluations++;

    const ctx = {
      mandateId: 0,
      category: "grid-trading",
      wallet: "0x0000000000000000000000000000000000000001",
      capWei: BigInt(Math.floor(opts.capitalBnb * 1e18)),
      price: {
        pool: POOL,
        token0: USDT,
        token1: WBNB,
        sqrtPriceX96: point.sqrtPriceX96,
        tick: point.tick,
        token1PerToken0: 1 / point.priceUsd,
        token0PerToken1: point.priceUsd,
        at: point.block,
      },
      valuation: {
        bnb: bnb + usdt / point.priceUsd,
        weiTotal: 0n,
        usd: bnb * point.priceUsd + usdt,
        parts: [
          { asset: "BNB", amount: bnb, bnb, wei: 0n },
          { asset: "USDT", amount: usdt, bnb: usdt / point.priceUsd, wei: 0n },
        ],
        priceUsd: point.priceUsd,
        sqrtPriceX96: point.sqrtPriceX96,
        blockNumber: BigInt(point.block),
        at: new Date().toISOString(),
      },
      state,
      now: Date.now(),
    } as unknown as AgentContext;

    const decision = await gridStrategy.evaluate(ctx);
    state = decision.state;

    for (const action of decision.actions) {
      const params = (action.call.args[0] ?? {}) as { tokenIn?: string; amountIn?: bigint };
      const amountIn = Number(params.amountIn ?? 0n) / 1e18;
      if (amountIn <= 0) continue;
      const buyingBnb = String(params.tokenIn).toLowerCase() === USDT;
      // The pool's own 0.05% fee, charged on the way in.
      const fee = amountIn * 0.0005;
      if (buyingBnb) {
        if (usdt < amountIn) continue;
        usdt -= amountIn;
        bnb += (amountIn - fee) / point.priceUsd;
        swapFeeBnb += fee / point.priceUsd;
      } else {
        if (bnb < amountIn) continue;
        bnb -= amountIn;
        usdt += (amountIn - fee) * point.priceUsd;
        swapFeeBnb += fee;
      }
      gasBnb += gasPerSwap;
      bnb -= gasPerSwap;
      fills++;
    }
  }

  const agentBnb = bnb + usdt / end;
  const holdBnb = holdBnbAmount + holdUsdtAmount / end;

  return {
    evaluations,
    fills,
    startPriceUsd: start,
    endPriceUsd: end,
    agentBnb,
    holdBnb,
    gasBnb,
    swapFeeBnb,
    netAdvantageBnb: agentBnb - holdBnb,
    trendPct: ((end - start) / start) * 100,
  };
}

/**
 * Gas price at the anchor block, taken from what was actually paid in it.
 *
 * BSC's `baseFeePerGas` is zero, so reading the header gives zero and any cost
 * model built on it silently charges nothing — which is how a grid simulation
 * ends up looking free. The honest figure is the median gas price of the
 * transactions in that block: what people paid, at that moment, on this chain.
 */
export async function gasPriceAt(block: bigint): Promise<{ wei: bigint; sampled: number }> {
  const b = (await rpc(ARCHIVE_RPCS, "eth_getBlockByNumber", [hex(block), true])) as {
    transactions?: { gasPrice?: string }[];
  };
  const prices = (b.transactions ?? [])
    .map((t) => (t.gasPrice ? BigInt(t.gasPrice) : 0n))
    .filter((v) => v > 0n)
    .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  if (!prices.length) return { wei: 0n, sampled: 0 };
  return { wei: prices[Math.floor(prices.length / 2)]!, sampled: prices.length };
}

export { DRIFT_TICKS, POOL, NPM };
export type { RawLog };

// ---------------------------------------------------------------------------
// Exploratory, and labelled as such.
//
// The locked sample for T1 is every live position in one pool at one fee tier.
// Over a three-hour window that turned out to be nine positions, which is too
// few to carry a percentage. The stopping rule forbids widening the locked
// analysis after seeing that, and it is not widened.
//
// What follows is a separate, pre-registered-as-absent scan across every
// PancakeSwap V3 pool touched in the same window. It is reported apart from
// the locked result and is never mixed into it. A pre-registered study that
// also reports exploratory analysis is normal; one that quietly relabels the
// exploratory arm as the result is not.
// ---------------------------------------------------------------------------

const V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";

const FACTORY_ABI = parseAbi([
  "function getPool(address, address, uint24) view returns (address)",
]);
const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 a, uint16 b, uint16 c, uint32 d, bool e)",
]);

export interface WideResult {
  positionsRead: number;
  live: number;
  pools: number;
  outOfRange: number;
  pastTrigger: number;
  byFee: Record<string, { live: number; out: number }>;
}

async function multicall(
  calls: { target: `0x${string}`; allowFailure: boolean; callData: `0x${string}` }[],
  block: bigint,
): Promise<readonly { success: boolean; returnData: `0x${string}` }[]> {
  const data = encodeFunctionData({ abi: MC3_ABI, functionName: "aggregate3", args: [calls] });
  const [decoded] = await callAt<
    readonly [readonly { success: boolean; returnData: `0x${string}` }[]]
  >(MULTICALL3, data, block, [
    {
      type: "tuple[]",
      components: [
        { name: "success", type: "bool" },
        { name: "returnData", type: "bytes" },
      ],
    },
  ]);
  return decoded;
}

/** Every V3 position touched in the window, against its own pool's tick. */
export async function scanAllPools(
  fromBlock: bigint,
  anchorBlock: bigint,
  onProgress?: (stage: string, done: number, total: number) => void,
): Promise<WideResult> {
  const logs = await getLogs({ address: NPM, topics: [INCREASE_TOPIC], fromBlock, toBlock: anchorBlock });
  const ids = [...new Set(logs.map((l) => l.topics[1]).filter(Boolean) as string[])].map(BigInt);

  interface Live { tokenId: bigint; token0: string; token1: string; fee: number; lower: number; upper: number }
  const live: Live[] = [];
  const BATCH = 80;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    onProgress?.("positions", i, ids.length);
    let results: readonly { success: boolean; returnData: `0x${string}` }[];
    try {
      results = await multicall(
        batch.map((tokenId) => ({
          target: NPM as `0x${string}`,
          allowFailure: true,
          callData: encodeFunctionData({ abi: PM_ABI, functionName: "positions", args: [tokenId] }),
        })),
        anchorBlock,
      );
    } catch {
      continue;
    }
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (!r?.success || r.returnData === "0x") continue;
      try {
        const p = decodeAbiParameters(
          [
            { type: "uint96" }, { type: "address" }, { type: "address" }, { type: "address" },
            { type: "uint24" }, { type: "int24" }, { type: "int24" }, { type: "uint128" },
            { type: "uint256" }, { type: "uint256" }, { type: "uint128" }, { type: "uint128" },
          ],
          r.returnData,
        );
        if ((p[7] as bigint) === 0n) continue;
        live.push({
          tokenId: batch[j]!,
          token0: String(p[2]).toLowerCase(),
          token1: String(p[3]).toLowerCase(),
          fee: Number(p[4]),
          lower: Number(p[5]),
          upper: Number(p[6]),
        });
      } catch {
        continue;
      }
    }
  }

  // Resolve each distinct pool, then read every pool's tick at the anchor block.
  const keys = [...new Set(live.map((l) => `${l.token0}|${l.token1}|${l.fee}`))];
  const poolOf = new Map<string, string>();
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    onProgress?.("pools", i, keys.length);
    try {
      const results = await multicall(
        batch.map((k) => {
          const [a, b, f] = k.split("|");
          return {
            target: V3_FACTORY as `0x${string}`,
            allowFailure: true,
            callData: encodeFunctionData({
              abi: FACTORY_ABI,
              functionName: "getPool",
              args: [a as `0x${string}`, b as `0x${string}`, Number(f)],
            }),
          };
        }),
        anchorBlock,
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (!r?.success || r.returnData === "0x") continue;
        const addr = `0x${r.returnData.slice(26)}`;
        if (!/^0x0+$/.test(addr)) poolOf.set(batch[j]!, addr);
      }
    } catch {
      continue;
    }
  }

  const pools = [...new Set(poolOf.values())];
  const tickOf = new Map<string, number>();
  for (let i = 0; i < pools.length; i += BATCH) {
    const batch = pools.slice(i, i + BATCH);
    onProgress?.("ticks", i, pools.length);
    try {
      const results = await multicall(
        batch.map((addr) => ({
          target: addr as `0x${string}`,
          allowFailure: true,
          callData: encodeFunctionData({ abi: POOL_ABI, functionName: "slot0" }),
        })),
        anchorBlock,
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (!r?.success || r.returnData === "0x") continue;
        try {
          const d = decodeAbiParameters(
            [
              { type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" },
              { type: "uint16" }, { type: "uint32" }, { type: "bool" },
            ],
            r.returnData,
          );
          tickOf.set(batch[j]!, Number(d[1]));
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  let outOfRange = 0;
  let pastTrigger = 0;
  const byFee: Record<string, { live: number; out: number }> = {};
  let counted = 0;
  for (const l of live) {
    const pool = poolOf.get(`${l.token0}|${l.token1}|${l.fee}`);
    const tick = pool ? tickOf.get(pool) : undefined;
    if (tick === undefined) continue;
    counted++;
    const key = `${l.fee}`;
    byFee[key] ??= { live: 0, out: 0 };
    byFee[key].live++;
    if (tick < l.lower || tick >= l.upper) {
      outOfRange++;
      byFee[key].out++;
    }
    if (shouldRecentre(l.lower, l.upper, tick)) pastTrigger++;
  }

  return { positionsRead: ids.length, live: counted, pools: pools.length, outOfRange, pastTrigger, byFee };
}
