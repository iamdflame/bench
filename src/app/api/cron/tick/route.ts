/**
 * The clock's tick, called from outside.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://mandate-coral.vercel.app/api/cron/tick
 *
 * Point any external pinger at this every five minutes. It decides what is
 * due (see lib/ops/schedule) rather than trusting the caller's cadence, so a
 * pinger that fires late or twice cannot double-run a job or skip one.
 *
 * Authorised callers only: the jobs write to the database and one of them
 * spends a little gas, so an open endpoint would be somebody else's budget.
 */

import { NextResponse } from "next/server";
import { scheduleState, tick } from "@/lib/ops/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const authorised =
    Boolean(secret) &&
    (request.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("key") === secret);

  if (!authorised) {
    return NextResponse.json(
      { ok: false, reason: "This endpoint runs the site's scheduled work and needs CRON_SECRET.", schedule: await scheduleState() },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const only = url.searchParams.getAll("job");
  const ran = await tick({ only: only.length ? only : undefined, force: url.searchParams.get("force") === "1" });
  return NextResponse.json(
    { at: new Date().toISOString(), ran, schedule: await scheduleState() },
    { headers: { "cache-control": "no-store" } },
  );
}
