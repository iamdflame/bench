/**
 * Where PancakeSwap V3 liquidity is thin against the demand actually routing
 * through it.
 *
 *   npm run pool-gap
 *
 * PancakeSwap's brief asked for exactly this and nobody took it up:
 * *"researching market movements to find demand where creating PancakeSwap
 * pools could improve liquidity efficiency."*
 *
 * The method is deliberately narrow, because a wide one would be a guess. For
 * every V3 pool that traded in the window, two numbers are read from the chain:
 * how much volume crossed it, and how much liquidity was standing there. The
 * ratio is turnover — volume per unit of liquidity — and a high turnover pool
 * is one where demand is arriving faster than depth is being supplied.
 *
 * What this does *not* claim: that a high-turnover pool is underpriced, that
 * adding liquidity there would be profitable, or that the fee tier is wrong.
 * Turnover is a signal about where to look, and it is reported as one.
 */

import { formatUnits, parseAbi } from "viem";
import { getLogs, callAt, rpc, ARCHIVE_RPCS, hex } from "@/advantage/chain";
import { marketClient } from "@/lib/chain/market";

const V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
/** Swap(address,address,int256,int256,uint160,uint128,int24,uint128,uint128) */
const SWAP_TOPIC = "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83";

const ERC20 = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const POOL = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function liquidity() view returns (uint128)",
]);

const WINDOW = BigInt(process.env.POOL_GAP_BLOCKS ?? "20000"); // ~2.5h
const TOP = Number(process.env.POOL_GAP_TOP ?? "12");

interface PoolStat {
  pool: string;
  swaps: number;
  /** Absolute token0 flow across the window, in raw units. */
  volume0: bigint;
  liquidity: bigint;
  fee: number;
  token0: string;
  token1: string;
  symbol0: string;
  symbol1: string;
  decimals0: number;
  /** Volume per unit of standing liquidity. */
  turnover: number;
}

const head = await marketClient.getBlockNumber();
const from = head - WINDOW;

console.log(`\n  scanning blocks ${from}–${head} (${WINDOW} blocks, ~${((Number(WINDOW) * 0.45) / 3600).toFixed(1)}h)\n`);

const logs = await getLogs({
  topics: [SWAP_TOPIC],
  fromBlock: from,
  toBlock: head,
  onWindow: (d, t, f) => process.stdout.write(`\r    ${d}/${t} windows · ${f} swaps`.padEnd(56)),
});
process.stdout.write("\r".padEnd(56) + "\r");

// Aggregate by pool. amount0 is the first data word, a signed int256.
const agg = new Map<string, { swaps: number; volume0: bigint }>();
for (const l of logs) {
  const body = l.data.slice(2);
  if (body.length < 64) continue;
  let a0 = BigInt(`0x${body.slice(0, 64)}`);
  if (a0 >= 1n << 255n) a0 -= 1n << 256n;
  const key = l.address.toLowerCase();
  const e = agg.get(key) ?? { swaps: 0, volume0: 0n };
  e.swaps += 1;
  e.volume0 += a0 < 0n ? -a0 : a0;
  agg.set(key, e);
}

console.log(`  ${logs.length.toLocaleString()} swaps across ${agg.size} pools\n`);

// Only pools with real traffic are worth reading state for.
const candidates = [...agg.entries()]
  .filter(([, v]) => v.swaps >= 20)
  .sort((a, b) => b[1].swaps - a[1].swaps)
  .slice(0, 60);

const symbols = new Map<string, { symbol: string; decimals: number }>();
const meta = async (token: string) => {
  const k = token.toLowerCase();
  const hit = symbols.get(k);
  if (hit) return hit;
  let symbol = `${token.slice(0, 6)}…`;
  let decimals = 18;
  try {
    const [s] = await callAt<readonly [string]>(token, "0x95d89b41", "latest", [{ type: "string" }]);
    symbol = s;
  } catch {
    /* a token that will not name itself is still a token */
  }
  try {
    const [d] = await callAt<readonly [number]>(token, "0x313ce567", "latest", [{ type: "uint8" }]);
    decimals = Number(d);
  } catch {
    /* keep 18 */
  }
  const v = { symbol, decimals };
  symbols.set(k, v);
  return v;
};

const stats: PoolStat[] = [];
for (const [pool, v] of candidates) {
  try {
    const [[t0], [t1], [fee], [liq]] = await Promise.all([
      callAt<readonly [string]>(pool, "0x0dfe1681", "latest", [{ type: "address" }]),
      callAt<readonly [string]>(pool, "0xd21220a7", "latest", [{ type: "address" }]),
      callAt<readonly [number]>(pool, "0xddca3f43", "latest", [{ type: "uint24" }]),
      callAt<readonly [bigint]>(pool, "0x1a686502", "latest", [{ type: "uint128" }]),
    ]);
    const m0 = await meta(t0);
    const m1 = await meta(t1);
    stats.push({
      pool,
      swaps: v.swaps,
      volume0: v.volume0,
      liquidity: liq,
      fee: Number(fee),
      token0: t0,
      token1: t1,
      symbol0: m0.symbol,
      symbol1: m1.symbol,
      decimals0: m0.decimals,
      // Standing liquidity is a Q-notation quantity, not a token amount, so
      // this ratio is comparable between pools and meaningless in isolation.
      turnover: liq === 0n ? Infinity : Number(v.volume0) / Number(liq),
    });
  } catch {
    continue;
  }
}

const ranked = stats
  .filter((s) => Number.isFinite(s.turnover))
  .sort((a, b) => b.turnover - a.turnover)
  .slice(0, TOP);

console.log(`  Highest turnover — volume crossing per unit of standing liquidity\n`);
console.log(`  ${"pair".padEnd(22)} ${"fee".padStart(6)} ${"swaps".padStart(7)} ${"turnover".padStart(11)}  pool`);
console.log(`  ${"-".repeat(22)} ${"-".repeat(6)} ${"-".repeat(7)} ${"-".repeat(11)}  ${"-".repeat(12)}`);
for (const s of ranked) {
  const pair = `${s.symbol0}/${s.symbol1}`.slice(0, 22);
  console.log(
    `  ${pair.padEnd(22)} ${`${(s.fee / 10_000).toFixed(2)}%`.padStart(6)} ${String(s.swaps).padStart(7)} ${s.turnover.toFixed(4).padStart(11)}  ${s.pool.slice(0, 12)}…`,
  );
}

const zero = stats.filter((s) => s.liquidity === 0n);
if (zero.length) {
  console.log(`\n  ${zero.length} pool(s) traded with zero standing liquidity in range:`);
  for (const s of zero.slice(0, 5)) {
    console.log(`    ${s.symbol0}/${s.symbol1} ${(s.fee / 10_000).toFixed(2)}% · ${s.swaps} swaps · ${s.pool}`);
  }
}

console.log(`
  Turnover says demand is arriving faster than depth is being supplied. It
  does not say a pool is mispriced, that adding liquidity there would pay, or
  that the fee tier is wrong — those need a view on the pair, and this is a
  measurement, not a view. ${stats.length} pools with 20+ swaps were read at
  head; pools that traded less are excluded and that exclusion is deliberate.
`);
