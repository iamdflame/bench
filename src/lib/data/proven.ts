/**
 * Capability evidence, committed as transactions anyone can open.
 *
 * The invariant `granted ⊆ proven` needs one fact before it will authorise
 * anything: has the chain shown this wallet using the protocol this job
 * requires. This file is where that fact lives, and its shape is the argument.
 *
 * It stores the *evidence*, not the verdict. Each row is a protocol, a
 * transaction hash and a block, so a reader checks it on BscScan without
 * trusting a boolean we computed in private. That is the difference between a
 * claim and a citation, and it is the difference this whole product is about.
 *
 * Regenerate with `npm run prove`. A wallet absent from the file is not denied:
 * the grant falls back to scanning the chain live, which is slower and shallower
 * but never silently refuses for want of a cache entry.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProvenTouch {
  /** Lowercased protocol address. */
  protocol: string;
  /** Human name, so a reader does not have to recognise a hex address. */
  label: string;
  tx: string;
  block: string;
}

export interface ProvenWallet {
  wallet: string;
  /** Who we understand this wallet to be, for the record. Never load-bearing. */
  label: string;
  /** Head block at capture. */
  scannedTo: string;
  scannedBlocks: string;
  /**
   * Whether the scan read its whole range.
   *
   * An incomplete scan is not evidence of absence, and the grant refuses on it
   * rather than quietly narrowing, exactly as a live scan does.
   */
  complete: boolean;
  protocols: string[];
  touches: ProvenTouch[];
}

export interface ProvenIndex {
  capturedAt: string;
  chainId: number;
  headBlock: string;
  lookbackBlocks: string;
  wallets: Record<string, ProvenWallet>;
}

const EMPTY: ProvenIndex = {
  capturedAt: new Date(0).toISOString(),
  chainId: 56,
  headBlock: "0",
  lookbackBlocks: "0",
  wallets: {},
};

let cached: ProvenIndex | null = null;

export function getProven(): ProvenIndex {
  if (cached) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src/data/proven.json"), "utf8"),
    ) as ProvenIndex;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

/** What the committed evidence says about one wallet, or null if it says nothing. */
export function provenFor(wallet: string): ProvenWallet | null {
  return getProven().wallets[wallet.toLowerCase()] ?? null;
}

/** The transactions behind one wallet's claim on one protocol. */
export function touchesOn(wallet: string, protocol: string): ProvenTouch[] {
  const p = provenFor(wallet);
  if (!p) return [];
  const target = protocol.toLowerCase();
  return p.touches.filter((t) => t.protocol === target);
}
