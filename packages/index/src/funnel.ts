/**
 * The funnel: how a registry of three hundred thousand becomes a shortlist.
 *
 * Every number here is a `total` returned by the index for a filtered query,
 * which means each stage costs one request with `limit=1` rather than a walk.
 * The whole funnel is eight requests, and that is the only reason it can be
 * recomputed on every worker cycle instead of once a day.
 *
 * The point of the funnel is not the top number. It is the distance between
 * the top number and the bottom one. A registration is a claim that costs a
 * gas fee; an endpoint that answers a call we made is a fact. Publishing both,
 * next to each other, is the product.
 *
 * Two of these stages are claims and are labelled as such. `x402_supported` is
 * a flag the registrant sets, not a payment anyone has taken: 71,458 agents
 * claimed it when this was written, while our own probe of Binance's B402
 * catalogue found four resources on this chain that could actually be paid.
 * That gap is not an error in either number. It is the difference between
 * saying and doing, and it is why this file never calls a claim a capability.
 */

import { known, unknown, type Maybe } from "@bench/measure";
import type { SupportedChain } from "@bench/shared";
import { countWhere } from "./scan";

/** What a stage is: a count, how it was obtained, and whether it is a claim. */
export interface FunnelStage {
  key: string;
  label: string;
  /** Unknown when the index could not be read. Never zero for that reason. */
  count: Maybe<number>;
  /** The query that produced it, so the figure can be reproduced. */
  method: string;
  /**
   * `claimed` — the registrant asserted it and nobody checked.
   * `indexed`  — the index observed it.
   * `measured` — we called it ourselves.
   */
  provenance: "claimed" | "indexed" | "measured";
}

export interface Funnel {
  chainId: SupportedChain;
  observedAt: string;
  stages: FunnelStage[];
}

/**
 * The stages, in the order a reader should meet them.
 *
 * Deliberately not sorted by size. The order is the argument: everything is
 * registered, almost nothing declares a way in, and essentially nothing has
 * ever been vouched for by anyone.
 */
const STAGES: ReadonlyArray<{
  key: string;
  label: string;
  params: Record<string, string | number | boolean>;
  provenance: FunnelStage["provenance"];
}> = [
  {
    key: "registered",
    label: "Registered on BNB Smart Chain",
    params: { is_testnet: false },
    provenance: "indexed",
  },
  {
    key: "a2a",
    label: "Declares an A2A endpoint",
    params: { is_testnet: false, has_a2a: true },
    provenance: "claimed",
  },
  {
    key: "mcp",
    label: "Declares an MCP server",
    params: { is_testnet: false, has_mcp: true },
    provenance: "claimed",
  },
  {
    key: "x402",
    label: "Claims it can be paid over x402",
    params: { is_testnet: false, x402_supported: true },
    provenance: "claimed",
  },
  {
    key: "endpointVerified",
    label: "Endpoint domain verified by the index",
    params: { is_testnet: false, is_endpoint_verified: true },
    provenance: "indexed",
  },
  {
    key: "feedback",
    label: "Has ever received a single piece of feedback",
    params: { is_testnet: false, min_feedbacks: 1 },
    provenance: "indexed",
  },
];

/**
 * Read the funnel.
 *
 * Stages are read in sequence rather than in parallel. The pacing in the scan
 * client is global, so firing six at once buys nothing and only makes a rate
 * limit likelier; six sequential reads is under a second with a key.
 */
export async function readFunnel(chainId: SupportedChain): Promise<Funnel> {
  const stages: FunnelStage[] = [];

  for (const s of STAGES) {
    const count = await countWhere(chainId, s.params);
    stages.push({
      key: s.key,
      label: s.label,
      count,
      method: describe(chainId, s.params),
      provenance: s.provenance,
    });
  }

  return { chainId, observedAt: new Date().toISOString(), stages };
}

/** The query, written out, so a reader can run it themselves. */
function describe(chainId: SupportedChain, params: Record<string, string | number | boolean>): string {
  const q = Object.entries({ chain_id: chainId, ...params })
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `GET /agents?${q}&limit=1 → total`;
}

/**
 * Two stages, as a share.
 *
 * Returns unknown rather than a ratio when either side is unknown, because a
 * percentage computed against a number we do not have is a number nobody
 * should read.
 */
export function share(numerator: Maybe<number>, denominator: Maybe<number>): Maybe<number> {
  if (!numerator.known) return unknown(numerator.reason);
  if (!denominator.known) return unknown(denominator.reason);
  if (denominator.value === 0) {
    return unknown("The population is zero, so a share of it is not defined.");
  }
  return known(numerator.value / denominator.value);
}

export const stageOf = (f: Funnel, key: string): FunnelStage | undefined =>
  f.stages.find((s) => s.key === key);
