/**
 * The judge path, checked from the inside.
 *
 * Each of the six beats on /judges depends on a read: the demo address has
 * something to diagnose, every category has an agent that answered, Ranger
 * resolves, Grid-1 has fills, the desk can read the KeyStore, the funnel can
 * read the registry. This runs those reads and grades them, so /status (and
 * any uptime probe pointed at /api/status) sees a broken beat before a judge
 * does. It checks data, not HTML; the smoke script checks the HTML.
 */

import type { Hex } from "viem";
import { diagnose } from "@/lib/diagnose";
import { judgePicks } from "@/lib/market/judge";
import { listingFor } from "@/lib/market/listing";
import { readGridWindow, type GridWindow } from "@/lib/grid/window";
import { snapshot } from "@/lib/data/snapshots";
import { listSessions } from "@/lib/chain/session-store";
import { comparePolicy } from "@/lib/chain/keystore";
import { registeredCount } from "@/lib/registry/count";
import { withTimeout } from "@/lib/cache";
import { DEMO_ADDRESS } from "@/lib/demo";

export interface Check {
  beat: number;
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

async function timed(beat: number, name: string, fn: () => Promise<{ ok: boolean; detail: string }>): Promise<Check> {
  const started = Date.now();
  const r = await withTimeout(fn().catch((e) => ({ ok: false, detail: `failed: ${(e as Error).message.slice(0, 160)}` })), 12_000);
  return { beat, name, ms: Date.now() - started, ...(r ?? { ok: false, detail: "no answer inside 12 seconds" }) };
}

export async function judgePathChecks(): Promise<Check[]> {
  return Promise.all([
    timed(1, "The demo address has something to fix", async () => {
      const d = await diagnose(DEMO_ADDRESS);
      if (!d) return { ok: false, detail: "diagnose returned nothing" };
      const out = d.findings.filter((f) => f.kind === "out-of-range").length;
      const venus = d.findings.some((f) => f.kind === "thin-headroom" || f.kind === "liquidatable" || f.kind === "healthy");
      const idle = d.findings.some((f) => f.kind === "idle-cash");
      return { ok: out > 0 && venus, detail: `${out} out of range, Venus ${venus ? "read" : "not read"}, idle cash ${idle ? "found" : "none"}, block ${d.blockNumber}` };
    }),
    timed(2, "Every category has an agent that answered", async () => {
      const picks = judgePicks();
      const cats = new Set(picks.map((p) => p.category));
      return { ok: cats.size === 4, detail: `${cats.size} of 4 categories have a live pick` };
    }),
    timed(3, "Ranger (269706) resolves with its checks", async () => {
      const l = listingFor("269706");
      return { ok: Boolean(l), detail: l ? `${l.name}: ${l.liveness}` : "not in the index" };
    }),
    timed(4, "Grid-1 has real fills on chain", async () => {
      // The read carries the stored window forward and stores each stretch as
      // it goes, so a slow provider can leave it short of the budget. The
      // stored reading is an earlier chain read of the same log: it stands,
      // with its block and its age, until it is more than a day old.
      let failed: string | null = null;
      const w = await withTimeout(
        readGridWindow().catch((e) => {
          failed = (e as Error).message.slice(0, 120);
          return null;
        }),
        9_000,
      );
      if (w) return { ok: w.fills.length > 0, detail: `${w.fills.length} fills, ${w.roundTrips.length} round trips, read to block ${w.toBlock}` };
      const why = failed ? `the chain read failed (${failed})` : "the chain read did not finish inside 9 seconds";
      const stored = snapshot<GridWindow>("grid-window")?.payload;
      if (!stored) return { ok: false, detail: `${why}, and there is no stored reading` };
      const hours = (Date.now() - Date.parse(stored.readAt)) / 3_600_000;
      const age = hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min` : `${hours.toFixed(1)} h`;
      return {
        ok: stored.fills.length > 0 && hours < 26,
        detail: `${stored.fills.length} fills, ${stored.roundTrips.length} round trips, stored reading to block ${stored.toBlock}, ${age} old; ${why}`,
      };
    }),
    timed(5, "The desk can read the KeyStore", async () => {
      const live = (await listSessions()).filter((s) => !s.revokedAt && s.registered && s.expiry * 1000 > Date.now());
      if (!live.length) return { ok: false, detail: "no live registered session to compare" };
      const s = live[0];
      const m = await comparePolicy({ wallet: s.walletAddress as Hex, publicKey: s.publicKey as Hex, expiry: s.expiry, registered: s.registered, revoked: false });
      return { ok: m.verdict === "matches", detail: `${s.label}: ${m.verdict} at block ${m.block ?? "?"}` };
    }),
    timed(6, "The funnel reads the registry", async () => {
      const c = await registeredCount();
      return { ok: c.count > 0, detail: `${c.count.toLocaleString("en-GB")} registered at block ${c.block.toLocaleString("en-GB")}` };
    }),
  ]);
}
