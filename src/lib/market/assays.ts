/**
 * The committed assay snapshot, read on the server.
 *
 * Six checks against mainnet take fourteen to seventeen seconds, so running
 * them on page load meant the first thing a visitor saw was six rows of
 * "checking now", for long enough that they left. These are run on a schedule
 * instead and read from a file, exactly like the agent index, and every
 * reading carries the time and the block it was taken at so nobody has to
 * guess how fresh the answer in front of them is.
 *
 * The file is large and stays on the server. A page passes one report to the
 * browser, never the snapshot.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AssayReport } from "@/lib/assay/types";

export interface AssaySnapshot {
  at: string;
  chainId: number;
  blockNumber: string | null;
  assayed: number;
  failed: { tokenId: string; why: string }[];
  reports: Record<string, AssayReport>;
}

const EMPTY: AssaySnapshot = {
  at: new Date(0).toISOString(),
  chainId: 56,
  blockNumber: null,
  assayed: 0,
  failed: [],
  reports: {},
};

let cached: AssaySnapshot | null = null;

export function assaySnapshot(): AssaySnapshot {
  if (cached) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src/data/assays.json"), "utf8"),
    ) as AssaySnapshot;
  } catch {
    // Absent on a fresh checkout, which is not an error: the page falls back
    // to running the checks live and says so.
    cached = EMPTY;
  }
  return cached;
}

export function assayFor(tokenId: string): AssayReport | null {
  return assaySnapshot().reports[tokenId] ?? null;
}
