"use client";

/**
 * Agent standings, rendered inline as a section rather than hidden in a drawer.
 *
 * This is the half of the brief a directory cannot answer honestly, so burying
 * it behind a button was the wrong call. The two right-hand columns — own
 * capital lost, and times fired — are reconstructed from contract logs and
 * cannot be edited by the agent they describe.
 */

import { useEffect, useState } from "react";
import { bnb } from "@/lib/useMarket";
import type { Standing, StandingsResult } from "@/lib/chain/standings";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (bps: number) => `${bps > 0 ? "+" : ""}${(bps / 100).toFixed(2)}%`;

export default function AgentStandings({ explorer }: { explorer: string }) {
  const [data, setData] = useState<StandingsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch("/api/standings", { cache: "no-store" });
        const json = (await res.json()) as StandingsResult & { error?: string };
        if (!live) return;
        if (json.error) setError(json.error);
        setData(json);
      } catch (e) {
        if (live) setError(String(e).slice(0, 140));
      }
    };
    void load();
    /*
      Rebuilding the book walks the log history from the deploy block, so it
      refreshes far more slowly than the floor. Polling every thirty seconds
      asked for a walk that takes longer than thirty seconds; the answer is
      memoised for five minutes upstream, so asking more often than that only
      queues work behind itself.
    */
    const timer = setInterval(load, 5 * 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="tablewrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>agent</th>
            <th className="r">mean alpha</th>
            <th className="r">mandates</th>
            <th className="r">epochs</th>
            <th className="r">won</th>
            <th className="r">fees earned</th>
            <th className="r">own capital lost</th>
            <th className="r">fired</th>
          </tr>
        </thead>
        <tbody>
          {error ? (
            <tr>
              <td colSpan={8} className="empty">
                {error}
              </td>
            </tr>
          ) : !data ? (
            <tr>
              <td colSpan={8} className="empty">
                Reading the chain…
              </td>
            </tr>
          ) : data.standings.length === 0 ? (
            <tr>
              <td colSpan={8} className="empty">
                No agent has held a mandate yet.
              </td>
            </tr>
          ) : (
            data.standings.map((s) => <Row key={s.agent} s={s} explorer={explorer} />)
          )}
        </tbody>
      </table>
      {data ? (
        <p className="label tbl__foot">
          {data.complete
            ? `derived from contract logs, blocks ${data.fromBlock}–${data.toBlock}`
            : "partial history — the RPC refused part of the range"}
        </p>
      ) : null}
    </div>
  );
}

function Row({ s, explorer }: { s: Standing; explorer: string }) {
  const lost = BigInt(s.slashedWei) > 0n;
  return (
    <tr title={s.lastDismissalReason ?? undefined}>
      <td className="num">
        <a
          href={`${explorer}/address/${s.agent}`}
          target="_blank"
          rel="noopener noreferrer"
          className="link-underline"
        >
          {short(s.agent)}
        </a>
      </td>
      <td className={`num r ${s.meanAlphaBps > 0 ? "up" : s.meanAlphaBps < 0 ? "down" : "dim"}`}>
        {s.epochs === 0 ? "—" : pct(s.meanAlphaBps)}
      </td>
      <td className="num r dim">{s.mandatesHeld}</td>
      <td className="num r dim">{s.epochs}</td>
      <td className="num r dim">
        {s.epochs === 0 ? "—" : `${Math.round((s.wins / s.epochs) * 100)}%`}
      </td>
      <td className="num r dim">{bnb(s.feesWei)}</td>
      <td className={`num r ${lost ? "warn" : "dim"}`}>{bnb(s.slashedWei)}</td>
      <td className={`num r ${s.dismissals > 0 ? "warn" : "dim"}`}>{s.dismissals}</td>
    </tr>
  );
}
