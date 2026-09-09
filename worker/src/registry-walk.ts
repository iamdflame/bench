/**
 * Reading the registry by cohort, rather than reading all of it.
 *
 * The naive shape of this job is a walk of every registration: 310,421 rows,
 * 3,105 requests, and a cursor that cannot be parallelised because each page
 * needs the one before it. That is half an hour of serial requests to learn
 * almost nothing, because the overwhelming majority of those rows declare no
 * way to reach the agent at all.
 *
 * An agent that declares no endpoint cannot be called, cannot be listed, and
 * cannot be hired. It needs a *count*, not a row. So the population is read
 * with `countWhere` — one request per figure — and only the cohorts that could
 * ever become a listing are enumerated:
 *
 *     declares A2A      28,461
 *     declares MCP       5,574
 *     declares OASF        340
 *     ─────────────────────────
 *     at most           34,375 rows, 344 requests, an 89% saving
 *
 * The cohorts overlap — 313 agents declare both A2A and MCP — so the union is
 * smaller again, and it is deduplicated on the way in.
 *
 * Each cohort carries its own cursor, so they are independent: one can finish,
 * one can be rate-limited, one can be resumed tomorrow, and none of that
 * disturbs the others. That is the only reason this is restartable at all.
 */

import { walkAgents, useCrawlTimeouts, readFunnel, SCAN_PAGE_MAX, type ScanAgent, type Funnel } from "@bench/index";
import type { SupportedChain } from "@bench/shared";
import { DATA_DIR, writeAtomicJson, readJson } from "./store";
import { join } from "node:path";

/**
 * A cohort is a filter that could produce a listing, and a reason it might.
 *
 * `label` is written for a reader of `/data`, not for a log. Every one of
 * these numbers ends up on a page beside the query that produced it.
 */
export interface Cohort {
  key: string;
  label: string;
  /** Sent verbatim to the index. Kept literal so `/data` can print it. */
  params: Record<string, string | number | boolean>;
}

export const COHORTS: readonly Cohort[] = [
  {
    key: "a2a",
    label: "Declares an A2A endpoint",
    params: { is_testnet: false, has_a2a: true },
  },
  {
    key: "mcp",
    label: "Declares an MCP server",
    params: { is_testnet: false, has_mcp: true },
  },
  {
    key: "oasf",
    label: "Declares an OASF descriptor",
    params: { is_testnet: false, has_oasf: true },
  },
];

/**
 * The fields worth keeping, and no others.
 *
 * A full row is roughly two kilobytes of avatars, ENS names and cross-chain
 * versions. Thirty-four thousand of those is a file nobody can commit and the
 * site cannot serve. This projection is what the board actually reads, and it
 * is deliberately short enough that the whole candidate set stays a few
 * megabytes.
 *
 * Note what is *not* here: an endpoint. The index says an agent declares one
 * but does not hand it over in a list response, so the URL is resolved later
 * from `tokenURI` on chain. Storing a declared endpoint we had not seen would
 * put a claim in the same shape as a fact.
 */
export interface Candidate {
  tokenId: string;
  owner: string | null;
  name: string | null;
  description: string | null;
  /** Which cohorts this row arrived in. An agent can be in more than one. */
  cohorts: string[];
  /** The registrant's claim, never a capability. */
  claimsX402: boolean;
  protocols: string[];
  createdAt: string | null;
  feedbacks: number | null;
  score: number | null;
}

/** Where a cohort's walk had got to, and what it cost. */
export interface CohortState {
  key: string;
  /** The population the index reports for this filter. */
  total: number | null;
  /** Rows read so far across every run. */
  fetched: number;
  /** Null once the cohort is complete; a cursor while it is in progress. */
  cursor: string | null;
  complete: boolean;
  pages: number;
  updatedAt: string;
}

export interface RegistryIndex {
  version: 1;
  chainId: SupportedChain;
  observedAt: string;
  funnel: Funnel | null;
  cohorts: Record<string, CohortState>;
  candidates: Candidate[];
}

export const registryPath = (chainId: SupportedChain) => join(DATA_DIR, `registry-${chainId}.json`);

export function readRegistry(chainId: SupportedChain): RegistryIndex | null {
  return readJson<RegistryIndex>(registryPath(chainId));
}

const project = (a: ScanAgent, cohort: string): Candidate => ({
  tokenId: a.token_id,
  owner: a.owner_address ?? null,
  name: a.name ?? null,
  // Long enough to classify a job from, short enough that the file stays small.
  description: a.description ? a.description.slice(0, 400) : null,
  cohorts: [cohort],
  claimsX402: (a as { x402_supported?: boolean }).x402_supported === true,
  protocols: (a as { supported_protocols?: string[] }).supported_protocols ?? [],
  createdAt: a.created_at ?? null,
  feedbacks: (a as { total_feedbacks?: number }).total_feedbacks ?? null,
  score: (a as { total_score?: number }).total_score ?? null,
});

export interface WalkReport {
  chainId: SupportedChain;
  cohorts: CohortState[];
  candidates: number;
  added: number;
  requests: number;
  seconds: number;
}

/**
 * Read every cohort, resuming each where it stopped.
 *
 * `budget` bounds a run in requests rather than in rows, because requests are
 * what a rate limit counts. A run that hits the budget is not a failure: it
 * checkpoints and the next run continues, which is why the cursor is written
 * after every page rather than at the end.
 */
export async function walkRegistry(
  chainId: SupportedChain,
  opts: { budget?: number; onProgress?: (msg: string) => void } = {},
): Promise<WalkReport> {
  useCrawlTimeouts();

  const started = Date.now();
  const budget = opts.budget ?? Infinity;
  const say = opts.onProgress ?? (() => {});

  const prior = readRegistry(chainId);
  const byToken = new Map<string, Candidate>(
    (prior?.candidates ?? []).map((c) => [c.tokenId, c]),
  );
  const before = byToken.size;
  const states: Record<string, CohortState> = { ...(prior?.cohorts ?? {}) };

  let requests = 0;

  for (const cohort of COHORTS) {
    const prev = states[cohort.key];

    // A completed cohort is re-opened from the head rather than resumed: new
    // registrations land at the top, and the walk stops at the first token
    // already held. That makes an incremental pass one request, not 285.
    const resuming = prev && !prev.complete && prev.cursor;
    const state: CohortState = {
      key: cohort.key,
      total: prev?.total ?? null,
      fetched: resuming ? prev.fetched : 0,
      cursor: resuming ? prev.cursor : null,
      complete: false,
      pages: prev?.pages ?? 0,
      updatedAt: new Date().toISOString(),
    };

    const known = new Set(byToken.keys());
    const incremental = !resuming && before > 0;

    say(`${cohort.key}: ${resuming ? `resuming at ${String(state.cursor).slice(0, 12)}…` : incremental ? "incremental from head" : "first pass"}`);

    try {
      for await (const page of walkAgents(chainId, {
        limit: SCAN_PAGE_MAX,
        cursor: state.cursor,
        filters: cohort.params,
        // On an incremental pass, stop at the first row already held. On a
        // first or resumed pass, read to the end of the cohort.
        ...(incremental ? { until: (a: ScanAgent) => known.has(a.token_id) } : {}),
      })) {
        requests += 1;
        state.pages += 1;
        state.fetched += page.items.length;
        state.cursor = page.state.cursor;
        state.total = page.state.total ?? state.total;

        for (const a of page.items) {
          const existing = byToken.get(a.token_id);
          if (existing) {
            if (!existing.cohorts.includes(cohort.key)) existing.cohorts.push(cohort.key);
          } else {
            byToken.set(a.token_id, project(a, cohort.key));
          }
        }

        if (!page.state.more) {
          state.complete = true;
          state.cursor = null;
          break;
        }
        if (requests >= budget) {
          say(`${cohort.key}: stopped on budget at ${state.fetched} rows`);
          break;
        }
      }
    } catch (e) {
      // A cohort that fails keeps its cursor. The others still run, and the
      // next pass resumes this one rather than starting over.
      say(`${cohort.key}: ${e instanceof Error ? e.message : "failed"}`);
    }

    state.updatedAt = new Date().toISOString();
    states[cohort.key] = state;
    say(`${cohort.key}: ${state.fetched}/${state.total ?? "?"} rows, ${state.complete ? "complete" : "incomplete"}`);

    // Checkpoint after every cohort, not at the end of the run.
    writeRegistry({
      version: 1,
      chainId,
      observedAt: new Date().toISOString(),
      funnel: prior?.funnel ?? null,
      cohorts: states,
      candidates: [...byToken.values()],
    });

    if (requests >= budget) break;
  }

  // The funnel is six requests and describes the whole population, including
  // the part deliberately not enumerated. Read last so a failed walk still
  // leaves the previous funnel in place rather than nothing.
  let funnel: Funnel | null = prior?.funnel ?? null;
  try {
    funnel = await readFunnel(chainId);
    requests += 6;
  } catch {
    say("funnel: could not be read; the previous one is kept");
  }

  const candidates = [...byToken.values()];
  writeRegistry({
    version: 1,
    chainId,
    observedAt: new Date().toISOString(),
    funnel,
    cohorts: states,
    candidates,
  });

  return {
    chainId,
    cohorts: Object.values(states),
    candidates: candidates.length,
    added: candidates.length - before,
    requests,
    seconds: (Date.now() - started) / 1000,
  };
}

export function writeRegistry(r: RegistryIndex) {
  writeAtomicJson(registryPath(r.chainId), r);
}
