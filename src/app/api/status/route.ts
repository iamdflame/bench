/**
 * The judge path's health, for an uptime probe.
 *
 * 200 when all six beats' data reads pass, 503 otherwise, with each check in
 * the body. Point a 15-minute monitor here and at /judges; this one fails
 * before the page does.
 */

import { NextResponse } from "next/server";
import { judgePathChecks } from "@/lib/ops/status";
import { live } from "@/lib/data/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  await live();
  const checks = await judgePathChecks();
  const ok = checks.every((c) => c.ok);
  return NextResponse.json(
    { ok, at: new Date().toISOString(), commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null, checks },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } },
  );
}
