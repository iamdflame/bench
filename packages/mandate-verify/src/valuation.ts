/**
 * What a wallet was worth at a past block, re-derived from public chain state.
 *
 * Written separately from the application's engine on purpose. The point of
 * this package is that it can *disagree* with the operator — a verifier that
 * imported the operator's arithmetic would be checking our sums against our
 * sums, and the isolation check exists to stop exactly that. Same sources,
 * same semantics, different code.
 *
 * It replaces a version that read native BNB and USDT and nothing else, whose
 * own comment said it "mirrors the operator's conversion". That was true, and
 * it was the problem: it mirrored a gauge that valued a V3 position, a Venus
 * supply and a WBNB wrap at zero, so it would have confirmed every settlement
 * those blind spots produced. A verifier that reproduces the bug it is meant
 * to catch is worse than no verifier, because it certifies the error.
 *
 * Three rules, the same three the engine it checks must obey:
 *
 *   1. Anything it cannot see makes the whole valuation null. A partial total
 *      reported as a whole one reads as a loss for everything it missed.
 *   2. Liabilities subtract.
 *   3. Every read is at the same pinned block.
 */

import type { Address, PublicClient } from "viem";

const Q96 = 2n ** 96n;

export const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;
export const TRACKED: { address: Address; symbol: string }[] = [
  { address: WBNB, symbol: "WBNB" },
  { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT" },
  { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC" },
  { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", symbol: "BTCB" },
  { address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", symbol: "CAKE" },
];

const V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as const;
const POSITION_MANAGER = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364" as const;
const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384" as const;
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36" as const;
const ZERO = "0x0000000000000000000000000000000000000000";
const FEES = [500, 2500, 100, 10000] as const;

const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

const POOL = [
  {
    type: "function", name: "slot0", stateMutability: "view", inputs: [],
    outputs: [
      { type: "uint160" }, { type: "int24" }, { type: "uint16" },
      { type: "uint16" }, { type: "uint16" }, { type: "uint32" }, { type: "bool" },
    ],
  },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const FACTORY = [
  {
    type: "function", name: "getPool", stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
] as const;

const NPM = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenOfOwnerByIndex", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "positions", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [
      { type: "uint96" }, { type: "address" }, { type: "address" }, { type: "address" },
      { type: "uint24" }, { type: "int24" }, { type: "int24" }, { type: "uint128" },
      { type: "uint256" }, { type: "uint256" }, { type: "uint128" }, { type: "uint128" },
    ],
  },
] as const;

const VTOKEN = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "borrowBalanceStored", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "exchangeRateStored", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "underlying", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const COMP = [
  { type: "function", name: "getAssetsIn", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address[]" }] },
] as const;

/** sqrt(1.0001^tick) * 2^96, from the reference expansion. */
export function sqrtRatioAtTick(tick: number): bigint {
  const abs = BigInt(tick < 0 ? -tick : tick);
  if (abs > 887272n) throw new RangeError(`tick ${tick} out of range`);
  const M = [
    0xfff97272373d413259a46990580e213an, 0xfff2e50f5f656932ef12357cf3c7fdccn,
    0xffe5caca7e10e4e61c3624eaa0941cd0n, 0xffcb9843d60f6159c9db58835c926644n,
    0xff973b41fa98c081472e6896dfb254c0n, 0xff2ea16466c96a3843ec78b326b52861n,
    0xfe5dee046a99a2a811c461f1969c3053n, 0xfcbe86c7900a88aedcffc83b479aa3a4n,
    0xf987a7253ac413176f2b074cf7815e54n, 0xf3392b0822b70005940c7a398e4b70f3n,
    0xe7159475a2c29b7443b29c7fa6e889d9n, 0xd097f3bdfd2022b8845ad8f792aa5825n,
    0xa9f746462d870fdf8a65dc1f90e061e5n, 0x70d869a156d2a1b890bb3df62baf32f7n,
    0x31be135f97d08fd981231505542fcfa6n, 0x9aa508b5b7a84e1c677de54f3e99bc9n,
    0x5d6af8dedb81196699c329225ee604n, 0x2216e584f5fa1ea926041bedfe98n,
    0x48a170391f7dc42444e8fa2n,
  ];
  let ratio = (abs & 1n) !== 0n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 1n << 128n;
  for (let i = 0; i < M.length; i++) {
    if ((abs & (2n << BigInt(i))) !== 0n) ratio = (ratio * M[i]!) >> 128n;
  }
  if (tick > 0) ratio = (2n ** 256n - 1n) / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

function amount0(a: bigint, b: bigint, l: bigint): bigint {
  const [lo, hi] = a > b ? [b, a] : [a, b];
  return lo === 0n ? 0n : (l * Q96 * (hi - lo)) / hi / lo;
}
function amount1(a: bigint, b: bigint, l: bigint): bigint {
  const [lo, hi] = a > b ? [b, a] : [a, b];
  return (l * (hi - lo)) / Q96;
}

/** What a concentrated position actually holds at the current price. */
export function positionAmounts(
  liquidity: bigint, tickLower: number, tickUpper: number, sqrtP: bigint,
): { a0: bigint; a1: bigint } {
  if (liquidity === 0n) return { a0: 0n, a1: 0n };
  const lo = sqrtRatioAtTick(tickLower);
  const hi = sqrtRatioAtTick(tickUpper);
  if (sqrtP <= lo) return { a0: amount0(lo, hi, liquidity), a1: 0n };
  if (sqrtP >= hi) return { a0: 0n, a1: amount1(lo, hi, liquidity) };
  return { a0: amount0(sqrtP, hi, liquidity), a1: amount1(lo, sqrtP, liquidity) };
}

export interface Rederived {
  netWei: bigint;
  assetsWei: bigint;
  liabilitiesWei: bigint;
  parts: { asset: string; bnbWei: bigint; kind: "asset" | "liability" }[];
}

/** BNB wei for one whole unit of a token, from its deepest WBNB pool. */
async function priceOf(
  c: PublicClient, token: Address, block: bigint,
  cache: Map<string, bigint | null>,
): Promise<bigint | null> {
  const key = token.toLowerCase();
  if (key === WBNB.toLowerCase()) return 10n ** 18n;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let decimals: number;
  try {
    decimals = Number(await c.readContract({ address: token, abi: ERC20, functionName: "decimals", blockNumber: block }));
  } catch { cache.set(key, null); return null; }

  for (const fee of FEES) {
    try {
      const pool = (await c.readContract({
        address: V3_FACTORY, abi: FACTORY, functionName: "getPool",
        args: [token, WBNB, fee], blockNumber: block,
      })) as Address;
      if (!pool || pool === ZERO) continue;
      const [slot0, token0] = await Promise.all([
        c.readContract({ address: pool, abi: POOL, functionName: "slot0", blockNumber: block }),
        c.readContract({ address: pool, abi: POOL, functionName: "token0", blockNumber: block }),
      ]);
      const sqrtP = (slot0 as readonly [bigint, ...unknown[]])[0];
      const p192 = sqrtP * sqrtP;
      const unit = 10n ** BigInt(decimals);
      const isToken0 = (token0 as Address).toLowerCase() === key;
      const value = isToken0
        ? (unit * p192) / (Q96 * Q96)
        : p192 === 0n ? 0n : (unit * Q96 * Q96) / p192;
      cache.set(key, value);
      return value;
    } catch { continue; }
  }
  cache.set(key, null);
  return null;
}

/**
 * The wallet's net value in BNB wei at `blockNumber`, or null.
 *
 * Null is a real answer and the important one: it means this package could not
 * see the whole wallet, so it declines to confirm or contradict the operator's
 * number rather than guessing at the difference.
 */
export async function rederiveValue(
  c: PublicClient, wallet: Address, blockNumber: bigint,
): Promise<Rederived | null> {
  const prices = new Map<string, bigint | null>();
  const parts: Rederived["parts"] = [];
  let assets = 0n;
  let liabilities = 0n;

  try {
    assets += await c.getBalance({ address: wallet, blockNumber });
    parts.push({ asset: "BNB", bnbWei: assets, kind: "asset" });

    for (const { address, symbol } of TRACKED) {
      const bal = (await c.readContract({
        address, abi: ERC20, functionName: "balanceOf", args: [wallet], blockNumber,
      })) as bigint;
      if (bal === 0n) continue;
      const decimals = Number(await c.readContract({ address, abi: ERC20, functionName: "decimals", blockNumber }));
      const per = await priceOf(c, address, blockNumber, prices);
      if (per === null) return null;
      const wei = (bal * per) / 10n ** BigInt(decimals);
      assets += wei;
      parts.push({ asset: symbol, bnbWei: wei, kind: "asset" });
    }

    // V3 positions: capital that has left the wallet entirely and reappeared
    // as liquidity between two ticks. Uncollected fees included — they are
    // earned and claimable, and omitting them measures a profitable position
    // as flat.
    const count = (await c.readContract({
      address: POSITION_MANAGER, abi: NPM, functionName: "balanceOf", args: [wallet], blockNumber,
    })) as bigint;
    for (let i = 0n; i < count; i++) {
      const id = (await c.readContract({
        address: POSITION_MANAGER, abi: NPM, functionName: "tokenOfOwnerByIndex", args: [wallet, i], blockNumber,
      })) as bigint;
      const p = (await c.readContract({
        address: POSITION_MANAGER, abi: NPM, functionName: "positions", args: [id], blockNumber,
      })) as readonly unknown[];
      const t0 = p[2] as Address, t1 = p[3] as Address;
      const fee = Number(p[4]), lower = Number(p[5]), upper = Number(p[6]);
      const liq = p[7] as bigint, owed0 = p[10] as bigint, owed1 = p[11] as bigint;
      if (liq === 0n && owed0 === 0n && owed1 === 0n) continue;

      const pool = (await c.readContract({
        address: V3_FACTORY, abi: FACTORY, functionName: "getPool", args: [t0, t1, fee], blockNumber,
      })) as Address;
      if (!pool || pool === ZERO) return null;
      const slot0 = await c.readContract({ address: pool, abi: POOL, functionName: "slot0", blockNumber });
      const sqrtP = (slot0 as readonly [bigint, ...unknown[]])[0];
      const { a0, a1 } = positionAmounts(liq, lower, upper, sqrtP);

      for (const [tok, amt] of [[t0, a0 + owed0], [t1, a1 + owed1]] as const) {
        if (amt === 0n) continue;
        const dec = Number(await c.readContract({ address: tok, abi: ERC20, functionName: "decimals", blockNumber }));
        const per = await priceOf(c, tok, blockNumber, prices);
        if (per === null) return null;
        const wei = (amt * per) / 10n ** BigInt(dec);
        assets += wei;
        parts.push({ asset: `V3#${id}`, bnbWei: wei, kind: "asset" });
      }
    }

    // Venus: supply is an asset, borrow is a liability. `Stored` rather than
    // `Current` because the Current variants accrue as a side effect, so their
    // answer depends on when they are called and not only on the block — and
    // this has to re-derive identically for anyone reading the same state.
    const entered = (await c.readContract({
      address: COMPTROLLER, abi: COMP, functionName: "getAssetsIn", args: [wallet], blockNumber,
    })) as readonly Address[];
    const markets = new Set(entered.map((m) => m.toLowerCase()));
    markets.add(VBNB.toLowerCase());

    for (const raw of markets) {
      const v = raw as Address;
      const [bal, borrowed, rate] = (await Promise.all([
        c.readContract({ address: v, abi: VTOKEN, functionName: "balanceOf", args: [wallet], blockNumber }),
        c.readContract({ address: v, abi: VTOKEN, functionName: "borrowBalanceStored", args: [wallet], blockNumber }),
        c.readContract({ address: v, abi: VTOKEN, functionName: "exchangeRateStored", blockNumber }),
      ])) as [bigint, bigint, bigint];
      if (bal === 0n && borrowed === 0n) continue;

      let underlying: Address = WBNB;
      if (v !== VBNB.toLowerCase()) {
        underlying = (await c.readContract({ address: v, abi: VTOKEN, functionName: "underlying", blockNumber })) as Address;
      }
      const dec = Number(await c.readContract({ address: underlying, abi: ERC20, functionName: "decimals", blockNumber }));
      const per = await priceOf(c, underlying, blockNumber, prices);
      if (per === null) return null;
      const unit = 10n ** BigInt(dec);

      const supplied = (bal * rate) / 10n ** 18n;
      if (supplied > 0n) {
        const wei = (supplied * per) / unit;
        assets += wei;
        parts.push({ asset: "Venus supplied", bnbWei: wei, kind: "asset" });
      }
      if (borrowed > 0n) {
        const wei = (borrowed * per) / unit;
        liabilities += wei;
        parts.push({ asset: "Venus borrowed", bnbWei: wei, kind: "liability" });
      }
    }
  } catch {
    // A read that failed is not a balance of zero.
    return null;
  }

  return { netWei: assets - liabilities, assetsWei: assets, liabilitiesWei: liabilities, parts };
}
