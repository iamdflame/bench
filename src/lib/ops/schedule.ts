/**
 * The clock this deployment does not have.
 *
 * Vercel's hobby plan runs one cron a day, GitHub Actions is billing-locked,
 * and the probe has to be at most fifteen minutes old for anything on the site
 * to claim liveness. So the schedule lives here instead of in a platform: one
 * authorised endpoint (`/api/cron/tick`) is called every few minutes from
 * outside, and this decides which jobs are actually due.
 *
 * Every job records when it last ran and what it said, so `/status` can show
 * the clock rather than assert it, and a job that starts failing is visible as
 * a widening gap rather than as silence.
 */

import { lastRuns, note, recordStatus } from "@/lib/ops/history";
import { refreshIfStale } from "@/lib/census/refresh";
import { readGridWindow } from "@/lib/grid/window";
import { judgePathChecks } from "@/lib/ops/status";
import { definitionOfDone, score } from "@/lib/ops/definition-of-done";
import { store } from "@/lib/data/snapshots";
import { beat } from "@/lib/heartbeat";

export interface Job {
  name: string;
  everyMinutes: number;
  budgetMs: number;
  run: () => Promise<unknown>;
}

export const JOBS: Job[] = [
  {
    // The answering set, so no page ever claims a liveness older than this.
    name: "probe",
    everyMinutes: 10,
    budgetMs: 38_000,
    run: () => refreshIfStale({ limit: 60, budgetMs: 34_000, force: true }),
  },
  {
    name: "status",
    everyMinutes: 5,
    budgetMs: 45_000,
    run: async () => {
      const checks = await judgePathChecks();
      const wrote = await recordStatus(checks);
      /*
        The definition is expensive (a ladder, the chain, the database) and
        /status is the page most likely to be opened cold, so it is computed
        here on a schedule and stored for the page to read.
      */
      const boxes = await definitionOfDone().catch(() => []);
      if (boxes.length) await store("definition", boxes).catch(() => undefined);
      return { ok: checks.every((c) => c.ok), beats: checks.length, samples: wrote, definition: score(boxes) };
    },
  },
  {
    name: "grid-window",
    everyMinutes: 30,
    budgetMs: 15_000,
    run: async () => {
      const w = await readGridWindow({ fresh: true });
      return { fills: w.fills.length, toBlock: w.toBlock };
    },
  },
  {
    name: "heartbeat",
    everyMinutes: 15,
    budgetMs: 5_000,
    run: async () => {
      await beat("cron", 1, { by: "tick" });
      return { wrote: "cron" };
    },
  },
];

export interface Ran {
  job: string;
  ok: boolean;
  ms: number;
  detail: unknown;
  skipped?: string;
}

/** When each job last ran, for the page that shows the clock. */
export async function scheduleState(): Promise<{ name: string; everyMinutes: number; lastRunAt: string | null; ok: boolean | null; overdue: boolean }[]> {
  const last = await lastRuns();
  return JOBS.map((j) => {
    const l = last.get(j.name);
    const at = l?.at ? new Date(l.at) : null;
    return {
      name: j.name,
      everyMinutes: j.everyMinutes,
      lastRunAt: at?.toISOString() ?? null,
      ok: l?.ok ?? null,
      // Twice the interval: one missed tick is a hiccup, two is a stopped clock.
      overdue: !at || Date.now() - at.getTime() > j.everyMinutes * 60_000 * 2,
    };
  });
}

/** Runs every job that is due. `only` and `force` are for the operator. */
export async function tick(opts: { only?: string[]; force?: boolean } = {}): Promise<Ran[]> {
  const last = await lastRuns();
  const out: Ran[] = [];
  for (const job of JOBS) {
    if (opts.only?.length && !opts.only.includes(job.name)) continue;
    const at = last.get(job.name)?.at;
    const due = opts.force || !at || Date.now() - new Date(at).getTime() >= job.everyMinutes * 60_000;
    if (!due) {
      const minutes = Math.ceil((job.everyMinutes * 60_000 - (Date.now() - new Date(at!).getTime())) / 60_000);
      out.push({ job: job.name, ok: true, ms: 0, detail: null, skipped: `not due for ${minutes} more minutes` });
      continue;
    }
    const started = Date.now();
    try {
      const detail = await Promise.race([
        job.run(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`over budget after ${job.budgetMs} ms`)), job.budgetMs)),
      ]);
      await note(job.name, true, detail);
      out.push({ job: job.name, ok: true, ms: Date.now() - started, detail });
    } catch (e) {
      const detail = (e as Error).message.slice(0, 200);
      await note(job.name, false, detail);
      out.push({ job: job.name, ok: false, ms: Date.now() - started, detail });
    }
  }
  return out;
}
