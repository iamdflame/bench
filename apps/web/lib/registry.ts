/**
 * The registry summary, as the floor reads it.
 *
 * The worker holds 33,813 rows and fifteen megabytes; the site serves a summary
 * derived from it — every classified row in full, and everything else as
 * arithmetic. That split is deliberate and it is why this file exists: a page
 * should not be able to reach for the working set even by accident, because
 * the working set is not in the deployment.
 *
 * Everything here is read from a committed file rather than from a third party
 * at request time. A front door that goes blank because somebody else's index
 * is rate-limiting has converted their outage into its own dishonesty.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { JobSlug, SupportedChain } from "@bench/shared";

export interface FunnelStage {
  key: string;
  label: string;
  count: { known: true; value: number } | { known: false; reason: string };
  method: string;
  provenance: "claimed" | "indexed" | "measured";
}

export interface TemplateGroup {
  sample: string;
  count: number;
  share: number;
  owners: number;
  tokenIds: string[];
}

export interface Candidate {
  tokenId: string;
  owner: string | null;
  name: string | null;
  description: string | null;
  cohorts: string[];
  claimsX402: boolean;
  protocols: string[];
  createdAt: string | null;
  feedbacks: number | null;
  score: number | null;
  job: JobSlug | null;
  jobReason: string;
}

export interface RegistrySummary {
  version: 1;
  chainId: SupportedChain;
  observedAt: string;
  funnel: { chainId: number; observedAt: string; stages: FunnelStage[] } | null;
  cohorts: Record<string, { total: number | null; fetched: number; complete: boolean }>;
  classified: Candidate[];
  perJob: Record<string, number>;
  templates: {
    rows: number;
    empty: number;
    distinct: number;
    clustered: number;
    groups: TemplateGroup[];
  };
  reachable: number;
}

const DATA = join(process.cwd(), "apps/web/data");
const FALLBACK = join(process.cwd(), "data");

function summaryPath(chainId: SupportedChain): string | null {
  for (const dir of [DATA, FALLBACK]) {
    const p = join(dir, `registry-summary-${chainId}.json`);
    if (existsSync(p)) return p;
  }
  return null;
}

let cache: { at: number; value: RegistrySummary | null } | null = null;

/**
 * The summary, or null.
 *
 * Null is a legitimate state — a deployment built before the first walk has no
 * summary — and every caller renders the absence rather than a zero. It is
 * cached for a minute because the file is a couple of hundred kilobytes and a
 * page can read it several times in one render.
 */
export function readSummary(chainId: SupportedChain = 56): RegistrySummary | null {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;

  const p = summaryPath(chainId);
  let value: RegistrySummary | null = null;
  if (p) {
    try {
      value = JSON.parse(readFileSync(p, "utf8")) as RegistrySummary;
    } catch {
      value = null;
    }
  }
  cache = { at: Date.now(), value };
  return value;
}

/** A stage by key, so a page names what it wants rather than indexing an array. */
export const stage = (s: RegistrySummary | null, key: string): FunnelStage | null =>
  s?.funnel?.stages.find((x) => x.key === key) ?? null;

/** The number in a stage, or null. Never zero standing in for unknown. */
export const stageValue = (s: RegistrySummary | null, key: string): number | null => {
  const st = stage(s, key);
  return st && st.count.known ? st.count.value : null;
};

/** Agents claiming one job, most recently registered first. */
export function byJob(s: RegistrySummary | null, job: JobSlug): Candidate[] {
  if (!s) return [];
  return s.classified
    .filter((c) => c.job === job)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/**
 * How many distinct things stand behind the registry's headline number.
 *
 * The gap between `reachable` and `distinct` is the whole argument the floor
 * makes, so it is computed in one place rather than in each page that quotes
 * it.
 */
export function concentration(s: RegistrySummary | null): {
  reachable: number;
  distinct: number;
  clustered: number;
  clusteredShare: number;
  largest: TemplateGroup | null;
} | null {
  if (!s) return null;
  const t = s.templates;
  return {
    reachable: t.rows,
    distinct: t.distinct,
    clustered: t.clustered,
    clusteredShare: t.rows === 0 ? 0 : t.clustered / t.rows,
    largest: t.groups[0] ?? null,
  };
}
