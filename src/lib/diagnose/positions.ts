/**
 * What is wrong with a position, read straight from the chain.
 *
 * This deliberately does not go through `valueWallet`. That engine refuses the
 * whole valuation if any single adapter cannot read, one unpriceable token,
 * one flaky provider, which is correct when the number will be used to slash
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

import { bscClient } from "@/lib/chain/rpc";
import { decodeAbiParameters, encodeFunctionData, parseAbi, type Address } from "viem";

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

// Ranked fallback over every configured provider: a dead node costs one
// failed call, not the page.
const client = bscClient();

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

export interface VenusMarket {
  vToken: Address;
  symbol: string;
  collateralUsd: number;
  borrowUsd: number;
  /** Venus's collateral factor for this market, 0 to 1. */
  collateralFactor: number;
}

export interface VenusReading {
  /** Comptroller error code; non-zero means it would not answer. */
  error: bigint;
  /**
   * Per market, priced by Venus's own oracle. Absent when the detail read
   * failed; the liquidity figures above still stand on their own.
   */
  markets?: VenusMarket[];
  collateralUsd?: number;
  borrowUsd?: number;
  /**
   * Collateral weighted by collateral factor, over debt. Below 1 is
   * liquidatable. Null when there is no debt, which is not the same as
   * "healthy" and is not printed as a number.
   */
  healthFactor?: number | null;
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
    const base: VenusReading = {
      error: liq[0],
      liquidityUsd: Number(liq[1]) / 1e18,
      shortfallUsd: Number(liq[2]) / 1e18,
      assetsIn: assets.length,
      active: assets.length > 0,
    };
    if (!assets.length) return base;
    const detail = await readVenusMarkets(wallet, assets).catch(() => null);
    return detail ? { ...base, ...detail } : base;
  } catch {
    return null;
  }
}

const VTOKEN = parseAbi([
  "function getAccountSnapshot(address) view returns (uint256,uint256,uint256,uint256)",
  "function symbol() view returns (string)",
]);
const COMPTROLLER_DETAIL = parseAbi([
  "function oracle() view returns (address)",
  "function markets(address) view returns (bool,uint256,bool)",
]);
const ORACLE = parseAbi(["function getUnderlyingPrice(address) view returns (uint256)"]);

/**
 * The health factor, computed the way Venus computes solvency.
 *
 * `getAccountLiquidity` gives spare capacity and shortfall in dollars but not
 * the ratio people ask about. The ratio needs each market's collateral and
 * debt priced by the same oracle Venus liquidates with, and each market's
 * collateral factor. Oracle prices are scaled to 36 minus the underlying's
 * decimals, so `amount * price / 1e36` is dollars for every market.
 */
async function readVenusMarkets(wallet: Address, assets: readonly Address[]) {
  const oracle = (await client.readContract({ address: COMPTROLLER, abi: COMPTROLLER_DETAIL, functionName: "oracle" })) as Address;
  const markets = await Promise.all(
    assets.map(async (vToken) => {
      const [snap, symbol, market, price] = await Promise.all([
        client.readContract({ address: vToken, abi: VTOKEN, functionName: "getAccountSnapshot", args: [wallet] }) as Promise<readonly [bigint, bigint, bigint, bigint]>,
        client.readContract({ address: vToken, abi: VTOKEN, functionName: "symbol" }).catch(() => "vToken") as Promise<string>,
        client.readContract({ address: COMPTROLLER, abi: COMPTROLLER_DETAIL, functionName: "markets", args: [vToken] }) as Promise<readonly [boolean, bigint, boolean]>,
        client.readContract({ address: oracle, abi: ORACLE, functionName: "getUnderlyingPrice", args: [vToken] }) as Promise<bigint>,
      ]);
      const [, vBalance, borrow, exchangeRate] = snap;
      const underlying = (vBalance * exchangeRate) / 10n ** 18n;
      return {
        vToken,
        symbol,
        collateralUsd: Number((underlying * price) / 10n ** 30n) / 1e6,
        borrowUsd: Number((borrow * price) / 10n ** 30n) / 1e6,
        collateralFactor: Number(market[1]) / 1e18,
      } satisfies VenusMarket;
    }),
  );
  const collateralUsd = markets.reduce((t, m) => t + m.collateralUsd, 0);
  const borrowUsd = markets.reduce((t, m) => t + m.borrowUsd, 0);
  const weighted = markets.reduce((t, m) => t + m.collateralUsd * m.collateralFactor, 0);
  return { markets, collateralUsd, borrowUsd, healthFactor: borrowUsd > 0 ? weighted / borrowUsd : null };
}

/* ------------------------------------------------------------------ idle cash */

const IDLE_TOKENS: { symbol: string; address: Address; stable: boolean }[] = [
  { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", stable: true },
  { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", stable: true },
  { symbol: "USD1", address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d", stable: true },
  { symbol: "FDUSD", address: "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409", stable: true },
  { symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", stable: false },
];
const WBNB_USDT_POOL = "0x36696169C63e42cd08ce11f5deeBbCeBae652050" as const;
const BALANCE = parseAbi(["function balanceOf(address) view returns (uint256)"]);

export interface IdleReading {
  holdings: { symbol: string; amount: number; usd: number }[];
  totalUsd: number;
  bnbUsd: number;
}

/**
 * What the wallet holds and is doing nothing with.
 *
 * Stablecoins and BNB sitting in the wallet itself: not supplied, not pooled,
 * not staked. Stables at a dollar, BNB at the WBNB/USDT 0.05% pool's own
 * price (token0 is USDT, so the pool quotes WBNB per USDT and BNB's dollar
 * price is its inverse). Native BNB is counted whole; a small amount is
 * needed for gas and the page says so rather than subtracting a guess.
 */
export async function readIdle(wallet: Address): Promise<IdleReading | null> {
  try {
    const [native, slot, ...balances] = await Promise.all([
      client.getBalance({ address: wallet }),
      client.readContract({ address: WBNB_USDT_POOL, abi: POOL, functionName: "slot0" }) as Promise<readonly unknown[]>,
      ...IDLE_TOKENS.map((t) =>
        client.readContract({ address: t.address, abi: BALANCE, functionName: "balanceOf", args: [wallet] }).catch(() => 0n) as Promise<bigint>,
      ),
    ]);
    const sqrt = Number(slot[0] as bigint) / 2 ** 96;
    const bnbUsd = sqrt > 0 ? 1 / (sqrt * sqrt) : 0;
    const holdings = [
      { symbol: "BNB", amount: Number(native) / 1e18, usd: (Number(native) / 1e18) * bnbUsd },
      ...IDLE_TOKENS.map((t, i) => {
        const amount = Number(balances[i]) / 1e18;
        return { symbol: t.symbol, amount, usd: t.stable ? amount : amount * bnbUsd };
      }),
    ].filter((h) => h.amount > 0);
    return { holdings, totalUsd: holdings.reduce((t, h) => t + h.usd, 0), bnbUsd };
  } catch {
    return null;
  }
}

export const currentBlock = () => client.getBlockNumber();
