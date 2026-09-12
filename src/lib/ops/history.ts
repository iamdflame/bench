/**
 * The schedule's bookkeeping, and the history it leaves behind.
 *
 * Split from `schedule` because the definition of done reads the uptime while
 * the schedule computes the definition. With both in one module they imported
 * each other and /status hung on module initialisation rather than failing,
 * which is the worst way for anything to break: it looks like a slow network.
 */

import { sql as pg } from "@/lib/db/client";
import { ensureTables } from "@/lib/db/tables";

/** When each job last ran, and whether it worked. */
export async function lastRuns(): Promise<Map<string, { at: Date | null; ok: boolean | null }>> {
  const out = new Map<string, { at: Date | null; ok: boolean | null }>();
  if (!(await ensureTables())) return out;
  try {
    const rows = (await pg!`select name, last_run_at, last_ok from schedules`) as { name: string; last_run_at: string | Date | null; last_ok: boolean | null }[];
    for (const r of rows) out.set(r.name, { at: r.last_run_at ? new Date(r.last_run_at) : null, ok: r.last_ok });
  } catch {
    /* nothing recorded yet */
  }
  return out;
}

export async function note(name: string, ok: boolean, detail: unknown): Promise<void> {
  if (!(await ensureTables())) return;
  await pg!`
    insert into schedules (name, last_run_at, last_ok, last_detail)
    values (${name}, now(), ${ok}, ${JSON.stringify(detail ?? null)}::jsonb)
    on conflict (name) do update set last_run_at = now(), last_ok = excluded.last_ok, last_detail = excluded.last_detail
  `.catch(() => undefined);
}

/**
 * Keeps one row per status sample, and thirty days of them.
 *
 * Returns what it did, so the tick's own report says whether the write landed
 * rather than leaving a silent failure to be found on the page a day later.
 */
export async function recordStatus(checks: { ok: boolean }[]): Promise<{ wrote: boolean; rows: number; error?: string }> {
  if (!(await ensureTables())) return { wrote: false, rows: 0, error: "no database" };
  const ok = checks.every((c) => c.ok);
  try {
    await pg!`insert into status_samples (at, ok, checks) values (now(), ${ok}, ${JSON.stringify(checks)}::jsonb) on conflict (at) do nothing`;
    await pg!`delete from status_samples where at < now() - interval '30 days'`.catch(() => undefined);
    const rows = (await pg!`select count(*)::int as n from status_samples`) as { n: number }[];
    return { wrote: true, rows: rows[0]?.n ?? 0 };
  } catch (e) {
    return { wrote: false, rows: 0, error: (e as Error).message.split("\n")[0].slice(0, 160) };
  }
}

export interface Uptime {
  samples: number;
  ok: number;
  /** Fraction of samples where every beat passed, or null when nothing is recorded. */
  ratio: number | null;
  since: string | null;
  last: { at: string; ok: boolean } | null;
  /** Stretches where the judge path was failing, newest first. */
  incidents: { from: string; to: string; samples: number }[];
  /** Why there is nothing here, when a read failed rather than found nothing. */
  error?: string;
}

export async function uptime(days = 14): Promise<Uptime> {
  const empty: Uptime = { samples: 0, ok: 0, ratio: null, since: null, last: null, incidents: [] };
  if (!(await ensureTables())) return { ...empty, error: "no database is configured on this deployment" };
  try {
    /*
      The cutoff is computed here and sent as a timestamp: Postgres would not
      infer the type of an interval built from a parameter through the pooler.
    */
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const raw = (await pg!`select at, ok from status_samples where at > ${cutoff}::timestamptz order by at asc`) as { at: string | Date; ok: boolean }[];
    /*
      The driver hands back a Date locally and a string over the pooled
      connection production uses, so the first row threw "toISOString is not a
      function" and the page reported no history while the table held a week of
      it. Both shapes are read as one here.
    */
    const rows = raw.map((r) => ({ at: new Date(r.at), ok: r.ok }));
    if (!rows.length) return empty;

    const ok = rows.filter((r) => r.ok).length;
    const incidents: Uptime["incidents"] = [];
    let open: { from: Date; to: Date; samples: number } | null = null;
    for (const r of rows) {
      if (!r.ok) {
        open = open ? { from: open.from, to: r.at, samples: open.samples + 1 } : { from: r.at, to: r.at, samples: 1 };
      } else if (open) {
        incidents.push({ from: open.from.toISOString(), to: open.to.toISOString(), samples: open.samples });
        open = null;
      }
    }
    if (open) incidents.push({ from: open.from.toISOString(), to: open.to.toISOString(), samples: open.samples });

    const last = rows[rows.length - 1];
    return {
      samples: rows.length,
      ok,
      ratio: ok / rows.length,
      since: rows[0].at.toISOString(),
      last: { at: last.at.toISOString(), ok: last.ok },
      incidents: incidents.reverse().slice(0, 10),
    };
  } catch (e) {
    // A history that cannot be read says so. This was silent once, and the page
    // reported "no samples" while the table held a week of them.
    return { ...empty, error: (e as Error).message.split("\n")[0].slice(0, 200) };
  }
}
