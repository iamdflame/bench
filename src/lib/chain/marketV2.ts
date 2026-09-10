/**
 * The V2 settlement path, as a library rather than as a script.
 *
 * Optimistic settlement has existed on chain since V2 shipped and has never
 * had a module behind it: `proposeEpoch`, `challengeEpoch` and `finaliseEpoch`
 * appear in exactly two places in this repository, the ABI and a single
 * end-to-end script. Everything else that tried to settle went through
 * `src/lib/settlement.ts`, which speaks V1's `settleEpoch` and builds a
 * six-field `Observation` where V2 wants seven. So the automation that was
 * supposed to keep four books moving could not have worked.
 *
 * Two shapes changed between the versions and both are load-bearing:
 *
 *   `Observation` gained `benchmarkWei` — what the same capital would have been
 *   worth under the mandate's benchmark. Without it `award` reverts
 *   `StaleObservation` and alpha cannot be re-derived.
 *
 *   `Attestation` gained the same field, so a four-tuple decode of
 *   `epochAttestation` silently reads the wrong slots.
 *
 * Alpha here is benchmark-relative, which is the whole point of V2: the return
 * the agent produced, less the return the benchmark produced over the same two
 * marks. Under `Benchmark.Hold` the benchmark does not move and this reduces to
 * the raw return, which is what V1 measured.
 */

import { parseGwei, type Address, type Hex } from "viem";
import { MANDATE_MARKET_V2_ABI } from "./abiV2";
import { MARKET_V2 } from "./deployments";
import { marketClient, marketChain, walletFor } from "./market";

/** V2's observation: seven fields. The seventh is why this module exists. */
export interface ObservationV2 {
  wallet: Address;
  valuationWei: bigint;
  gasSpentWei: bigint;
  priceX96: bigint;
  blockNumber: bigint;
  breakdownRef: Hex;
  /** What the same capital would be worth under the mandate's benchmark. */
  benchmarkWei: bigint;
}

/** V2's attestation: five fields, not four. */
export interface AttestationV2 {
  observationHash: Hex;
  valuationWei: bigint;
  blockNumber: bigint;
  takenAt: bigint;
  benchmarkWei: bigint;
}

export const ZERO_REF = `0x${"0".repeat(64)}` as Hex;

const read = (fn: string, args: unknown[] = []) =>
  marketClient.readContract({
    address: MARKET_V2,
    abi: MANDATE_MARKET_V2_ABI,
    functionName: fn,
    args,
  } as never);

/**
 * A gas price the network will actually gossip.
 *
 * viem quotes BSC from `eth_gasPrice`, which returns the floor, and a
 * transaction sent at exactly the floor is accepted by the dataseed node you
 * sent it to and then propagated nowhere. Measured: a transfer at 0.05 gwei sat
 * in one node's pool indefinitely and was unknown to every other node; the same
 * transfer at 3 gwei mined in seconds.
 *
 * Twenty-one thousand gas at this price is about four cents, so the insurance
 * is free and a stuck nonce blocks every transaction behind it.
 */
const GAS_FLOOR = parseGwei("3");

async function gasPrice(): Promise<bigint> {
  const quoted = await marketClient.getGasPrice().catch(() => 0n);
  const doubled = quoted * 2n;
  return doubled > GAS_FLOOR ? doubled : GAS_FLOOR;
}

/**
 * Simulate, then send, and never by spreading the simulation's request.
 *
 * `simulateContract` returns a request whose `account` is an address. Handing
 * that to a wallet client talking to a public node makes viem reach for
 * `eth_sendTransaction`, which no public node serves. The local account has to
 * be passed as the object it is so the transaction is signed here.
 */
async function send(
  wallet: ReturnType<typeof walletFor>,
  functionName: string,
  args: unknown[],
  value?: bigint,
): Promise<Hex> {
  await marketClient.simulateContract({
    address: MARKET_V2,
    abi: MANDATE_MARKET_V2_ABI,
    functionName,
    args,
    value,
    account: wallet.account!.address,
  } as never);

  const hash = await wallet.writeContract({
    address: MARKET_V2,
    abi: MANDATE_MARKET_V2_ABI,
    functionName,
    args,
    value,
    chain: marketChain,
    account: wallet.account!,
    gasPrice: await gasPrice(),
  } as never);

  const receipt = await marketClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") throw new Error(`${functionName} reverted on chain`);
  return hash;
}

/* ------------------------------------------------------------------ reads */

export async function openAttestation(mandateId: number): Promise<AttestationV2 | null> {
  const raw = (await read("openAttestation", [BigInt(mandateId)]).catch(() => null)) as
    | readonly [Hex, bigint, bigint, bigint, bigint]
    | null;
  if (!raw || raw[3] === 0n) return null;
  return {
    observationHash: raw[0],
    valuationWei: raw[1],
    blockNumber: raw[2],
    takenAt: raw[3],
    benchmarkWei: raw[4],
  };
}

export async function epochAttestation(
  mandateId: number,
  epoch: number,
): Promise<AttestationV2 | null> {
  const raw = (await read("epochAttestation", [BigInt(mandateId), epoch]).catch(() => null)) as
    | readonly [Hex, bigint, bigint, bigint, bigint]
    | null;
  if (!raw || raw[3] === 0n) return null;
  return {
    observationHash: raw[0],
    valuationWei: raw[1],
    blockNumber: raw[2],
    takenAt: raw[3],
    benchmarkWei: raw[4],
  };
}

/** The mark an epoch is measured against: the previous epoch, or the open. */
export async function previousMarkV2(
  mandateId: number,
  epoch: number,
): Promise<AttestationV2 | null> {
  return epoch === 0 ? openAttestation(mandateId) : epochAttestation(mandateId, epoch - 1);
}

export async function proposalFor(mandateId: number, epoch: number) {
  return (await read("getProposal", [BigInt(mandateId), epoch]).catch(() => null)) as {
    proposer: Address;
    alphaBps: bigint;
    finalisableAt: bigint;
    challenged: boolean;
    resolved: boolean;
    proposerStake: bigint;
  } | null;
}

export const requiredBond = (mandateId: number) =>
  read("requiredBond", [BigInt(mandateId)]) as Promise<bigint>;

/* ------------------------------------------------------------- alpha ---- */

const ratioBps = (now: bigint, then: bigint) =>
  then === 0n ? null : (now * 10_000n) / then - 10_000n;

/**
 * Benchmark-relative alpha between two marks.
 *
 * Returns `null` rather than a number when either denominator is zero, because
 * a division that cannot be performed is not a performance of zero. Every
 * caller has to decide what to do about that, which is the behaviour
 * `measureAlpha` already established and the reason it is worth keeping.
 */
export function alphaBetween(
  previous: Pick<AttestationV2, "valuationWei" | "benchmarkWei">,
  current: Pick<ObservationV2, "valuationWei" | "benchmarkWei">,
): bigint | null {
  const agent = ratioBps(current.valuationWei, previous.valuationWei);
  const benchmark = ratioBps(current.benchmarkWei, previous.benchmarkWei);
  if (agent === null || benchmark === null) return null;
  return agent - benchmark;
}

/* ------------------------------------------------------------- writes --- */

export function openMandateArgs(opts: {
  category: 0 | 1 | 2 | 3;
  benchmark: 0 | 1 | 2;
  toleranceBps: number;
  feeBps: number;
  slashBps: number;
  epochLength: number;
  epochsTotal: number;
  strikes: number;
  catastrophicBps: number;
  bondFloorBps: number;
}): unknown[] {
  if (opts.epochLength <= 300) {
    throw new Error(
      `epochLength ${opts.epochLength}s does not exceed the 300s challenge window; the contract refuses it`,
    );
  }
  if (opts.strikes === 0) throw new Error("strikes must not be zero; the contract refuses it");
  if (opts.catastrophicBps >= 0) {
    throw new Error("the catastrophic threshold must be negative; the contract refuses it");
  }
  return [
    opts.category,
    "0x0000000000000000000000000000000000000000",
    0n,
    opts.benchmark,
    opts.toleranceBps,
    opts.feeBps,
    opts.slashBps,
    opts.epochLength,
    opts.epochsTotal,
    opts.strikes,
    opts.catastrophicBps,
    opts.bondFloorBps,
  ];
}

export const openMandate = (
  principal: ReturnType<typeof walletFor>,
  args: unknown[],
  capitalWei: bigint,
) => send(principal, "openMandate", args, capitalWei);

export const bid = (
  agent: ReturnType<typeof walletFor>,
  mandateId: number,
  targetAlphaBps: number,
  bondWei: bigint,
  ttl = 0n,
) => send(agent, "bid", [BigInt(mandateId), targetAlphaBps, 0n, ttl], bondWei);

export const award = (
  principal: ReturnType<typeof walletFor>,
  mandateId: number,
  bidIndex: number,
  opening: ObservationV2,
) => send(principal, "award", [BigInt(mandateId), BigInt(bidIndex), opening]);

export const proposeEpoch = (
  adjudicator: ReturnType<typeof walletFor>,
  mandateId: number,
  alphaBps: bigint,
  observation: ObservationV2,
  stakeWei: bigint,
) => send(adjudicator, "proposeEpoch", [BigInt(mandateId), alphaBps, observation], stakeWei);

export const challengeEpoch = (
  challenger: ReturnType<typeof walletFor>,
  mandateId: number,
  epoch: number,
  observation: ObservationV2,
  stakeWei: bigint,
) => send(challenger, "challengeEpoch", [BigInt(mandateId), epoch, observation], stakeWei);

/** Permissionless by design: a settlement only the proposer can complete is one they can withhold. */
export const finaliseEpoch = (
  anyone: ReturnType<typeof walletFor>,
  mandateId: number,
  epoch: number,
) => send(anyone, "finaliseEpoch", [BigInt(mandateId), epoch]);

export const closeMandate = (caller: ReturnType<typeof walletFor>, mandateId: number) =>
  send(caller, "closeMandate", [BigInt(mandateId)]);

export const withdraw = (caller: ReturnType<typeof walletFor>) =>
  send(caller, "withdraw", ["0x0000000000000000000000000000000000000000"]);

/* ------------------------------------------------------------ parameters */

export async function marketParameters() {
  const [paused, minBond, proposerStake, challengeWindow, minFineness, adjudicator, owner] =
    await Promise.all([
      read("paused") as Promise<boolean>,
      read("minBond") as Promise<bigint>,
      read("proposerStake") as Promise<bigint>,
      read("challengeWindow") as Promise<bigint>,
      read("minFineness") as Promise<number>,
      read("adjudicator") as Promise<Address>,
      read("owner") as Promise<Address>,
    ]);
  return { paused, minBond, proposerStake, challengeWindow, minFineness, adjudicator, owner };
}
