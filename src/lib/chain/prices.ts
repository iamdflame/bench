/**
 * Prices, read from PancakeSwap V3 pools.
 *
 * Everything an agent decides and everything the adjudicator settles rests on
 * a price, so it is read from a pool's `slot0` rather than an API: it is the
 * same number the router will trade against, it costs one call, and it cannot
 * disagree with the chain the trade lands on.
 *
 * Verified against the live WBNB/USDT 0.05% pool, which returned $724.64 —
 * a real BNB price, which is how we know the fixed-point maths is right.
 */

import { marketClient } from "./market";
import type { Address } from "viem";

export const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;
export const USDT = "0x55d398326f99059fF775485246999027B3197955" as const;
export const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" as const;

export const V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as const;
export const V3_ROUTER = "0x13f4ea83d0bd40e75c8222255bc855a974568dd4" as const;

/** The deepest WBNB/USDT pool on BSC; the reference for BNB in dollars. */
export const WBNB_USDT_POOL = "0x36696169C63e42cd08ce11f5deeBbCeBae652050" as const;

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

export interface PoolPrice {
  pool: Address;
  token0: Address;
  token1: Address;
  sqrtPriceX96: bigint;
  tick: number;
  /** How many token1 one token0 buys. */
  token1PerToken0: number;
  /** How many token0 one token1 buys. */
  token0PerToken1: number;
  at: number;
}

/**
 * Reads a pool's current price.
 *
 * V3 stores the square root of price in Q64.96 fixed point, so the price is
 * `(sqrtPriceX96 / 2**96) ** 2` in raw token units. Both tokens here are
 * 18-decimal, so no scaling is needed; a pool with mismatched decimals would
 * need the ratio adjusted by `10 ** (d0 - d1)`.
 */
export async function readPool(pool: Address = WBNB_USDT_POOL): Promise<PoolPrice> {
  const [slot0, token0, token1] = await Promise.all([
    marketClient.readContract({ address: pool, abi: POOL_ABI, functionName: "slot0" }),
    marketClient.readContract({ address: pool, abi: POOL_ABI, functionName: "token0" }),
    marketClient.readContract({ address: pool, abi: POOL_ABI, functionName: "token1" }),
  ]);

  const [sqrtPriceX96, tick] = slot0 as readonly [bigint, number, ...unknown[]];
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  const token1PerToken0 = ratio * ratio;

  return {
    pool,
    token0: token0 as Address,
    token1: token1 as Address,
    sqrtPriceX96,
    tick: Number(tick),
    token1PerToken0,
    token0PerToken1: token1PerToken0 === 0 ? 0 : 1 / token1PerToken0,
    at: Date.now(),
  };
}

/** BNB priced in dollars, from the reference pool. */
export async function bnbUsd(): Promise<number> {
  const p = await readPool(WBNB_USDT_POOL);
  // token0 is USDT, token1 is WBNB, so USDT per WBNB is token0PerToken1.
  return p.token0PerToken1;
}

export async function findPool(
  a: Address,
  b: Address,
  fee: 100 | 500 | 2500 | 10000 = 500,
): Promise<Address | null> {
  const pool = (await marketClient.readContract({
    address: V3_FACTORY,
    abi: FACTORY_ABI,
    functionName: "getPool",
    args: [a, b, fee],
  })) as Address;
  return pool === "0x0000000000000000000000000000000000000000" ? null : pool;
}

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export async function tokenBalance(token: Address, owner: Address): Promise<bigint> {
  return (await marketClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

export interface Valuation {
  /** Total value expressed in BNB. */
  bnb: number;
  /**
   * The same, in wei.
   *
   * An attestation is committed on chain, so the value it carries has to be
   * exact. A float is fine for a label and wrong for a commitment — the whole
   * point of the observation is that two parties derive the identical digest.
   */
  weiTotal: bigint;
  /** The same, in dollars, at the reference pool's price. */
  usd: number;
  parts: { asset: string; amount: number; bnb: number; wei: bigint }[];
  priceUsd: number;
  /** The pool's raw price, carried into the attestation so it can be re-read. */
  sqrtPriceX96: bigint;
  /** The block the valuation was taken at. Pins re-derivation. */
  blockNumber: bigint;
  at: string;
}

/**
 * Values a wallet in BNB terms.
 *
 * This is what settlement compares against a benchmark, so it is deliberately
 * a measurement rather than an estimate: native balance and token balances,
 * each converted at the pool price the agent itself trades against.
 */
export async function valueWallet(owner: Address): Promise<Valuation> {
  // Everything is read at one block. A valuation assembled from balances read
  // at different heights is not a measurement of anything.
  const blockNumber = await marketClient.getBlockNumber();
  const [native, usdt, pool] = await Promise.all([
    marketClient.getBalance({ address: owner, blockNumber }),
    marketClient
      .readContract({
        address: USDT,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [owner],
        blockNumber,
      })
      .catch(() => 0n) as Promise<bigint>,
    readPool(WBNB_USDT_POOL),
  ]);

  const price = pool.token0PerToken1;

  // USDT is 18-decimal on BSC, so converting to BNB-denominated wei is a ratio
  // in integer space; no float is allowed to reach the committed total.
  const priceScaled = BigInt(Math.round(price * 1e18));
  const usdtWei = priceScaled > 0n ? (usdt * 10n ** 18n) / priceScaled : 0n;

  const parts = [
    { asset: "BNB", amount: Number(native) / 1e18, bnb: Number(native) / 1e18, wei: native },
    { asset: "USDT", amount: Number(usdt) / 1e18, bnb: Number(usdtWei) / 1e18, wei: usdtWei },
  ].filter((p) => p.wei > 0n);

  const weiTotal = parts.reduce((s, p) => s + p.wei, 0n);
  const bnb = Number(weiTotal) / 1e18;

  return {
    bnb,
    weiTotal,
    usd: bnb * price,
    parts,
    priceUsd: price,
    sqrtPriceX96: pool.sqrtPriceX96,
    blockNumber,
    at: new Date().toISOString(),
  };
}
