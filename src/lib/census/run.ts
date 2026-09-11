/**
 * The census as a function: call agents, record what came back, merge.
 *
 * `src/scripts/probe-all.ts` did this as a one-shot script that wrote a
 * file. That is right on a laptop and impossible on a serverless function,
 * which has sixty seconds, no writable filesystem, and no scheduler behind
 * it now that GitHub Actions is locked and the Railway worker has stopped.
 *
 * So the census is now incremental and budgeted. A run takes the `limit`
 * agents whose reading is oldest, re-resolves their cards, calls them, and
 * merges the results into the previous reading. Six runs of sixty agents
 * refresh the whole classified set; a judge's own visits (`after()` on the
 * judge-facing pages) and the daily cron are what trigger them. From a
 * laptop `limit` is unbounded and it is the old full census.
 *
 * Two rules from the script survive unchanged. A card that would not resolve
 * is *our* failure and carries its previous reading forward, never
 * overwritten with "no endpoint". And an agent that publishes nothing to
 * call is recorded as publishing nothing, a finding rather than a gap.
 */

import { readRegistryEntry } from "@/lib/sources/registry";
import { probeAll, type ProbeResult } from "@/lib/probe";
import { readQuote, readPreview, type Quote } from "@/lib/x402/quote";
import { getAgentIndex } from "@/lib/data/agents";
import type { ProbeIndex } from "@/lib/data/probes";

export interface CensusOptions {
  previous: ProbeIndex | null;
  /** How many agents to refresh this run. Unbounded when omitted. */
  limit?: number;
  /** Wall-clock budget; the run stops taking new work past it. */
  budgetMs?: number;
  resolveConcurrency?: number;
  probeConcurrency?: number;
  /** Refresh only these token ids (a category, a judge pick). */
  only?: string[];
  log?: (...a: unknown[]) => void;
}

export interface CensusRun {
  index: ProbeIndex;
  refreshed: number;
  resolvedFailed: number;
  ms: number;
}

function endpointFor(e: Awaited<ReturnType<typeof readRegistryEntry>>): string | null {
  if (!e) return null;
  if (e.x402Endpoint) return e.x402Endpoint;
  const svc = e.services?.find((s) => typeof s.endpoint === "string" && /^https?:/i.test(s.endpoint));
  if (svc?.endpoint) return svc.endpoint;
  return null;
}

export async function runCensus(opts: CensusOptions): Promise<CensusRun> {
  const started = Date.now();
  const log = opts.log ?? (() => undefined);
  const budget = opts.budgetMs ?? Number.POSITIVE_INFINITY;
  const overBudget = () => Date.now() - started > budget;

  const prev = opts.previous;
  const prevResults = new Map<string, ProbeResult>((prev?.results ?? []).map((r) => [r.tokenId, r]));
  const prevQuotes: Record<string, Quote> = { ...(prev?.quotes ?? {}) };
  const prevPreviews: Record<string, unknown> = { ...(prev?.previews ?? {}) };

  let agents = getAgentIndex().agents.filter((a) => a.category);
  if (opts.only?.length) {
    const want = new Set(opts.only);
    agents = agents.filter((a) => want.has(a.tokenId));
  }
  // Oldest reading first, never-read first of all.
  agents.sort((a, b) => {
    const ta = prevResults.get(a.tokenId)?.at ?? "";
    const tb = prevResults.get(b.tokenId)?.at ?? "";
    return ta.localeCompare(tb);
  });
  if (opts.limit) agents = agents.slice(0, opts.limit);
  log(`${agents.length} agents to refresh`);

  const targets: { tokenId: string; endpoint: string | null; unread: boolean }[] = [];
  const queue = [...agents];
  await Promise.all(
    Array.from({ length: opts.resolveConcurrency ?? 8 }, async () => {
      for (;;) {
        if (overBudget()) return;
        const a = queue.shift();
        if (!a) return;
        const e = await readRegistryEntry(a.tokenId).catch(() => null);
        targets.push({
          tokenId: a.tokenId,
          endpoint: endpointFor(e),
          unread: e === null || e.cardSource === "unresolved",
        });
      }
    }),
  );

  const now = new Date().toISOString();
  const callable = targets.filter((t) => !t.unread && t.endpoint);
  log(`${callable.length} of ${targets.length} advertise an endpoint; calling them`);
  const results = overBudget() ? [] : await probeAll(callable, opts.probeConcurrency ?? 8);

  const fresh = new Map<string, ProbeResult>(results.map((r) => [r.tokenId, r]));
  let resolvedFailed = 0;
  for (const t of targets) {
    if (t.unread) {
      // Our read failed. Keep what we knew; if we knew nothing, say so.
      resolvedFailed += 1;
      if (!prevResults.has(t.tokenId)) {
        prevResults.set(t.tokenId, {
          tokenId: t.tokenId,
          endpoint: null,
          answered: false,
          status: null,
          latencyMs: null,
          error: "the card did not resolve on this read; not a finding about the agent",
          at: now,
        });
      }
      continue;
    }
    if (!t.endpoint) {
      prevResults.set(t.tokenId, {
        tokenId: t.tokenId,
        endpoint: null,
        answered: false,
        status: null,
        latencyMs: null,
        error: "the card advertises no endpoint",
        at: now,
      });
      continue;
    }
    const r = fresh.get(t.tokenId);
    if (r) prevResults.set(t.tokenId, r);
  }

  // Anything that answered 402 is asked what it charges.
  for (const r of results) {
    if (r.status !== 402 || !r.endpoint || overBudget()) continue;
    const q = await readQuote(r.endpoint).catch(() => null);
    if (q) prevQuotes[r.tokenId] = q;
    const pv = await readPreview(r.endpoint).catch(() => null);
    if (pv) prevPreviews[r.tokenId] = pv;
  }

  const all = [...prevResults.values()];
  const index: ProbeIndex = {
    at: now,
    probed: all.filter((r) => r.endpoint).length,
    answered: all.filter((r) => r.answered).length,
    quotes: prevQuotes,
    previews: prevPreviews,
    results: all,
  };
  return { index, refreshed: results.length, resolvedFailed, ms: Date.now() - started };
}
