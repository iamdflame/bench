/**
 * Ending a session, on chain, because somebody clicked.
 *
 * ---------------------------------------------------------------------------
 * Why this is the most important button in the product
 * ---------------------------------------------------------------------------
 *
 * Rail 3 asks for standing authority, which is the largest thing this
 * marketplace ever asks for. The only honest justification for asking is that
 * it can be taken back, immediately, by the person who gave it — and until now
 * the desk rendered `Revoke` as a disabled `<span>` with no handler, over a
 * `revokeEngagement` that had been written, tested and never called from
 * anywhere.
 *
 * Revocation is not a preference stored in a database. It is a transaction
 * against the Altana account contract, after which the session's next call
 * fails at validation time rather than being filtered by a runner that might
 * not be running. That distinction is the whole reason the session rail is
 * worth more than an API key.
 *
 * ---------------------------------------------------------------------------
 * Whose sessions these are
 * ---------------------------------------------------------------------------
 *
 * These are sessions this deployment granted, over accounts it controls, on
 * behalf of its own reference agents — so this deployment holds the admin key
 * that can end them, and using it here is not custody of anyone else's funds.
 * A visitor's own Altana session is revoked by their own signer, from their own
 * wallet, and this route will not pretend otherwise: it refuses an engagement
 * whose principal is not an account this deployment administers.
 *
 * Idempotent. Revoking twice returns the first revocation rather than sending a
 * second transaction, because a button somebody pressed twice in an anxious
 * moment should not cost them a second fee.
 */

import { NextResponse } from "next/server";
import { hasPrincipal, readEngagement, revokeEngagement } from "@bench/rails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { id?: number | string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, refusedBecause: "The request body was not readable JSON." }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 0) {
    return NextResponse.json({ ok: false, refusedBecause: "That is not an engagement id." }, { status: 400 });
  }

  const existing = readEngagement(id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, refusedBecause: `There is no engagement ${id} on this deployment's desk.` },
      { status: 404 },
    );
  }

  /* Already ended. Say when, rather than sending a second transaction. */
  if (existing.revokedAt) {
    return NextResponse.json({
      ok: true,
      alreadyRevoked: true,
      revokedAt: existing.revokedAt,
      txHash: existing.revokedTx ?? null,
      says: `This session was already revoked at ${existing.revokedAt}. Its authority ended then and has not returned.`,
    });
  }

  if (!hasPrincipal()) {
    return NextResponse.json(
      {
        ok: false,
        refusedBecause:
          "This deployment holds no principal key, so it cannot sign the revocation. The authority is still endable: `npm run prove-scope` revokes from a checkout with the key, and the session's own expiry ends it regardless.",
      },
      { status: 200 },
    );
  }

  try {
    const ended = await revokeEngagement(id);
    return NextResponse.json({
      ok: true,
      revokedAt: ended.revokedAt,
      txHash: ended.revokedTx ?? null,
      says:
        "The session key is revoked on chain. Its next call fails at the account contract's validation step, not in a runner's filter — so it fails whether or not anything of ours is running.",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, refusedBecause: `The revocation did not land: ${String(e).slice(0, 200)}` },
      { status: 200 },
    );
  }
}
