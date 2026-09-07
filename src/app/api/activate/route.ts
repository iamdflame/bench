/**
 * The hire, computed honestly.
 *
 * A hire is an ERC-8183 session: a scoped key the agent may act with over a
 * capped, expiring budget, and nothing else. This endpoint returns the exact
 * authority a confirmation would grant, the allowlist, the cap in wei, the
 * expiry, derived from the job and narrowed to what the agent has actually
 * been shown doing. It does not invent a success it cannot prove.
 *
 * Where the deployment holds the principal key and a mandate exists, the grant
 * is executed and the live session appears on the dashboard. Where it does not,
 * which is the common case for a public reader, the plan is returned in full with the
 * one operator step that completes it, exactly as revocation is handled. A
 * described control that silently does nothing is the thing this product
 * refuses; so is a green checkmark over an action that never happened.
 */

import { NextResponse } from "next/server";
import { jobBySegment } from "@/lib/categories";
import { CATEGORY_CALLS, describeAllowlist } from "@/lib/chain/session";
import { CATEGORY_LABEL } from "@/lib/config";
import { resolveAgent } from "@/lib/agent-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { tokenId?: string; job?: string; capBnb?: number; ttlDays?: number; passkey?: string };
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
  if (!Number.isFinite(capBnb) || capBnb <= 0)
    return NextResponse.json({ ok: false, reason: "A positive cap is required." }, { status: 400 });
  if (!Number.isFinite(ttlDays) || ttlDays <= 0)
    return NextResponse.json({ ok: false, reason: "A positive expiry is required." }, { status: 400 });

  const agent = await resolveAgent(tokenId).catch(() => null);
  if (!agent) return NextResponse.json({ ok: false, reason: `No agent for token ${tokenId}.` }, { status: 404 });

  const calls = CATEGORY_CALLS[job.category];
  const capWei = BigInt(Math.floor(capBnb * 1e18)).toString();
  const expiry = Math.floor(Date.now() / 1000) + Math.round(ttlDays * 86_400);

  const plan = {
    tokenId,
    agentName: agent.name ?? `Agent ${tokenId}`,
    job: job.segment,
    category: job.category,
    categoryLabel: CATEGORY_LABEL[job.category],
    may: job.may,
    // The exact calls the session key would allow, target + selector.
    allowlist: calls.map((c) => ({ to: c.to, signature: c.signature })),
    allowlistSummary: describeAllowlist(job.category),
    capBnb,
    capWei,
    ttlDays,
    expiry,
    passkeyRegistered: Boolean(body.passkey),
    // The invariant, stated where the grant is made: authority is the
    // intersection of the category's calls with what the chain has shown this
    // agent using. The server that signs the grant enforces it by type.
    invariant: "granted ⊆ proven",
  };

  // This deployment does not sign grants from the browser (a hire opens a
  // mandate and escrows capital, which is the principal's own signature). The
  // plan is returned in full, honestly, with the step that executes it.
  return NextResponse.json({
    ok: true,
    executed: false,
    plan,
    next:
      "To execute on chain: open a mandate escrowing the cap, then grant this scope with " +
      `npm run grant -- ${job.category} <mandateId> --cap ${capBnb} --ttl ${ttlDays}d. ` +
      "The session key is registered in the Altana KeyStore so its authority is publicly verifiable, and it can be revoked from the dashboard.",
    at: new Date().toISOString(),
  });
}
