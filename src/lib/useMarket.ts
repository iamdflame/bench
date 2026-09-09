"use client";

/**
 * One live subscription to the market, shared by every section of the page.
 *
 * Previously each panel opened its own stream. One connection, one source of
 * truth, and the derived tape is computed once rather than per component.
 */

import { useEffect, useRef, useState } from "react";
import type { FloorMandate, FloorSnapshot } from "@/app/api/floor/route";

export type TapeTone = "settle" | "gain" | "loss" | "slash" | "dismissal" | "award";

export interface TapeEntry {
  key: string;
  mandateId: number;
  text: string;
  tone: TapeTone;
  at: string;
  /**
   * The block this change was first seen at.
   *
   * The tape is built by diffing consecutive snapshots, so `at` is when we
   * read the chain and not when the chain moved. Thirteen entries landing in
   * one poll all carry the same wall clock, which reads as thirteen things
   * happening in the same second and is not what happened. The block is the
   * honest stamp: the state had changed by then.
   */
  blockNumber: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";
const short = (a: string) => (a && a !== ZERO ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const pct = (bps: number) => `${bps > 0 ? "+" : ""}${(bps / 100).toFixed(2)}%`;

export function bnb(wei: string | bigint | undefined, dp?: number): string {
  if (wei === undefined) return "—";
  const n = Number(BigInt(wei)) / 1e18;
  if (dp !== undefined) return n.toFixed(dp);
  if (n === 0) return "0";
  // Precision follows magnitude: a 0.0025 BNB position is real, not zero.
  return n.toFixed(placesFor(n));
}

/** Decimals a single figure needs before it rounds away to nothing. */
export function placesFor(n: number): number {
  return n >= 100 ? 1 : n >= 1 ? 2 : n >= 0.01 ? 3 : n >= 0.0001 ? 5 : 7;
}

/**
 * One precision for a whole column.
 *
 * Per-figure precision is right for a figure standing alone and wrong the
 * moment figures are stacked: the floor's capital column ran 0.0000600,
 * 0.0000500, 0.0000486, 0.00015, 0.00150, 0.00250 — four different decimal
 * counts down one column, so the digits did not line up and two values an
 * order of magnitude apart looked the same length. A column takes the
 * precision its smallest non-zero member needs, and every row uses it.
 */
export function columnPlaces(values: (string | bigint | undefined)[]): number {
  let places = 2;
  for (const v of values) {
    if (v === undefined) continue;
    const n = Number(BigInt(v)) / 1e18;
    if (n === 0) continue;
    places = Math.max(places, placesFor(n));
  }
  return places;
}

export interface MarketState {
  snapshot: FloorSnapshot | null;
  tape: TapeEntry[];
  connected: boolean;
  /** Mandate ids dismissed since the renderer last consumed them. */
  ruptures: number[];
  settlementTick: number;
}

/**
 * @param initial A snapshot read on the server, so the first render has rows.
 *
 * Without it the floor's state began as `null` and only filled inside an
 * effect, which does not run during server rendering — so the HTML said
 * "0 mandates active" and "Reading the chain…" while three ledgers said Active.
 * The stream still takes over as soon as it connects; this is what the page
 * says before it does.
 */
export function useMarket(initial?: FloorSnapshot | null) {
  const [snapshot, setSnapshot] = useState<FloorSnapshot | null>(initial ?? null);
  const [tape, setTape] = useState<TapeEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const previous = useRef<Map<number, FloorMandate>>(new Map());
  const signals = useRef({ ruptures: [] as number[], settlementTick: 0 });

  useEffect(() => {
    const es = new EventSource("/api/floor");

    es.addEventListener("state", (ev) => {
      setConnected(true);
      const next = JSON.parse((ev as MessageEvent).data) as FloorSnapshot;
      setSnapshot(next);

      const entries: TapeEntry[] = [];
      for (const m of next.mandates) {
        const before = previous.current.get(m.id);
        if (!before) continue;

        if (m.epochsSettled > before.epochsSettled) {
          const delta = m.cumulativeAlphaBps - before.cumulativeAlphaBps;
          entries.push({
            key: `${m.id}-e${m.epochsSettled}`,
            mandateId: m.id,
            text: `epoch ${m.epochsSettled} settled ${pct(delta)}`,
            tone: delta >= 0 ? "gain" : "loss",
            at: next.at,
            blockNumber: next.blockNumber,
          });
        }

        if (BigInt(m.bondWei) < BigInt(before.bondWei)) {
          const slashed = BigInt(before.bondWei) - BigInt(m.bondWei);
          entries.push({
            key: `${m.id}-s${m.epochsSettled}`,
            mandateId: m.id,
            text: `bond slashed ${bnb(slashed.toString())} BNB`,
            tone: "slash",
            at: next.at,
            blockNumber: next.blockNumber,
          });
        }

        if (m.agent.toLowerCase() !== before.agent.toLowerCase()) {
          const wasHeld = before.agent !== ZERO;
          const isHeld = m.agent !== ZERO;
          // Only a change of holder is a dismissal; unheld to held is an award.
          if (wasHeld) signals.current.ruptures.push(m.id);
          entries.push({
            key: `${m.id}-a${m.epochsSettled}-${m.agent}`,
            mandateId: m.id,
            text: !wasHeld
              ? `awarded to ${short(m.agent)}`
              : isHeld
                ? `${short(before.agent)} dismissed · ${short(m.agent)} takes over`
                : `${short(before.agent)} dismissed · no successor`,
            tone: wasHeld ? "dismissal" : "award",
            at: next.at,
            blockNumber: next.blockNumber,
          });
        }
      }

      previous.current = new Map(next.mandates.map((m) => [m.id, m]));
      if (entries.length) {
        signals.current.settlementTick += 1;
        setTape((t) => [...entries.reverse(), ...t].slice(0, 60));
      }
    });

    es.addEventListener("stale", () => setConnected(false));
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  return { snapshot, tape, connected, signals };
}
