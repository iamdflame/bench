/**
 * Revocation, as an action a principal can actually take.
 *
 * Altana's requirement is that a user can see what their agent may do and
 * revoke it *inside the product*. The authority was already rendered — the
 * allowlist, the cap, the expiry — with a paragraph explaining what revoking
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

export async function POST(request: Request) {
  if (!TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "No OPERATOR_TOKEN is configured, so this deployment cannot revoke from the browser. Revocation still works from the operator's machine: npm run grant -- revoke <mandateId>.",
      },
      { status: 503 },
    );
  }

  const supplied = request.headers.get("x-operator-token") ?? "";
  // Length-independent comparison is overkill for a hackathon deployment and
  // costs nothing, so it is here rather than argued about.
  if (supplied.length !== TOKEN.length || supplied !== TOKEN) {
    return NextResponse.json({ ok: false, reason: "Not authorised." }, { status: 401 });
  }

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
