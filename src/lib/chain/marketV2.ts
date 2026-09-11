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
 *   `Observation` gained `benchmarkWei`, what the same capital would have been
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
 * The network's minimum moves, so this is measured, not remembered. On block
 * 121,176,407 every included transaction paid between 0.105 and 0.246 gwei
 * and a transaction at the quoted 0.05 propagated nowhere, so the floor was
 * set at 0.15. On 11 September, blocks 121,308,989 and 121,309,191 included
 * transactions from 0.05 gwei, with a median of 0.051 to 0.053. The floor is
 * now 0.06 gwei, a fifth above that, and a transaction with no receipt inside
 * the window is resent at double the price up to 1 gwei, so a floor set too
 * low costs a rebroadcast, not a stuck transaction.
 *
 * The first floor here was 3 gwei. It mined, and it paid fifteen to thirty
 * times what the block was clearing at, which on a budget of a few dollars
 * was the difference between running the plan and not.
 */
export const GAS_FLOOR = parseGwei("0.06");
export const GAS_CEILING = parseGwei("1");

export async function gasPrice(attempt = 0): Promise<bigint> {
  const quoted = await marketClient.getGasPrice().catch(() => 0n);
  const padded = (quoted * 12n) / 10n;
  const base = padded > GAS_FLOOR ? padded : GAS_FLOOR;
  const escalated = base * 2n ** BigInt(attempt);
  return escalated > GAS_CEILING ? GAS_CEILING : escalated;
}

/**
 * Waits for a receipt, and if none arrives inside the window, resends the
 * same nonce at the next escalation step. A replacement with a higher price
 * supersedes the stuck one; whichever mines first wins and the other is
 * dropped by the pool.
 */
export async function waitOrEscalate(
  hash: Hex,
  resend: (gasPrice: bigint) => Promise<Hex>,
  opts: { windowMs?: number; maxAttempts?: number } = {},
): Promise<{ hash: Hex; receipt: Awaited<ReturnType<typeof marketClient.waitForTransactionReceipt>> }> {
  const windowMs = opts.windowMs ?? 90_000;
  const maxAttempts = opts.maxAttempts ?? 3;
  let current = hash;
  for (let attempt = 1; ; attempt++) {
    try {
      const receipt = await marketClient.waitForTransactionReceipt({ hash: current, timeout: windowMs });
      return { hash: current, receipt };
    } catch (e) {
      if (attempt >= maxAttempts) throw e;
      const price = await gasPrice(attempt);
      if (price >= GAS_CEILING && attempt > 1) throw e;
      current = await resend(price);
    }
  }
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

/**
 * The adjudicator's wallet, and nothing else's.
 *
 * Owner and adjudicator were one key. That is the "admin can invent the
 * number and also keep the fees" objection, and it was true. The role now
 * signs with `ADJUDICATOR_KEY`, which must differ from the owner's key, and
 * the well-known anvil key is refused outright on a mainnet chain id.
 */
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export function adjudicatorWallet(): ReturnType<typeof walletFor> {
  const raw = process.env.ADJUDICATOR_KEY;
  if (!raw) throw new Error("ADJUDICATOR_KEY is not set; epochs are proposed by the adjudicator and there is no default.");
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (key.toLowerCase() === ANVIL_KEY && marketChain.id !== 31337) throw new Error("refusing anvil's test key on a public chain");
  const wallet = walletFor(key);
  const ownerRaw = process.env.PRIVATE_KEY;
  if (ownerRaw) {
    const owner = walletFor((ownerRaw.startsWith("0x") ? ownerRaw : `0x${ownerRaw}`) as Hex);
    if (owner.account!.address.toLowerCase() === wallet.account!.address.toLowerCase()) {
      throw new Error("ADJUDICATOR_KEY is the owner's key; the roles must be held by different keys");
    }
  }
  return wallet;
}

/** Who the contract says holds each role, read live. */
export async function roles(): Promise<{ owner: Address; adjudicator: Address; pendingAdjudicator: Address; block: number }> {
  const [owner, adjudicator, pendingAdjudicator, block] = await Promise.all([
    read("owner") as Promise<Address>,
    read("adjudicator") as Promise<Address>,
    read("pendingAdjudicator") as Promise<Address>,
    marketClient.getBlockNumber().then(Number),
  ]);
  return { owner, adjudicator, pendingAdjudicator, block };
}

export async function nominateAdjudicator(owner: ReturnType<typeof walletFor>, next: Address): Promise<Hex> {
  return send(owner, "nominateAdjudicator", [next]);
}

export async function acceptAdjudicator(nominee: ReturnType<typeof walletFor>): Promise<Hex> {
  return send(nominee, "acceptAdjudicator", []);
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
