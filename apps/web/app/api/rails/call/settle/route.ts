/**
 * The second half of a buyer-funded call: deliver a signature the visitor made.
 *
 * ---------------------------------------------------------------------------
 * Why the server delivers a payment it did not authorise
 * ---------------------------------------------------------------------------
 *
 * The seller's endpoint belongs to somebody else and carries no CORS headers
 * for us, so a `fetch` from the page fails for a reason that has nothing to do
 * with the payment. The signature is made in the browser, where the key is;
 * the request is made from here, where it can reach the host. No key crosses
 * either way.
 *
 * ---------------------------------------------------------------------------
 * The signature is checked against the chain, not against the client
 * ---------------------------------------------------------------------------
 *
 * A client could post any authorization it liked. So this does not trust the
 * one it receives: it re-resolves the listing, re-fetches the 402, and checks
 * that the payee and the amount in the authorization are the payee and the
 * amount the seller is *currently* asking for. A tampered envelope is refused
 * before it is relayed, and the refusal names which field disagreed.
 *
 * That check costs one extra round trip to the seller. It is worth it: without
 * it this route is an open relay that will attach any signature to any
 * merchant, and the first thing anybody would do with that is get a user to
 * sign one thing and have us submit another.
 */

import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { deliverPayment } from "@bench/rails";
import { resolveAndChallenge, settlementOf, txFromSettlement } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: {
    chainId?: number;
    id?: string;
    resource?: string | null;
    signature?: string;
    authorization?: {
      from: `0x${string}`;
      to: `0x${string}`;
      value: string;
      validAfter: "0";
      validBefore: string;
      nonce: `0x${string}`;
    };
    envelope?: Record<string, unknown>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, refusedBecause: "The request body was not readable JSON." }, { status: 400 });
  }

  const signature = body.signature;
  const authorization = body.authorization;
  const envelope = body.envelope;
  if (!signature || !/^0x[0-9a-fA-F]+$/.test(signature) || !authorization || !envelope) {
    return NextResponse.json(
      { ok: false, refusedBecause: "This needs a signature and the authorisation it was made over." },
      { status: 400 },
    );
  }

  const found = await resolveAndChallenge(body);
  if (!found.ok) {
    return NextResponse.json({ ok: false, refusedBecause: found.refusedBecause }, { status: found.status });
  }

  /* --------------------------------------- the authorisation must still hold */
  const route = found.challenge.best!;
  if (route.payTo?.toLowerCase() !== authorization.to.toLowerCase()) {
    return NextResponse.json(
      {
        ok: false,
        refusedBecause:
          "The payee in the signed authorisation is not the payee this endpoint is currently asking for. Nothing was sent. Re-read the price and sign again.",
      },
      { status: 200 },
    );
  }
  if (route.amount === null || BigInt(authorization.value) !== route.amount) {
    return NextResponse.json(
      {
        ok: false,
        refusedBecause: `The signed amount is ${formatEther(BigInt(authorization.value))} and the endpoint is asking ${route.amount === null ? "an amount we could not read" : formatEther(route.amount)}. Nothing was sent.`,
      },
      { status: 200 },
    );
  }

  const result = await deliverPayment({
    url: found.target,
    prepared: {
      typed: null,
      authorization,
      envelope: envelope as never,
      cost: { amount: route.amount, asset: route.asset!, symbol: route.assetSymbol },
    },
    signature: signature as `0x${string}`,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, refusedBecause: result.refusedBecause }, { status: 200 });
  }

  const txHash = txFromSettlement(result.settlement);
  return NextResponse.json({
    ok: true,
    executed: true,
    paidBy: "you" as const,
    status: result.status,
    body: result.body,
    latencyMs: result.latencyMs,
    paid: result.paid ? `${formatEther(result.paid.amount)} ${result.paid.symbol ?? ""}`.trim() : null,
    txHash,
    settlement: settlementOf(txHash, result.paid),
  });
}
