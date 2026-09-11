/**
 * The scheduled work, as a list of named jobs with a time budget each.
 *
 * Run by `GET /api/cron/daily` (Vercel's hobby cron, once a day) and by
 * `npm run ops` from a laptop as often as wanted. Each job reports what it
 * did so the cron response and `/status` can show it, and a job that throws
 * does not stop the ones after it.
 */

import { refreshIfStale } from "@/lib/census/refresh";
import { keeperBid, keeperConfigured, openMandatesNeedingBids } from "@/lib/keeper/bid";
import { beat } from "@/lib/heartbeat";

export interface JobReport {
  job: string;
  ok: boolean;
  ms: number;
  detail: unknown;
}

type Job = { name: string; budgetMs: number; run: (authorised: boolean) => Promise<unknown> };

const JOBS: Job[] = [
  {
    name: "census",
    budgetMs: 40_000,
    // Only an authorised caller may force a refresh; anyone else gets one only
    // if the reading is stale, which the site would do on its own anyway.
    run: (authorised) => refreshIfStale({ limit: 120, budgetMs: 35_000, force: authorised }),
  },
  {
    name: "keeper-sweep",
    budgetMs: 15_000,
    run: async (authorised) => {
      if (!authorised) return { skipped: "the keeper sweep spends money, so it runs only for an authorised caller" };
      if (!keeperConfigured()) return { skipped: "no keeper key on this deployment" };
      const ids = await openMandatesNeedingBids();
      const outcomes = [];
      for (const id of ids.slice(0, 3)) outcomes.push({ id, ...(await keeperBid(id)) });
      await beat("keeper", 1, { open: ids.length, acted: outcomes.length });
      return { open: ids, outcomes };
    },
  },
];

/** Later packages append here (settle sweeper, write-back, Greenfield). */
export function registerJob(job: Job): void {
  if (!JOBS.some((j) => j.name === job.name)) JOBS.push(job);
}

export function jobNames(): string[] {
  return JOBS.map((j) => j.name);
}

export async function runJobs(only?: string[], authorised = false): Promise<JobReport[]> {
  const reports: JobReport[] = [];
  for (const job of JOBS) {
    if (only?.length && !only.includes(job.name)) continue;
    const started = Date.now();
    try {
      const detail = await Promise.race([
        job.run(authorised),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`over budget after ${job.budgetMs} ms`)), job.budgetMs)),
      ]);
      reports.push({ job: job.name, ok: true, ms: Date.now() - started, detail });
    } catch (e) {
      reports.push({ job: job.name, ok: false, ms: Date.now() - started, detail: (e as Error).message });
    }
  }
  return reports;
}
