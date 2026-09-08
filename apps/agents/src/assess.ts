/**
 * What a reference agent actually answers.
 *
 * Each of the eight is a function from observed chain state to an assessment:
 * what it would do right now, why, and the values that decision rests on. It
 * proposes and does not send — the same shape the session allowlist grants, so
 * a strategy that tried to act outside its brief would fail at the wallet
 * rather than being trusted not to.
 *
 * Three properties make this worth paying a cent for rather than being a demo:
 *
 *   1. It reads the chain at a block and says which block. The answer is a
 *      reading, not an opinion.
 *   2. It says plainly when the answer is "do nothing", and why. An agent that
 *      always recommends acting is a churn machine, and the honest half of
 *      every one of these jobs is knowing when the fees would not cover the
 *      gas.
 *   3. Where it cannot see, it says so rather than substituting a default.
 */

import type { Address, PublicClient } from "viem";
import {
  V3_POOL_ABI,
  V3_POSITIONS_ABI,
  VENUES,
  VENUS_COMPTROLLER_ABI,
  VTOKEN_ABI,
  chainClient,
  type JobSlug,
  type SupportedChain,
} from "@bench/shared";

export interface Assessment {
  agent: string;
  job: JobSlug;
  /** The block every figure below was read at. */
  block: string;
  observedAt: string;
  subject: string | null;
  /** The recommendation, in a sentence a person can act on. */
  action: string;
  /** Why, from the values that produced it. */
  because: string;
  /** The readings behind it. Each names what it is and where it came from. */
  readings: { name: string; value: string; source: string }[];
  /** What it could not see. Never omitted when there is something. */
  unknown: string[];
}

const nowIso = () => new Date().toISOString();

/**
 * A position's range, and whether the price is inside it.
 *
 * The whole rebalancing job is this question, and it is answerable from two
 * reads: the position's ticks and the pool's current tick.
 */
async function rangeAssessment(
  client: PublicClient,
  chainId: SupportedChain,
  wallet: Address | null,
  block: bigint,
  wide: boolean,
): Promise<Assessment> {
  const readings: Assessment["readings"] = [];
  const unknown: string[] = [];

  if (!wallet) {
    return {
      agent: wide ? "Range Keeper II" : "Range Keeper I",
      job: "rebalancing",
      block: block.toString(),
      observedAt: nowIso(),
      subject: null,
      action: "Nothing to assess.",
      because:
        "No position was named in the request and this agent holds none of its own, so there is no range to judge.",
      readings,
      unknown: ["Which position to assess. Pass ?wallet=0x… or hire it against a position you own."],
    };
  }

  const count = await client
    .readContract({
      address: VENUES.pancakeV3PositionManager as Address,
      abi: V3_POSITIONS_ABI,
      functionName: "balanceOf",
      args: [wallet],
      blockNumber: block,
    })
    .catch(() => null);

  if (count === null) {
    unknown.push("The position manager could not be read at this block, so nothing about this wallet's ranges is established.");
    return {
      agent: wide ? "Range Keeper II" : "Range Keeper I",
      job: "rebalancing",
      block: block.toString(),
      observedAt: nowIso(),
      subject: wallet,
      action: "No recommendation.",
      because: "The chain could not be read for this wallet, and a recommendation on unread state would be a guess.",
      readings,
      unknown,
    };
  }

  const n = Number(count as bigint);
  readings.push({ name: "V3 positions held", value: String(n), source: "PancakeSwap position manager" });

  if (n === 0) {
    return {
      agent: wide ? "Range Keeper II" : "Range Keeper I",
      job: "rebalancing",
      block: block.toString(),
      observedAt: nowIso(),
      subject: wallet,
      action: "Open a position before hiring a rebalancer.",
      because: "This wallet holds no PancakeSwap V3 position, so there is no range to keep.",
      readings,
      unknown,
    };
  }

  const id = await client
    .readContract({
      address: VENUES.pancakeV3PositionManager as Address,
      abi: V3_POSITIONS_ABI,
      functionName: "tokenOfOwnerByIndex",
      args: [wallet, 0n],
      blockNumber: block,
    })
    .catch(() => null);

  if (id === null) {
    unknown.push("The first position's id could not be read.");
    return {
      agent: wide ? "Range Keeper II" : "Range Keeper I",
      job: "rebalancing",
      block: block.toString(),
      observedAt: nowIso(),
      subject: wallet,
      action: "No recommendation.",
      because: "The position could not be enumerated at this block.",
      readings,
      unknown,
    };
  }

  const pos = await client
    .readContract({
      address: VENUES.pancakeV3PositionManager as Address,
      abi: V3_POSITIONS_ABI,
      functionName: "positions",
      args: [id as bigint],
      blockNumber: block,
    })
    .catch(() => null);

  if (!pos) {
    unknown.push("The position's parameters could not be read.");
    return {
      agent: wide ? "Range Keeper II" : "Range Keeper I",
      job: "rebalancing",
      block: block.toString(),
      observedAt: nowIso(),
      subject: wallet,
      action: "No recommendation.",
      because: "The position could not be read at this block.",
      readings,
      unknown,
    };
  }

  const [, , token0, token1, fee, tickLower, tickUpper, liquidity] = pos as unknown as [
    bigint, Address, Address, Address, number, number, number, bigint,
  ];
  readings.push({ name: "Position", value: String(id), source: "position manager" });
  readings.push({ name: "Range", value: `${tickLower} to ${tickUpper}`, source: "position manager" });
  readings.push({ name: "Liquidity", value: liquidity.toString(), source: "position manager" });

  const { V3_FACTORY_ABI } = await import("@bench/shared");
  const pool = (await client
    .readContract({
      address: VENUES.pancakeV3Factory as Address,
      abi: V3_FACTORY_ABI,
      functionName: "getPool",
      args: [token0, token1, fee],
      blockNumber: block,
    })
    .catch(() => null)) as Address | null;

  if (!pool || /^0x0+$/.test(pool)) {
    unknown.push("The pool for this pair and fee tier could not be located, so the current tick is unknown.");
    return {
      agent: wide ? "Range Keeper II" : "Range Keeper I",
      job: "rebalancing",
      block: block.toString(),
      observedAt: nowIso(),
      subject: wallet,
      action: "No recommendation.",
      because: "Without the pool there is no current price to compare the range against.",
      readings,
      unknown,
    };
  }

  const slot0 = await client
    .readContract({ address: pool, abi: V3_POOL_ABI, functionName: "slot0", blockNumber: block })
    .catch(() => null);
  if (!slot0) {
    unknown.push("The pool's current tick could not be read.");
    return {
      agent: wide ? "Range Keeper II" : "Range Keeper I",
      job: "rebalancing",
      block: block.toString(),
      observedAt: nowIso(),
      subject: wallet,
      action: "No recommendation.",
      because: "The pool did not answer at this block.",
      readings,
      unknown,
    };
  }

  const tick = Number((slot0 as unknown as [bigint, number])[1]);
  readings.push({ name: "Pool tick now", value: String(tick), source: `pool ${pool.slice(0, 10)}…` });

  const inRange = tick >= tickLower && tick < tickUpper;
  const width = tickUpper - tickLower;
  const distance = inRange ? Math.min(tick - tickLower, tickUpper - tick) : tick < tickLower ? tickLower - tick : tick - tickUpper;
  readings.push({
    name: inRange ? "Ticks from the nearer edge" : "Ticks outside the range",
    value: String(distance),
    source: "derived from the two above",
  });

  /*
    The two variants differ exactly here, and nowhere else. The primary moves
    when the price leaves the band; the conservative one tolerates being out of
    range for a while, because every recentre crystallises loss and pays gas,
    and on a mean-reverting pair the patient position often wins.
  */
  const trigger = wide ? Math.round(width * 0.25) : 0;

  const action = !inRange
    ? distance > trigger
      ? `Recentre the range around tick ${tick}.`
      : "Hold. The price is outside the band but not far enough to pay for moving."
    : "Hold. The position is earning.";

  const because = !inRange
    ? distance > trigger
      ? `The price is ${distance} ticks outside a band ${width} ticks wide, so the position is earning nothing and the drift is beyond this agent's tolerance of ${trigger} ticks.`
      : `The price is ${distance} ticks outside the band, inside this agent's tolerance of ${trigger}. Recentring now would crystallise loss and pay gas for a move the price may undo.`
    : `The price sits ${distance} ticks inside a band ${width} ticks wide, so the position is collecting fees and moving it would cost more than it earns.`;

  return {
    agent: wide ? "Range Keeper II" : "Range Keeper I",
    job: "rebalancing",
    block: block.toString(),
    observedAt: nowIso(),
    subject: wallet,
    action,
    because,
    readings,
    unknown,
  };
}

/** Venus account health, which is the whole health-factor job. */
async function healthAssessment(
  client: PublicClient,
  wallet: Address | null,
  block: bigint,
  collateralFirst: boolean,
): Promise<Assessment> {
  const name = collateralFirst ? "Health Shield II" : "Health Shield I";
  const readings: Assessment["readings"] = [];
  const unknown: string[] = [];

  if (!wallet) {
    return {
      agent: name,
      job: "health",
      block: block.toString(),
      observedAt: nowIso(),
      subject: null,
      action: "Nothing to assess.",
      because: "No account was named in the request, so there is no borrow position to defend.",
      readings,
      unknown: ["Which account to watch. Pass ?wallet=0x…"],
    };
  }

  const liq = await client
    .readContract({
      address: VENUES.venusComptroller as Address,
      abi: VENUS_COMPTROLLER_ABI,
      functionName: "getAccountLiquidity",
      args: [wallet],
      blockNumber: block,
    })
    .catch(() => null);

  if (!liq) {
    unknown.push("The Venus comptroller could not be read at this block.");
    return {
      agent: name,
      job: "health",
      block: block.toString(),
      observedAt: nowIso(),
      subject: wallet,
      action: "No recommendation.",
      because: "The lending position could not be read, and a recommendation on unread state would be a guess.",
      readings,
      unknown,
    };
  }

  const [err, liquidity, shortfall] = liq as unknown as [bigint, bigint, bigint];
  readings.push({ name: "Venus error code", value: String(err), source: "comptroller" });
  readings.push({ name: "Borrowing headroom", value: `${Number(liquidity) / 1e18} USD`, source: "comptroller" });
  readings.push({ name: "Shortfall", value: `${Number(shortfall) / 1e18} USD`, source: "comptroller" });

  if (err !== 0n) {
    unknown.push(`Venus returned error code ${err} for this account.`);
    return {
      agent: name, job: "health", block: block.toString(), observedAt: nowIso(), subject: wallet,
      action: "No recommendation.",
      because: "Venus would not value this account, so its health cannot be judged.",
      readings, unknown,
    };
  }

  if (liquidity === 0n && shortfall === 0n) {
    return {
      agent: name, job: "health", block: block.toString(), observedAt: nowIso(), subject: wallet,
      action: "Nothing to defend.",
      because: "This account has no Venus position, so there is no health factor at risk.",
      readings, unknown,
    };
  }

  if (shortfall > 0n) {
    return {
      agent: name, job: "health", block: block.toString(), observedAt: nowIso(), subject: wallet,
      action: collateralFirst
        ? "Supply collateral immediately. This position is already liquidatable."
        : "Repay part of the debt immediately. This position is already liquidatable.",
      because: `Venus reports a shortfall of ${Number(shortfall) / 1e18} USD, which means a liquidator can act now and Venus charges a ten percent penalty when one does. Acting before is cheaper than being acted upon.`,
      readings, unknown,
    };
  }

  /*
    Headroom alone does not say how close the account is — it says how much
    more could be borrowed. Reporting it as a health factor would be inventing
    a denominator we did not read, so it is reported as what it is.
  */
  return {
    agent: name, job: "health", block: block.toString(), observedAt: nowIso(), subject: wallet,
    action: "Hold. Nothing needs doing.",
    because: `Venus reports ${Number(liquidity) / 1e18} USD of borrowing headroom and no shortfall, so the position is not near liquidation at this block.`,
    readings,
    unknown: [
      "The exact health factor. Venus reports liquidity and shortfall rather than a ratio, and deriving one needs each market's collateral factor and the oracle price — read on a hire, not on a one-shot call.",
    ],
  };
}

/** The best supply rate actually available, which is the yield job. */
async function yieldAssessment(
  client: PublicClient,
  chainId: SupportedChain,
  wallet: Address | null,
  block: bigint,
  hysteresis: boolean,
): Promise<Assessment> {
  const name = hysteresis ? "Yield Router II" : "Yield Router I";
  const readings: Assessment["readings"] = [];
  const unknown: string[] = [];
  const { BLOCK_SECONDS } = await import("@bench/shared");
  const blocksPerYear = 31_536_000 / BLOCK_SECONDS[chainId];

  const markets: [string, Address][] = [
    ["Venus vBNB", VENUES.venusVBNB as Address],
    ["Venus vUSDT", VENUES.venusVUSDT as Address],
  ];

  const rates: { label: string; apy: number }[] = [];
  for (const [label, address] of markets) {
    const r = await client
      .readContract({ address, abi: VTOKEN_ABI, functionName: "supplyRatePerBlock", blockNumber: block })
      .catch(() => null);
    if (r === null) {
      unknown.push(`${label}'s supply rate could not be read at this block.`);
      continue;
    }
    const apy = (Number(r as bigint) / 1e18) * blocksPerYear * 100;
    rates.push({ label, apy });
    readings.push({ name: `${label} supply APY`, value: `${apy.toFixed(2)}%`, source: "vToken supplyRatePerBlock" });
  }

  if (rates.length === 0) {
    return {
      agent: name, job: "yield", block: block.toString(), observedAt: nowIso(), subject: wallet,
      action: "No recommendation.",
      because: "No market's rate could be read at this block, and a rotation recommended on unread rates would be a guess.",
      readings, unknown,
    };
  }

  rates.sort((a, b) => b.apy - a.apy);
  const best = rates[0]!;
  const spread = rates.length > 1 ? best.apy - rates[rates.length - 1]!.apy : 0;
  const bar = hysteresis ? 1.5 : 0.4;

  return {
    agent: name, job: "yield", block: block.toString(), observedAt: nowIso(), subject: wallet,
    action:
      spread >= bar
        ? `Move idle stables to ${best.label}.`
        : "Hold. The spread does not pay for moving.",
    because:
      spread >= bar
        ? `${best.label} pays ${best.apy.toFixed(2)}%, which is ${spread.toFixed(2)} points above the worst market read here — past this agent's bar of ${bar}%.`
        : `The best and worst rates read here differ by ${spread.toFixed(2)} points, below this agent's bar of ${bar}%. Rotating for that spread pays gas to chase a rate that may revert before it earns the gas back.`,
    readings,
    unknown: [
      ...unknown,
      "Aave and MasterChef rates, and the depth at your size. A rate with no liquidity behind it is the classic trap in this job and is not judged from a single call.",
    ],
  };
}

/** The grid job's honest one-shot answer: the price, the band, and the fills. */
async function gridAssessment(
  client: PublicClient,
  wallet: Address | null,
  block: bigint,
  braked: boolean,
): Promise<Assessment> {
  const name = braked ? "Grid Runner II" : "Grid Runner I";
  return {
    agent: name,
    job: "grid",
    block: block.toString(),
    observedAt: nowIso(),
    subject: wallet,
    action: "Hire it against a band before asking what it would do.",
    because:
      "A grid's recommendation is a function of the band it was given and the inventory it holds. Without those, any 'buy here, sell there' would be a number this agent made up rather than one it read.",
    readings: [{ name: "Block", value: block.toString(), source: "BNB Smart Chain" }],
    unknown: [
      "The band. A grid without one has nothing to place orders inside.",
      "The starting inventory, which decides which side of the ladder can fill first.",
    ],
  };
}

export async function assess(
  slug: string,
  chainId: SupportedChain,
  wallet: Address | null,
): Promise<Assessment> {
  const client = chainClient(chainId);
  const block = await client.getBlockNumber();

  switch (slug) {
    case "range-keeper-i":
      return rangeAssessment(client, chainId, wallet, block, false);
    case "range-keeper-ii":
      return rangeAssessment(client, chainId, wallet, block, true);
    case "health-shield-i":
      return healthAssessment(client, wallet, block, false);
    case "health-shield-ii":
      return healthAssessment(client, wallet, block, true);
    case "yield-router-i":
      return yieldAssessment(client, chainId, wallet, block, false);
    case "yield-router-ii":
      return yieldAssessment(client, chainId, wallet, block, true);
    case "grid-runner-i":
      return gridAssessment(client, wallet, block, false);
    case "grid-runner-ii":
      return gridAssessment(client, wallet, block, true);
    default:
      throw new Error(`No reference agent called "${slug}".`);
  }
}
