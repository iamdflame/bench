/**
 * Brings the mainnet market to life, carefully.
 *
 * This spends real BNB, so it is deliberately not the simulation loop. Every
 * step is explicit, amounts are declared up front, the whole plan is costed and
 * checked against the deployer's balance before anything is sent, and it stops
 * rather than improvising if the balance will not cover it.
 *
 *   npx tsx --env-file=.env src/scripts/seed-mainnet.ts plan
 *   npx tsx --env-file=.env src/scripts/seed-mainnet.ts run
 *   npx tsx --env-file=.env src/scripts/seed-mainnet.ts settle <alphaBps> [...]
 *   npx tsx --env-file=.env src/scripts/seed-mainnet.ts status
 */

import { formatEther, parseEther, type Address, type Hex } from "viem";
import {
  MANDATE_MARKET_ABI,
  MARKET_ADDRESS,
  marketChain,
  marketClient,
  readLiveMandates,
  walletFor,
} from "@/lib/chain/market";
import { assayAgent } from "@/lib/assay";
import { toObservation } from "@/lib/settlement";
import { valueWallet } from "@/lib/chain/prices";

const CMD = process.argv[2] ?? "plan";

const norm = (k: string | undefined): Hex =>
  (k?.startsWith("0x") ? k : `0x${k}`) as Hex;

const DEPLOYER = norm(process.env.PRIVATE_KEY);
const AGENT_KEYS = [norm(process.env.AGENT_A_KEY), norm(process.env.AGENT_B_KEY)];

/** Sizing for a small real-money market. Everything here is BNB. */
const FUND_PER_AGENT = parseEther("0.0018");
const CAPITAL_PER_MANDATE = parseEther("0.0025");
const BOND = parseEther("0.0008");
const MANDATES = [
  { category: 0, label: "Rebalancing" },
  { category: 3, label: "Health Factor" },
];
/** One hour per epoch, eight epochs. Slow, so settling does not burn gas fast. */
const EPOCH_SECONDS = 3_600;
const EPOCHS_TOTAL = 8;

const owner = walletFor(DEPLOYER);
const agents = AGENT_KEYS.map((k) => walletFor(k));

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const bnb = (w: bigint, dp = 6) => Number(formatEther(w)).toFixed(dp);

async function balance(a: Address) {
  return marketClient.getBalance({ address: a });
}

async function send(
  wallet: ReturnType<typeof walletFor>,
  functionName: string,
  args: unknown[],
  value?: bigint,
) {
  const hash = await wallet.writeContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName,
    args,
    value,
    chain: marketChain,
    account: wallet.account!,
  } as never);
  const receipt = await marketClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") throw new Error(`${functionName} reverted (${hash})`);
  return hash;
}

async function plan() {
  const deployerAddr = owner.account!.address;
  const have = await balance(deployerAddr);
  const gasPrice = await marketClient.getGasPrice();

  const funding = FUND_PER_AGENT * BigInt(agents.length);
  const capital = CAPITAL_PER_MANDATE * BigInt(MANDATES.length);
  // Roughly: 2 transfers, 2 assays, 1 gate, 2 opens, 4 bids, 2 awards.
  const txs = 13n;
  const gas = gasPrice * 200_000n * txs;
  const total = funding + capital + gas;

  console.log(`\nchain            ${marketChain.name} (${marketChain.id})`);
  console.log(`market           ${MARKET_ADDRESS}`);
  console.log(`deployer         ${deployerAddr}`);
  console.log(`gas price        ${Number(gasPrice) / 1e9} gwei\n`);
  console.log(`fund ${agents.length} agents      ${bnb(funding)} BNB`);
  console.log(`${MANDATES.length} mandates       ${bnb(capital)} BNB`);
  console.log(`gas headroom     ${bnb(gas)} BNB`);
  console.log(`                 ${"-".repeat(18)}`);
  console.log(`total            ${bnb(total)} BNB`);
  console.log(`available        ${bnb(have)} BNB`);
  console.log(
    `\n${have >= total ? "AFFORDABLE" : "NOT AFFORDABLE — reduce the sizing above"}` +
      `   headroom after: ${bnb(have > total ? have - total : 0n)} BNB\n`,
  );
  return have >= total;
}

async function run() {
  if (!(await plan())) {
    console.error("refusing to spend: the plan exceeds the balance.");
    process.exit(1);
  }

  // 1. Fund the agent wallets so they can post bonds and pay their own gas.
  for (const [i, a] of agents.entries()) {
    const addr = a.account!.address;
    const bal = await balance(addr);
    if (bal >= FUND_PER_AGENT) {
      log(`agent ${i} already funded (${bnb(bal)} BNB)`);
      continue;
    }
    const hash = await owner.sendTransaction({
      to: addr,
      value: FUND_PER_AGENT - bal,
      chain: marketChain,
      account: owner.account!,
    });
    await marketClient.waitForTransactionReceipt({ hash });
    log(`funded agent ${i} ${addr} with ${bnb(FUND_PER_AGENT - bal)} BNB`);
  }

  // 2. Assay each agent against BSC and publish the result on chain. The
  //    fineness is real: it comes from testing a live registry entry.
  const REFERENCE = ["304493", "330536"];
  for (const [i, a] of agents.entries()) {
    const report = await assayAgent(56, REFERENCE[i] ?? "304493");
    await send(owner, "publishAssay", [a.account!.address, report.fineness]);
    log(
      `assayed agent ${i} against BSC agent ${REFERENCE[i]} → ${report.fineness} fine, published`,
    );
  }

  // 3. Raise the bar so a bond alone is not enough to bid.
  await send(owner, "setMinFineness", [300]);
  log("gate set: 300 fine required to bid");

  // 4. Open the mandates and let both agents contest each one.
  for (const m of MANDATES) {
    const hash = await send(
      owner,
      "openMandate",
      [m.category, 200, 2_000, 2_500, EPOCH_SECONDS, EPOCHS_TOTAL],
      CAPITAL_PER_MANDATE,
    );
    const count = Number(
      await marketClient.readContract({
        address: MARKET_ADDRESS,
        abi: MANDATE_MARKET_ABI,
        functionName: "mandateCount",
      }),
    );
    const id = count - 1;
    log(`mandate ${id} opened · ${m.label} · ${bnb(CAPITAL_PER_MANDATE)} BNB · ${hash}`);

    for (const [i, a] of agents.entries()) {
      try {
        await send(a, "bid", [BigInt(id), 200 + i * 100], BOND);
        log(`  agent ${i} bid ${bnb(BOND)} BNB`);
      } catch (error) {
        log(`  agent ${i} refused: ${String(error).slice(0, 90)}`);
      }
    }

    // The opening mark is taken here, on chain, at award. There is no local
    // benchmark to lose and nothing to write down afterwards.
    const opening = toObservation(
      agents[0].account!.address,
      await valueWallet(agents[0].account!.address),
    );
    await send(owner, "award", [BigInt(id), 0n, opening]);
    log(
      `  awarded to agent 0 · opening mark ${bnb(opening.valuationWei)} BNB ` +
        `at block ${opening.blockNumber}`,
    );
  }

  await status();
}

/** Settles one epoch per live mandate with the alpha given on the command line. */
async function settle() {
  const alphas = process.argv.slice(3).map(Number);
  if (alphas.length === 0) {
    console.error("usage: settle <alphaBps> [alphaBps ...]  (one per live mandate)");
    process.exit(1);
  }
  const { live } = await readLiveMandates();
  const active = live.filter((m) => m.state === 1);
  for (const [i, m] of active.entries()) {
    const alpha = alphas[i] ?? alphas[alphas.length - 1];
    try {
      const hash = await send(owner, "settleEpoch", [BigInt(m.id), BigInt(alpha)]);
      log(`mandate ${m.id} settled ${alpha >= 0 ? "+" : ""}${(alpha / 100).toFixed(2)}% · ${hash}`);
    } catch (error) {
      log(`mandate ${m.id} settle failed: ${String(error).slice(0, 120)}`);
    }
  }
  await status();
}

/**
 * Opens a short-epoch mandate so the market can actually be watched.
 *
 * The main mandates settle hourly, which is right for a real market and
 * useless for demonstrating one. This opens a small mandate whose epochs are
 * a minute long, so a slash and a dismissal can be produced and pointed at on
 * a block explorer.
 */
async function fast() {
  const capital = parseEther("0.0015");
  const topUp = parseEther("0.0012");

  for (const [i, a] of agents.entries()) {
    const addr = a.account!.address;
    const bal = await balance(addr);
    if (bal >= topUp) continue;
    const hash = await owner.sendTransaction({
      to: addr,
      value: topUp - bal,
      chain: marketChain,
      account: owner.account!,
    });
    await marketClient.waitForTransactionReceipt({ hash });
    log(`topped up agent ${i} to ${bnb(topUp)} BNB`);
  }

  await send(owner, "openMandate", [1, 200, 2_000, 2_500, 60, 12], capital);
  const count = Number(
    await marketClient.readContract({
      address: MARKET_ADDRESS,
      abi: MANDATE_MARKET_ABI,
      functionName: "mandateCount",
    }),
  );
  const id = count - 1;
  log(`mandate ${id} opened · Grid Trading · ${bnb(capital)} BNB · 60s epochs`);

  for (const [i, a] of agents.entries()) {
    await send(a, "bid", [BigInt(id), 200 + i * 100], BOND);
    log(`  agent ${i} bid ${bnb(BOND)} BNB`);
  }
  const opening = toObservation(
    agents[0].account!.address,
    await valueWallet(agents[0].account!.address),
  );
  await send(owner, "award", [BigInt(id), 0n, opening]);
  log(`  awarded to agent 0 · successor queued · opening mark ${bnb(opening.valuationWei)} BNB`);
  await status();
}

async function status() {
  const { live, total } = await readLiveMandates();
  const have = await balance(owner.account!.address);
  console.log(`\nmandates opened all-time: ${total}`);
  for (const m of live) {
    console.log(
      `  #${m.id} state=${m.state} capital=${bnb(m.capital)} bond=${bnb(m.bond)} ` +
        `alpha=${Number(m.cumulativeAlphaBps) / 100}% epochs=${m.epochsSettled}/${m.epochsTotal} ` +
        `strikes=${m.strikes} agent=${m.agent.slice(0, 10)}…`,
    );
  }
  console.log(`\ndeployer balance: ${bnb(have)} BNB`);
  for (const [i, a] of agents.entries()) {
    console.log(`agent ${i} balance : ${bnb(await balance(a.account!.address))} BNB`);
  }
  console.log(`\nhttps://bscscan.com/address/${MARKET_ADDRESS}\n`);
}

if (marketChain.id !== 56 && CMD !== "plan") {
  console.error(
    `refusing: this script is for BSC mainnet, but MARKET_CHAIN_ID is ${marketChain.id}.`,
  );
  process.exit(1);
}

if (CMD === "plan") await plan();
else if (CMD === "run") await run();
else if (CMD === "settle") await settle();
else if (CMD === "fast") await fast();
else if (CMD === "status") await status();
else {
  console.error(`unknown command: ${CMD}`);
  process.exit(1);
}
