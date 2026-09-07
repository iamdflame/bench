/**
 * Revocation, as an action a principal can actually take.
 *
 * Altana's requirement is that a user can see what their agent may do and
 * revoke it *inside the product*. The authority was already rendered, the
 * allowlist, the cap, the expiry, with a paragraph explaining what revoking
 * would do and no way to do it. A description of a control is not a control.
 *
 * Who is allowed to press it is the awkward part, and it is stated rather than
 * finessed. In this deployment the principal, the operator and the adjudicator
 * are one party, so revocation is authorised by an operator token. A market
 * with third-party principals would have the principal sign it from their own
 * wallet; the contract already treats dismissal that way, and this endpoint is
 * the piece that would move.
 */

import { NextResponse } from "next/server";
import { loadMeta, revokeMandateSession } from "@/lib/chain/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = process.env.OPERATOR_TOKEN ?? "";

/**
 * Who may close a session.
 *
 * A session opened from the public ticket may be closed from the public desk.
 * That is the narrowest rule that still makes revocation a control rather than
 * a description of one: a visitor cannot be authenticated here, and a Revoke
 * button that answers 401 to everybody is exactly the unusable-control problem
 * this product spends the rest of its surface objecting to.
 *
 * A session the operator opened from its own machine still needs the operator's
 * token, so a stranger cannot end the keepers that hold this market's mandates.
 * The asymmetry is deliberate and it is stated on the desk rather than left for
 * someone to discover by being refused.
 */
function authorised(request: Request, session: { viaWeb?: boolean }): { ok: boolean; reason?: string } {
  if (session.viaWeb) return { ok: true };

  if (!TOKEN) {
    return {
      ok: false,
      reason:
        "This session was opened by the operator, not from this desk, and no operator token is configured here. It can still be revoked from the operator's machine: npm run grant -- revoke <mandateId>.",
    };
  }
  const supplied = request.headers.get("x-operator-token") ?? "";
  if (supplied.length !== TOKEN.length || supplied !== TOKEN) {
    return {
      ok: false,
      reason:
        "This session was opened by the operator rather than from this desk, so ending it needs the operator's key. Sessions you opened here are revocable here.",
    };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  let mandateId: number;
  try {
    const body = (await request.json()) as { mandateId?: unknown };
    mandateId = Number(body.mandateId);
    if (!Number.isInteger(mandateId) || mandateId < 0) throw new Error("bad id");
  } catch {
    return NextResponse.json({ ok: false, reason: "mandateId is required." }, { status: 400 });
  }

  const before = loadMeta(mandateId);
  if (!before) {
    return NextResponse.json(
      { ok: false, reason: `No session on file for mandate ${mandateId}.` },
      { status: 404 },
    );
  }

  const auth = authorised(request, before);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, reason: auth.reason }, { status: 403 });
  }

  if (before.revokedAt) {
    return NextResponse.json({ ok: true, alreadyRevoked: true, revokedAt: before.revokedAt });
  }

  try {
    await revokeMandateSession(mandateId);
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: `Revocation failed: ${String(e).slice(0, 200)}` },
      { status: 502 },
    );
  }

  const after = loadMeta(mandateId);
  return NextResponse.json({
    ok: true,
    mandateId,
    revokedAt: after?.revokedAt ?? new Date().toISOString(),
    sessionKey: before.sessionKey,
  });
}
