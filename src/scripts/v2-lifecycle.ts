/**
 * A complete optimistic settlement on BNB Smart Chain, including a challenge.
 *
 *   npx tsx --env-file=.env --env-file=.env.local src/scripts/v2-lifecycle.ts
 *
 * The point of V2 is that settlement costs something to get wrong, and that
 * anyone can take the other side of it. Asserting that is easy. This runs it:
 * a mandate opened, bid on and awarded against a committed opening mark, an
 * epoch proposed with a stake, that proposal contradicted by a stranger for
 * the same block, and the dispute resolved with the loser's stake moving to
 * the winner — then a second epoch settled the ordinary way, unchallenged.
 *
 * Sized for the funds actually available. The mechanism is identical at any
 * size; only the numbers change.
 */

import { formatEther, parseEther, type Address, type Hex } from "viem";
import { MANDATE_MARKET_V2_ABI } from "@/lib/chain/abiV2";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";
import { valueWallet } from "@/lib/chain/prices";

const V2 = (process.env.NEXT_PUBLIC_MARKET_V2_ADDRESS ??
  "0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2") as Address;

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;
const owner = walletFor(norm(process.env.PRIVATE_KEY));
const agent = walletFor(norm(process.env.AGENT_A_KEY));

const CAPITAL = parseEther("0.00006");
const BOND = parseEther("0.00008");
const STAKE = parseEther("0.00002");
/** Must exceed the contract's 300s challenge window. */
const EPOCH_SECONDS = 360;
const EPOCHS_TOTAL = 4;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const bnb = (w: bigint) => Number(formatEther(w)).toFixed(8);

async function send(
  w: ReturnType<typeof walletFor>,
  functionName: string,
  args: unknown[],
  value?: bigint,
) {
  const hash = await w.writeContract({
    address: V2,
    abi: MANDATE_MARKET_V2_ABI,
    functionName,
    args,
    value,
    chain: marketChain,
    account: w.account!,
  } as never);
  const r = await marketClient.waitForTransactionReceipt({ hash });
  if (r.status === "reverted") throw new Error(`${functionName} reverted (${hash})`);
  return hash;
}

// The ABI is `as const`, so viem narrows function names and argument tuples.
// That is worth keeping for callers; here the names are dynamic, so the call
// is widened once, in one place, rather than cast at every use.
const read = (functionName: string, args: unknown[] = []): Promise<unknown> =>
  marketClient.readContract({
    address: V2,
    abi: MANDATE_MARKET_V2_ABI,
    functionName,
    args,
  } as never);

/** The measurement, in the shape the contract hashes. */
async function observe(wallet: Address, benchmarkWei: bigint) {
  const v = await valueWallet(wallet);
  return {
    wallet,
    valuationWei: v.weiTotal,
    gasSpentWei: 0n,
    priceX96: v.sqrtPriceX96,
    blockNumber: v.blockNumber,
    breakdownRef: `0x${"0".repeat(64)}` as Hex,
    benchmarkWei,
  };
}

if (marketChain.id !== 56) {
  console.error(`refusing: this is for BSC mainnet, chain is ${marketChain.id}.`);
  process.exit(1);
}

const balance = await marketClient.getBalance({ address: owner.account!.address });
log(`market ${V2}`);
log(`owner ${owner.account!.address} · ${bnb(balance)} BNB`);
log(`agent ${agent.account!.address} · ${bnb(await marketClient.getBalance({ address: agent.account!.address }))} BNB\n`);

// The agent needs enough for its bond, its challenge stake and gas. Topping it
// up is part of the run rather than a manual step, so this reproduces.
const need = BOND + STAKE + parseEther("0.0002");
const agentBalance = await marketClient.getBalance({ address: agent.account!.address });
if (agentBalance < need) {
  const top = need - agentBalance;
  log(`agent is short; sending ${bnb(top)} BNB`);
  const h = await owner.sendTransaction({
    account: owner.account!,
    chain: marketChain,
    to: agent.account!.address,
    value: top,
  });
  await marketClient.waitForTransactionReceipt({ hash: h });
  log(`agent now holds ${bnb(await marketClient.getBalance({ address: agent.account!.address }))} BNB\n`);
}

// ------------------------------------------------------------------ open
await send(
  owner,
  "openMandate",
  [
    1, // GridTrading
    "0x0000000000000000000000000000000000000000", // native BNB
    0n,
    0, // Benchmark.Hold
    200,
    2_000,
    2_500,
    EPOCH_SECONDS,
    EPOCHS_TOTAL,
    3,
    -1_000,
    // The bond must be at least a fifth of the capital under mandate. A flat
    // floor is only meaningful at one size.
    2_000,
  ],
  CAPITAL,
);
const id = Number(await read("mandateCount")) - 1;
log(`mandate ${id} opened · ${bnb(CAPITAL)} BNB · ${EPOCH_SECONDS}s epochs`);

await send(agent, "bid", [BigInt(id), 200, 0n, 0n], BOND);
log(`  agent bid ${bnb(BOND)} BNB`);

// The benchmark for Hold is the opening value: it does not move, so alpha
// reduces to the raw return — which is what V1 measured, expressed generally.
const opening = await observe(agent.account!.address as Address, 0n);
const openingWithBench = { ...opening, benchmarkWei: opening.valuationWei };
await send(owner, "award", [BigInt(id), 0n, openingWithBench]);
log(`  awarded · opening mark ${bnb(opening.valuationWei)} BNB at block ${opening.blockNumber}`);

// -------------------------------------------------- epoch 0, challenged
log(`\n  epoch 0 — proposed, then contradicted`);
log(`  waiting ${EPOCH_SECONDS}s for the epoch to elapse…`);
await new Promise((r) => setTimeout(r, (EPOCH_SECONDS + 5) * 1000));

const obs0 = await observe(agent.account!.address as Address, opening.valuationWei);
const agentReturn =
  (obs0.valuationWei * 10_000n) / opening.valuationWei - 10_000n;
const proposeHash = await send(owner, "proposeEpoch", [BigInt(id), agentReturn, obs0], STAKE);
log(`    proposed ${Number(agentReturn) / 100}% with a ${bnb(STAKE)} BNB stake`);
log(`    https://bscscan.com/tx/${proposeHash}`);

// A stranger disagrees about the same block. The agent plays that part here
// because it is the only other funded key available; the contract does not
// care who challenges, which is the point.
const contradiction = { ...obs0, valuationWei: obs0.valuationWei / 2n };
const challengeHash = await send(agent, "challengeEpoch", [BigInt(id), 0, contradiction], STAKE);
log(`    challenged: ${bnb(contradiction.valuationWei)} BNB, same block ${obs0.blockNumber}`);
log(`    https://bscscan.com/tx/${challengeHash}`);

const frozen = (await read("getMandate", [BigInt(id)])) as unknown as { epochsSettled: number };
log(`    epochs settled while contested: ${frozen.epochsSettled} — nothing moved`);

const resolveHash = await send(owner, "resolveChallenge", [BigInt(id), 0, true, 0n]);
log(`    resolved for the proposer · pot ${bnb(STAKE * 2n)} BNB to the winner`);
log(`    https://bscscan.com/tx/${resolveHash}`);

// ------------------------------------------------- epoch 1, unchallenged
log(`\n  epoch 1 — proposed and finalised unchallenged`);
log(`  waiting ${EPOCH_SECONDS}s…`);
await new Promise((r) => setTimeout(r, (EPOCH_SECONDS + 5) * 1000));

const prev = (await read("epochAttestation", [BigInt(id), 0])) as unknown as readonly [Hex, bigint, bigint, bigint, bigint];
const obs1 = await observe(agent.account!.address as Address, prev[4]);
const r1 = (obs1.valuationWei * 10_000n) / prev[1] - 10_000n;
const b1 = (obs1.benchmarkWei * 10_000n) / prev[4] - 10_000n;
await send(owner, "proposeEpoch", [BigInt(id), r1 - b1, obs1], STAKE);
log(`    proposed ${Number(r1 - b1) / 100}%`);

log(`    waiting out the 300s challenge window…`);
await new Promise((r) => setTimeout(r, 310_000));

const finalHash = await send(owner, "finaliseEpoch", [BigInt(id), 1]);
log(`    finalised · stake returned`);
log(`    https://bscscan.com/tx/${finalHash}`);

const m = (await read("getMandate", [BigInt(id)])) as unknown as {
  epochsSettled: number;
  cumulativeAlphaBps: bigint;
  capital: bigint;
  bond: bigint;
};
log(`\n  mandate ${id}: ${m.epochsSettled}/${EPOCHS_TOTAL} epochs · cumulative α ${Number(m.cumulativeAlphaBps) / 100}%`);
log(`  capital ${bnb(m.capital)} BNB · bond ${bnb(m.bond)} BNB`);
console.log(`\nV2_MANDATE_ID=${id}\n`);
