import type { Address, PublicClient } from "viem";
import { getSqrtRatioAtTick } from "./tickmath";
import type { PriceSource } from "./types";

export const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;
export const USDT = "0x55d398326f99059fF775485246999027B3197955" as const;
export const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" as const;
export const BTCB = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c" as const;
export const CAKE = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82" as const;
export const V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as const;

/**
 * The window a settlement price is averaged over.
 *
 * Thirty minutes is long enough that moving it requires holding a pool away
 * from its true price for the whole window — which costs far more than any
 * bond on this market is worth — and short enough that a settlement still
 * reflects the epoch it is settling.
 */
export const TWAP_WINDOW_SECONDS = 1800;

/**
 * How far spot may sit from the average before a settlement refuses.
 *
 * Two hundred basis points. Inside that, the difference is ordinary drift.
 * Outside it, something is holding the pool, and the honest response is to
 * settle nothing rather than to settle a number somebody chose.
 */
export const MAX_DEVIATION_BPS = 200n;

const POOL_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint32" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "observe",
    stateMutability: "view",
    inputs: [{ name: "secondsAgos", type: "uint32[]" }],
    outputs: [
      { name: "tickCumulatives", type: "int56[]" },
      { name: "secondsPerLiquidityCumulativeX128", type: "uint160[]" },
    ],
  },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
] as const;

const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";
const Q96 = 2n ** 96n;

/** Fee tiers to try, deepest-first for the pairs this market touches. */
const FEE_TIERS = [500, 2500, 100, 10000] as const;

/**
 * Decimals are read, never assumed.
 *
 * USDC is 18 on BSC and 6 on most other chains; BTCB is 18 where WBTC is 8.
 * A hardcoded 18 is right often enough to pass a demo and wrong often enough
 * to misprice a wallet by twelve orders of magnitude.
 */
const decimalsCache = new Map<string, number>();

export async function decimalsOf(
  client: PublicClient,
  token: Address,
): Promise<number | null> {
  const key = token.toLowerCase();
  const hit = decimalsCache.get(key);
  if (hit !== undefined) return hit;
  try {
    const d = Number(
      await client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }),
    );
    if (!Number.isInteger(d) || d < 0 || d > 36) return null;
    decimalsCache.set(key, d);
    return d;
  } catch {
    return null;
  }
}

export interface PoolReading {
  pool: Address;
  token0: Address;
  token1: Address;
  /** Spot, from slot0. What the router trades against. */
  spotSqrtX96: bigint;
  /** Time-weighted average over the window. Null when the pool has no history. */
  twapSqrtX96: bigint | null;
  deviationBps: bigint | null;
}

const poolCache = new Map<string, Address | null>();

async function findPool(
  client: PublicClient,
  a: Address,
  b: Address,
): Promise<Address | null> {
  const key = [a.toLowerCase(), b.toLowerCase()].sort().join(":");
  const hit = poolCache.get(key);
  if (hit !== undefined) return hit;
  for (const fee of FEE_TIERS) {
    try {
      const pool = (await client.readContract({
        address: V3_FACTORY,
        abi: FACTORY_ABI,
        functionName: "getPool",
        args: [a, b, fee],
      })) as Address;
      if (pool && pool !== ZERO) {
        poolCache.set(key, pool);
        return pool;
      }
    } catch {
      continue;
    }
  }
  poolCache.set(key, null);
  return null;
}

/**
 * Reads a pool both ways at one block.
 *
 * Spot and average together, because the difference between them is the
 * measurement that decides whether a settlement is safe to make.
 */
export async function readPoolBoth(
  client: PublicClient,
  pool: Address,
  blockNumber: bigint,
): Promise<PoolReading | null> {
  try {
    const [slot0, token0, token1] = await Promise.all([
      client.readContract({ address: pool, abi: POOL_ABI, functionName: "slot0", blockNumber }),
      client.readContract({ address: pool, abi: POOL_ABI, functionName: "token0", blockNumber }),
      client.readContract({ address: pool, abi: POOL_ABI, functionName: "token1", blockNumber }),
    ]);
    const spotSqrtX96 = (slot0 as readonly [bigint, ...unknown[]])[0];

    let twapSqrtX96: bigint | null = null;
    try {
      // `observe` reverts with OLD when the window predates the oldest
      // observation. That revert is the honest answer and is allowed to
      // propagate into a null rather than being smoothed into spot.
      const [cumulatives] = (await client.readContract({
        address: pool,
        abi: POOL_ABI,
        functionName: "observe",
        args: [[TWAP_WINDOW_SECONDS, 0]],
        blockNumber,
      })) as readonly [readonly bigint[], readonly bigint[]];

      const delta = cumulatives[1]! - cumulatives[0]!;
      const window = BigInt(TWAP_WINDOW_SECONDS);
      // Solidity's reference rounds toward negative infinity here; matching it
      // keeps our tick identical to one derived on chain.
      let tick = delta / window;
      if (delta < 0n && delta % window !== 0n) tick -= 1n;
      twapSqrtX96 = getSqrtRatioAtTick(Number(tick));
    } catch {
      twapSqrtX96 = null;
    }

    const deviationBps =
      twapSqrtX96 === null || twapSqrtX96 === 0n
        ? null
        : // Compared on price, not on sqrt(price): a 1% move in price is a
          // 0.5% move in its square root, and guarding the wrong one halves
          // the threshold silently.
          bpsBetween(
            (spotSqrtX96 * spotSqrtX96) >> 96n,
            (twapSqrtX96 * twapSqrtX96) >> 96n,
          );

    return {
      pool,
      token0: token0 as Address,
      token1: token1 as Address,
      spotSqrtX96,
      twapSqrtX96,
      deviationBps,
    };
  } catch {
    return null;
  }
}

const abs = (v: bigint) => (v < 0n ? -v : v);

export function bpsBetween(a: bigint, b: bigint): bigint {
  if (b === 0n) return 0n;
  return (abs(a - b) * 10_000n) / b;
}

/**
 * Prices every token this market touches, in BNB wei, at one block.
 *
 * `kind` decides which reading is used and is not a preference: settlement
 * takes the average and refuses when spot has been pushed away from it,
 * execution takes spot because that is what the trade will actually get.
 */
export async function priceSource(
  client: PublicClient,
  blockNumber: bigint,
  kind: "execution" | "settlement",
): Promise<PriceSource & { deviations: Map<string, bigint> }> {
  const cache = new Map<string, bigint | null>();
  const deviations = new Map<string, bigint>();

  const bnbWeiPerUnit = async (token: Address): Promise<bigint | null> => {
    const key = token.toLowerCase();
    if (key === WBNB.toLowerCase()) return 10n ** 18n;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;

    const decimals = await decimalsOf(client, token);
    if (decimals === null) {
      cache.set(key, null);
      return null;
    }

    const pool = await findPool(client, token, WBNB);
    if (!pool) {
      cache.set(key, null);
      return null;
    }
    const reading = await readPoolBoth(client, pool, blockNumber);
    if (!reading) {
      cache.set(key, null);
      return null;
    }

    let sqrt: bigint;
    if (kind === "settlement") {
      if (reading.twapSqrtX96 === null) {
        // No usable window. A settlement price that quietly falls back to spot
        // is the manipulation vector this function exists to close.
        cache.set(key, null);
        return null;
      }
      sqrt = reading.twapSqrtX96;
      if (reading.deviationBps !== null) deviations.set(key, reading.deviationBps);
    } else {
      sqrt = reading.spotSqrtX96;
    }

    // price = (sqrt / 2^96)^2 as token1 per token0, in raw units. Rearranged
    // into integer space, then adjusted for the two tokens' decimals so the
    // result is BNB wei for one whole unit of `token`.
    const priceX192 = sqrt * sqrt;
    const tokenIsToken0 = reading.token0.toLowerCase() === key;
    const unit = 10n ** BigInt(decimals);

    const value = tokenIsToken0
      ? (unit * priceX192) / (Q96 * Q96)
      : priceX192 === 0n
        ? 0n
        : (unit * Q96 * Q96) / priceX192;

    cache.set(key, value);
    return value;
  };

  return { block: blockNumber, kind, bnbWeiPerUnit, deviations };
}

export { ERC20_ABI, POOL_ABI, FACTORY_ABI, ZERO, Q96 };
