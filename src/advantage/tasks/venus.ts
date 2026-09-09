/**
 * T3 (Yield) and T4 (Health Factor), measured against Venus on BSC.
 *
 * Neither task asks how fast a person is. T3's no-agent arm is the absence of
 * the action — capital left where it is — which is definitional rather than
 * estimated. T4's is stronger still: the cost of not acting is a parameter
 * Venus publishes on chain and charges to every borrower who was too slow, so
 * the baseline is not modelled at all. It is the penalty itself.
 */

import { decodeAbiParameters, encodeFunctionData, parseAbi } from "viem";
import { callAt, getLogs, storageAt, type RawLog } from "../chain";

const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const LIQUIDATE_TOPIC = "0x298637f684da70674f26509b10f07ec2fbc77a335ab1e7d6215a4b2484d8bb52";

const MC3_ABI = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])",
]);

const SEL = {
  getAllMarkets: "0xb0772d0b",
  liquidationIncentive: "0x4ada90af",
  closeFactor: "0xe8755446",
  supplyRatePerBlock: "0xae9d70b0",
  borrowRatePerBlock: "0xf8f9da28",
  getCash: "0x3b1d21a2",
  symbol: "0x95d89b41",
  totalSupply: "0x18160ddd",
  exchangeRateStored: "0x182df0f5",
} as const;

export interface Market {
  vToken: string;
  symbol: string;
  supplyRatePerBlock: bigint;
  supplyApyPct: number;
  /** Underlying available in the market, in USD at Venus's own oracle. */
  cashUsd: number;
}

export interface YieldResult {
  markets: Market[];
  best: Market | null;
  worst: Market | null;
  spreadPct: number;
  /** Exploratory, outside the lock: the same figures restricted to markets
   *  deep enough to actually absorb the capital. Reported separately because
   *  the locked metric did not include a liquidity filter and may not gain one
   *  after the fact. */
  liquid: { best: Market | null; worst: Market | null; spreadPct: number; minCashUsd: number; count: number };
  blocksPerYear: number;
  /** Capital at which one rotation's gas is repaid inside 30 days. */
  breakEvenUsd: number;
  gasCostUsd: number;
  capitalUsd: number;
  gainPerMonthUsd: number;
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

const decodeString = (data: `0x${string}`): string => {
  try {
    return String(decodeAbiParameters([{ type: "string" }], data)[0]);
  } catch {
    return "?";
  }
};

/** Every listed Venus market's supply rate at the anchor block. */
export async function readMarkets(block: bigint): Promise<Market[]> {
  const [addresses] = await callAt<readonly [readonly string[]]>(
    COMPTROLLER,
    SEL.getAllMarkets,
    block,
    [{ type: "address[]" }],
  );

  // Venus's own price oracle, read from the Unitroller's slot 4.
  const oracle = `0x${(await storageAt(COMPTROLLER, 4, block)).toString(16).padStart(40, "0")}`;

  const priceCall = (v: string) =>
    `0xfc57d4df000000000000000000000000${v.slice(2).toLowerCase()}` as `0x${string}`;

  const PER = 4;
  const calls = addresses.flatMap((v) => [
    { target: v as `0x${string}`, allowFailure: true, callData: SEL.symbol as `0x${string}` },
    { target: v as `0x${string}`, allowFailure: true, callData: SEL.supplyRatePerBlock as `0x${string}` },
    { target: v as `0x${string}`, allowFailure: true, callData: SEL.getCash as `0x${string}` },
    { target: oracle as `0x${string}`, allowFailure: true, callData: priceCall(v) },
  ]);

  const out: Market[] = [];
  const BATCH = 60;
  for (let i = 0; i < calls.length; i += BATCH) {
    const slice = calls.slice(i, i + BATCH);
    let results: readonly { success: boolean; returnData: `0x${string}` }[];
    try {
      results = await multicall(slice, block);
    } catch {
      continue;
    }
    for (let j = 0; j + PER - 1 < results.length; j += PER) {
      const idx = (i + j) / PER;
      const vToken = addresses[idx];
      if (!vToken) continue;
      const [sym, rate, cash, price] = [results[j], results[j + 1], results[j + 2], results[j + 3]];
      if (!rate?.success || rate.returnData.length < 66) continue;
      // Venus vTokens return three words here, not one. Taking the whole
      // buffer as an integer produced a 10^154 % APY — the first word is the
      // rate and the rest is padding.
      const cashRaw = cash?.success && cash.returnData.length >= 66 ? BigInt(cash.returnData.slice(0, 66)) : 0n;
      // Compound convention: the oracle scales price by 1e(36 - decimals), so
      // cash x price / 1e36 is USD without needing the token's decimals.
      const priceRaw = price?.success && price.returnData.length >= 66 ? BigInt(price.returnData.slice(0, 66)) : 0n;
      out.push({
        vToken,
        symbol: sym?.success ? decodeString(sym.returnData) : "?",
        supplyRatePerBlock: BigInt(rate.returnData.slice(0, 66)),
        supplyApyPct: 0,
        cashUsd: Number((cashRaw * priceRaw) / 10n ** 30n) / 1e6,
      });
    }
  }
  return out;
}

/**
 * The yield task.
 *
 * Reports the spread between the best and worst live market, and the capital
 * at which moving pays for itself. That second number is the one that decides
 * whether the agent has any advantage here at all, and it was named as this
 * task's loss condition before the run.
 */
export function scoreYield(
  markets: Market[],
  opts: { blocksPerYear: number; capitalUsd: number; gasPriceWei: bigint; bnbUsd: number },
): YieldResult {
  for (const m of markets) {
    // Simple annualisation of the per-block rate; compounding at 63M periods
    // overflows any useful precision and Venus quotes the simple figure too.
    m.supplyApyPct = (Number(m.supplyRatePerBlock) / 1e18) * opts.blocksPerYear * 100;
  }
  const usable = markets.filter((m) => m.supplyApyPct > 0).sort((a, b) => b.supplyApyPct - a.supplyApyPct);
  const best = usable[0] ?? null;
  const worst = usable[usable.length - 1] ?? null;
  const spreadPct = best && worst ? best.supplyApyPct - worst.supplyApyPct : 0;

  // A market with no cash cannot be supplied into at any rate. The locked
  // metric has no such filter, so this is computed alongside it, never
  // substituted for it.
  const MIN_CASH_USD = 1_000_000;
  const deep = usable.filter((m) => m.cashUsd >= MIN_CASH_USD);
  const liquid = {
    best: deep[0] ?? null,
    worst: deep[deep.length - 1] ?? null,
    spreadPct: deep.length ? deep[0]!.supplyApyPct - deep[deep.length - 1]!.supplyApyPct : 0,
    minCashUsd: MIN_CASH_USD,
    count: deep.length,
  };

  // Rotating out and in: redeem, approve, mint. Measured gas price, real BNB price.
  const ROTATION_GAS = 450_000n;
  const gasCostUsd = (Number(opts.gasPriceWei * ROTATION_GAS) / 1e18) * opts.bnbUsd;
  // Break-even is computed on the actionable spread, not the locked one: a
  // rotation into a market with no cash is not a rotation.
  const actionable = liquid.spreadPct;
  const gainPerMonthUsd = (opts.capitalUsd * (actionable / 100)) / 12;
  const breakEvenUsd = actionable > 0 ? (gasCostUsd * 12) / (actionable / 100) : Infinity;

  return {
    markets: usable,
    best,
    worst,
    spreadPct,
    liquid,
    blocksPerYear: opts.blocksPerYear,
    breakEvenUsd,
    gasCostUsd,
    capitalUsd: opts.capitalUsd,
    gainPerMonthUsd,
  };
}

export interface HealthResult {
  incentiveSource: string;
  layoutVerified: boolean;
  liquidationIncentiveMantissa: string;
  closeFactorMantissa: string;
  /** The penalty a borrower pays for being late, as a percentage of seized collateral. */
  penaltyPct: number;
  /** The most of a borrow that can be taken in one liquidation. */
  closeFactorPct: number;
  repayGasUsd: number;
  /** On a position of this size, what being late costs against what being early costs. */
  exampleBorrowUsd: number;
  penaltyUsd: number;
  ratio: number;
  liquidations: { count: number; window: number } | { inconclusive: string };
}

export async function readHealth(
  block: bigint,
  opts: {
    fromBlock: bigint;
    gasPriceWei: bigint;
    bnbUsd: number;
    exampleBorrowUsd: number;
    markets: string[];
  },
): Promise<HealthResult> {
  // The Comptroller is a Diamond and exposes no liquidationIncentiveMantissa()
  // — every spelling of it reverts with "Function does not exist". The value is
  // still on chain, in the Unitroller's storage, so it is read from slot 6.
  //
  // A raw slot read is only trustworthy if the layout is right, so it is
  // checked rather than assumed: slot 5 must equal what closeFactorMantissa()
  // returns at the same block. If the two disagree the layout is wrong and the
  // incentive read is thrown away rather than published.
  const [closeFactor] = await callAt<readonly [bigint]>(COMPTROLLER, SEL.closeFactor, block, [
    { type: "uint256" },
  ]);
  const slot5 = await storageAt(COMPTROLLER, 5, block);
  const layoutOk = slot5 === closeFactor;
  const incentive = layoutOk ? await storageAt(COMPTROLLER, 6, block) : 0n;

  // The incentive is a multiplier on seized collateral: 1.1e18 means the
  // liquidator takes 110% of what they repaid, so the borrower loses 10%.
  const penaltyPct = layoutOk ? (Number(incentive) / 1e18 - 1) * 100 : 0;
  const closeFactorPct = (Number(closeFactor) / 1e18) * 100;

  const REPAY_GAS = 250_000n;
  const repayGasUsd = (Number(opts.gasPriceWei * REPAY_GAS) / 1e18) * opts.bnbUsd;
  const seizable = opts.exampleBorrowUsd * (closeFactorPct / 100);
  const penaltyUsd = seizable * (penaltyPct / 100);

  let liquidations: HealthResult["liquidations"];
  try {
    let count = 0;
    for (const market of opts.markets) {
      const logs = await getLogs({
        address: market,
        topics: [LIQUIDATE_TOPIC],
        fromBlock: opts.fromBlock,
        toBlock: block,
      });
      count += logs.length;
    }
    liquidations = { count, window: Number(block - opts.fromBlock) };
  } catch (e) {
    liquidations = {
      inconclusive: `log scan refused: ${e instanceof Error ? e.message.slice(0, 90) : "unknown"}`,
    };
  }

  return {
    incentiveSource: layoutOk
      ? "Unitroller storage slot 6; layout confirmed by slot 5 matching closeFactorMantissa()"
      : "UNVERIFIED — slot 5 did not match closeFactorMantissa(), so the layout is wrong and this value is not published",
    layoutVerified: layoutOk,
    liquidationIncentiveMantissa: incentive.toString(),
    closeFactorMantissa: closeFactor.toString(),
    penaltyPct,
    closeFactorPct,
    repayGasUsd,
    exampleBorrowUsd: opts.exampleBorrowUsd,
    penaltyUsd,
    ratio: repayGasUsd > 0 ? penaltyUsd / repayGasUsd : Infinity,
    liquidations,
  };
}

export { COMPTROLLER };
export type { RawLog };
