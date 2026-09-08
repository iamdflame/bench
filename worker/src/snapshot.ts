/**
 * The funnel, assembled from what was actually read.
 *
 * This is the object the four doors, the board's footnote and `/data` are all
 * built from, and it is the one place the product states how much of the
 * registry it has seen. Three rules govern it:
 *
 *   1. `registered` is a `Maybe`. When the registry index is unreachable the
 *      answer is not zero and not the last number we happened to see — it is
 *      unknown, with the reason, and the page says so.
 *
 *   2. `read` travels beside `registered` everywhere. A sweep that has reached
 *      a fraction of the registry is a fraction, and rendering the whole as
 *      inventory is the lie by aggregation this product exists to avoid.
 *
 *   3. `perJob` counts are computed from the same records the board renders,
 *      not from a separate query. A door that disagrees with the board it
 *      leads to is worse than no door.
 */

import { clusterOrigins, COHORT_REPORT_AT, hostOf } from "@bench/index";
import {
  JOB_SLUGS,
  type Agent,
  type BazaarService,
  type JobSlug,
  type Snapshot,
  type SupportedChain,
} from "@bench/shared";
import { known, unknown, type Maybe } from "@bench/measure";

export function buildSnapshot(input: {
  chainId: SupportedChain;
  agents: Agent[];
  services: BazaarService[];
  registered: Maybe<number>;
  block: bigint;
  limitations: string[];
}): Snapshot {
  const { chainId, agents, services, registered, block } = input;

  /*
    Origin concentration is computed over everything that declares an endpoint,
    registry rows and B402 listings alike. The denominator is deliberately
    "things with an endpoint" rather than "things registered": a share of the
    whole registry would be diluted by the ninety-plus percent that declare
    nothing, and would understate the concentration by an order of magnitude.
  */
  const endpoints = [...agents.map((a) => a.endpoint), ...services.map((s) => s.resource)];
  const { cohorts, byHost, declaring } = clusterOrigins(endpoints);

  const withCohort = agents.map((a) => ({
    ...a,
    originCohortSize: a.originHost ? (byHost.get(a.originHost) ?? 1) : 1,
  }));

  const callable = (a: Agent) => a.rails.call.available;
  const hireable = (a: Agent) => a.rails.hire.available;
  const mandatable = (a: Agent) => a.rails.mandate.available;

  const perJob = {} as Snapshot["perJob"];
  for (const slug of JOB_SLUGS) {
    const inJob = withCohort.filter((a) => a.job.known && a.job.value === slug);
    const svcInJob = services.filter((s) => s.job.known && s.job.value === slug);
    perJob[slug] = {
      listed: inJob.length + svcInJob.length,
      callable: inJob.filter(callable).length + svcInJob.filter((s) => s.call.available).length,
      hireable: inJob.filter(hireable).length,
      mandatable: inJob.filter(mandatable).length,
      ours: inJob.filter((a) => a.isOurs).length,
    };
  }

  const probed = withCohort.filter((a) => a.probe !== null).length + services.filter((s) => s.probe !== null).length;
  const duplicateOrigin = [...byHost.values()].reduce((n, c) => n + Math.max(0, c - 1), 0);

  const limitations = [...input.limitations];
  if (!registered.known) limitations.push(registered.reason);
  const read = withCohort.length;
  if (registered.known && read < registered.value) {
    limitations.push(
      `The sweep has read ${read.toLocaleString("en-US")} of ${registered.value.toLocaleString("en-US")} registrations. Everything below is drawn from what has been read; the rest is neither listed nor counted as absent.`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    chainId,
    cutoff: { block: block.toString(), observedAt: new Date().toISOString() },
    registry: {
      registered,
      declaringEndpoint:
        declaring > 0
          ? known(declaring)
          : unknown("No endpoint was found on any record read so far."),
      read,
    },
    origins: cohorts.filter((c) => c.count >= 2).slice(0, 40),
    totals: {
      listed: read + services.length,
      callable: withCohort.filter(callable).length + services.filter((s) => s.call.available).length,
      hireable: withCohort.filter(hireable).length,
      mandatable: withCohort.filter(mandatable).length,
      probed,
      refused:
        withCohort.filter((a) => a.probe?.refusal).length + services.filter((s) => s.probe?.refusal).length,
      duplicateOrigin,
      ours: withCohort.filter((a) => a.isOurs).length,
      bazaar: services.length,
    },
    perJob,
    limitations: [...new Set(limitations)],
  };
}

/** The concentration finding, phrased for `/data`. Returns null when there is none. */
export function concentrationFinding(s: Snapshot): { host: string; count: number; share: number } | null {
  const top = s.origins[0];
  if (!top || top.count < COHORT_REPORT_AT) return null;
  return top;
}

export { hostOf, type JobSlug };
