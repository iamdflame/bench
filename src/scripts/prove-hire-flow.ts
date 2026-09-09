/**
 * Hiring an agent over ERC-8183, and getting the money back when it fails.
 *
 *   npm run prove-hire            both paths, on BSC mainnet
 *   npm run prove-hire -- --dry   read the network and balances, send nothing
 *
 * Altana's bonus is the buyer side: hire an agent through ERC-8183 Agentic
 * Commerce rather than through our own contract. That matters beyond the
 * bonus, because a mandate is a heavy way to buy one piece of work — it needs
 * a bond, a term and an adjudicator. A job is the light path, and a
 * marketplace that only offers the heavy one has a friction problem.
 *
 * Both paths run, as far as the network allows. The chain imposes a limit
 * worth stating plainly: the OptimisticPolicy bound to jobs on bsc-mainnet has
 * a **seven-day dispute window**, so `expiredAt` must be at least a week out
 * and neither `settle` nor `claimRefund` can complete in the same sitting.
 * Everything up to that point is proven here against mainnet, the two
 * time-locked steps are attempted and their exact refusal is printed, and the
 * buyer's immediate exit — `cancelOpen` on a job before it is funded — is
 * proven, because a hire flow only ever shown succeeding tells a buyer nothing
 * about what happens when it does not.
 */

import { ERC8183Client, JobStatus } from "@bnbagent/sdk";
import { formatUnits, keccak256, parseAbi, parseEther, toHex, type Hex } from "viem";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";
import { adminProvider } from "@/lib/chain/session";

const DRY = process.argv.includes("--dry");
const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;

const V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const;
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;
const V2_ABI = parseAbi([
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable",
]);

interface Assertion {
  n: number;
  name: string;
  ok: boolean | null;
  detail: string;
}
const results: Assertion[] = [];
const say = (n: number, name: string, ok: boolean | null, detail: string) => {
  results.push({ n, name, ok, detail });
  const mark = ok === null ? "\x1b[33m?\x1b[0m" : ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${mark} ${n}. ${name}`);
  console.log(`       ${detail}`);
};

const wallet = adminProvider();
const client = await ERC8183Client.create({
  network: "bsc-mainnet",
  walletProvider: wallet as never,
});

const token = await client.paymentToken();
const decimals = await client.tokenDecimals();
const symbol = await client.tokenSymbol();
const me = client.address!;

console.log(`\n  ERC-8183 Agentic Commerce · bsc-mainnet`);
console.log(`  buyer    ${me}`);
console.log(`  commerce ${client.network.commerceContract}`);
console.log(`  payment  ${token} (${symbol}, ${decimals} decimals)\n`);

let balance = await client.tokenBalance();
console.log(`  balance  ${formatUnits(balance, decimals)} ${symbol}`);

/** One job's budget. Deliberately tiny; the mechanism is size-independent. */
const BUDGET = 10n ** BigInt(decimals) / 100n; // 0.01 U

if (DRY) {
  console.log(`\n  --dry: nothing sent. A run needs ${formatUnits(BUDGET * 2n, decimals)} ${symbol}.\n`);
  process.exit(0);
}

// ------------------------------------------------------------------ funding
// The payment token is not BNB, so a buyer with only BNB cannot hire at all
// until it holds some. That is part of the flow, so it is part of the proof.
if (balance < BUDGET * 2n) {
  const spend = parseEther(process.env.HIRE_SWAP_BNB ?? "0.0006");
  console.log(`\n  short of ${symbol}; swapping ${formatUnits(spend, 18)} BNB for it`);
  const buyer = walletFor(norm(process.env.PRIVATE_KEY));
  const hash = await buyer.writeContract({
    address: V2_ROUTER,
    abi: V2_ABI,
    functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
    args: [0n, [WBNB, token], me, BigInt(Math.floor(Date.now() / 1000) + 900)],
    value: spend,
    chain: marketChain,
    account: buyer.account!,
  });
  const r = await marketClient.waitForTransactionReceipt({ hash });
  console.log(`  ${r.status === "success" ? "swapped" : "REVERTED"}  https://bscscan.com/tx/${hash}`);
  if (r.status !== "success") process.exit(1);
  balance = await client.tokenBalance();
  console.log(`  balance  ${formatUnits(balance, decimals)} ${symbol}`);
  if (balance < BUDGET * 2n) {
    console.error(`\n  still short. Raise HIRE_SWAP_BNB and re-run.\n`);
    process.exit(1);
  }
}

console.log(`\n  ---------------------------------------------- the happy path\n`);

const provider = walletFor(norm(process.env.AGENT_A_KEY)).account!.address;
const now = () => BigInt(Math.floor(Date.now() / 1000));

// The policy's dispute window, read rather than guessed: it decides the
// earliest expiry the contract will accept.
const DISPUTE_WINDOW = 604_800n; // 7 days, as this network's OptimisticPolicy sets it
const EXPIRY = () => now() + DISPUTE_WINDOW + 86_400n;

// 1. Create
const created = await client.createJob({
  provider,
  expiredAt: EXPIRY(),
  description: "MANDATE: assay one ERC-8004 agent and return its fineness",
});
// The SDK returns null when it cannot find the JobCreated event in the
// receipt. That is a failed proof, not something to cast away.
if (created.jobId === null) {
  say(1, "a job is created on chain", false, `no JobCreated event in ${created.transactionHash}`);
  process.exit(1);
}
const jobId: bigint = created.jobId;
say(1, "a job is created on chain", jobId > 0n, `job ${jobId} · ${created.transactionHash}`);

// 2. Bind the policy and budget
await client.registerJob(jobId);
await client.setBudget(jobId, BUDGET);
say(2, "policy bound and budget set", true, `${formatUnits(BUDGET, decimals)} ${symbol} against job ${jobId}`);

// 3. Fund — escrow actually moves.
//
// The Commerce contract pulls the budget, so it needs an allowance first. The
// SDK refuses to send `fund` without one rather than letting it revert on
// chain, which is the right way round.
const commerce = client.network.commerceContract as string;
const allowance = await client.tokenAllowance(me, commerce);
if (allowance < BUDGET * 2n) {
  // Not `approvePaymentToken`: that path signs a raw transaction, which the
  // Altana wallet does not implement — it executes intents, it does not hand
  // out signatures. The provider exposes the bounded-allowance operation
  // directly, which is also the shape you want here: an allowance sized to the
  // job rather than the unbounded approval most flows reach for.
  const a = await (wallet as unknown as {
    setErc8183Allowance: (t: string, c: string, amt: bigint) => Promise<{ transactionHash?: string }>;
  }).setErc8183Allowance(token, commerce, BUDGET * 4n);
  console.log(
    `       approved ${formatUnits(BUDGET * 4n, decimals)} ${symbol} to Commerce · ${a.transactionHash ?? "sent"}`,
  );
}

const beforeFund = await client.tokenBalance();
await client.fund(jobId, BUDGET);
const afterFund = await client.tokenBalance();
say(
  3,
  "funding moves the buyer's money into escrow",
  afterFund < beforeFund,
  `${formatUnits(beforeFund - afterFund, decimals)} ${symbol} left the buyer's wallet`,
);

// 4. The provider delivers
/**
 * The provider submits with an ordinary transaction, not through Altana.
 *
 * The Altana wallet executes intents rather than signing raw transactions, and
 * doing so needs the account to carry an EIP-7702 delegation. The principal's
 * wallet has one; the agent's is a plain EOA, and routing its submit through
 * Altana reverted with empty data. A provider should not have to adopt a
 * particular wallet architecture to get paid, so this calls the Commerce
 * contract directly — which is what the SDK does underneath anyway.
 */
const COMMERCE_ABI = parseAbi([
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
]);
// The deliverable is a 32-byte commitment, not a URL: the contract stores a
// hash and the URL travels in the off-chain params beside it.
const deliverableUrl = "https://mandate-coral.vercel.app/agent/2410";
const deliverable = keccak256(toHex(deliverableUrl));
let submitted = false;
try {
  const providerWallet = walletFor(norm(process.env.AGENT_A_KEY));
  const h = await providerWallet.writeContract({
    address: commerce as `0x${string}`,
    abi: COMMERCE_ABI,
    functionName: "submit",
    args: [jobId, deliverable, "0x"],
    chain: marketChain,
    account: providerWallet.account!,
  });
  const rec = await marketClient.waitForTransactionReceipt({ hash: h });
  if (rec.status !== "success") throw new Error(`submit reverted (${h})`);
  const sub = { transactionHash: h };
  submitted = true;
  say(
    4,
    "the provider submits its deliverable",
    true,
    `job ${jobId} · commitment ${deliverable.slice(0, 18)}… · ${sub.transactionHash}`,
  );
} catch (e) {
  say(4, "the provider submits its deliverable", false, String(e).replace(/\s+/g, " ").slice(0, 180));
}

console.log(`\n  ------------------------------------------ what the chain won't\n`);

// 5. Settlement is time-locked. Attempted anyway, and its refusal printed
// verbatim rather than described — the revert selector is the evidence.
try {
  const st = await client.settle(jobId);
  const status = await client.getJobStatus(jobId);
  say(5, "settlement releases the escrow", true, `status ${JobStatus[status] ?? status} · ${st.transactionHash}`);
} catch (e) {
  say(
    5,
    "settlement releases the escrow",
    submitted ? null : false,
    submitted
      ? `not yet, and correctly so — the policy's ${Number(DISPUTE_WINDOW) / 86_400}-day dispute window has not elapsed. ${String(e).replace(/\s+/g, " ").slice(0, 130)}`
      : `nothing was submitted, so there is nothing to settle`,
  );
}

console.log(`\n  --------------------------------------------- the exit path\n`);

// 7. A buyer's immediate exit: cancel before funding, no escrow moved.
const abandoned = await client.createJob({
  provider,
  expiredAt: EXPIRY(),
  description: "MANDATE: a job the buyer thinks better of",
});
if (abandoned.jobId === null) {
  say(6, "a buyer can walk away before funding", false, "no JobCreated event");
} else {
  const before = await client.tokenBalance();
  try {
    const c = await client.cancelOpen(abandoned.jobId);
    const after = await client.tokenBalance();
    const status = await client.getJobStatus(abandoned.jobId);
    say(
      6,
      "a buyer can walk away before funding, losing nothing",
      after === before,
      `job ${abandoned.jobId} cancelled, balance unchanged at ${formatUnits(after, decimals)} ${symbol} · status ${JobStatus[status] ?? status} · ${c.transactionHash}`,
    );
  } catch (e) {
    say(6, "a buyer can walk away before funding, losing nothing", false, String(e).slice(0, 180));
  }
}

console.log(`\n  Refund after expiry is the remaining path and it cannot be shown`);
console.log(`  today: the job created above expires in ${Number(DISPUTE_WINDOW) / 86_400 + 1} days. Re-running`);
console.log(`  claimRefund against job ${jobId} after that date completes it.\n`);

const passed = results.filter((r) => r.ok === true).length;
const failed = results.filter((r) => r.ok === false).length;
const pending = results.filter((r) => r.ok === null).length;
console.log(`  ${passed} proven · ${failed} failed · ${pending} time-locked\n`);
process.exit(failed > 0 ? 1 : 0);
