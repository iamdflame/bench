/**
 * The daily cron.
 *
 * Vercel calls this once a day with `Authorization: Bearer $CRON_SECRET`
 * (the hobby plan's ceiling). Between runs the site refreshes itself from
 * traffic (`scheduleRefresh` on the judge-facing pages). With the secret, the
 * jobs run in full. Without it, anyone may call this, and gets only what the
 * site would do on its own: a census slice if the reading is stale. Nothing
 * that spends money runs for an unauthorised caller.
 */

import { NextResponse } from "next/server";
import { runJobs } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authorised = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  const url = new URL(req.url);
  const only = url.searchParams.getAll("job");
  const reports = await runJobs(only.length ? only : undefined, authorised);
  return NextResponse.json({ at: new Date().toISOString(), authorised, reports }, { headers: { "cache-control": "no-store" } });
}
