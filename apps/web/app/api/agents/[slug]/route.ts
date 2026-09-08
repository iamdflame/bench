/**
 * The seller side of Rail 1, for our own reference agents.
 *
 * An unpaid GET answers 402 with a real x402 challenge in USD1. A GET carrying
 * a valid `X-PAYMENT` gets the assessment. That is the whole protocol, and
 * implementing it here rather than describing it means our own agents are
 * listed by the same prober that lists everyone else's — they earn their rail
 * badges rather than being handed them.
 *
 * ---------------------------------------------------------------------------
 * On settlement, stated plainly
 * ---------------------------------------------------------------------------
 *
 * x402's `exact` scheme separates authorisation from submission: the buyer
 * signs an EIP-3009 `transferWithAuthorization` and somebody else pays the gas
 * to submit it. That somebody is normally a facilitator.
 *
 * This deployment verifies the signature always, and submits the transfer only
 * when a settler key with gas is configured. When one is not, the answer is
 * returned with `settled: false` and the reason — because a seller that takes
 * a signed authorisation, cannot bank it, and says nothing is a seller with a
 * silent accounts-receivable problem. The buyer is told which happened.
 */

import { NextResponse } from "next/server";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildEip3009TypedData } from "@altananetwork/sdk";
import {
  EIP3009_ABI,
  TOKENS,
  chainClient,
  resolveChain,
  viemChain,
  type SupportedChain,
} from "@bench/shared";
import { HOUSE_AGENTS, houseBySlug, houseEndpoint } from "@bench/shared";
import { assess } from "@bench/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHAIN: SupportedChain = 56;

function challenge(slug: string, price: bigint, description: string) {
  const usd1 = TOKENS[CHAIN].USD1!;
  const payTo = (process.env.HOUSE_PAY_TO ?? process.env.AGENT_A_ADDR ?? "") as Address;
  return {
    x402Version: 2,
    error: "Payment Required",
    resource: {
      url: houseEndpoint(slug),
      description,
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: `eip155:${CHAIN}`,
        asset: usd1.address,
        amount: price.toString(),
        maxAmountRequired: price.toString(),
        payTo,
        maxTimeoutSeconds: 300,
        extra: {
          name: "World Liberty Financial USD",
          /*
            USD1 reverts on `version()`, so a client that reads the token
            rather than the challenge would get nothing here. The domain this
            names is the one recomputed against the contract's own
            DOMAIN_SEPARATOR, which is the only way to get a signature that
            actually recovers.
          */
          version: "1",
          assetTransferMethod: "eip3009",
        },
      },
    ],
  };
}

interface Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

/**
 * Verify the payment before answering.
 *
 * Four things are checked, and each one is an attack if it is not: that the
 * signature recovers to the declared payer, that the amount is at least the
 * price, that the destination is us, and that the authorisation has not
 * expired. A seller that checks only the first is one that can be paid a cent
 * for a dollar's work.
 */
async function verifyPayment(
  header: string,
  price: bigint,
): Promise<{ ok: true; payer: Address; auth: Authorization } | { ok: false; why: string }> {
  let payload: { payload?: { signature?: Hex; authorization?: Authorization } };
  try {
    payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as typeof payload;
  } catch {
    return { ok: false, why: "The X-PAYMENT header is not base64 JSON." };
  }
  const sig = payload.payload?.signature;
  const auth = payload.payload?.authorization;
  if (!sig || !auth) return { ok: false, why: "The payment payload carries no signature or no authorization." };

  const usd1 = TOKENS[CHAIN].USD1!;
  const payTo = (process.env.HOUSE_PAY_TO ?? process.env.AGENT_A_ADDR ?? "").toLowerCase();

  if (BigInt(auth.value) < price) {
    return { ok: false, why: `The authorization is for ${auth.value} and the price is ${price}.` };
  }
  if (payTo && auth.to.toLowerCase() !== payTo) {
    return { ok: false, why: "The authorization pays an address that is not this agent's." };
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (BigInt(auth.validBefore) <= now) return { ok: false, why: "The authorization has expired." };

  const typed = buildEip3009TypedData({
    chainId: CHAIN,
    token: usd1.address,
    name: "World Liberty Financial USD",
    version: "1",
    from: auth.from,
    to: auth.to,
    value: BigInt(auth.value),
    validAfter: BigInt(auth.validAfter),
    validBefore: BigInt(auth.validBefore),
    nonce: auth.nonce,
  });

  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({
      ...(typed as unknown as Record<string, unknown>),
      signature: sig,
    } as never);
  } catch {
    return { ok: false, why: "The signature does not recover against the token's EIP-712 domain." };
  }
  if (recovered.toLowerCase() !== auth.from.toLowerCase()) {
    return { ok: false, why: "The signature recovers to a different address than the one it claims to pay from." };
  }

  /*
    A nonce can only be spent once, and the token itself is the authority on
    whether it already has been. Checking it here turns a replayed header from
    a free answer into a refusal.
  */
  try {
    const spent = await chainClient(CHAIN).readContract({
      address: usd1.address,
      abi: EIP3009_ABI,
      functionName: "authorizationState",
      args: [auth.from, auth.nonce],
    });
    if (spent === true) return { ok: false, why: "This authorization has already been spent." };
  } catch {
    // The token would not answer. Not a reason to refuse a valid signature,
    // and the settle attempt below would fail anyway if it were truly spent.
  }

  return { ok: true, payer: auth.from, auth };
}

/** Submit the transfer, if this deployment has a settler with gas. */
async function settle(auth: Authorization, sig: Hex): Promise<{ tx: Hex | null; why: string | null }> {
  const key = process.env.SETTLER_KEY ?? process.env.PRIVATE_KEY;
  if (!key) {
    return {
      tx: null,
      why: "No settler key is configured on this deployment, so the signed authorization was verified but not submitted. The answer is served either way; the payment is outstanding rather than silently dropped.",
    };
  }
  try {
    const { createWalletClient, http } = await import("viem");
    const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
    const wallet = createWalletClient({ account, chain: viemChain(CHAIN), transport: http() });
    const r = sig.slice(0, 66) as Hex;
    const s = `0x${sig.slice(66, 130)}` as Hex;
    const v = Number.parseInt(sig.slice(130, 132), 16);
    const tx = await wallet.writeContract({
      address: TOKENS[CHAIN].USD1!.address,
      abi: EIP3009_ABI,
      functionName: "transferWithAuthorization",
      args: [
        auth.from, auth.to, BigInt(auth.value),
        BigInt(auth.validAfter), BigInt(auth.validBefore), auth.nonce,
        v, r, s,
      ],
    });
    return { tx, why: null };
  } catch (e) {
    return { tx: null, why: `The transfer could not be submitted: ${String(e).slice(0, 160)}` };
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = houseBySlug(slug);
  if (!agent) {
    return NextResponse.json(
      {
        error: "no such agent",
        message: `There is no reference agent called "${slug}".`,
        available: HOUSE_AGENTS.map((h) => h.slug),
      },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const { chainId } = resolveChain(url.searchParams.get("chain") ?? undefined);
  const walletParam = url.searchParams.get("wallet");
  const wallet = /^0x[0-9a-fA-F]{40}$/.test(walletParam ?? "") ? (walletParam as Address) : null;

  const header = request.headers.get("x-payment");
  if (!header) {
    return NextResponse.json(challenge(slug, agent.callPrice, agent.description), {
      status: 402,
      headers: { "cache-control": "no-store" },
    });
  }

  const verified = await verifyPayment(header, agent.callPrice);
  if (!verified.ok) {
    return NextResponse.json(
      { ...challenge(slug, agent.callPrice, agent.description), error: verified.why },
      { status: 402, headers: { "cache-control": "no-store" } },
    );
  }

  let payload: { payload?: { signature?: Hex } } = {};
  try {
    payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as typeof payload;
  } catch {
    /* verifyPayment already parsed it; this cannot fail here */
  }
  const settled = await settle(verified.auth, payload.payload!.signature!);

  const assessment = await assess(slug, chainId, wallet);

  return NextResponse.json(
    {
      ...assessment,
      paidBy: verified.payer,
      settled: settled.tx !== null,
      settlementTx: settled.tx,
      settlementNote: settled.why,
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        ...(settled.tx
          ? { "x-payment-response": Buffer.from(JSON.stringify({ success: true, transaction: settled.tx })).toString("base64") }
          : {}),
      },
    },
  );
}
