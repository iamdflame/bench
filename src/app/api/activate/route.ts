/**
 * The hire, executed.
 *
 * This endpoint used to compute the exact authority a grant would carry and
 * then return `executed: false` with a command to run somewhere else. That was
 * honest, and it was the reason the product's central claim, that you can hire
 * an agent here, was a row without a button.
 *
 * It grants now. The order matters and it is the whole argument:
 *
 *   1. RESOLVE. Who is this agent, and which wallet does it act from? From the
 *      chain, not from the card.
 *   2. DERIVE. What has that wallet actually been shown doing on BNB Smart
 *      Chain? The allowlist is the category's calls intersected with that, so
 *      `granted ⊆ proven` holds by construction rather than by inspection. An
 *      agent that describes itself as a rebalancer and has never touched the
 *      position manager gets nothing, and is told exactly that.
 *   3. GRANT. A scoped, capped, expiring ERC-8183 session key, registered in
 *      the Altana KeyStore so a third party can verify its authority without
 *      asking us.
 *
 * Three outcomes, and none of them is a green tick over nothing:
 *
 *   executed   the session is on chain, with the transaction that proves it
 *   refused    the scope could not be derived, with the reason and the remedy
 *   planned    no principal key is configured here, with the command that
 *              completes it and the full scope it would sign
 *
 * The third case is deliberately not dressed up. A deployment without a key
 * cannot sign, and saying so is cheaper than a demo that lies once.
 */

import { NextResponse } from "next/server";
import { jobBySegment } from "@/lib/categories";
import { grantMandateSession, nextSessionId, readPublicIndex } from "@/lib/chain/session";
import { scopeFromChain, isRefused } from "@/lib/chain/scope";
import { allowlistFor } from "@/lib/chain/allowlist";
import { resolveAgent } from "@/lib/agent-record";
import { shopByTokenId } from "@/lib/shops";
import { checkGrantBudget, callerOf, recordGrant } from "@/lib/guard";
import type { Address } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
  The capability scan reads a hundred and twenty thousand blocks of logs before
  it will grant anything. That is the point, and it is not fast. A default
  function timeout cuts it off mid-scan, and an incomplete scan is refused
  rather than silently narrowed, so the hire would fail for want of looking.
*/
export const maxDuration = 60;

/** Caps a browser may ask for. A cap is a promise; an unbounded one is not. */
const MAX_CAP_BNB = 1;
const MAX_TTL_DAYS = 90;

export async function POST(request: Request) {
  let body: { tokenId?: string; job?: string; capBnb?: number; ttlDays?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: "Malformed request." }, { status: 400 });
  }

  const tokenId = String(body.tokenId ?? "").trim();
  const job = jobBySegment(String(body.job ?? ""));
  const capBnb = Number(body.capBnb);
  const ttlDays = Number(body.ttlDays);

  if (!tokenId) return NextResponse.json({ ok: false, reason: "tokenId is required." }, { status: 400 });
  if (!job) return NextResponse.json({ ok: false, reason: "Unknown job." }, { status: 400 });
  if (!Number.isFinite(capBnb) || capBnb <= 0 || capBnb > MAX_CAP_BNB)
    return NextResponse.json(
      { ok: false, reason: `A cap between 0 and ${MAX_CAP_BNB} BNB is required.` },
      { status: 400 },
    );
  if (!Number.isFinite(ttlDays) || ttlDays <= 0 || ttlDays > MAX_TTL_DAYS)
    return NextResponse.json(
      { ok: false, reason: `An expiry between 1 and ${MAX_TTL_DAYS} days is required.` },
      { status: 400 },
    );

  /* ----------------------------------------------------------- 1. resolve */
  const agent = await resolveAgent(tokenId).catch(() => null);
  if (!agent) {
    return NextResponse.json({ ok: false, reason: `No agent for token ${tokenId}.` }, { status: 404 });
  }
  const wallet = agent.owner;
  if (!wallet) {
    return NextResponse.json(
      {
        ok: false,
        refused: true,
        reason: "The registry does not resolve this token to a wallet, so there is nobody to grant authority to.",
        remedy: "The registration has to name a holder the chain will answer for before it can be hired.",
      },
      { status: 200 },
    );
  }

  const shop = shopByTokenId(tokenId);
  const capWei = BigInt(Math.round(capBnb * 1e18));
  const ttlSeconds = Math.round(ttlDays * 86_400);

  /* ------------------------------------------------------------ 2. derive */
  const scope = await scopeFromChain(wallet as Address, job.category).catch((e) => ({
    refused: true as const,
    reason: `the capability scan could not complete: ${String(e).slice(0, 160)}`,
    remedy: "retry in a moment; an unreadable scan must not become a silent denial",
  }));

  if (isRefused(scope)) {
    return NextResponse.json({
      ok: false,
      refused: true,
      reason:
        `A session was not granted because ${scope.reason}.` +
        (shop
          ? ` This is ${shop.operator.name}'s agent, and this is the honest result of putting it through the same test as our own.`
          : ""),
      remedy: scope.remedy,
      allowlist: allowlistFor(job.category),
      at: new Date().toISOString(),
    });
  }

  /* ------------------------------------------------------------- 3. grant */
  if (!process.env.PRIVATE_KEY) {
    return NextResponse.json({
      ok: true,
      executed: false,
      plan: {
        capBnb,
        ttlDays,
        expiry: Math.floor(Date.now() / 1000) + ttlSeconds,
        command: `npm run grant -- <mandateId> ${job.category} --cap ${capBnb} --ttl ${ttlDays}d --register`,
      },
      scope: {
        calls: scope.calls,
        withheld: scope.withheld,
        proven: scope.proven,
        rationale: scope.rationale,
      },
      allowlist: allowlistFor(job.category),
      at: new Date().toISOString(),
    });
  }

  /*
    The reserve is checked after the scope is derived and before anything is
    signed, so a caller who is over the limit still sees the exact authority
    their hire would carry. Refusing before the derivation would have told them
    nothing, and this page's job is to be legible even when it says no.
  */
  const budget = await checkGrantBudget(callerOf(request));
  if (!budget.ok) {
    /*
      A refusal should hand over evidence, not an apology.

      "Trust us, hiring works" is worth nothing here, and a limit that produces
      only a dead end wastes the one thing that would answer the doubt: a hire
      that already happened, with the transaction that registered it. So the
      most recent completed grant is named and linked, and a reader can check it
      without pressing anything.
    */
    const done = Object.entries(readPublicIndex())
      .map(([id, v]) => ({ id: Number(id), ...v }))
      .filter((v) => v.registered && v.registrationTx)
      .sort((a, b) => b.id - a.id)[0];

    return NextResponse.json({
      ok: true,
      executed: false,
      limited: true,
      ...(done
        ? {
            already: {
              id: done.id,
              tokenId: done.tokenId ?? null,
              category: done.category,
              registrationTx: done.registrationTx,
              revoked: Boolean(done.revokedAt),
            },
          }
        : {}),
      plan: {
        capBnb,
        ttlDays,
        expiry: Math.floor(Date.now() / 1000) + ttlSeconds,
        command: `npm run grant -- <mandateId> ${job.category} --cap ${capBnb} --ttl ${ttlDays}d --register`,
      },
      reason: budget.reason,
      scope: { calls: scope.calls, withheld: scope.withheld, rationale: scope.rationale },
      allowlist: allowlistFor(job.category),
      at: new Date().toISOString(),
    });
  }

  try {
    const id = nextSessionId();
    const granted = await grantMandateSession({
      mandateId: id,
      // So the desk can name the agent rather than only its category.
      tokenId,
      // Opened from the ticket, so it can be closed from the desk without a
      // token. A hire nobody can undo is not a hire, it is a transfer.
      viaWeb: true,
      scope,
      capWei,
      ttlSeconds,
      // Registered, not ephemeral. An unregistered session enforces identically
      // and is invisible to anyone checking it from outside, which is the wrong
      // trade for a hire somebody is being asked to trust.
      register: true,
    });

    recordGrant(callerOf(request));

    return NextResponse.json({
      ok: true,
      executed: true,
      session: {
        id,
        sessionKey: granted.sessionKey,
        walletAddress: granted.walletAddress,
        registered: granted.registered,
        registrationTx: granted.registrationTx,
        expiry: granted.expiry,
        capBnb,
        persisted: granted.persisted,
      },
      scope: { rationale: granted.scopeRationale, withheld: granted.withheld },
      allowlist: allowlistFor(job.category),
      at: new Date().toISOString(),
    });
  } catch (e) {
    /*
      A revert here is a real answer, not an outage. It is rendered as the exact
      reason on the ticket, next to the bonded alternative in the same job,
      because a hire that fails honestly and offers the next option is a
      completed journey and a hire that spins forever is not.
    */
    return NextResponse.json(
      {
        ok: false,
        reason: `The grant did not land: ${String((e as Error).message ?? e).slice(0, 240)}`,
        remedy: "The scope was derivable, so this is the signing or relay step. Nothing was authorised.",
        at: new Date().toISOString(),
      },
      { status: 502 },
    );
  }
}
