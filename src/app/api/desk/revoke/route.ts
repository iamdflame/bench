/**
 * Revoke, from a plain form.
 *
 * /desk posts here without JavaScript. The operator token is the only
 * credential; it is compared in constant time, and five attempts a minute per
 * caller is the ceiling. Revocation needs the admin key and the session's
 * public key, not the session's signer, so it works on a deployment that
 * cannot open stored sessions.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { revokeStoredSession } from "@/lib/chain/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const attempts = new Map<string, number[]>();
function allowed(caller: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(caller) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  attempts.set(caller, recent);
  return recent.length <= 5;
}

const back = (req: Request, query: string) => NextResponse.redirect(new URL(`/desk?${query}#keys`, req.url), 303);

export async function POST(req: Request) {
  const caller = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allowed(caller)) return back(req, "error=rate");
  const form = await req.formData().catch(() => null);
  const id = String(form?.get("id") ?? "").slice(0, 200);
  const token = String(form?.get("token") ?? "");
  const expected = process.env.OPERATOR_TOKEN;
  if (!expected) return back(req, "error=no-operator");
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return back(req, "error=token");
  if (!id) return back(req, "error=missing");
  try {
    const { tx } = await revokeStoredSession(id, "revoked from /desk by the operator");
    return back(req, `revoked=${encodeURIComponent(id)}${tx ? `&tx=${tx}` : ""}`);
  } catch (e) {
    return back(req, `error=failed&why=${encodeURIComponent((e as Error).message.slice(0, 140))}`);
  }
}
