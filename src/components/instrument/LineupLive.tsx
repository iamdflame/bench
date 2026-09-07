"use client";

import { useEffect, useState } from "react";

/**
 * What each of our agents is observing right now.
 *
 * One fetch of the live dry-run endpoint, keyed by slug, so the roster page can
 * show each agent's actual reasoning at this block, "Venus pays 0.06% APR and
 * moving would earn less than the gas", rather than a status light. Enhances a
 * page that already renders every agent server-side; if the fetch fails, the
 * static roster stands on its own.
 */
export interface LiveObs {
  observed: string;
  managingBnb: number | null;
  priceUsd: number | null;
  actions: { kind: string; reason: string }[];
  walletMode: string;
}

export default function LineupLive({ onData }: { onData?: (m: Record<string, LiveObs>) => void }) {
  const [map, setMap] = useState<Record<string, LiveObs> | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/agents/ours")
      .then((r) => r.json())
      .then((d: { agents: (LiveObs & { slug: string })[] }) => {
        if (!live) return;
        const m: Record<string, LiveObs> = {};
        for (const a of d.agents) m[a.slug] = a;
        setMap(m);
        onData?.(m);
      })
      .catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [onData]);

  if (err) {
    return (
      <p className="meta" style={{ color: "var(--color-fail)" }}>
        Live reasoning could not be read this moment. The roster below is unchanged; only the
        block-by-block observation is missing.
      </p>
    );
  }
  if (!map) {
    return <p className="meta" aria-busy>Reading what each agent observes right now…</p>;
  }

  const entries = Object.entries(map);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      {entries.map(([slug, o]) => (
        <div key={slug} className="card" style={{ padding: "0.6rem 0.85rem", display: "flex", gap: "0.75rem", alignItems: "baseline", flexWrap: "wrap" }}>
          <span className="num meta" style={{ minWidth: "8rem" }}>{slug}</span>
          <span style={{ fontSize: "var(--text-sm)", flex: 1, minWidth: "16rem" }}>{o.observed}</span>
          <span className="chip">{o.actions.length ? `${o.actions.length} action${o.actions.length === 1 ? "" : "s"}` : "no action"}</span>
        </div>
      ))}
    </div>
  );
}
