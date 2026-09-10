/**
 * Ask the keeper to bid on a mandate.
 *
 * Called by the hire flow the moment a mandate opens, which is what makes the
 * bid land inside a minute on the path a buyer is actually walking. A cron
 * sweeps for anything opened elsewhere; neither Vercel's hobby crons (one a
 * day) nor GitHub Actions (five minutes at best) can do sixty seconds, so the
 * on-open call is the one that matters and the cron is the safety net.
 *
 * The body is a mandate id and nothing else. Everything that decides whether
 * money moves is read from the chain inside `keeperBid`, so a caller cannot
 * name an amount, a recipient, or a market.
 */

import { NextResponse } from "next/server";
import { keeperBid, keeperConfigured, openMandatesNeedingBids } from "@/lib/keeper/bid";
import { take } from "@/lib/api/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIMIT = { capacity: 12, windowMs: 60_000 };

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "anonymous"
  );
}

export async function POST(request: Request) {
  const gate = take(`keeper:${clientKey(request)}`, LIMIT);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: `Too many keeper requests. Try again in ${gate.retryAfter}s.` },
      { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
    );
  }

  if (!keeperConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No keeper key is configured on this deployment, so nothing will bid automatically. Agents can still bid from /jobs.",
      },
      { status: 503 },
    );
  }

  let mandateId: number | null = null;
  try {
    const body = (await request.json()) as { mandateId?: unknown };
    mandateId = Number(body.mandateId);
  } catch {
    mandateId = null;
  }
  if (mandateId === null || !Number.isInteger(mandateId) || mandateId < 0) {
    return NextResponse.json({ ok: false, error: "Pass a mandateId." }, { status: 400 });
  }

  const result = await keeperBid(mandateId);
  // "Already bid" and "not open" are not failures of this endpoint; they are
  // the endpoint being idempotent. A retry must not read as an error.
  const status = result.ok || result.code === "already" || result.code === "state" ? 200 : 502;
  return NextResponse.json(result, { status });
}

/** The sweep, for anything opened outside the product. */
export async function GET(request: Request) {
  const sweepGate = take(`keeper-sweep:${clientKey(request)}`, { capacity: 4, windowMs: 60_000 });
  if (!sweepGate.ok) {
    return NextResponse.json({ ok: false, error: "Too many sweeps." }, { status: 429 });
  }
  if (!keeperConfigured()) {
    return NextResponse.json({ ok: false, error: "No keeper key configured." }, { status: 503 });
  }

  const open = await openMandatesNeedingBids().catch(() => null);
  if (!open) {
    return NextResponse.json({ ok: false, error: "The chain would not answer." }, { status: 502 });
  }

  const results = [];
  for (const id of open) results.push(await keeperBid(id));
  return NextResponse.json({ ok: true, open, results });
}
