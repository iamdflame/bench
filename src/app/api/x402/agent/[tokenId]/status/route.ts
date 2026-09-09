/**
 * An agent's assay, sold for USD1 over x402.
 *
 * The first request gets a 402 carrying what it would cost and how to pay.
 * The second, carrying a signed authorization, gets the answer — and the seller
 * submits the transfer, so the buyer needs no BNB.
 */

import { NextResponse } from "next/server";
import { challenge, priceOf, settle, verifyPayment } from "@/lib/x402";
import { assayAgent } from "@/lib/assay";
import { hallmarkFor, isHallmarked } from "@/lib/assay/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRICE = priceOf(process.env.X402_PRICE_STATUS ?? "0.01");
const CHAIN = Number(process.env.CHAIN_ID ?? 56);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await params;
  const resource = new URL(request.url).pathname;

  const payment = await verifyPayment(request.headers.get("x-payment"), {
    priceAtomic: PRICE,
  });

  if (!payment.ok) {
    return NextResponse.json(
      { ...challenge({ resource, description: `Assay of agent ${tokenId}`, priceAtomic: PRICE }), rejected: payment.reason },
      { status: 402 },
    );
  }

  // Settle first. Serving the work and then failing to collect is the wrong
  // way round, and the buyer has already committed by signing.
  let settlementTx: string;
  try {
    settlementTx = await settle(
      payment.authorization,
      JSON.parse(Buffer.from(request.headers.get("x-payment")!, "base64").toString()).payload.signature,
    );
  } catch (e) {
    return NextResponse.json(
      { error: "settlement failed", detail: String(e).slice(0, 200) },
      { status: 502 },
    );
  }

  const report = await assayAgent(CHAIN, tokenId);
  const grade = hallmarkFor(report.fineness);

  return NextResponse.json(
    {
      agentId: tokenId,
      name: report.name,
      fineness: report.fineness,
      hallmark: grade.name,
      hireable: isHallmarked(report.fineness),
      results: report.results.map((r) => ({
        id: r.id,
        verdict: r.verdict,
        score: r.score,
        finding: r.finding,
      })),
      paidBy: payment.payer,
      reproduce: `npm run assay -- ${tokenId}`,
    },
    {
      status: 200,
      headers: {
        "x-payment-response": Buffer.from(
          JSON.stringify({ success: true, transaction: settlementTx, network: `eip155:${CHAIN}` }),
        ).toString("base64"),
      },
    },
  );
}
