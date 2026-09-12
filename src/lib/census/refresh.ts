/**
 * Keeps the census fresh from the request path.
 *
 * There is no scheduler behind this deployment right now: GitHub Actions is
 * locked on billing and the Railway worker stopped on 6 September. Vercel's
 * hobby cron runs once a day. So the site refreshes itself from its own
 * traffic: judge-facing pages call `scheduleRefresh()` and, after the
 * response is sent, a budgeted census slice runs if the reading is older
 * than fifteen minutes. One instance at a time, by a lease row in Postgres.
 *
 * The visible effect: a judge who opens `/agents` at 2am sees the reading
 * from fifteen minutes ago at worst, taken by the previous visitor's request,
 * and the age is printed beside every count either way.
 */

import { after } from "next/server";
import { sql as pg } from "@/lib/db/client";
import { ensureTables } from "@/lib/db/tables";
import { getProbes } from "@/lib/data/probes";
import { store, warm } from "@/lib/data/snapshots";
import { beat } from "@/lib/heartbeat";
import { runCensus } from "./run";

export const STALE_AFTER_MS = 15 * 60_000;
const LEASE_NAME = "census-refresh";

let inFlight: Promise<RefreshOutcome> | null = null;

export interface RefreshOutcome {
  ran: boolean;
  why: string;
  refreshed?: number;
  at?: string;
  ms?: number;
}

/*
  A lease row, not an advisory lock.

  Advisory locks belong to a database session, and behind a transaction-mode
  pooler the lock and the unlock can land on different server connections: the
  lock is then held by a connection nobody is using, and every later refresh
  sees "another instance holds the lock" forever. One atomic upsert with an
  expiry has no session state to lose.
*/
const LEASE_SECONDS = 90;

async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!pg) return fn();
  await ensureTables();
  const got = (await pg`
    insert into leases (name, until) values (${LEASE_NAME}, now() + ${`${LEASE_SECONDS} seconds`}::interval)
    on conflict (name) do update set until = excluded.until where leases.until < now()
    returning name
  `) as { name: string }[];
  if (!got.length) return null;
  try {
    return await fn();
  } finally {
    await pg`update leases set until = now() where name = ${LEASE_NAME}`.catch(() => undefined);
  }
}

/** Runs one census slice if the reading is stale. Safe to call concurrently. */
export async function refreshIfStale(opts: { maxAgeMs?: number; limit?: number; budgetMs?: number; force?: boolean } = {}): Promise<RefreshOutcome> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await warm(["probe"]);
      const current = getProbes();
      const age = Date.now() - new Date(current.at).getTime();
      if (!opts.force && age < (opts.maxAgeMs ?? STALE_AFTER_MS)) {
        return { ran: false, why: `reading is ${Math.round(age / 60_000)} min old`, at: current.at };
      }
      const out = await withLock(async () => {
        const run = await runCensus({
          previous: current,
          limit: opts.limit ?? 60,
          budgetMs: opts.budgetMs ?? 40_000,
          resolveConcurrency: 8,
          probeConcurrency: 12,
        });
        await store("probe", run.index, run.index.at);
        await beat("probe", 1, { refreshed: run.refreshed, probed: run.index.probed, answered: run.index.answered, ms: run.ms });
        return { ran: true, why: "reading was stale", refreshed: run.refreshed, at: run.index.at, ms: run.ms };
      });
      return out ?? { ran: false, why: "another instance holds the lock", at: current.at };
    } catch (e) {
      return { ran: false, why: `failed: ${(e as Error).message}` };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * From a server component or route: refresh after the response goes out.
 * Never throws and never delays the page.
 */
export function scheduleRefresh(): void {
  try {
    after(() => refreshIfStale().catch(() => undefined));
  } catch {
    // Outside a request scope (a script, a test): nothing to schedule.
  }
}
