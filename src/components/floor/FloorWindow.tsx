"use client";

import { useEffect, useRef, useState } from "react";
import FloorCanvas, { type FloorState } from "./FloorCanvas";
import { layOut, pressure } from "./layout";
import Legend from "./Legend";
import type { FloorSnapshot } from "@/app/api/floor/route";

/**
 * The market floor as a live window.
 *
 * Mounted only once it is on screen, and never on the critical path: the front
 * page has to reach LCP over hotel wifi, and a WebGL context opened above the
 * fold would spend that budget on something a judge has not scrolled to yet.
 * Until then it is a hairline frame, which is also the fallback where WebGL is
 * unavailable.
 */
export default function FloorWindow({ height = 400 }: { height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [connected, setConnected] = useState(false);
  const state = useRef<FloorState>({
    bodies: [],
    stress: 0,
    flow: 0,
    settlementTick: 0,
    ruptures: [],
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLive(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!live) return;
    const es = new EventSource("/api/floor");
    es.addEventListener("state", (ev) => {
      setConnected(true);
      const snap = JSON.parse((ev as MessageEvent).data) as FloorSnapshot;
      const s = state.current;
      s.bodies = layOut(snap);
      const p = pressure(snap);
      s.stress = p.stress;
      s.flow = p.flow;
    });
    es.addEventListener("stale", () => setConnected(false));
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [live]);

  return (
    <div className="floorwin" ref={host} style={{ height }}>
      {live ? <FloorCanvas state={state} className="floorwin__canvas" /> : null}
      <Legend compact />
      <a className="floorwin__go btn btn--sm" href="/floor">
        See the market floor →
      </a>
      <span className="floorwin__status mark-label">
        <span className={`pulse ${connected ? "pulse--on" : ""}`} aria-hidden />
        {connected ? "live" : live ? "connecting" : "idle"}
      </span>
    </div>
  );
}
