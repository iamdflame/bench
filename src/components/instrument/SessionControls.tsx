"use client";

import { useState } from "react";

/**
 * Pause and revoke, as controls that do what they say.
 *
 * These are two different acts and the desk must not blur them, because a
 * principal choosing between them is choosing between reversible and final.
 *
 *   PAUSE   this office's own hold. Off chain, free, reversible. The agent
 *           cannot reach its signer while it is set, so it cannot act; the key
 *           still exists and its term keeps running.
 *   REVOKE  on chain and final. The key stops signing anything, for anyone,
 *           and getting the agent back means granting a new session.
 *
 * Both keep their verb through the flow: "Revoke" becomes "Revoked.", never
 * "Success", and neither reports a state it did not reach. Where a public
 * deployment cannot sign, the reason is shown rather than a tick.
 */
export default function SessionControls({
  mandateId,
  revoked,
  paused = false,
}: {
  mandateId: number;
  revoked: boolean;
  paused?: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(revoked ? "done" : "idle");
  const [held, setHeld] = useState(paused);
  const [holding, setHolding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (revoked || state === "done") {
    return <span className="chip chip--fail">Revoked</span>;
  }

  async function hold() {
    setHolding(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sessions/pause", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mandateId, paused: !held }),
      });
      const data = await res.json();
      if (data.ok) setHeld(!held);
      else setMsg(data.reason ?? "The hold was refused.");
    } catch (e) {
      setMsg(String((e as Error).message ?? e));
    } finally {
      setHolding(false);
    }
  }

  async function revoke() {
    if (!confirm("Revoke this agent's authority now? This ends its ability to act, on chain, and cannot be undone.")) return;
    setState("busy");
    setMsg(null);
    try {
      const res = await fetch("/api/sessions/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mandateId }),
      });
      const data = await res.json();
      if (data.ok) {
        setState("done");
      } else {
        setState("error");
        setMsg(data.reason ?? "Revocation was refused.");
      }
    } catch (e) {
      setState("error");
      setMsg(String((e as Error).message ?? e));
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3rem" }}>
      <span style={{ display: "inline-flex", gap: "0.4rem" }}>
        <button
          className="btn btn--sm"
          onClick={hold}
          disabled={holding || state === "busy"}
          title={
            held
              ? "Lift the hold. The session resumes under the same cap and expiry."
              : "Stop the agent acting without ending its key. Off chain, free, reversible."
          }
        >
          {holding ? "…" : held ? "Resume" : "Pause"}
        </button>
        <button
          className="btn btn--sm"
          onClick={revoke}
          disabled={state === "busy"}
          title="End this agent's authority on chain. Final."
          style={{ borderColor: "color-mix(in srgb, var(--color-fail) 40%, white)", color: "var(--color-fail)" }}
        >
          {state === "busy" ? "Revoking…" : "Revoke"}
        </button>
      </span>
      {held ? <span className="chip">held · key alive, agent stopped</span> : null}
      {msg ? <span className="meta" style={{ color: "var(--color-fail)", maxWidth: "22rem", textAlign: "right" }}>{msg}</span> : null}
    </span>
  );
}
