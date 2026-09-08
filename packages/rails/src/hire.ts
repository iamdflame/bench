/**
 * Rail 2 — Hire. The rail that makes this a marketplace rather than a shop.
 *
 * ---------------------------------------------------------------------------
 * The wall, and why this is the way through it
 * ---------------------------------------------------------------------------
 *
 * Every serious team building an agent marketplace on this chain hit the same
 * wall: you cannot safely hand a session key to a stranger's agent. A session
 * key binds a target and four selector bytes. It cannot bind an *argument*. So
 * granting `mint(...)` on PancakeSwap's position manager grants it with any
 * recipient the agent chooses, and the only thing between a hired stranger and
 * your liquidity is that the key sits in an isolated account. That is a real
 * boundary. It is not a binding.
 *
 * The usual responses are to hardcode third-party hiring off and become a
 * boutique, or to ship no signer at all and become a directory. Both are
 * consequences of assuming there is one way to hire.
 *
 * ERC-8183 is the other way. The buyer funds an escrow against a job; the
 * seller submits a deliverable committed on chain as a hash; after a dispute
 * window the escrow releases, and if the seller never delivers the buyer
 * reclaims the whole thing. **You never hand a stranger a key. You hand them
 * an escrow they can only open by doing the work.**
 *
 * That is why a three-rail marketplace is structurally a marketplace and a
 * session-only marketplace always collapses into a portfolio.
 *
 * ---------------------------------------------------------------------------
 * What this module is
 * ---------------------------------------------------------------------------
 *
 * A *plan builder*. It signs nothing and sends nothing. It takes a signed
 * quote and returns the exact transaction intents, the guardrails, and the
 * number of signatures the user will be asked for — all of it computed before
 * the user is asked for the first one. Nobody should discover a fourth wallet
 * popup halfway through paying for something.
 */

import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { ERC20_ABI, TOKENS, chainClient, erc8183, type Job, type SupportedChain } from "@bench/shared";

/**
 * The kernel's buyer surface, written to the five calls we make.
 *
 * `createJob` mints the job, `registerJob` binds the policy that decides
 * disputes, `setBudget` states the escrow, `approve` lets the kernel move the
 * $U, and `fund` moves it. They are ordinary contract calls, which is what
 * lets an Altana wallet batch all five into one atomic relayed intent — one
 * signature where a Studio buyer needs five self-paid transactions.
 */
/*
  The kernel's real interface, read off the deployed contract rather than
  transcribed from prose.

  Every signature here was wrong until 2026-09-08, and none of it had been
  noticed because no hire plan had ever been submitted: `createJob` took three
  arguments instead of five and in a different order, `setBudget` and `fund`
  were missing their trailing `bytes`, and `registerJob` was addressed to the
  kernel when it lives on the router. Five intents, five wrong selectors — the
  plan would have reverted on its first call and told the buyer nothing useful
  about why.

  Confirmed against chain 97 by calling `getJob(1)` and matching the returned
  tuple, and against `jobCounter()` on both chains: 56,748 jobs on mainnet,
  1,134 on testnet. A plan built from a signature nobody has sent is a
  hypothesis.
*/
export const COMMERCE_ABI = parseAbi([
  "function jobCounter() view returns (uint256)",
  "function paymentToken() view returns (address)",
  "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)",
  "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
  "function fund(uint256 jobId, uint256 expectedBudget, bytes optParams)",
  "function claimRefund(uint256 jobId)",
  "function getJob(uint256 jobId) view returns ((uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook, uint256 submittedAt, bytes32 deliverable))",
]);

/** `registerJob` and `settle` live on the router, not the kernel. */
export const ROUTER_ABI = parseAbi([
  "function registerJob(uint256 jobId, address policy)",
  "function settle(uint256 jobId, bytes evidence)",
]);

export const POLICY_ABI = parseAbi([
  "function disputeWindow() view returns (uint64)",
  "function dispute(uint256 jobId)",
]);

/** Job status, in the kernel's own order. */
export const JOB_STATUS = ["OPEN", "FUNDED", "SUBMITTED", "COMPLETED", "REJECTED", "EXPIRED"] as const;
export type JobStatusName = (typeof JOB_STATUS)[number];

/** One transaction the user will be asked to authorise, in plain terms. */
export interface Intent {
  /** Stable id, so the UI can label a failure precisely. */
  step: "approve" | "createJob" | "registerJob" | "setBudget" | "fund";
  /** What this call does, for a person. */
  says: string;
  to: Address;
  data: Hex;
  value: bigint;
}

/**
 * The guardrails, stated before the button rather than after the signature.
 *
 * Every field here answers a question a person is entitled to ask before
 * committing money to a stranger's agent, and every one is computed from the
 * plan rather than written as copy.
 */
export interface Guardrails {
  /** Where the money sits between funding and delivery. */
  custody: string;
  /** What we can do with it. Deliberately: nothing. */
  ourAccess: string;
  /** How the buyer gets it back if nothing arrives. */
  recovery: string;
  /** The exact moment reclaim becomes possible. */
  reclaimableAt: number;
  /** Seconds the buyer has to dispute after submission. */
  disputeWindowSeconds: number;
  /** Approval is for exactly the budget, not unlimited. */
  approvalMode: "exact" | "already-sufficient";
}

export interface HirePlan {
  chainId: SupportedChain;
  provider: Address;
  buyer: Address;
  /** Predicted from `jobCounter() + 1`. Job ids are 1-indexed. */
  jobId: bigint;
  budget: bigint;
  token: { address: Address; symbol: string; decimals: number };
  /** Absolute unix seconds. Must exceed now + disputeWindow. */
  expiredAt: number;
  /** The negotiated terms, verbatim, as they will sit on chain. */
  description: string;
  intents: Intent[];
  guardrails: Guardrails;
  /**
   * How many wallet prompts this will cost.
   *
   * Declared up front and honestly: one for an Altana batch, or the count of
   * intents for a plain EOA doing them one at a time.
   */
  maximumSignatures: number;
  /** Anything the buyer should know that is not a guardrail. */
  notes: string[];
}

export class QuoteRejected extends Error {
  constructor(readonly why: string) {
    super(why);
    this.name = "QuoteRejected";
  }
}

/**
 * Refuse a quote before it can cost anybody anything.
 *
 * Four conditions, checked in the order that fails cheapest. A quote that
 * fails here produces a named refusal on the hire screen — the failed
 * condition, not a toast and not a 500.
 */
export function assertAllowedQuote(
  quote: { accepted: boolean; price: bigint | null; currency: string | null; quoteExpiresAt: number | null },
  allow: { maxBudget: bigint; token: Address; now?: number },
): asserts quote is { accepted: true; price: bigint; currency: string; quoteExpiresAt: number | null } {
  const now = allow.now ?? Math.floor(Date.now() / 1000);
  if (!quote.accepted) throw new QuoteRejected("The agent did not accept this job.");
  if (quote.price === null || quote.price <= 0n) throw new QuoteRejected("The agent's quote states no price.");
  if (quote.price > allow.maxBudget)
    throw new QuoteRejected(
      `The agent quoted more than the ceiling this marketplace will escrow without you raising it.`,
    );
  if (quote.currency && quote.currency.toLowerCase() !== allow.token.toLowerCase())
    throw new QuoteRejected(
      "The agent quoted in a token the ERC-8183 kernel does not escrow. The kernel settles in $U and nothing else.",
    );
  if (quote.quoteExpiresAt !== null && quote.quoteExpiresAt <= now)
    throw new QuoteRejected("The agent's quote had already expired when it arrived.");
}

/** What the buyer's wallet currently holds and has already approved. */
export interface BuyerFacts {
  balance: bigint;
  allowance: bigint;
  /** True when no approve call is needed. Saves the buyer a signature. */
  allowanceSufficient: boolean;
  /** Set when they simply do not have the money. */
  shortfall: bigint | null;
}

export async function getBuyerFacts(
  chainId: SupportedChain,
  buyer: Address,
  budget: bigint,
): Promise<BuyerFacts> {
  const client = chainClient(chainId);
  const a = erc8183(chainId);
  const [balance, allowance] = await Promise.all([
    client
      .readContract({ address: a.paymentToken, abi: ERC20_ABI, functionName: "balanceOf", args: [buyer] })
      .catch(() => 0n),
    client
      .readContract({
        address: a.paymentToken,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [buyer, a.commerce],
      })
      .catch(() => 0n),
  ]);
  return {
    balance: balance as bigint,
    allowance: allowance as bigint,
    allowanceSufficient: (allowance as bigint) >= budget,
    shortfall: (balance as bigint) < budget ? budget - (balance as bigint) : null,
  };
}

/** The policy's dispute window, read rather than assumed. */
export async function readDisputeWindow(chainId: SupportedChain): Promise<number> {
  const a = erc8183(chainId);
  try {
    const w = await chainClient(chainId).readContract({
      address: a.policy,
      abi: POLICY_ABI,
      functionName: "disputeWindow",
    });
    return Number(w as bigint);
  } catch {
    // The kernel's default, used only when the read fails. Stated in the
    // plan's notes so a buyer knows the number was not read.
    return 900;
  }
}

/** Next job id, predicted. Job ids are 1-indexed off the counter. */
export async function nextJobId(chainId: SupportedChain): Promise<bigint> {
  const a = erc8183(chainId);
  const c = await chainClient(chainId).readContract({
    address: a.commerce,
    abi: COMMERCE_ABI,
    functionName: "jobCounter",
  });
  return (c as bigint) + 1n;
}

/**
 * Build the whole engagement, ready to sign, having signed nothing.
 *
 * `deadline = now + disputeWindow + an hour` follows the shape the strongest
 * implementation in this field uses: the seller needs room to submit, and the
 * dispute window has to fit inside the job's life or the escrow expires while
 * a dispute is still open.
 */
export async function buildHirePlan(input: {
  chainId: SupportedChain;
  buyer: Address;
  provider: Address;
  job: Job;
  budget: bigint;
  /** The signed negotiation result, which becomes `job.description` verbatim. */
  description: string;
  /** Extra submission time beyond the dispute window. */
  deadlineSeconds?: number;
  /** True when the buyer holds an Altana wallet and the five calls batch. */
  batched?: boolean;
}): Promise<HirePlan> {
  const { chainId, buyer, provider, budget, description } = input;

  /*
    The kernel rejects a description over 4096 bytes, and the description is the
    signed quote verbatim. Truncating it here would make the terms on chain
    differ from the terms the agent signed, which is the one thing an escrow
    cannot survive — so this refuses instead.
  */
  const descriptionBytes = new TextEncoder().encode(description).length;
  if (descriptionBytes > 4096) {
    throw new QuoteRejected(
      `The signed terms are ${descriptionBytes} bytes and the job kernel accepts 4096. They are not truncated here, because the description on chain has to be the quote the agent signed.`,
    );
  }
  const a = erc8183(chainId);
  const token = TOKENS[chainId].U;

  const [jobId, disputeWindow, facts] = await Promise.all([
    nextJobId(chainId),
    readDisputeWindow(chainId),
    getBuyerFacts(chainId, buyer, budget),
  ]);

  const now = Math.floor(Date.now() / 1000);
  const expiredAt = now + disputeWindow + (input.deadlineSeconds ?? 3_600);

  const intents: Intent[] = [];

  /*
    Exact approval, not unlimited.

    An unlimited approval is one signature cheaper and leaves the kernel able
    to move every $U the buyer will ever hold. The saving is not worth it, and
    a marketplace that quietly takes it has made a custody decision on the
    user's behalf without telling them.
  */
  if (!facts.allowanceSufficient) {
    intents.push({
      step: "approve",
      says: `Allow the job escrow to take exactly ${budget} units of ${token.symbol}, and no more.`,
      to: token.address,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [a.commerce, budget] }),
      value: 0n,
    });
  }

  intents.push(
    {
      step: "createJob",
      says: "Create the job on chain, carrying the terms the agent signed.",
      to: a.commerce,
      data: encodeFunctionData({
        abi: COMMERCE_ABI,
        functionName: "createJob",
        args: [provider, a.router, BigInt(expiredAt), description, a.router],
      }),
      value: 0n,
    },
    {
      step: "registerJob",
      says: "Bind the job to the policy that decides a dispute, so neither side picks the referee later.",
      to: a.router,
      data: encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "registerJob",
        args: [jobId, a.policy],
      }),
      value: 0n,
    },
    {
      step: "setBudget",
      says: `State the escrow: ${budget} units of ${token.symbol}.`,
      to: a.commerce,
      data: encodeFunctionData({
        abi: COMMERCE_ABI,
        functionName: "setBudget",
        args: [jobId, budget, "0x"],
      }),
      value: 0n,
    },
    {
      step: "fund",
      says: "Move the money into escrow. It leaves your wallet here and the agent cannot touch it.",
      /*
        `expectedBudget` is passed rather than omitted: the kernel compares it
        to what `setBudget` stored, so a job whose budget changed between the
        two calls reverts instead of quietly escrowing a different number.
      */
      data: encodeFunctionData({ abi: COMMERCE_ABI, functionName: "fund", args: [jobId, budget, "0x"] }),
      to: a.commerce,
      value: 0n,
    },
  );

  const notes: string[] = [];
  if (facts.shortfall !== null) {
    notes.push(
      `This wallet is short ${facts.shortfall} units of ${token.symbol}. The plan is complete and cannot be funded until that is covered.`,
    );
  }
  if (facts.allowanceSufficient) {
    notes.push("No approval is needed: this wallet has already allowed the escrow at least this much.");
  }
  notes.push(
    "The job id is predicted from the kernel's counter. If another job is created in the same block the batch reverts harmlessly and is retried against the new counter, because registerJob is client-only.",
  );

  return {
    chainId,
    provider,
    buyer,
    jobId,
    budget,
    token: { address: token.address, symbol: token.symbol, decimals: token.decimals },
    expiredAt,
    description,
    intents,
    guardrails: {
      custody: `The ${token.symbol} sits in the ERC-8183 escrow at ${a.commerce}, not with the agent and not with us.`,
      ourAccess: "This marketplace never holds your key and is not a party to the job. It cannot move, release or reclaim your escrow.",
      recovery: "If the agent never submits, you reclaim the whole escrow yourself after the deadline. One call, from your own wallet.",
      reclaimableAt: expiredAt,
      disputeWindowSeconds: disputeWindow,
      approvalMode: facts.allowanceSufficient ? "already-sufficient" : "exact",
    },
    maximumSignatures: input.batched ? 1 : intents.length,
    notes,
  };
}

/** The reclaim call, for a job whose seller never delivered. */
export function buildReclaim(chainId: SupportedChain, jobId: bigint): Intent {
  const a = erc8183(chainId);
  return {
    step: "fund",
    says: "Take the escrow back. The deadline passed and nothing was delivered.",
    to: a.commerce,
    data: encodeFunctionData({ abi: COMMERCE_ABI, functionName: "claimRefund", args: [jobId] }),
    value: 0n,
  };
}
