import type { CounterfactualRecord } from "./counterfactual";
/**
 * Where the board's data lives between the worker and the page.
 *
 * A committed JSON snapshot, written by the worker and read by the web app.
 * Postgres is an optional accelerator for the crawl's cursor and for row-level
 * updates; it is deliberately not on the read path, because the front door of
 * an agent marketplace must not go blank when a database is unreachable.
 *
 * Two properties matter more than throughput:
 *
 *   RESUMABLE   the sweep's cursor is written every batch, so a restart
 *               continues rather than starting a three-hundred-thousand-row
 *               crawl again.
 *   HONEST      a partial cycle is written as partial. The snapshot carries
 *               what was read, what was not, and why — so the site can say
 *               "3,808 of 334,770 read" rather than presenting a slice as
 *               the whole.
 *
 * Everything is written atomically through a temp file and a rename, because
 * a snapshot half-written while the site is reading it is worse than a stale
 * one, and on a deploy the site will read it at exactly the wrong moment.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Agent, BazaarService, Snapshot, SupportedChain } from "@bench/shared";
import type { WorkedExample } from "./examples";

/** Repo root, resolved from this file rather than from the working directory. */
export const ROOT = new URL("../../", import.meta.url).pathname;
export const DATA_DIR = join(ROOT, "apps/web/data");

/**
 * One cycle's reading, kept so the board can show what changed.
 *
 * The trending strip is a diff between two of these. Without stored history it
 * would either show nothing or invent movement, and inventing movement on a
 * page whose whole argument is that figures are readings would be the worst
 * possible place to do it.
 *
 * Only what a diff needs is kept: the totals, and the identities that were
 * open on each rail. Eleven callable keys and six integers is a few hundred
 * bytes per cycle, so a dozen cycles of history costs nothing.
 */
export interface Reading {
  at: string;
  block: string;
  totals: { listed: number; callable: number; hireable: number; mandatable: number; probed: number };
  /** Row keys that were open on each rail at this reading. */
  callable: string[];
  hireable: string[];
  mandatable: string[];
}

/** How many cycles of history to keep. Twelve is three hours at a 15m cycle. */
export const HISTORY_DEPTH = 12;

export interface StoredBoard {
  version: 1;
  chainId: SupportedChain;
  generatedAt: string;
  /** Agents from the ERC-8004 registry, probed. */
  agents: Agent[];
  /** Paid services from B402 Bazaar, probed. These have no token id. */
  services: BazaarService[];
  snapshot: Snapshot;
  /** Newest last. Empty until the second cycle, and the strip says so. */
  history?: Reading[];
  /**
   * One real mainnet transaction per job, found on chain.
   *
   * Absent for a job means the scan window held no example of that work, which
   * the page states rather than substituting an invented one.
   */
  examples?: WorkedExample[];
  /** The last counterfactual replay. One record, so every row is comparable. */
  counterfactual?: CounterfactualRecord;
}

export interface SweepCursor {
  chainId: SupportedChain;
  /**
   * Where the next pass continues from, walking backwards from the head.
   *
   * Null means "start at the head again": a completed walk restarts at the top
   * rather than stopping, because the registry keeps minting and the deepest
   * rows are the oldest.
   */
  fromBlock: string | null;
  /** The head when the last pass ran, so depth is meaningful. */
  headBlock: string | null;
  /** The population as last established, however it was established. */
  total: number | null;
  updatedAt: string;
}

function writeAtomic(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/**
 * bigint does not survive JSON.stringify, and every block number in this
 * product is one. They are written as decimal strings with a marker so the
 * reader can put them back rather than silently losing the provenance that
 * makes a measurement a measurement.
 */
const BIGINT_TAG = "__bigint__:";

const replacer = (_k: string, v: unknown) => (typeof v === "bigint" ? BIGINT_TAG + v.toString() : v);
const reviver = (_k: string, v: unknown) =>
  typeof v === "string" && v.startsWith(BIGINT_TAG) ? BigInt(v.slice(BIGINT_TAG.length)) : v;

export const boardPath = (chainId: SupportedChain) => join(DATA_DIR, `board-${chainId}.json`);
export const cursorPath = (chainId: SupportedChain) => join(DATA_DIR, `cursor-${chainId}.json`);

export function writeBoard(board: StoredBoard) {
  writeAtomic(boardPath(board.chainId), JSON.stringify(board, replacer, 1));
}

export function readBoard(chainId: SupportedChain): StoredBoard | null {
  const p = boardPath(chainId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"), reviver) as StoredBoard;
  } catch {
    return null;
  }
}

export function writeCursor(c: SweepCursor) {
  writeAtomic(cursorPath(c.chainId), JSON.stringify(c, null, 1));
}

export function readCursor(chainId: SupportedChain): SweepCursor | null {
  const p = cursorPath(chainId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as SweepCursor;
  } catch {
    return null;
  }
}

/** Merge a fresh batch into an existing board, keyed the way the plan says. */
export function mergeAgents(existing: Agent[], incoming: Agent[]): Agent[] {
  const key = (a: Agent) => `${a.chainId}:${a.tokenId}`;
  const byKey = new Map(existing.map((a) => [key(a), a]));
  for (const a of incoming) byKey.set(key(a), a);
  return [...byKey.values()];
}

export function mergeServices(existing: BazaarService[], incoming: BazaarService[]): BazaarService[] {
  const byKey = new Map(existing.map((s) => [s.resource, s]));
  for (const s of incoming) byKey.set(s.resource, s);
  return [...byKey.values()];
}
