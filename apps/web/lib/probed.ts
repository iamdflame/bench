/**
 * What happened when this deployment called the classified agents.
 *
 * Kept separate from the registry summary because they answer different
 * questions and decay at different rates: a registration is durable, a probe
 * is a moment. Merging them into one file would mean re-writing the whole
 * corpus every fifteen minutes to record that an endpoint still answers.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SupportedChain } from "@bench/shared";

export type Liveness = "alive" | "degraded" | "dead" | "never";

export interface Probed {
  tokenId: string;
  endpoint: string | null;
  liveness: Liveness;
  status: number | null;
  latencyMs: number | null;
  refusal: string | null;
  payable: boolean;
  challenge: { network: string | null; asset: string | null; amount: string | null } | null;
  mismatch: string | null;
  probedAt: string;
}

export interface Resolved {
  tokenId: string;
  owner: string | null;
  tokenURI: string | null;
  uriKind: string;
  endpoint: string | null;
  endpointField: string | null;
  agentWallet: string | null;
  skills: string[];
  refusal: string | null;
  block: string;
  resolvedAt: string;
}

function read<T>(chainId: SupportedChain, stem: string): T | null {
  for (const dir of [join(process.cwd(), "apps/web/data"), join(process.cwd(), "data")]) {
    const p = join(dir, `${stem}-${chainId}.json`);
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8")) as T;
      } catch {
        return null;
      }
    }
  }
  return null;
}

let cache: { at: number; probed: Map<string, Probed>; resolved: Map<string, Resolved> } | null = null;

/** Both indexes, keyed by token id, cached for a minute. */
export function callRecord(chainId: SupportedChain = 56): {
  probed: Map<string, Probed>;
  resolved: Map<string, Resolved>;
} {
  if (cache && Date.now() - cache.at < 60_000) return cache;

  const p = read<{ probed: Probed[] }>(chainId, "probed");
  const r = read<{ resolved: Resolved[] }>(chainId, "resolved");
  cache = {
    at: Date.now(),
    probed: new Map((p?.probed ?? []).map((x) => [x.tokenId, x])),
    resolved: new Map((r?.resolved ?? []).map((x) => [x.tokenId, x])),
  };
  return cache;
}
