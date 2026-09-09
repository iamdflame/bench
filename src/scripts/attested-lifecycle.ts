/**
 * A complete attested mandate, on BNB Smart Chain mainnet.
 *
 * Open, bid, award with an opening measurement, settle against it. Every step
 * is real and every number that decides an outcome is committed on chain, so
 * this produces the artifact `mandate-verify` checks: a mandate whose alpha a
 * stranger can re-derive without asking us for anything.
 *
 * Sized for the funds actually available rather than for a good screenshot.
 * The mechanism is identical at any size; only the numbers change.
 *
 *   npx tsx --env-file=.env --env-file=.env.local src/scripts/attested-lifecycle.ts plan
 *   npx tsx ... attested-lifecycle.ts run
 *   npx tsx ... attested-lifecycle.ts settle <mandateId>
 */

import { formatEther, parseEther, type Address, type Hex } from "viem";
import {
  MANDATE_MARKET_ABI,
  MARKET_ADDRESS,
  marketChain,
  marketClient,
  readMandate,
  walletFor,
} from "@/lib/chain/market";
import { valueWallet } from "@/lib/chain/prices";
import { measureAlpha, toObservation } from "@/lib/settlement";

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;
const owner = walletFor(norm(process.env.PRIVATE_KEY));
const agent = walletFor(norm(process.env.AGENT_A_KEY));

/** Sized against ~$1.15 of real funds. */
const MIN_BOND = parseEther("0.00004");
const BOND = parseEther("0.00008");
const CAPITAL = parseEther("0.00015");
const EPOCH_SECONDS = 60;
const EPOCHS_TOTAL = 6;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const bnb = (w: bigint) => Number(formatEther(w)).toFixed(8);
const cmd = process.argv[2] ?? "plan";

async function send(
  w: ReturnType<typeof walletFor>,
  functionName: string,
  args: unknown[],
  value?: bigint,
) {
  const hash = await w.writeContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
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

async function plan() {
  const o = await marketClient.getBalance({ address: owner.account!.address });
  const a = await marketClient.getBalance({ address: agent.account!.address });
  const gas = (await marketClient.getGasPrice()) * 180_000n * 6n;
  const need = CAPITAL + gas;

  console.log(`\nmarket    ${MARKET_ADDRESS}`);
  console.log(`principal ${owner.account!.address}  ${bnb(o)} BNB`);
  console.log(`agent     ${agent.account!.address}  ${bnb(a)} BNB\n`);
  console.log(`capital   ${bnb(CAPITAL)} BNB`);
  console.log(`bond      ${bnb(BOND)} BNB  (from the agent)`);
  console.log(`gas       ${bnb(gas)} BNB\n`);
  console.log(`principal needs ${bnb(need)} — ${o >= need ? "OK" : "SHORT"}`);
  console.log(`agent needs     ${bnb(BOND + gas / 6n)} — ${a >= BOND + gas / 6n ? "OK" : "SHORT"}\n`);
  return o >= need && a >= BOND + gas / 6n;
}

async function run() {
  if (!(await plan())) {
    console.error("refusing to spend: the plan exceeds available funds.");
    process.exit(1);
  }

  const current = (await marketClient.readContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: "minBond",
  })) as bigint;
  if (current > MIN_BOND) {
    await send(owner, "setMinBond", [MIN_BOND]);
    log(`minBond lowered to ${bnb(MIN_BOND)} BNB for a demonstration at this size`);
  }

  await send(
    owner,
    "openMandate",
    [1 /* GridTrading */, 200, 2_000, 2_500, EPOCH_SECONDS, EPOCHS_TOTAL],
    CAPITAL,
  );
  const count = Number(
    await marketClient.readContract({
      address: MARKET_ADDRESS,
      abi: MANDATE_MARKET_ABI,
      functionName: "mandateCount",
    }),
  );
  const id = count - 1;
  log(`mandate ${id} opened · Grid Trading · ${bnb(CAPITAL)} BNB · ${EPOCH_SECONDS}s epochs`);

  await send(agent, "bid", [BigInt(id), 200], BOND);
  log(`  agent bid ${bnb(BOND)} BNB`);

  // The opening mark. Taken now, on chain, before the outcome is known.
  const v = await valueWallet(agent.account!.address as Address);
  const opening = toObservation(agent.account!.address as Address, v);
  const hash = await send(owner, "award", [BigInt(id), 0n, opening]);

  log(`  awarded with an opening attestation`);
  log(`    wallet   ${opening.wallet}`);
  log(`    value    ${bnb(opening.valuationWei)} BNB`);
  log(`    block    ${opening.blockNumber}`);
  log(`    priceX96 ${opening.priceX96}`);
  log(`    https://bscscan.com/tx/${hash}`);

  const stored = (await marketClient.readContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: "openAttestation",
    args: [BigInt(id)],
  })) as readonly [string, bigint, bigint, bigint];
  log(`  committed on chain: hash ${stored[0].slice(0, 18)}… value ${bnb(stored[1])} block ${stored[2]}`);
  console.log(`\nMANDATE_ID=${id}`);
}

async function settle(id: number) {
  const m = await readMandate(id);
  const measurement = await measureAlpha(id, m.epochsSettled);
  console.log(`\nmandate ${id} · epoch ${m.epochsSettled}`);
  console.log(`  ${measurement.explanation}`);

  if (measurement.alphaBps === null || !measurement.observation) {
    console.error("\nrefusing to settle: not measurable.");
    process.exit(1);
  }

  const hash = await send(owner, "settleEpoch", [
    BigInt(id),
    measurement.alphaBps,
    measurement.observation,
  ]);
  console.log(`\n  settled at ${(Number(measurement.alphaBps) / 100).toFixed(2)}%`);
  console.log(`  https://bscscan.com/tx/${hash}`);
  console.log(`  the contract re-derived this alpha from the two committed marks and agreed.`);
}

if (marketChain.id !== 56) {
  console.error(`refusing: this script is for BSC mainnet, chain is ${marketChain.id}.`);
  process.exit(1);
}

if (cmd === "plan") await plan();
else if (cmd === "run") await run();
else if (cmd === "settle") await settle(Number(process.argv[3]));
else {
  console.error("usage: attested-lifecycle.ts <plan|run|settle <id>>");
  process.exit(1);
}
