"use client";

import { useState } from "react";

/**
 * Revoke, as a control that actually does something.
 *
 * Altana's requirement is that a principal can end an agent's authority inside
 * the product. This is that button. It calls the revoke endpoint, and it is
 * honest about the one case where a public deployment cannot sign from the
 * browser, it shows the operator command rather than pretending it worked.
 * The button keeps its verb: "Revoke" becomes "Revoked.", never "Success".
 */
export default function SessionControls({
  mandateId,
  revoked,
}: {
  mandateId: number;
  revoked: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(revoked ? "done" : "idle");
  const [msg, setMsg] = useState<string | null>(null);

  if (revoked || state === "done") {
    return <span className="chip chip--fail">Revoked</span>;
  }

  async function revoke() {
    if (!confirm("Revoke this agent's authority now? This ends its ability to act, on chain.")) return;
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
        <span className="btn btn--sm" aria-disabled title="Pausing keeps the session but stops the keeper acting. Operator control.">Pause</span>
        <button className="btn btn--sm" onClick={revoke} disabled={state === "busy"} style={{ borderColor: "color-mix(in srgb, var(--color-fail) 40%, white)", color: "var(--color-fail)" }}>
          {state === "busy" ? "Revoking…" : "Revoke"}
        </button>
      </span>
      {msg ? <span className="meta" style={{ color: "var(--color-fail)", maxWidth: "22rem", textAlign: "right" }}>{msg}</span> : null}
    </span>
  );
}
