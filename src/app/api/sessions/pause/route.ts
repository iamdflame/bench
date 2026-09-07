/**
 * Pause, as a control that actually does something.
 *
 * The desk showed a Pause button that was a grey rectangle with a tooltip. A
 * described control that does nothing is the exact thing this product exists to
 * object to, so it either had to work or come off the page.
 *
 * It works, and it is honest about being a different act from revoking. Revoke
 * is on chain and final. Pause is this office's own hold: reversible, free, and
 * enforced where it cannot be forgotten, in the one function an agent process
 * uses to reach its signer. A paused session cannot produce one.
 *
 * Authorised the same way revocation is, and for the same reason: in this
 * deployment the principal, the operator and the adjudicator are one party. A
 * market with third-party principals would have the principal sign it.
 */

import { NextResponse } from "next/server";
import { loadMeta, pauseMandateSession } from "@/lib/chain/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = process.env.OPERATOR_TOKEN ?? "";

export async function POST(request: Request) {
  if (!TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "No OPERATOR_TOKEN is configured, so this deployment cannot pause from the browser. The hold still works from the operator's machine.",
      },
      { status: 503 },
    );
  }

  const supplied = request.headers.get("x-operator-token") ?? "";
  if (supplied.length !== TOKEN.length || supplied !== TOKEN) {
    return NextResponse.json({ ok: false, reason: "Not authorised." }, { status: 401 });
  }

  let mandateId: number;
  let paused: boolean;
  try {
    const body = (await request.json()) as { mandateId?: unknown; paused?: unknown };
    mandateId = Number(body.mandateId);
    paused = body.paused !== false;
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
    return NextResponse.json(
      {
        ok: false,
        reason: "That session was revoked. Its key is already dead on chain, and pausing a dead key would be theatre.",
      },
      { status: 409 },
    );
  }

  let persisted: boolean;
  try {
    persisted = pauseMandateSession(mandateId, paused);
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: `The hold could not be set: ${String(e).slice(0, 200)}` },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    mandateId,
    paused,
    persisted,
    note: paused
      ? "The agent cannot obtain its signer while this hold is set. The session key itself is untouched and its term is still running: to end its authority on chain, revoke."
      : "The hold is lifted. The session resumes under the same cap and the same expiry it always had.",
  });
}
