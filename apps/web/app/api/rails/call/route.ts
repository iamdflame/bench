/**
 * Rail 1, executed.
 *
 * This endpoint spends money, so it is bounded before it is convenient. An
 * unauthenticated POST that pays a stranger's endpoint is, left alone, a
 * faucet — and it fails in the worst possible order: the first few visitors
 * get a working call, the float empties, and every visitor after that hits an
 * error on the one screen the whole product rests on.
 *
 * So four bounds, chosen to fail early and legibly rather than late and
 * silently:
 *
 *   PER CALLER   a short window, because a person trying the rail does it
 *                once and a script does it a thousand times.
 *   PER DAY      a global ceiling, so a distributed caller cannot walk around
 *                the per-caller limit.
 *   PER CALL     a hard maximum on any single payment, whatever a challenge
 *                asks for. A merchant that quotes ten dollars gets refused.
 *   FLOAT        a balance below which nothing is attempted at all. Reaching
 *                it returns "the float is out", which is true, rather than
 *                letting a transfer fail and reporting that as a bug.
 *
 * The payment is made from this deployment's own wallet and the button says
 * so. That is a stated arrangement rather than a disguised one: a marketplace
 * whose cheapest path requires a visitor to fund a wallet first is a demo.
 */

import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { formatEther } from "viem";
import { ERC20_ABI, TOKENS, chainClient, resolveChain, safeFetch } from "@bench/shared";
import { parseChallenge } from "@bench/probe";
import { payAndCall } from "@bench/rails";
import { findRow } from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Nothing this endpoint does may cost more than five cents. */
const MAX_PER_CALL = 50_000_000_000_000_000n; // 0.05 USD1
/** Below this the float is treated as empty. */
const FLOOR = 20_000_000_000_000_000n; // 0.02 USD1
const PER_CALLER = 3;
const WINDOW_MS = 15 * 60_000;
const PER_DAY = 60;

/*
  In memory, so it resets when an instance recycles. That is the wrong tool for
  a bank and the right one here: it costs nothing, needs no service, and the
  balance floor is the backstop that actually bounds the loss.
*/
const seen = new Map<string, number[]>();
let dayCount = 0;
let dayStart = Date.now();

function allow(caller: string): { ok: true } | { ok: false; why: string } {
  const now = Date.now();
  if (now - dayStart > 86_400_000) {
    dayStart = now;
    dayCount = 0;
  }
  if (dayCount >= PER_DAY) {
    return { ok: false, why: "This deployment has made its daily allowance of paid calls. The rail is not broken; the float is deliberately small." };
  }
  const hits = (seen.get(caller) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= PER_CALLER) {
    return { ok: false, why: `You have used this ${PER_CALLER} times in the last fifteen minutes, which is the per-visitor limit.` };
  }
  hits.push(now);
  seen.set(caller, hits);
  dayCount++;
  return { ok: true };
}

const callerOf = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";

export async function POST(request: Request) {
  let body: { chainId?: number; id?: string; resource?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, refusedBecause: "The request body was not readable JSON." }, { status: 400 });
  }

  const { chainId } = resolveChain(body.chainId);
  const id = String(body.id ?? "");
  const hit = findRow(chainId, id);
  if (!hit) {
    return NextResponse.json(
      { ok: false, refusedBecause: "This id is not on the board, so there is no endpoint to call." },
      { status: 404 },
    );
  }

  const target = hit.service?.resource ?? hit.agent?.endpoint ?? body.resource ?? null;
  if (!target) {
    return NextResponse.json(
      { ok: false, refusedBecause: "This listing declares no endpoint, so there is nothing to call." },
      { status: 200 },
    );
  }

  const gate = allow(callerOf(request));
  if (!gate.ok) return NextResponse.json({ ok: false, refusedBecause: gate.why }, { status: 429 });

  const keyRaw = process.env.BUYER_KEY ?? process.env.AGENT_A_KEY;
  if (!keyRaw) {
    return NextResponse.json(
      {
        ok: false,
        refusedBecause:
          "This deployment has no buyer key configured, so it cannot pay on your behalf. The rail itself works: `npm run prove-call` runs the same code path from a checkout with your own key.",
      },
      { status: 200 },
    );
  }
  const account = privateKeyToAccount((keyRaw.startsWith("0x") ? keyRaw : `0x${keyRaw}`) as `0x${string}`);
  const usd1 = TOKENS[chainId].USD1;
  if (!usd1) {
    return NextResponse.json(
      { ok: false, refusedBecause: `There is no EIP-3009 stablecoin configured on chain ${chainId}, so an x402 exact payment cannot settle here.` },
      { status: 200 },
    );
  }

  const balance = (await chainClient(chainId)
    .readContract({ address: usd1.address, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] })
    .catch(() => 0n)) as bigint;

  if (balance < FLOOR) {
    return NextResponse.json(
      {
        ok: false,
        refusedBecause: `The float this deployment pays from is down to ${formatEther(balance)} ${usd1.symbol}, below its floor. Nothing was attempted, because a transfer that fails on chain is worse than a sentence that says why.`,
      },
      { status: 200 },
    );
  }

  /* ------------------------------------------------------------- challenge */
  const unpaid = await safeFetch(target, { timeoutMs: 15_000 });
  if (!unpaid.ok) {
    return NextResponse.json({ ok: false, refusedBecause: unpaid.detail }, { status: 200 });
  }
  if (unpaid.status !== 402) {
    return NextResponse.json(
      {
        ok: false,
        refusedBecause: `It answered ${unpaid.status} rather than asking for payment, so there is no priced call to buy right now.`,
      },
      { status: 200 },
    );
  }
  const challenge = parseChallenge(unpaid.body, chainId);
  if (!challenge) {
    return NextResponse.json(
      { ok: false, refusedBecause: "It answered 402 with a body we could not read as an x402 challenge." },
      { status: 200 },
    );
  }
  if (!challenge.payable || !challenge.best) {
    return NextResponse.json({ ok: false, refusedBecause: challenge.unpayableReason }, { status: 200 });
  }
  if (challenge.best.amount! > MAX_PER_CALL) {
    return NextResponse.json(
      {
        ok: false,
        refusedBecause: `It asks ${formatEther(challenge.best.amount!)} ${challenge.best.assetSymbol}, above the per-call ceiling this deployment will spend on a visitor's behalf.`,
      },
      { status: 200 },
    );
  }

  /* ------------------------------------------------------------------- pay */
  const result = await payAndCall({
    chainId,
    url: target,
    challenge,
    account,
    maxAmount: MAX_PER_CALL,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, refusedBecause: result.refusedBecause }, { status: 200 });
  }

  /*
    The settlement receipt is base64 JSON carrying the transaction hash. It is
    decoded here so the answer can link to the transfer on BscScan rather than
    asking a reader to trust that one happened.
  */
  let txHash: string | null = null;
  if (result.settlement) {
    try {
      const decoded = JSON.parse(Buffer.from(result.settlement, "base64").toString("utf8")) as {
        transaction?: string;
      };
      if (typeof decoded.transaction === "string") txHash = decoded.transaction;
    } catch {
      /* a receipt we cannot decode is not a failure of the call */
    }
  }

  /*
    What actually happened to the money, said in words.

    `paid: null, txHash: null` is ambiguous to anything that is not a person:
    it reads equally as "the call was free" and as "we owe them a cent". Those
    are different facts and §14.1's rule is that an absence carries a reason, so
    the machine surface states which one this is rather than leaving a reader to
    infer it from two nulls.

    The middle case is the real one. x402 separates authorising a transfer from
    submitting it: the buyer signs, the seller verifies the signature and the
    balance and serves the answer, and a facilitator submits the transfer. A
    deployment with no settler key has done everything except the last step, and
    the honest word for that is outstanding, not free.
  */
  const settlement = txHash
    ? { state: "settled" as const, why: "The transfer is on chain at the hash below." }
    : result.paid
      ? {
          state: "outstanding" as const,
          why: "The buyer signed a valid EIP-3009 authorisation and the seller verified it and answered. The transfer itself was not submitted by this deployment, so the seller is owed the amount above and can still submit the authorisation itself.",
        }
      : {
          state: "unpaid" as const,
          why: "This endpoint answered without requiring payment, so nothing was owed and nothing was signed.",
        };

  return NextResponse.json({
    ok: true,
    status: result.status,
    body: result.body,
    latencyMs: result.latencyMs,
    paid: result.paid ? `${formatEther(result.paid.amount)} ${result.paid.symbol ?? ""}`.trim() : null,
    txHash,
    settlement,
  });
}
