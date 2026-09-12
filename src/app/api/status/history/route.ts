/**
 * The judge path's history, as data.
 *
 *   GET /api/status/history?days=14
 *
 * One sample every five minutes, written by the scheduled tick: whether every
 * beat passed, and the stretches where they did not. A status page without a
 * history is a claim about this second only, which is exactly the claim a
 * marketplace should not be trusted on.
 */

import { NextResponse } from "next/server";
import { uptime } from "@/lib/ops/history";
import { scheduleState } from "@/lib/ops/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const days = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 14));
  const started = Date.now();
  const [history, schedule] = await Promise.all([uptime(days).catch(() => null), scheduleState().catch(() => [])]);
  return NextResponse.json(
    { days, history, schedule, ms: Date.now() - started },
    { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } },
  );
}
