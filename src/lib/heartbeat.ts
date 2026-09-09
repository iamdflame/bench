/**
 * Whether anything is actually running.
 *
 * The market's case is that mandates settle, agents are slashed and dismissals
 * revoke a key — all of which happen because a process is running somewhere,
 * not because a page was loaded. There was no way to tell from the site
 * whether that process was alive. `npm run floor` in a terminal and a keeper
 * on a schedule produce identical-looking books, and only one of them is a
 * market.
 *
 * So each long-running process stamps a row, and the floor reads it. Two
 * properties matter:
 *
 *   A missing heartbeat is reported as missing. Not as "starting", not as a
 *   quiet absence of a badge — the floor says the keeper is down and gives the
 *   last time it was not, because a market with no keeper is a fact a buyer is
 *   entitled to before they escrow anything.
 *
 *   Nothing here can be written by a page. The stamp is a side effect of the
 *   process doing its work, so it cannot say "alive" unless a cycle completed.
 */

import { db, hasDb, schema } from "@/lib/db/client";
import { CHAIN_ID } from "@/lib/config";
import { and, eq } from "drizzle-orm";
import { memo } from "@/lib/cache";

export type Process = "keeper" | "worker" | "probe";

const KEY = (p: Process) => `heartbeat.${p}`;

export interface Heartbeat {
  process: Process;
  at: string;
  /** Cycles completed since the process started. */
  cycles: number;
  /** Whatever the process wants on the record — blocks scanned, rows written. */
  detail: Record<string, unknown> | null;
  /** How long ago, in seconds. */
  ageSeconds: number;
  /** False once the heartbeat is older than the process's own interval allows. */
  alive: boolean;
}

/**
 * How stale a stamp may be before the process counts as down.
 *
 * Generous multiples of each interval, so a slow cycle is not reported as a
 * dead process — but finite, because "we have not heard from it in an hour"
 * and "it is running" are not the same claim.
 */
const TOLERANCE_MS: Record<Process, number> = {
  keeper: 5 * 60_000,
  worker: 45 * 60_000,
  probe: 90 * 60_000,
};

/** Stamped by the process itself, after a cycle has actually completed. */
export async function beat(
  process: Process,
  cycles: number,
  detail?: Record<string, unknown>,
): Promise<void> {
  if (!hasDb || !db) return;
  try {
    await db
      .insert(schema.stats)
      .values({
        chainId: CHAIN_ID,
        key: KEY(process),
        value: cycles,
        detail: detail ?? null,
        capturedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.stats.chainId, schema.stats.key],
        set: { value: cycles, detail: detail ?? null, capturedAt: new Date() },
      });
  } catch {
    // A heartbeat that cannot be written must not take the process down with
    // it. The floor will report the silence, which is the correct outcome.
  }
}

async function readOne(process: Process): Promise<Heartbeat | null> {
  if (!hasDb || !db) return null;
  try {
    const [row] = await db
      .select()
      .from(schema.stats)
      .where(and(eq(schema.stats.chainId, CHAIN_ID), eq(schema.stats.key, KEY(process))))
      .limit(1);
    if (!row?.capturedAt) return null;
    const at = new Date(row.capturedAt);
    const ageMs = Date.now() - at.getTime();
    return {
      process,
      at: at.toISOString(),
      cycles: Math.round(row.value),
      detail: (row.detail as Record<string, unknown> | null) ?? null,
      ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
      alive: ageMs < TOLERANCE_MS[process],
    };
  } catch {
    return null;
  }
}

/**
 * The heartbeats, memoised briefly.
 *
 * Null for a process means no stamp has ever been written — which is a
 * different statement from a stale one, and the floor renders it differently.
 */
export function readHeartbeats(): Promise<Record<Process, Heartbeat | null>> {
  return memo("heartbeats", { freshMs: 15_000, staleMs: 120_000 }, async () => {
    const [keeper, worker, probe] = await Promise.all([
      readOne("keeper"),
      readOne("worker"),
      readOne("probe"),
    ]);
    return { keeper, worker, probe };
  });
}
