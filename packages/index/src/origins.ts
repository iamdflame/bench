/**
 * Endpoint-origin clustering, which is what makes 334,770 rows usable.
 *
 * The most important fact about the supply this marketplace is asked to make
 * discoverable is that it is not 334,770 things. Of the agents declaring any
 * endpoint at all, the overwhelming majority resolve to a single company's
 * backend. A board that renders the registry count as inventory is lying by
 * aggregation, and a board that ranks by count ranks one operator's batch
 * registration above everything a person could actually hire.
 *
 * So the host is a first-class field on every row, the cohort size travels
 * with it, and a cohort above the threshold is collapsed to its distinct
 * services with the remainder expandable. Nothing is hidden — the count is on
 * the row and the register lists every one — but nothing is padded either.
 *
 * The same rule applies to B402 Bazaar listings, where a handful of operators
 * publish dozens of endpoints each on one host. The finding is not about one
 * company; it is about what an unclustered directory does to a reader.
 */

/** Above this, a host is a batch rather than an operator, and the board collapses it. */
export const COHORT_COLLAPSE_AT = 5;

/** Above this, the host is reported on `/data` as a concentration finding. */
export const COHORT_REPORT_AT = 100;

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export interface OriginCohort {
  host: string;
  count: number;
  /** Share of everything that declared an endpoint at all. */
  share: number;
}

/**
 * Count endpoints per host.
 *
 * The denominator is the number of records that declared an endpoint, not the
 * number of records — a share of the whole registry would be diluted by the
 * ninety-plus percent that declare nothing, and would understate the
 * concentration by an order of magnitude.
 */
export function clusterOrigins(endpoints: (string | null | undefined)[]): {
  cohorts: OriginCohort[];
  byHost: Map<string, number>;
  declaring: number;
} {
  const byHost = new Map<string, number>();
  let declaring = 0;
  for (const e of endpoints) {
    const h = hostOf(e);
    if (!h) continue;
    declaring++;
    byHost.set(h, (byHost.get(h) ?? 0) + 1);
  }
  const cohorts = [...byHost.entries()]
    .map(([host, count]) => ({ host, count, share: declaring > 0 ? count / declaring : 0 }))
    .sort((a, b) => b.count - a.count);
  return { cohorts, byHost, declaring };
}

/**
 * Collapse a list so one host cannot dominate it.
 *
 * `keyOf` returns the identity within a host — for a Bazaar listing that is
 * the path, so one operator publishing forty distinct services still shows
 * forty rows if they are forty different services, and one shows once if it is
 * the same service registered forty times. That distinction is the point: this
 * penalises manufactured plurality, not productive operators.
 */
export function collapseByOrigin<T>(
  rows: T[],
  hostOfRow: (t: T) => string | null,
  keyOf: (t: T) => string,
  perHost = COHORT_COLLAPSE_AT,
): { shown: T[]; hidden: number; hiddenByHost: Map<string, number> } {
  const seen = new Map<string, Set<string>>();
  const shown: T[] = [];
  const hiddenByHost = new Map<string, number>();
  let hidden = 0;

  for (const row of rows) {
    const host = hostOfRow(row);
    if (!host) {
      shown.push(row);
      continue;
    }
    const keys = seen.get(host) ?? new Set<string>();
    const key = keyOf(row);
    if (keys.has(key)) {
      // The same service twice under one host is duplication, not depth.
      hidden++;
      hiddenByHost.set(host, (hiddenByHost.get(host) ?? 0) + 1);
      continue;
    }
    if (keys.size >= perHost) {
      hidden++;
      hiddenByHost.set(host, (hiddenByHost.get(host) ?? 0) + 1);
      continue;
    }
    keys.add(key);
    seen.set(host, keys);
    shown.push(row);
  }

  return { shown, hidden, hiddenByHost };
}
