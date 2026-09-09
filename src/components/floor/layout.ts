import type { FloorBody } from "./FloorCanvas";
import type { FloorMandate, FloorSnapshot } from "@/app/api/floor/route";

/**
 * Where each mandate stands on the floor.
 *
 * Four columns, one per assay office, mandates stacked within them. Radius is
 * capital under management, ring is the bond still at risk, tint is realised
 * alpha, tremor is strikes. Nothing here is chosen for effect — every visual
 * property is a field of the mandate, which is what makes the legend possible
 * and the picture worth looking at.
 *
 * Extracted so the full floor and the live window on the front page place
 * bodies identically. Two layouts of the same market would be two claims.
 */
export function layOut(snap: FloorSnapshot | null): FloorBody[] {
  if (!snap) return [];
  // Only live mandates stand on the floor. Closed and abandoned ones are book
  // history and belong in the ledger, not underfoot.
  const live = snap.mandates.filter((m) => m.state === 0 || m.state === 1);
  const byCategory = new Map<number, FloorMandate[]>();
  for (const m of live) {
    const list = byCategory.get(m.category) ?? [];
    list.push(m);
    byCategory.set(m.category, list);
  }
  const maxCapital = Math.max(1, ...live.map((m) => Number(BigInt(m.capitalWei)) / 1e18));

  const out: FloorBody[] = [];
  for (let c = 0; c < 4; c++) {
    const list = byCategory.get(c) ?? [];
    // Columns sit at -0.66, -0.22, 0.22, 0.66 across the floor.
    const x = -0.66 + c * 0.44;
    list.forEach((m, i) => {
      const y = list.length === 1 ? -0.16 : 0.06 - (i / Math.max(list.length - 1, 1)) * 0.52;
      const capital = Number(BigInt(m.capitalWei)) / 1e18;
      const radius = 0.06 + 0.1 * Math.sqrt(capital / maxCapital);
      const perEpoch = m.epochsSettled > 0 ? m.cumulativeAlphaBps / m.epochsSettled : 0;
      out.push({
        id: m.id,
        x,
        y,
        radius: m.state === 1 ? radius : radius * 0.62,
        bond: m.state === 1 ? Math.max(0, Math.min(1, m.bondFraction)) : 0,
        alpha: Math.max(-1, Math.min(1, perEpoch / 400)),
        strikes: Math.min(1, m.strikes / 3),
      });
    });
  }
  return out;
}

/** Aggregate stress and flow, the two scalars the shader reads. */
export function pressure(snap: FloorSnapshot | null): { stress: number; flow: number } {
  if (!snap) return { stress: 0, flow: 0 };
  const total = Math.max(snap.mandates.length, 1);
  const losing = snap.mandates.filter((m) => m.cumulativeAlphaBps < 0).length;
  const distress = snap.mandates.reduce((sum, m) => sum + m.strikes, 0) / (total * 3);
  return {
    stress: Math.min(1, (losing / total) * 0.6 + distress * 0.8),
    flow: Math.min(1, snap.totals.active / total),
  };
}
