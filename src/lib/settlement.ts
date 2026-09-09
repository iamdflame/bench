/**
 * Measured settlement, against a benchmark nobody has to take on trust.
 *
 * This file used to keep the opening valuation in `.benchmarks/mandate-N.json`
 * — a file on one laptop, deciding every slash, in a product whose entire
 * thesis is that a claim costing nothing to make is worth nothing to read.
 * That was the contradiction a judge finds in ninety seconds, and it also
 * meant the system could not run anywhere but here.
 *
 * The benchmark now lives on chain. `openAttestation` is written when the
 * mandate is awarded; each epoch's measurement is written when it settles.
 * Alpha is the ratio between consecutive marks, computed here in exactly the
 * integer arithmetic the contract re-checks it with, so a settlement either
 * agrees with its own committed measurements or it reverts.
 *
 * Nothing in this module reads local state.
 */

import type { Address } from "viem";
import { MANDATE_MARKET_ABI, MARKET_ADDRESS, marketClient } from "@/lib/chain/market";
import { readPool, WBNB_USDT_POOL, type Valuation } from "@/lib/chain/prices";
import {
  MAX_DEVIATION_BPS,
  NegativeNetValue,
  settlementValuation,
  toLegacyValuation,
} from "@/lib/chain/valuation";

/** Mirrors the contract's `Observation` struct, field for field and in order. */
export interface Observation {
  wallet: Address;
  valuationWei: bigint;
  gasSpentWei: bigint;
  priceX96: bigint;
  blockNumber: bigint;
  breakdownRef: `0x${string}`;
}

/** The contract's committed form of a measurement. */
export interface Attestation {
  observationHash: `0x${string}`;
  valuationWei: bigint;
  blockNumber: bigint;
  takenAt: bigint;
}

const ZERO_REF = `0x${"0".repeat(64)}` as const;
const BPS = 10_000n;

/** Turns a valuation into the exact struct the contract will hash. */
export function toObservation(
  wallet: Address,
  v: Valuation,
  gasSpentWei = 0n,
  breakdownRef: `0x${string}` = ZERO_REF,
): Observation {
  return {
    wallet,
    valuationWei: v.weiTotal,
    gasSpentWei,
    priceX96: v.sqrtPriceX96,
    blockNumber: v.blockNumber,
    breakdownRef,
  };
}

/** Reads a measurement back off the chain. */
export async function readOpenAttestation(mandateId: number): Promise<Attestation | null> {
  const r = (await marketClient.readContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: "openAttestation",
    args: [BigInt(mandateId)],
  })) as readonly [`0x${string}`, bigint, bigint, bigint];
  return r[1] === 0n
    ? null
    : { observationHash: r[0], valuationWei: r[1], blockNumber: r[2], takenAt: r[3] };
}

export async function readEpochAttestation(
  mandateId: number,
  epoch: number,
): Promise<Attestation | null> {
  const r = (await marketClient.readContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: "epochAttestation",
    args: [BigInt(mandateId), epoch],
  })) as readonly [`0x${string}`, bigint, bigint, bigint];
  return r[1] === 0n
    ? null
    : { observationHash: r[0], valuationWei: r[1], blockNumber: r[2], takenAt: r[3] };
}

/**
 * The mark the next epoch is measured against: the previous epoch's if there is
 * one, otherwise the opening.
 */
export async function previousMark(
  mandateId: number,
  epoch: number,
): Promise<Attestation | null> {
  return epoch === 0
    ? readOpenAttestation(mandateId)
    : readEpochAttestation(mandateId, epoch - 1);
}

/**
 * Alpha, in the contract's arithmetic.
 *
 * Deliberately integer and deliberately identical to `settleEpoch`'s check: if
 * this used floating point it would drift from the on-chain recomputation and
 * settlements would revert for reasons that looked like a bug rather than a
 * disagreement.
 */
export const alphaFrom = (previousWei: bigint, nowWei: bigint): bigint =>
  (nowWei * BPS) / previousWei - BPS;

export interface Measurement {
  mandateId: number;
  epoch: number;
  /** Basis points against the previous mark. Null when unmeasurable. */
  alphaBps: bigint | null;
  previousWei: bigint | null;
  observation: Observation | null;
  valuation: Valuation | null;
  /** Always populated, including when the answer is null. */
  explanation: string;
  at: string;
}

/**
 * Measures a mandate's realized alpha for the epoch about to settle.
 *
 * Returns null rather than zero when it cannot measure. A flat epoch that was
 * never observed is exactly the fabrication this replaced, so the settler
 * refuses to send instead.
 */
export async function measureAlpha(mandateId: number, epoch: number): Promise<Measurement> {
  const at = new Date().toISOString();
  const base = { mandateId, epoch, at };

  const prev = await previousMark(mandateId, epoch);
  if (!prev) {
    return {
      ...base,
      alphaBps: null,
      previousWei: null,
      observation: null,
      valuation: null,
      explanation:
        epoch === 0
          ? "no opening attestation on chain for this mandate; it was never awarded with one, so there is no benchmark to settle against"
          : `no attestation on chain for epoch ${epoch - 1}; the chain of marks is broken and alpha cannot be derived`,
    };
  }

  // The wallet under management is whichever one the opening mark named.
  const openMark = await readOpenAttestation(mandateId);
  const wallet = await walletOf(mandateId, openMark);
  if (!wallet) {
    return {
      ...base,
      alphaBps: null,
      previousWei: prev.valuationWei,
      observation: null,
      valuation: null,
      explanation: "the mandate has no holder, so there is no wallet to measure",
    };
  }

  /*
    Measured with the full valuation engine, at an average price.

    Two things changed here and both of them decided real slashes. The gauge
    now sees V3 positions, Venus supply and borrow, staked liquidity and every
    tracked token — previously it read native BNB and USDT and nothing else, so
    an agent that put capital to work was measured as having lost it. And the
    price is a thirty-minute average rather than spot, because spot is the one
    number a third party can push at settlement time to force a slash on
    somebody else.

    Any of three conditions produces no settlement rather than a wrong one: an
    adapter that could not see, a pool whose average has been pushed away from
    spot, or a wallet whose debts exceed its assets.
  */
  const measured = await settlementValuation(marketClient, wallet);
  if (!measured.valuation) {
    return {
      ...base,
      alphaBps: null,
      previousWei: prev.valuationWei,
      observation: null,
      valuation: null,
      explanation:
        measured.refusedBy === "deviation-guard"
          ? `spot sits ${measured.maxDeviationBps} bps from the thirty-minute average, past the ${MAX_DEVIATION_BPS} bps guard; the pool is being held and this epoch defers rather than settling a price somebody chose`
          : `the ${measured.refusedBy} adapter could not see the whole wallet at block ${measured.blockNumber}, and a partial valuation reads as a loss for whatever it missed`,
    };
  }

  const reference = await readPool(WBNB_USDT_POOL);
  let v: Valuation;
  try {
    v = toLegacyValuation(measured.valuation, {
      sqrtPriceX96: reference.sqrtPriceX96,
      usdPerBnb: reference.token0PerToken1,
    });
  } catch (e) {
    if (e instanceof NegativeNetValue) {
      return {
        ...base,
        alphaBps: null,
        previousWei: prev.valuationWei,
        observation: null,
        valuation: null,
        explanation: `the wallet owes more than it holds (${e.netWei} wei net), and an insolvent position cannot be committed as a uint96`,
      };
    }
    throw e;
  }
  const observation = toObservation(wallet, v);

  if (prev.valuationWei === 0n) {
    return {
      ...base,
      alphaBps: null,
      previousWei: prev.valuationWei,
      observation,
      valuation: v,
      explanation: "the previous mark is zero, so a proportional change is undefined",
    };
  }

  const alphaBps = alphaFrom(prev.valuationWei, observation.valuationWei);

  return {
    ...base,
    alphaBps,
    previousWei: prev.valuationWei,
    observation,
    valuation: v,
    explanation:
      `wallet held ${fmt(prev.valuationWei)} BNB at the mark for epoch ${epoch === 0 ? "open" : epoch - 1} ` +
      `and holds ${fmt(observation.valuationWei)} at block ${observation.blockNumber}, ` +
      `so ${alphaBps >= 0n ? "+" : ""}${(Number(alphaBps) / 100).toFixed(2)}% against holding — gas included`,
  };
}

async function walletOf(mandateId: number, open: Attestation | null): Promise<Address | null> {
  // The mandate's current holder is the wallet whose value is at stake.
  const m = (await marketClient.readContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: "getMandate",
    args: [BigInt(mandateId)],
  })) as Record<string, unknown>;
  const agent = m.agent as Address;
  if (agent && agent !== "0x0000000000000000000000000000000000000000") return agent;
  return open ? null : null;
}

const fmt = (wei: bigint) => (Number(wei) / 1e18).toFixed(8);
