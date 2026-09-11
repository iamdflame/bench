/**
 * Our reference agents, one per category, and the evidence that each works.
 *
 * A reference agent is only "live" when it holds a live session on the demo
 * account and has a mainnet transaction to show for it. Where one has not
 * been built yet, that is the state reported; the category tile still shows
 * the third-party agent that answered, so no tile is ever empty.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Category } from "@/lib/config";
import { listSessions, type SessionRecord } from "@/lib/chain/session-store";
import { snapshot } from "@/lib/data/snapshots";
import type { GridWindow } from "@/lib/grid/window";
import { recenterRecord } from "@/lib/demo";
import { referenceRegistrations } from "@/lib/house";

export interface Reference {
  category: Category;
  name: string;
  status: "live" | "idle" | "not built";
  evidence: string;
  href: string;
  tx?: string;
  /** Its ERC-8004 token, once registered. */
  tokenId?: string;
}

const liveSession = (sessions: SessionRecord[], prefix: string) =>
  sessions.find((s) => s.id.startsWith(prefix) && !s.revokedAt && s.expiry * 1000 > Date.now()) ?? null;

function record<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "src/data", name), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function referenceAgents(): Promise<Record<Category, Reference>> {
  const sessions = await listSessions().catch(() => [] as SessionRecord[]);
  const recenter = recenterRecord()?.latest ?? null;
  const grid = snapshot<GridWindow>("grid-window")?.payload ?? record<GridWindow>("grid-window.json");
  const yieldRun = record<{ tx: string; summary: string }>("yield-1.json");
  const guardRun = record<{ tx: string; summary: string }>("guard-1.json");

  const regs = referenceRegistrations();
  const range = liveSession(sessions, "house:range-1:");
  const gridSession = liveSession(sessions, "house:grid-1:");
  const lastFill = grid?.fills[grid.fills.length - 1];

  return {
    rebalancing: {
      category: "rebalancing",
      name: "Range-1",
      status: range && recenter ? "live" : recenter ? "idle" : "not built",
      evidence: recenter
        ? `Recentered position #${recenter.before.tokenId} into #${recenter.after.tokenId} through RecipientBound, same owner throughout.`
        : "No recenter yet.",
      href: "/desk#range-1",
      tx: recenter?.txs.mint,
      tokenId: regs["range-1"]?.tokenId,
    },
    "grid-trading": {
      category: "grid-trading",
      name: "Grid-1",
      status: gridSession && grid ? "live" : grid?.fills.length ? "idle" : "not built",
      evidence: grid
        ? grid.fills.length
          ? `${grid.fills.length} real fill${grid.fills.length === 1 ? "" : "s"} through SwapBound; ${grid.winRate === null ? "no round trip closed yet" : `${Math.round(grid.winRate * 100)}% of ${grid.roundTrips.length} round trips won`}.`
          : "Trading window open; no level crossed yet, so no fill."
        : "No window yet.",
      href: "/desk#grid-1",
      tx: lastFill?.tx,
      tokenId: regs["grid-1"]?.tokenId,
    },
    "yield-optimisation": {
      category: "yield-optimisation",
      name: "Yield-1",
      status: yieldRun ? "live" : "not built",
      evidence: yieldRun?.summary ?? "Not running yet. The third-party agent beside it is the one that answered.",
      href: "/desk",
      tx: yieldRun?.tx,
      tokenId: regs["yield-1"]?.tokenId,
    },
    "health-factor": {
      category: "health-factor",
      name: "Guard-1",
      status: guardRun ? "live" : "not built",
      evidence: guardRun?.summary ?? "Not running yet. The third-party agent beside it is the one that answered.",
      href: "/desk",
      tx: guardRun?.tx,
      tokenId: regs["guard-1"]?.tokenId,
    },
  };
}
