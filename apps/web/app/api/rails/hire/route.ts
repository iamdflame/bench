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
import { resolveChain } from "@bench/shared";
import type { Address } from "viem";
import { planFor } from "@/lib/hirePlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;


export async function POST(request: Request) {
  let body: { chainId?: number; id?: string; buyer?: string; batched?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, refusedBecause: "The request body was not readable JSON." }, { status: 400 });
  }

  const { chainId } = resolveChain(body.chainId);
  const buyer = /^0x[0-9a-fA-F]{40}$/.test(body.buyer ?? "") ? (body.buyer as Address) : null;
  const built = await planFor(chainId, String(body.id ?? ""), buyer, { batched: body.batched });

  if (!built.ok) {
    return NextResponse.json(
      { ok: false, executed: false, refusedBecause: built.refusedBecause },
      { status: built.status ?? 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    /*
      Not a receipt. Nothing has been signed or sent, and saying so in the
      payload rather than only in the description means a client that never
      reads descriptions still cannot mistake this for one.
    */
    executed: false,
    plan: built.plan,
  });
}
