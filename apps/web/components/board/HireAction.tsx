"use client";

import { useState } from "react";
import type { RailName } from "@bench/shared";

/**
 * The button, and the only interactive thing on the hire screen.
 *
 * It does one job: post the engagement and render exactly what came back. A
 * success shows the goods; a refusal shows the condition that failed. There is
 * no toast, no generic error, and no spinner — a hairline pulse on the button
 * while it waits, because a spinner tells a person nothing they did not
 * already know.
 *
 * Rail 1 is executed by this deployment on the buyer's behalf and says so on
 * the button. That is a deliberate, stated arrangement rather than a
 * disguised one: a marketplace whose cheapest path requires the visitor to
 * fund a wallet first has a demo, not a front door, and pretending the cent
 * came from them would be worse than saying where it came from.
 */

interface Result {
  ok: boolean;
  body?: string;
  status?: number;
  paid?: string;
  txHash?: string;
  latencyMs?: number;
  refusedBecause?: string;
  plan?: { steps: { says: string }[]; signatures: number; note?: string };
}

const VERB: Record<RailName, string> = {
  call: "Ask it",
  hire: "Prepare the escrow",
  mandate: "Prepare the session",
};

export default function HireAction({
  chainId,
  id,
  rail,
  name,
  price,
  resource,
}: {
  chainId: number;
  id: string;
  rail: RailName;
  name: string;
  price: string | null;
  resource: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  /*
    The one motion that follows a write. It plays once, on the confirmation
    that the engagement landed, and it is deliberately not repeated on a
    re-render: a lift that replays every time React reconciles is decoration.
  */
  const [lifted, setLifted] = useState(false);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/rails/${rail}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainId, id, resource }),
      });
      const payload = (await res.json()) as Result;
      setResult(payload);
      if (payload.ok && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setLifted(true);
        setTimeout(() => setLifted(false), 600);
      }
    } catch (e) {
      setResult({ ok: false, refusedBecause: `The request did not complete: ${String(e).slice(0, 140)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className={`btn btn--hire ${busy ? "pulse" : ""}`} onClick={run} disabled={busy}>
        {busy ? "Working…" : `${VERB[rail]}${price ? ` — ${price}` : ""}`}
      </button>

      {rail === "call" ? (
        <p className="provenance" style={{ marginTop: 8, maxWidth: "62ch" }}>
          This deployment pays the cent from its own wallet so you can see the rail work without funding
          one first. It is rate-limited, and it stops when the float runs out and says so.
        </p>
      ) : null}

      {result ? (
        <div style={{ marginTop: 16 }}>
          {result.ok ? (
            <div className={`panel ${lifted ? "lifted" : ""}`} style={{ padding: 14 }}>
              <div className="between">
                <span className="chip chip--call">
                  {rail === "call" ? "paid and answered" : "prepared"}
                </span>
                <span className="provenance">
                  {result.paid ? `${result.paid} · ` : ""}
                  {result.latencyMs !== undefined ? `${result.latencyMs} ms` : ""}
                </span>
              </div>
              {result.txHash ? (
                <p className="provenance" style={{ marginTop: 8 }}>
                  settled in{" "}
                  <a
                    className="nav__link"
                    style={{ textDecoration: "underline" }}
                    href={`https://bscscan.com/tx/${result.txHash}`}
                  >
                    {result.txHash.slice(0, 14)}…
                  </a>
                </p>
              ) : null}
              {result.plan ? (
                <ol className="stack" style={{ gap: 6, marginTop: 10 }}>
                  {result.plan.steps.map((s, i) => (
                    <li key={i} className="prose" style={{ margin: 0 }}>
                      <span className="num dim">{i + 1}.</span> {s.says}
                    </li>
                  ))}
                </ol>
              ) : null}
              {result.plan?.note ? (
                <p className="provenance" style={{ marginTop: 10 }}>
                  {result.plan.note}
                </p>
              ) : null}
              {/*
                Where it went. A confirmation that does not say what to do next
                is a dead end, and the desk is the room that answers it.
              */}
              <p className="provenance" style={{ marginTop: 10 }}>
                <a className="nav__link" href="/desk" style={{ textDecoration: "underline" }}>
                  See it on the desk
                </a>
              </p>
              {result.body ? (
                <pre
                  className="num"
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: "var(--color-ground)",
                    borderRadius: 8,
                    fontSize: "var(--text-2xs)",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 320,
                  }}
                >
                  {result.body.slice(0, 4000)}
                </pre>
              ) : null}
            </div>
          ) : (
            <p className="refusal" style={{ maxWidth: "72ch" }}>
              <strong style={{ fontWeight: 500 }}>{name} was not put to work.</strong>{" "}
              {result.refusedBecause ?? "The condition that failed was not reported, which is itself a bug."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
