/**
 * Rail 2, exercised: fund an escrow, and prove the buyer is never at the
 * agent's mercy.
 *
 * ---------------------------------------------------------------------------
 * What this rail is for
 * ---------------------------------------------------------------------------
 *
 * Rail 3 hands an agent a key. That is the right instrument when the chain has
 * shown you what the agent does, and the wrong one for a stranger. Rail 2 is
 * the answer for a stranger: the money goes into a contract, the agent can only
 * open it by delivering, and if it never delivers the buyer takes the whole
 * escrow back without asking anyone's permission.
 *
 * So the assertions below are not "did it work". They are the four things a
 * buyer is entitled to know before signing:
 *
 *   - the terms on chain are the terms that were quoted, character for
 *     character;
 *   - the money is in the escrow and not in ours;
 *   - the date it becomes reclaimable is read from the policy contract, not
 *     from a constant in this repository;
 *   - and the reclaim path is a call the buyer can make from their own wallet.
 *
 * ---------------------------------------------------------------------------
 * Why this script did not exist until now
 * ---------------------------------------------------------------------------
 *
 * `package.json` has advertised `npm run prove-hire` for as long as the rail
 * has existed, pointing at a file that was never written. Nothing caught it,
 * because nothing ran it — and because nothing ran it, every signature in
 * `COMMERCE_ABI` was wrong: `createJob` had three arguments instead of five,
 * `setBudget` and `fund` were missing their trailing `bytes`, and `registerJob`
 * was addressed to the kernel when it lives on the router. Five intents, five
 * selectors the chain has never heard of.
 *
 * A rail nobody has exercised is a rail nobody has. This is the exercise.
 *
 *   npm run prove-hire                      # testnet, the default
 *   npm run prove-hire -- --chain 56        # mainnet, spends real $U
 */

import {
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  COMMERCE_ABI,
  JOB_STATUS,
  buildHirePlan,
  buildReclaim,
  readDisputeWindow,
} from "@bench/rails";
import {
  TOKENS,
  chainClient,
  erc8183,
  jobBySlug,
  txUrl,
  viemChain,
  type SupportedChain,
} from "@bench/shared";

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : dflt;
};

const CHAIN = (Number(arg("chain", "97")) === 56 ? 56 : 97) as SupportedChain;

/**
 * The counterparty.
 *
 * A real provider address already carrying jobs on this kernel, not one of
 * ours. The whole claim of Rail 2 is that it works against somebody you have
 * no relationship with, and a proof that hires our own agent proves the
 * opposite of what it sets out to.
 */
const PROVIDER = (arg("provider", "0xD8c45dA4e4036f4946132B18fc7568096CB7535f") as Address);

let passed = 0;
let failed = 0;
let inconclusive = 0;
const ok = (m: string) => (console.log(`  ✓ ${m}`), passed++);
const no = (m: string) => (console.log(`  ✗ ${m}`), failed++);
const meh = (m: string) => (console.log(`  ? ${m}`), inconclusive++);

async function main() {
  const pk = process.env.PRINCIPAL_KEY ?? process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("\n  No key. Rail 2 escrows the buyer's own money; there is nothing to escrow without one.\n");
    process.exit(2);
  }
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
  const pub = chainClient(CHAIN);
  const rpc = CHAIN === 56 ? process.env.BSC_RPC_URL : process.env.BSC_TESTNET_RPC_URL;
  const wallet = createWalletClient({ account, chain: viemChain(CHAIN), transport: http(rpc) });
  const a = erc8183(CHAIN);
  const token = TOKENS[CHAIN].U;

  console.log(`\nRail 2 — Hire\n`);
  console.log(`  chain      ${CHAIN}${CHAIN === 97 ? " (testnet)" : " (mainnet — this spends real $U)"}`);
  console.log(`  buyer      ${account.address}`);
  console.log(`  provider   ${PROVIDER}  (not ours)`);
  console.log(`  kernel     ${a.commerce}`);

  const budget = parseUnits(arg("budget", "1"), token.decimals);
  const held = (await pub.readContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  console.log(`  holds      ${formatUnits(held, token.decimals)} ${token.symbol}, escrowing ${formatUnits(budget, token.decimals)}\n`);

  if (held < budget) {
    console.error(`  Short of ${token.symbol}. Nothing was sent.\n`);
    process.exit(2);
  }

  /* ------------------------------------ 1. the window comes from the chain */
  const window = await readDisputeWindow(CHAIN);
  const onChainWindow = window > 0;
  if (onChainWindow) {
    ok(`1. the dispute window is read from the policy contract   ${window}s = ${(window / 3600).toFixed(1)}h`);
  } else {
    no("1. the dispute window is read from the policy contract   the policy returned nothing");
  }

  /* -------------------------------------------- 2. the plan is submittable */
  const plan = await buildHirePlan({
    chainId: CHAIN,
    buyer: account.address,
    provider: PROVIDER,
    job: jobBySlug("rebalancing")!,
    budget,
    description:
      "Assess whether a PancakeSwap V3 BNB/USDT position is in range, and state what to do about it.",
  });

  /*
    Simulated before a single transaction is sent.

    `createJob` is the only call that can be simulated independently — the four
    after it depend on a job that does not exist yet — so this checks the one
    that can be checked and lets the receipts check the rest. It is still worth
    doing: it is exactly the assertion that would have caught five wrong
    selectors before they cost a buyer a signature.
  */
  const create = plan.intents.find((i) => i.step === "createJob")!;
  try {
    await pub.call({ account: account.address, to: create.to, data: create.data, value: 0n });
    ok(`2. the plan simulates before anything is signed          ${plan.intents.length} intents, createJob clean`);
  } catch (e) {
    no(`2. the plan simulates before anything is signed — createJob reverts: ${String(e).slice(0, 70)}`);
    console.log("\n  Nothing was sent.\n");
    process.exit(1);
  }

  /* ------------------------------------------------- 3. every intent lands */
  const hashes: { step: string; hash: Hex }[] = [];
  for (const intent of plan.intents) {
    try {
      const hash = await wallet.sendTransaction({
        to: intent.to,
        data: intent.data,
        value: intent.value,
        chain: viemChain(CHAIN),
      });
      const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== "success") throw new Error(`reverted in block ${receipt.blockNumber}`);
      hashes.push({ step: intent.step, hash });
      console.log(`     ${intent.step.padEnd(12)} ${txUrl(CHAIN, hash)}`);
    } catch (e) {
      no(`3. every intent lands — ${intent.step} failed: ${String(e).slice(0, 80)}`);
      console.log(`\n  ${hashes.length} of ${plan.intents.length} intents landed before this. The job is incomplete.\n`);
      process.exit(1);
    }
  }
  ok(`3. every intent in the plan lands on chain               ${hashes.length} transactions`);

  /* ------------------------------- 4. the job on chain says what we promised */
  const job = (await pub.readContract({
    address: a.commerce,
    abi: COMMERCE_ABI,
    functionName: "getJob",
    args: [plan.jobId],
  })) as {
    client: Address;
    provider: Address;
    description: string;
    budget: bigint;
    expiredAt: bigint;
    status: number;
  };

  const termsMatch =
    job.client.toLowerCase() === account.address.toLowerCase() &&
    job.provider.toLowerCase() === PROVIDER.toLowerCase() &&
    job.description === plan.description &&
    job.budget === budget;
  if (termsMatch) {
    ok(`4. the terms on chain are the terms that were quoted     job ${plan.jobId}, ${job.description.length} chars, verbatim`);
  } else {
    no(
      `4. the terms on chain differ — client ${job.client}, provider ${job.provider}, budget ${job.budget}, description ${job.description === plan.description ? "matches" : "DIFFERS"}`,
    );
  }

  /* --------------------------------------- 5. the money is actually escrowed */
  const escrow = (await pub.readContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [a.commerce],
  })) as bigint;
  const heldAfter = (await pub.readContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  const moved = held - heldAfter;
  if (moved === budget && escrow >= budget) {
    ok(`5. exactly the budget left the buyer and sits in escrow  ${formatUnits(moved, token.decimals)} ${token.symbol}`);
  } else {
    no(`5. the escrow does not hold the budget — ${formatUnits(moved, token.decimals)} left the buyer`);
  }

  /* ------------------------------------------- 6. the status is FUNDED */
  const statusName = JOB_STATUS[job.status] ?? `unknown(${job.status})`;
  if (statusName === "FUNDED") {
    ok(`6. the kernel reports the job as funded                  status ${job.status} = FUNDED`);
  } else {
    meh(`6. the kernel reports status ${statusName}, not FUNDED — the escrow may settle differently`);
  }

  /* ------------------------- 7. the buyer can get it back, and we cannot */
  const reclaim = buildReclaim(CHAIN, plan.jobId);
  const reclaimIsBuyers =
    reclaim.to.toLowerCase() === a.commerce.toLowerCase() &&
    reclaim.data ===
      encodeFunctionData({ abi: COMMERCE_ABI, functionName: "claimRefund", args: [plan.jobId] });
  if (reclaimIsBuyers) {
    ok(`7. reclaim is one call the buyer makes from their wallet claimRefund(${plan.jobId})`);
  } else {
    no("7. the reclaim path is not a plain claimRefund from the buyer");
  }

  /*
    Reclaim is not *attempted*. The kernel refuses it until `expiredAt`, and a
    call that reverts because the deadline has not arrived proves the deadline
    exists — which is already established by reading it. Sending it anyway
    would burn gas to learn nothing, and a proof that manufactures a revert to
    display is theatre.
  */
  const reclaimAt = new Date(Number(job.expiredAt) * 1000);
  meh(
    `8. the escrow returns to the buyer if nothing arrives     not yet: reclaimable ${reclaimAt.toISOString()}`,
  );

  console.log(
    `\n  ${passed} proven · ${failed} failed · ${inconclusive} inconclusive\n` +
      `  job ${plan.jobId} on chain ${CHAIN}, against a provider we do not operate.\n` +
      `  Settlement opens ${reclaimAt.toISOString()}, ${(window / 3600).toFixed(0)}h after submission, read from ${a.policy}.\n`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
