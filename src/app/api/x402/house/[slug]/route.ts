/**
 * Our reference agents, sold over x402 for 0.05 USD1 a call.
 *
 *   curl -i https://mandate-coral.vercel.app/api/x402/house/grid-1        -> 402 and the terms
 *   (sign an EIP-3009 transferWithAuthorization for USD1, send it as X-PAYMENT)
 *   curl -H "X-PAYMENT: <base64>" .../api/x402/house/grid-1               -> 200 and the work
 *
 * USD1 rather than USDT because BNB Smart Chain's USDT has no
 * transferWithAuthorization: nobody can pay in it by signature, so a price in
 * it would be a price nobody could pay. The seller submits the transfer, so
 * the buyer needs no BNB. Payment is verified and settled on chain, and the
 * settlement's receipt is awaited, before any work is done.
 */

import { NextResponse } from "next/server";
import { challenge, priceOf, settle, verifyPayment } from "@/lib/x402";
import { HOUSE_SERVICES } from "@/lib/house/services";
import { marketClient } from "@/lib/chain/market";
import { live } from "@/lib/data/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PRICE = priceOf(process.env.X402_PRICE_HOUSE ?? "0.05");
const CHAIN = Number(process.env.CHAIN_ID ?? 56);

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = HOUSE_SERVICES[slug];
  if (!service) {
    return NextResponse.json({ error: `no reference agent called ${slug}`, agents: Object.keys(HOUSE_SERVICES) }, { status: 404 });
  }
  const url = new URL(request.url);
  const input = Object.fromEntries(url.searchParams) as Record<string, string>;
  const invalid = service.validate(input);
  const header = request.headers.get("x-payment") ?? request.headers.get("payment-signature");

  /*
    Terms first, inputs second. An unpaid request always gets the 402 with the
    price and the inputs it will need, so a buyer (or a census) learns what the
    agent charges before assembling a query. A paid request with bad inputs is
    refused before anything is settled: nobody pays for an answer we cannot give.
  */
  if (header && invalid) {
    return NextResponse.json({ error: invalid, inputs: service.inputs, settled: false }, { status: 400 });
  }

  await live();
  const payment = await verifyPayment(header, { priceAtomic: PRICE });
  if (!payment.ok) {
    const body = {
      ...challenge({ resource: url.pathname + url.search, description: `${service.name}: ${service.description}`, priceAtomic: PRICE }),
      ...(header ? { rejected: payment.reason } : {}),
      agent: service.name,
      inputs: service.inputs,
      ...(invalid ? { missing: invalid } : {}),
      preview: invalid ? null : await service.preview(input).catch(() => null),
    };
    return NextResponse.json(body, { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify(body)).toString("base64") } });
  }

  let settlement: string;
  try {
    const signature = JSON.parse(Buffer.from(header!, "base64").toString()).payload.signature;
    settlement = await settle(payment.authorization, signature);
    const receipt = await marketClient.waitForTransactionReceipt({ hash: settlement as `0x${string}`, timeout: 40_000 });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "settlement reverted on chain; no work was done", settlement }, { status: 402 });
    }
  } catch (e) {
    return NextResponse.json({ error: "settlement failed; no work was done", detail: String(e).slice(0, 200) }, { status: 502 });
  }

  const work = await service.run(input).catch((e) => ({ error: `paid, but the read failed: ${String(e).slice(0, 160)}` }));
  return NextResponse.json(
    { agent: service.name, ...work, paid: { by: payment.payer, amount: "0.05 USD1", settlement, network: `eip155:${CHAIN}` } },
    {
      status: 200,
      headers: {
        "x-payment-response": Buffer.from(JSON.stringify({ success: true, transaction: settlement, network: `eip155:${CHAIN}` })).toString("base64"),
        "cache-control": "no-store",
      },
    },
  );
}
