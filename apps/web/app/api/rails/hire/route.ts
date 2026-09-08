/**
 * Rail 2, planned.
 *
 * This endpoint builds the engagement and signs nothing. It returns the exact
 * transaction intents, the guardrails, and the number of signatures the buyer
 * will be asked for — computed before the first one is requested, because
 * nobody should discover a fourth wallet popup halfway through paying for
 * something.
 *
 * It signs nothing for a reason that is not caution. Funding an ERC-8183 job
 * moves the buyer's money, and this marketplace holds no buyer's key. A server
 * that could fund a job on your behalf would be a custodian, and the single
 * most valuable property of this rail is that it is not one: the escrow sits
 * in the kernel, we are not a party to it, and we could not release or reclaim
 * it if we wanted to.
 *
 * So the answer is a plan the caller executes from their own wallet, with
 * `executed: false` in the payload rather than only in the prose — a client
 * that ignores descriptions still cannot read the result as a receipt.
 */

import { NextResponse } from "next/server";
import { formatEther, type Address } from "viem";
import { TOKENS, jobBySlug, resolveChain } from "@bench/shared";
import { probeQuote } from "@bench/probe";
import { assertAllowedQuote, buildHirePlan, QuoteRejected } from "@bench/rails";
import { REASON_CODE_TEXT } from "@bench/probe";
import { findRow } from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The most this marketplace will plan without the buyer raising it. */
const MAX_BUDGET = 2_000_000_000_000_000_000n; // 2 $U

export async function POST(request: Request) {
  let body: { chainId?: number; id?: string; buyer?: string; budget?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, refusedBecause: "The request body was not readable JSON." }, { status: 400 });
  }

  const { chainId } = resolveChain(body.chainId);
  const id = String(body.id ?? "");
  const hit = findRow(chainId, id);
  if (!hit || !hit.agent) {
    return NextResponse.json(
      {
        ok: false,
        executed: false,
        refusedBecause:
          "Rail 2 escrows a job against a provider address. This listing has no on-chain agent identity, so there is nobody for the kernel to pay.",
      },
      { status: 200 },
    );
  }

  const agent = hit.agent;
  if (!agent.job.known) {
    return NextResponse.json(
      {
        ok: false,
        executed: false,
        refusedBecause: `It is not classified into one of the four jobs, so there is no job specification to quote against. ${agent.job.reason}`,
      },
      { status: 200 },
    );
  }
  const job = jobBySlug(agent.job.value)!;
  const provider = (agent.agentWallet ?? agent.owner) as Address | null;
  if (!provider) {
    return NextResponse.json(
      { ok: false, executed: false, refusedBecause: "The registry does not resolve this token to a wallet, so there is nobody to escrow against." },
      { status: 200 },
    );
  }

  /* ---------------------------------------------------------- 1. the quote */
  const quote = await probeQuote(agent.endpoint, job, { chainId });
  if (!quote.accepted) {
    const because =
      quote.reasonCode && REASON_CODE_TEXT[quote.reasonCode]
        ? `It was asked for a quote and declined: ${REASON_CODE_TEXT[quote.reasonCode]}.`
        : quote.refusal === "no-8183-seller"
          ? "It does not implement the ERC-8183 seller side, so there is no quote to escrow against. Rail 2 is the one rail that needs the other side to speak the protocol."
          : (quote.reason ?? "It did not return an accepted quote for this job.");
    return NextResponse.json({ ok: false, executed: false, refusedBecause: because }, { status: 200 });
  }

  /* --------------------------------------------------------- 2. the refusal */
  const u = TOKENS[chainId].U;
  try {
    assertAllowedQuote(quote, { maxBudget: MAX_BUDGET, token: u.address });
  } catch (e) {
    return NextResponse.json(
      { ok: false, executed: false, refusedBecause: e instanceof QuoteRejected ? e.why : String(e).slice(0, 200) },
      { status: 200 },
    );
  }

  /* ----------------------------------------------------------- 3. the plan */
  const buyer = (/^0x[0-9a-fA-F]{40}$/.test(body.buyer ?? "") ? body.buyer : provider) as Address;
  const plan = await buildHirePlan({
    chainId,
    buyer,
    provider,
    job,
    budget: quote.price!,
    description: JSON.stringify(quote.result ?? { task: job.title, price: quote.price!.toString() }).slice(0, 4096),
    batched: false,
  });

  return NextResponse.json({
    ok: true,
    /*
      Not a receipt. Nothing has been signed or sent, and saying so in the
      payload rather than only in the description means a client that never
      reads descriptions still cannot mistake this for one.
    */
    executed: false,
    plan: {
      jobId: plan.jobId.toString(),
      provider: plan.provider,
      budget: `${formatEther(plan.budget)} ${plan.token.symbol}`,
      expiredAt: plan.expiredAt,
      signatures: plan.maximumSignatures,
      steps: plan.intents.map((i) => ({ step: i.step, says: i.says, to: i.to, data: i.data })),
      guardrails: plan.guardrails,
      note: [
        `Nothing has been signed. These are the ${plan.intents.length} calls your wallet would make, in order.`,
        ...plan.notes,
      ].join(" "),
    },
  });
}
