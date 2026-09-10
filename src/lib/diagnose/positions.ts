/**
 * What is wrong with a position, read straight from the chain.
 *
 * This deliberately does not go through `valueWallet`. That engine refuses the
 * whole valuation if any single adapter cannot read — one unpriceable token,
 * one flaky provider — which is correct when the number will be used to slash
 * a bond, and useless when a stranger pastes an address and wants to know
 * whether their liquidity is earning anything. Here a position we cannot price
 * is still a position we can say is out of range.
 *
 * Reads go through Multicall3 in batches. The per-position path in
 * `valuation/v3.ts` is eight to twelve sequential round trips each, which is
 * fine in a background sweep and will not survive a page request.
 *
 * **The range convention.** Two places in this repository already decide
 * whether a position is in range and they disagree at the upper bound:
 * `src/agents/rebalance.ts` treats `tick === tickUpper` as in range, and
 * `src/advantage/tasks/pool.ts` treats it as out. Uniswap V3 ticks are
 * half-open, `[tickLower, tickUpper)`: at `tickUpper` the position holds only
 * token0 and earns no fees. This module follows the pool convention, and the
 * page says so, because a boundary case a reader cannot see the rule for is
 * worse than either answer.
 */

import { createPublicClient, decodeAbiParameters, encodeFunctionData, http, parseAbi, type Address } from "viem";
import { bsc } from "viem/chains";

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
export const POSITION_MANAGER = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364" as const;
export const V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as const;
export const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384" as const;

const MC3 = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])",
]);
const PM = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
  "function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 f0, uint256 f1, uint128 owed0, uint128 owed1)",
  "function ownerOf(uint256) view returns (address)",
]);
const FACTORY = parseAbi([
  "function getPool(address, address, uint24) view returns (address)",
]);
const POOL = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 a, uint16 b, uint16 c, uint32 d, bool e)",
]);
const ERC20 = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const VENUS = parseAbi([
  "function getAccountLiquidity(address) view returns (uint256 errorCode, uint256 liquidity, uint256 shortfall)",
  "function getAssetsIn(address) view returns (address[])",
]);

const RPCS = [
  process.env.MARKET_RPC_URL,
  process.env.BSC_RPC_URL,
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
].filter(Boolean) as string[];

const client = createPublicClient({
  chain: bsc,
  transport: http(RPCS[0], { timeout: 15_000, batch: { wait: 12 } }),
});

interface Call {
  target: Address;
  allowFailure: boolean;
  callData: `0x${string}`;
}

/** One multicall, chunked, so a wallet with forty positions is a few round trips. */
async function aggregate(calls: Call[], chunk = 60) {
  const out: { success: boolean; returnData: `0x${string}` }[] = [];
  for (let i = 0; i < calls.length; i += chunk) {
    const slice = calls.slice(i, i + chunk);
    const res = (await client.readContract({
      address: MULTICALL3,
      abi: MC3,
      functionName: "aggregate3",
      args: [slice],
    })) as readonly { success: boolean; returnData: `0x${string}` }[];
    out.push(...res);
  }
  return out;
}

export interface PositionReading {
  tokenId: string;
  owner: Address | null;
  token0: Address;
  token1: Address;
  symbol0: string | null;
  symbol1: string | null;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  /** Null when the pool could not be read. */
  tick: number | null;
  pool: Address | null;
  /** Null when `tick` is null: unknown is not the same as in range. */
  inRange: boolean | null;
  /** How many ticks outside the range, zero when inside. */
  ticksOut: number;
  /** Liquidity zero means the position is closed, not merely idle. */
  closed: boolean;
}

const decode = <T>(types: readonly unknown[], data: `0x${string}`): T =>
  decodeAbiParameters(types as never, data) as T;

/** Every V3 position id a wallet holds directly. */
export async function positionIdsOf(wallet: Address): Promise<bigint[]> {
  const count = (await client.readContract({
    address: POSITION_MANAGER,
    abi: PM,
    functionName: "balanceOf",
    args: [wallet],
  })) as bigint;
  if (count === 0n) return [];

  const capped = count > 60n ? 60n : count;
  const calls: Call[] = Array.from({ length: Number(capped) }, (_, i) => ({
    target: POSITION_MANAGER,
    allowFailure: true,
    callData: encodeFunctionData({
      abi: PM,
      functionName: "tokenOfOwnerByIndex",
      args: [wallet, BigInt(i)],
    }),
  }));
  const res = await aggregate(calls);
  return res
    .filter((r) => r.success)
    .map((r) => decode<[bigint]>([{ type: "uint256" }], r.returnData)[0]);
}

/** Read a set of positions, resolve their pools, and decide in or out of range. */
export async function readPositions(ids: bigint[]): Promise<PositionReading[]> {
  if (!ids.length) return [];

  const posCalls: Call[] = ids.map((id) => ({
    target: POSITION_MANAGER,
    allowFailure: true,
    callData: encodeFunctionData({ abi: PM, functionName: "positions", args: [id] }),
  }));
  const ownerCalls: Call[] = ids.map((id) => ({
    target: POSITION_MANAGER,
    allowFailure: true,
    callData: encodeFunctionData({ abi: PM, functionName: "ownerOf", args: [id] }),
  }));
  const [posRes, ownerRes] = await Promise.all([aggregate(posCalls), aggregate(ownerCalls)]);

  const POS_TYPES = [
    { type: "uint96" }, { type: "address" }, { type: "address" }, { type: "address" },
    { type: "uint24" }, { type: "int24" }, { type: "int24" }, { type: "uint128" },
    { type: "uint256" }, { type: "uint256" }, { type: "uint128" }, { type: "uint128" },
  ] as const;

  const partial = ids.map((id, i) => {
    const r = posRes[i];
    if (!r?.success) return null;
    const d = decode<
      [bigint, Address, Address, Address, number, number, number, bigint, bigint, bigint, bigint, bigint]
    >(POS_TYPES, r.returnData);
    const o = ownerRes[i];
    return {
      tokenId: id.toString(),
      owner: o?.success ? decode<[Address]>([{ type: "address" }], o.returnData)[0] : null,
      token0: d[2],
      token1: d[3],
      fee: Number(d[4]),
      tickLower: Number(d[5]),
      tickUpper: Number(d[6]),
      liquidity: d[7],
    };
  });

  const live = partial.filter(Boolean) as NonNullable<(typeof partial)[number]>[];
  if (!live.length) return [];

  // Resolve each distinct pair to its pool, then read every pool's tick.
  const poolCalls: Call[] = live.map((p) => ({
    target: V3_FACTORY,
    allowFailure: true,
    callData: encodeFunctionData({
      abi: FACTORY,
      functionName: "getPool",
      args: [p.token0, p.token1, p.fee],
    }),
  }));
  const poolRes = await aggregate(poolCalls);
  const pools = poolRes.map((r) =>
    r.success ? decode<[Address]>([{ type: "address" }], r.returnData)[0] : null,
  );

  const slotCalls: Call[] = pools.map((pool) => ({
    target: (pool ?? MULTICALL3) as Address,
    allowFailure: true,
    callData: encodeFunctionData({ abi: POOL, functionName: "slot0" }),
  }));
  const symbolCalls: Call[] = live.flatMap((p) => [
    { target: p.token0, allowFailure: true, callData: encodeFunctionData({ abi: ERC20, functionName: "symbol" }) },
    { target: p.token1, allowFailure: true, callData: encodeFunctionData({ abi: ERC20, functionName: "symbol" }) },
  ]);
  const [slotRes, symRes] = await Promise.all([aggregate(slotCalls), aggregate(symbolCalls)]);

  const SLOT_TYPES = [
    { type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" },
    { type: "uint16" }, { type: "uint32" }, { type: "bool" },
  ] as const;

  const sym = (i: number): string | null => {
    const r = symRes[i];
    if (!r?.success) return null;
    try {
      return decode<[string]>([{ type: "string" }], r.returnData)[0];
    } catch {
      return null;
    }
  };

  return live.map((p, i) => {
    const pool = pools[i] ?? null;
    const zero = pool && /^0x0+$/.test(pool);
    const s = slotRes[i];
    let tick: number | null = null;
    if (!zero && s?.success) {
      try {
        tick = Number(decode<[bigint, number, number, number, number, number, boolean]>(SLOT_TYPES, s.returnData)[1]);
      } catch {
        tick = null;
      }
    }
    // Half-open range: at tickUpper the position is out.
    const inRange = tick === null ? null : tick >= p.tickLower && tick < p.tickUpper;
    const ticksOut =
      tick === null || inRange ? 0 : Math.max(p.tickLower - tick, tick - p.tickUpper + 1);

    return {
      ...p,
      symbol0: sym(i * 2),
      symbol1: sym(i * 2 + 1),
      pool: zero ? null : pool,
      tick,
      inRange,
      ticksOut,
      closed: p.liquidity === 0n,
    };
  });
}

export interface VenusReading {
  /** Comptroller error code; non-zero means it would not answer. */
  error: bigint;
  /** Spare borrowing capacity, in USD with 18 decimals. */
  liquidityUsd: number;
  /** How far underwater. Non-zero means already liquidatable. */
  shortfallUsd: number;
  assetsIn: number;
  /** True only when the account actually has a Venus position. */
  active: boolean;
}

export async function readVenus(wallet: Address): Promise<VenusReading | null> {
  try {
    const [liq, assets] = await Promise.all([
      client.readContract({
        address: COMPTROLLER,
        abi: VENUS,
        functionName: "getAccountLiquidity",
        args: [wallet],
      }) as Promise<readonly [bigint, bigint, bigint]>,
      client.readContract({
        address: COMPTROLLER,
        abi: VENUS,
        functionName: "getAssetsIn",
        args: [wallet],
      }) as Promise<readonly Address[]>,
    ]);
    return {
      error: liq[0],
      liquidityUsd: Number(liq[1]) / 1e18,
      shortfallUsd: Number(liq[2]) / 1e18,
      assetsIn: assets.length,
      active: assets.length > 0,
    };
  } catch {
    return null;
  }
}

export const currentBlock = () => client.getBlockNumber();
