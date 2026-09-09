/**
 * Every session's public half.
 *
 * All of this is already on chain — the key, the allowlist, the cap, the
 * expiry — so it is served openly. The signer never leaves the machine that
 * granted it and is not in this response.
 */

import { NextResponse } from "next/server";
import { readPublicIndex } from "@/lib/chain/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const all = readPublicIndex();
  const now = Math.floor(Date.now() / 1000);
  const sessions = Object.entries(all)
    .map(([id, s]) => ({
      mandateId: Number(id),
      category: s.category,
      sessionKey: s.sessionKey,
      walletAddress: s.walletAddress,
      capWei: s.capWei,
      expiry: s.expiry,
      expiresIn: s.expiry - now,
      registered: s.registered,
      registrationTx: s.registrationTx ?? null,
      registrationBlock: s.registrationBlock ?? null,
      allowlist: s.allowlist,
      withheld: s.withheld ?? [],
      provenProtocols: s.provenProtocols ?? [],
      scopeRationale: s.scopeRationale ?? null,
      grantedAt: s.grantedAt,
      revokedAt: s.revokedAt ?? null,
      revokedBecause: s.revokedBecause ?? null,
      dismissalTx: s.dismissalTx ?? null,
      market: s.market ?? null,
    }))
    .sort((a, b) => a.mandateId - b.mandateId);

  return NextResponse.json({
    sessions,
    revocable: Boolean(process.env.OPERATOR_TOKEN),
    at: new Date().toISOString(),
  });
}
