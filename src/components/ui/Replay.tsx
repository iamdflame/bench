"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Observation from "./Observation";
import Command from "./Command";

interface ReplayedRung {
  n: number;
  name: string;
  population: number | null;
  method: string;
  replayable: boolean;
}

interface ReplayData {
  blockNumber: string;
  blockTime: string | null;
  rungs: ReplayedRung[];
  notes: string[];
  at: string;
}

/**
 * The register, against history.
 *
 * The only way to show that this data is *derived* rather than *authored* is to
 * re-derive it at a block somebody else picked and let them watch it move.
 * Every figure here is recomputed from event logs on each drag — nothing is
 * cached, nothing is interpolated, and a rung that cannot be re-derived is left
 * empty with the reason rather than back-filled from today's answer.
 */
export default function Replay({ head, initial }: { head: number; initial?: number }) {
  /** Roughly two days at BSC's 0.45s blocks — as far back as the logs reach. */
  const span = 400_000;
  const floor = Math.max(1, head - span);

  const [block, setBlock] = useState(initial ?? head);
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (at: number) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/replay?block=${at}`, { signal: controller.signal });
      const body = (await res.json()) as { ok: boolean; data?: ReplayData; error?: string };
      if (!body.ok || !body.data) throw new Error(body.error ?? "could not re-derive");
      setData(body.data);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "could not re-derive");
    } finally {
      setLoading(false);
    }
  }, []);

  // Only when the drag settles. Re-deriving on every pixel would be a log
  // query per pixel, and the point is the derivation, not the animation.
  useEffect(() => {
    const id = setTimeout(() => void load(block), 250);
    return () => clearTimeout(id);
  }, [block, load]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (block === head) url.searchParams.delete("block");
    else url.searchParams.set("block", String(block));
    window.history.replaceState(null, "", url.toString());
  }, [block, head]);

  return (
    <section className="panel replay" aria-labelledby="replay-title">
      <div className="panel__head">
        <h2 id="replay-title" className="mark-label">
          The register, against history
        </h2>
        <Observation
          size="small"
          block={data?.blockNumber ?? block}
          at={data?.blockTime ?? undefined}
        />
      </div>

      <div className="panel__body">
        <label className="replay__scrub">
          <span className="mark-label">
            block {block.toLocaleString()}
            {block === head ? " · head" : ` · ${(head - block).toLocaleString()} behind`}
          </span>
          <input
            type="range"
            min={floor}
            max={head}
            step={1000}
            value={block}
            onChange={(e) => setBlock(Number(e.target.value))}
            aria-label="Block to re-derive the ladder at"
          />
        </label>

        <ol className="replay__rungs" aria-busy={loading}>
          {(data?.rungs ?? []).map((r) => (
            <li className="replay__rung" key={r.n} data-off={r.replayable ? undefined : "1"}>
              <span className="replay__fig num">
                {r.population === null ? "—" : r.population.toLocaleString()}
              </span>
              <span className="replay__body">
                <span className="replay__name">
                  {r.n} {r.name}
                </span>
                <span className="replay__method">{r.method}</span>
              </span>
            </li>
          ))}
          {!data && !error ? <li className="hairline" aria-hidden /> : null}
        </ol>

        {error ? <p className="small au__unread">{error}</p> : null}

        {data?.notes.length ? (
          <ul className="replay__notes">
            {data.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}

        <Command note="Re-derives the same ladder from a terminal, against the same event history. The page and the command share no state.">
          {`npm run replay -- ${block}`}
        </Command>
      </div>
    </section>
  );
}
