/**
 * Building an ERC-8183 escrow plan, in one place.
 *
 * Two callers need it and they must not drift: `/api/rails/hire`, which serves
 * agents and anything else speaking to the machine surface, and the hire screen
 * itself, which renders the plan server-side so the whole document is in the
 * HTML with JavaScript switched off.
 *
 * Written as one function because the alternative was two, and the first bug in
 * this rail came from exactly that shape — the route defaulted the buyer to the
 * *provider* when none was posted, so every plan ever shown decided whether an
 * approval step was needed by reading the counterparty's allowance. A plan that
 * is wrong about what it will ask you to sign is worse than no plan.
 */

import { formatEther, type Address } from "viem";
import { REASON_CODE_TEXT, probeQuote } from "@bench/probe";
import { TOKENS, jobBySlug, type SupportedChain } from "@bench/shared";
import { assertAllowedQuote, buildHirePlan, QuoteRejected } from "@bench/rails";
import { findRow } from "@/lib/board";

/** The most this marketplace will plan without the buyer raising it. */
export const MAX_BUDGET = 2_000_000_000_000_000_000n; // 2 $U

export interface WirePlan {
  jobId: string;
  buyer: Address;
  provider: Address;
  budget: string;
  expiredAt: number;
  /** Read from the policy contract, never assumed. */
  disputeWindow: number;
  settlesAt: string;
  signatures: number;
  steps: { step: string; says: string; to: Address; data: `0x${string}`; value: string }[];
  guardrails: unknown;
  note: string;
}

export type PlanResult = { ok: true; plan: WirePlan } | { ok: false; refusedBecause: string; status?: number };

export async function planFor(
  chainId: SupportedChain,
  id: string,
  buyer: Address | null,
  opts: { batched?: boolean } = {},
): Promise<PlanResult> {
  const no = (refusedBecause: string, status?: number): PlanResult => ({ ok: false, refusedBecause, status });

  if (!buyer) {
    return no(
      "An escrow plan is specific to the wallet that funds it — whether an approval is needed depends on your allowance, not on anyone else's. Connect a wallet, or paste an address, and this returns the exact calls yours would make.",
    );
  }

  const hit = findRow(chainId, id);
  if (!hit?.agent) return no("This id is not an agent on the board, so there is nothing to hire.", 404);
  const agent = hit.agent;

  if (!agent.job.known) {
    return no(
      `It is not classified into one of the four jobs, so there is no job specification to quote against. ${agent.job.reason}`,
    );
  }
  const job = jobBySlug(agent.job.value)!;
  const provider = (agent.agentWallet ?? agent.owner) as Address | null;
  if (!provider) {
    return no("The registry does not resolve this token to a wallet, so there is nobody to escrow against.");
  }

  /* ------------------------------------------------------------- the quote */
  const quote = await probeQuote(agent.endpoint, job, { chainId });
  if (!quote.accepted) {
    return no(
      quote.reasonCode && REASON_CODE_TEXT[quote.reasonCode]
        ? `It was asked for a quote and declined: ${REASON_CODE_TEXT[quote.reasonCode]}.`
        : quote.refusal === "no-8183-seller"
          ? "It does not implement the ERC-8183 seller side, so there is no quote to escrow against. Rail 2 is the one rail that needs the other side to speak the protocol."
          : (quote.reason ?? "It did not return an accepted quote for this job."),
    );
  }

  const u = TOKENS[chainId].U;
  try {
    assertAllowedQuote(quote, { maxBudget: MAX_BUDGET, token: u.address });
  } catch (e) {
    return no(e instanceof QuoteRejected ? e.why : String(e).slice(0, 200));
  }

  /* -------------------------------------------------------------- the plan */
  const built = await buildHirePlan({
    chainId,
    buyer,
    provider,
    job,
    budget: quote.price!,
    description: JSON.stringify(quote.result ?? { task: job.title, price: quote.price!.toString() }).slice(0, 4096),
    batched: Boolean(opts.batched),
  });

  return {
    ok: true,
    plan: {
      jobId: built.jobId.toString(),
      buyer,
      provider: built.provider,
      budget: `${formatEther(built.budget)} ${built.token.symbol}`,
      expiredAt: built.expiredAt,
      disputeWindow: built.guardrails.disputeWindowSeconds,
      /*
        §12.3 wants the settlement date on the screen, not the window in
        seconds. Both are here: the window because it is the fact read from the
        contract, the date because it is the one a person can act on.
      */
      settlesAt: new Date(built.expiredAt * 1000).toISOString(),
      signatures: built.maximumSignatures,
      steps: built.intents.map((i) => ({
        step: i.step,
        says: i.says,
        to: i.to,
        data: i.data,
        value: i.value.toString(),
      })),
      guardrails: built.guardrails,
      note: [
        `Nothing has been signed. These are the ${built.intents.length} calls your wallet would make, in order.`,
        ...built.notes,
      ].join(" "),
    },
  };
}
