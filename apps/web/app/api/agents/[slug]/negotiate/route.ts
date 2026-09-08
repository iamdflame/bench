/**
 * The ERC-8183 seller side, for our own reference agents.
 *
 * ---------------------------------------------------------------------------
 * Why this had to exist before anything on this board could be hired
 * ---------------------------------------------------------------------------
 *
 * Rail 2 is the one rail that needs the *other* side to speak the protocol. A
 * buyer cannot escrow against an agent that will not quote, and until now every
 * agent on this board — including all eight of ours — refused with
 * `no-8183-seller`, because nothing anywhere answered a negotiation request.
 * The consequence was visible on the front page and was read as a rendering
 * fault: four job doors all showing the same "2 callable", because the hireable
 * count was zero everywhere and every door fell through to its next fallback.
 *
 * So this is the missing half. It answers the request `probeQuote` sends,
 * in the shape `parseQuoteBody` reads, with a price this repository set and
 * terms it can actually meet.
 *
 * ---------------------------------------------------------------------------
 * The quote is signed, and says so when it is not
 * ---------------------------------------------------------------------------
 *
 * §15 rung 5 is "a **signed** ERC-8183 quote returned", and the signature is
 * what makes the terms anchorable: `description` on the job is this quote
 * verbatim, so a seller that signed it cannot later argue it agreed to
 * something else.
 *
 * A deployment with no seller key can still quote — the escrow works either
 * way, because the kernel binds the description whether or not we signed it —
 * but the response then carries no `provider_sig` and `signed: false`, and the
 * prober reports the difference rather than papering over it. What it must
 * never do is emit a `provider_sig` field containing something that is not a
 * signature.
 */

import { NextResponse } from "next/server";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { HOUSE_AGENTS, TOKENS, jobBySlug, resolveChain } from "@bench/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How long a quote stands. Long enough to fund, short enough to mean something. */
const QUOTE_TTL_SECONDS = 900;

interface NegotiationRequest {
  request?: {
    task_description?: string;
    terms?: {
      price?: string | number;
      currency?: string;
      deliverables?: string;
      evaluator_type?: string;
    };
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = HOUSE_AGENTS.find((h) => h.slug === slug);
  if (!agent) {
    return NextResponse.json(
      { response: { accepted: false, reason: "This marketplace does not operate an agent by that name." } },
      { status: 404 },
    );
  }

  let body: NegotiationRequest = {};
  try {
    body = (await request.json()) as NegotiationRequest;
  } catch {
    /* an unreadable body is a refusal with a reason, not a 500 */
    return NextResponse.json(
      { response: { accepted: false, reason_code: "malformed_request", reason: "The negotiation request was not readable JSON." } },
      { status: 200 },
    );
  }

  const { chainId } = resolveChain(Number(new URL(request.url).searchParams.get("chainId") ?? 56));
  const u = TOKENS[chainId].U;
  const job = jobBySlug(agent.job)!;
  const asked = body.request?.terms;

  /*
    The kernel escrows in $U and nothing else, so a request naming another
    currency is declined here rather than accepted and then rejected on chain
    by a contract whose revert reason nobody will read.
  */
  if (asked?.currency && String(asked.currency).toLowerCase() !== u.address.toLowerCase()) {
    return NextResponse.json(
      {
        response: {
          accepted: false,
          reason_code: "currency_unsupported",
          reason: `This job settles through the ERC-8183 kernel, which escrows in ${u.symbol} at ${u.address} and nothing else.`,
        },
      },
      { status: 200 },
    );
  }

  /*
    A budget below the asking price is declined with the price stated. A seller
    that silently accepts less than it quoted has taught the buyer that its
    prices are decorative.
  */
  let offered: bigint | null = null;
  try {
    offered = asked?.price === undefined ? null : BigInt(asked.price);
  } catch {
    offered = null;
  }
  if (offered !== null && offered < agent.hirePrice) {
    return NextResponse.json(
      {
        response: {
          accepted: false,
          reason_code: "below_price",
          reason: `${agent.name} quotes ${agent.hirePrice.toString()} raw ${u.symbol} for this job. The request offered ${offered.toString()}.`,
          terms: { price: agent.hirePrice.toString(), currency: u.address },
        },
      },
      { status: 200 },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const response = {
    accepted: true,
    agent: agent.slug,
    job: agent.job,
    quote_expires_at: now + QUOTE_TTL_SECONDS,
    estimated_completion_seconds: 900,
    terms: {
      price: agent.hirePrice.toString(),
      currency: u.address,
      deliverables:
        asked?.deliverables ??
        `A written assessment of the position named in the request: the action ${agent.name} would take now, why, and the on-chain values it is based on.`,
      quality_standards:
        "Every figure cites the block it was read at. Where a value could not be read, that is stated rather than defaulted.",
      success_criteria: [
        "The response names a specific action, or states explicitly that no action is warranted.",
        "Every numeric claim carries the block it was read at.",
      ],
      evaluator_type: "optimistic",
      evaluation_required: false,
    },
    /* What this agent is for, so the escrowed description is self-describing. */
    method: agent.proof,
    task: job.title,
  };

  /*
    The hash is over the response exactly as serialised below, so a verifier
    recomputes it from the bytes it received rather than from a re-encoding of
    an object it parsed. Those differ the first time a key order changes.
  */
  const serialised = JSON.stringify(response);
  const responseHash = keccak256(toHex(serialised));

  const key = process.env.SELLER_KEY ?? process.env.PRIVATE_KEY;
  let providerSig: string | null = null;
  if (key) {
    try {
      const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
      providerSig = await account.signMessage({ message: { raw: responseHash } });
    } catch {
      /* an unusable key produces no signature, never a fake one */
      providerSig = null;
    }
  }

  return NextResponse.json({
    response,
    response_hash: responseHash,
    negotiation_hash: responseHash,
    ...(providerSig ? { provider_sig: providerSig } : {}),
    signed: providerSig !== null,
    ...(providerSig
      ? {}
      : {
          unsigned_because:
            "This deployment holds no seller key, so the quote is unsigned. The terms still bind on chain — the job's description is this quote verbatim — but nobody can prove from this response alone that the seller authored it.",
        }),
    seller: agent.wallet,
  });
}
