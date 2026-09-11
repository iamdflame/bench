/**
 * Judge Mode: hire a stranger without a wallet, and watch it settle.
 *
 *   GET  /api/judge/hire            what can be sponsored right now, and how many are left
 *   POST /api/judge/hire {tokenId}  we pay the agent and hand back its answer
 *
 * Mandate pays from the wallet named in the response, the agent settles the
 * transfer on BNB Smart Chain, and the reply carries the transaction, the
 * agent's own answer, and what that answer can be checked against. The caps
 * live in `judge-mode`; a call a cap refuses never reaches the seller.
 *
 * The money is real and so is the failure case: if the seller takes the
 * payment and answers with an error, that is what comes back and what gets
 * recorded, because a sponsored demonstration that hides its failures is
 * worth less than no demonstration at all.
 */

import { NextResponse } from "next/server";
import type { Address } from "viem";
import { payAndCall } from "@/lib/x402/pay";
import { allowance, callerHash, noteSponsored, sponsorAddress, MAX_CALL, sponsorKey } from "@/lib/market/judge-mode";
import { SPONSORED, sponsoredIds } from "@/lib/market/sponsored-targets";
import { listingFor } from "@/lib/market/listing";
import { hirePath } from "@/lib/market/hire-law";
import { listPaidCalls, outcomes, recordPaidCall, toRecord } from "@/lib/market/paid-calls";
import { take, callerOf, limitHeaders } from "@/lib/api/ratelimit";
import { live } from "@/lib/data/live";
import { marketChain } from "@/lib/chain/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const explorer = marketChain.blockExplorers?.default.url ?? "https://bscscan.com";

async function offers() {
  const seen = outcomes(await listPaidCalls().catch(() => []));
  return sponsoredIds().map((id) => {
    const t = SPONSORED[id];
    const l = listingFor(id);
    const verdict = l ? hirePath(l, { outcomes: seen }) : null;
    return {
      tokenId: id,
      name: l?.name ?? `#${id}`,
      category: t.category,
      asks: t.asks,
      takesSubject: t.takesSubject,
      checkWith: t.checkWith,
      price: l?.priceLabel ?? null,
      available: Boolean(verdict?.ok),
      why: verdict?.reason ?? null,
    };
  });
}

export async function GET(request: Request) {
  await live();
  const a = await allowance({ caller: callerHash(request) });
  return NextResponse.json(
    { ok: a.ok, reason: a.reason, left: a.left, usedToday: a.usedToday, sponsor: a.sponsor, maxCall: MAX_CALL.toString(), offers: await offers() },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const burst = take(`judge:${callerOf(request)}`, { capacity: 3, windowMs: 60_000 });
  if (!burst.ok) {
    return NextResponse.json({ ok: false, reason: "Too many requests in a minute." }, { status: 429, headers: limitHeaders(burst) });
  }

  let tokenId = "";
  let subject: string | undefined;
  try {
    const body = (await request.json()) as { tokenId?: unknown; subject?: unknown };
    tokenId = String(body.tokenId ?? "");
    subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 64) : undefined;
  } catch {
    return NextResponse.json({ ok: false, reason: "Send a JSON body naming a tokenId." }, { status: 400 });
  }

  const target = SPONSORED[tokenId];
  if (!target) {
    return NextResponse.json({ ok: false, reason: "That agent is not on the sponsored list.", sponsored: sponsoredIds() }, { status: 400 });
  }

  await live();
  const listing = listingFor(tokenId);
  const seen = outcomes(await listPaidCalls().catch(() => []));
  const verdict = listing ? hirePath(listing, { outcomes: seen }) : null;
  if (!listing || !verdict?.ok) {
    return NextResponse.json({ ok: false, reason: verdict?.reason ?? "We have no live reading for that agent." }, { status: 409 });
  }

  const price = listing.quote ? BigInt(listing.quote.amount) : 0n;
  const asset = (listing.quote?.asset ?? undefined) as Address | undefined;
  const caller = callerHash(request);
  const allowed = await allowance({ caller, asset, price });
  if (!allowed.ok) {
    return NextResponse.json({ ok: false, reason: allowed.reason, left: allowed.left, sponsor: allowed.sponsor }, { status: 429 });
  }

  const key = sponsorKey();
  if (!key) return NextResponse.json({ ok: false, reason: "This deployment holds no sponsoring key." }, { status: 503 });

  // Counted before the call, so a failed attempt cannot be repeated freely.
  await noteSponsored(caller, tokenId);

  const call = await payAndCall({
    url: target.url(subject),
    key,
    maxAmount: price > 0n && price < MAX_CALL ? price : MAX_CALL,
    method: target.method,
    body: target.body,
    settleWaitMs: 25_000,
  });

  const record = toRecord(call, {
    tokenId,
    name: listing.name,
    category: target.category,
    sponsored: true,
    subject: subject ?? null,
    evidence: null,
  });
  await recordPaidCall(record).catch(() => undefined);

  return NextResponse.json(
    {
      ok: call.delivered,
      paid: call.paid,
      delivered: call.delivered,
      reason: call.refused,
      agent: { tokenId, name: listing.name, asks: target.asks, checkWith: target.checkWith },
      paidBy: sponsorAddress(),
      price: listing.priceLabel,
      settlement: call.settlement ? { tx: call.settlement.tx, url: `${explorer}/tx/${call.settlement.tx}`, found: call.settlement.source } : null,
      deliverable: call.deliverable,
      ms: call.ms,
      left: Math.max(0, allowed.left - 1),
    },
    { status: call.delivered ? 200 : 502, headers: { "cache-control": "no-store" } },
  );
}
