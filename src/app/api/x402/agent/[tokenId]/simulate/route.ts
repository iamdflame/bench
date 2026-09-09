/**
 * What a strategy would do with this agent's wallet, right now, for USD1.
 *
 * Nothing is sent. The strategy is a pure function from chain state to the
 * calls it is permitted to make, so a simulation is the real decision with the
 * execution withheld — which is exactly what a buyer wants before hiring.
 */

import { NextResponse } from "next/server";
import type { Address } from "viem";
import { challenge, priceOf, settle, verifyPayment } from "@/lib/x402";
import { STRATEGIES, buildContext } from "@/agents/registry";
import { CATEGORIES, type Category } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRICE = priceOf(process.env.X402_PRICE_SIMULATE ?? "0.02");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await params;
  const resource = new URL(request.url).pathname;
  const header = request.headers.get("x-payment");

  let body: { wallet?: string; category?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* an empty body is fine; the defaults below cover it */
  }

  const category = (CATEGORIES as readonly string[]).includes(body.category ?? "")
    ? (body.category as Category)
    : "grid-trading";

  const payment = await verifyPayment(header, { priceAtomic: PRICE });
  if (!payment.ok) {
    return NextResponse.json(
      {
        ...challenge({
          resource,
          description: `Simulate ${category} against agent ${tokenId}`,
          priceAtomic: PRICE,
        }),
        rejected: payment.reason,
      },
      { status: 402 },
    );
  }

  let settlementTx: string;
  try {
    settlementTx = await settle(
      payment.authorization,
      JSON.parse(Buffer.from(header!, "base64").toString()).payload.signature,
    );
  } catch (e) {
    return NextResponse.json({ error: "settlement failed", detail: String(e).slice(0, 200) }, { status: 502 });
  }

  const wallet = (body.wallet ?? payment.payer) as Address;
  const strategy = STRATEGIES[category];
  // A simulation caps at the wallet's own value: a "what would you do" that
  // assumed a budget the wallet does not have would answer a different
  // question than the one being paid for.
  const ctx = await buildContext({
    category,
    wallet,
    capWei: 0n,
    mandateId: 0,
  });
  ctx.capWei = ctx.valuation.weiTotal;
  const decision = await strategy.evaluate(ctx);

  return NextResponse.json(
    {
      agentId: tokenId,
      category,
      wallet,
      observed: decision.observed,
      wouldDo: decision.actions.map((a) => ({
        kind: a.kind,
        reason: a.reason,
        expect: a.expect,
        to: a.call.address,
        call: a.call.functionName,
      })),
      sent: false,
      paidBy: payment.payer,
    },
    {
      status: 200,
      headers: {
        "x-payment-response": Buffer.from(
          JSON.stringify({ success: true, transaction: settlementTx }),
        ).toString("base64"),
      },
    },
  );
}
