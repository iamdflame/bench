"use client";

import { useState } from "react";

/**
 * The live listing check.
 *
 * Posts whatever was pasted and renders the result as a per-rail verdict with
 * the specific condition that failed. It is deliberately the same code path
 * the worker runs, so an operator who fixes what this reports has fixed what
 * the board sees — a "validator" that disagrees with the thing it validates
 * for is worse than none.
 */

interface RailVerdict {
  rail: string;
  open: boolean;
  reason: string | null;
}

interface CheckResult {
  ok: boolean;
  subject?: string;
  name?: string | null;
  job?: string | null;
  jobReason?: string | null;
  status?: number | null;
  latencyMs?: number | null;
  rails?: RailVerdict[];
  refusedBecause?: string;
}

export default function ListCheck() {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: value.trim() }),
      });
      setResult((await res.json()) as CheckResult);
    } catch (err) {
      setResult({ ok: false, refusedBecause: `The check did not complete: ${String(err).slice(0, 140)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={run} className="row wrap" style={{ gap: 8, maxWidth: 620 }}>
        <label htmlFor="subject" className="sr-only">
          Token id or endpoint URL
        </label>
        <input
          id="subject"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="338734, or https://your-agent.example/api"
          className="num"
          style={{
            flex: 1,
            minWidth: 260,
            padding: "9px 12px",
            background: "var(--color-panel)",
            border: "1px solid var(--color-rule)",
            borderRadius: "var(--radius-ui)",
            fontSize: "var(--text-xs)",
          }}
        />
        <button className={`btn btn--hire ${busy ? "pulse" : ""}`} type="submit" disabled={busy}>
          {busy ? "Calling it…" : "Check it live"}
        </button>
      </form>

      {result ? (
        <div className="panel" style={{ marginTop: 16, padding: 18, maxWidth: 720 }}>
          {result.ok ? (
            <>
              <div className="between wrap">
                <span style={{ fontWeight: 500 }}>{result.name || result.subject}</span>
                <span className="provenance">
                  {result.status !== null && result.status !== undefined ? `HTTP ${result.status}` : "no answer"}
                  {result.latencyMs !== null && result.latencyMs !== undefined ? ` · ${result.latencyMs} ms` : ""}
                </span>
              </div>

              <p className="provenance" style={{ marginTop: 6 }}>
                {result.job ? `Classified as: ${result.job}` : `Not classified: ${result.jobReason ?? "no reason given"}`}
              </p>

              <ul className="stack" style={{ gap: 10, marginTop: 14 }}>
                {(result.rails ?? []).map((r) => (
                  <li key={r.rail}>
                    <span className={`chip ${r.open ? `chip--${r.rail}` : "chip--refused"}`}>{r.rail}</span>{" "}
                    <span className="meta">{r.open ? "would be listed" : "would not be listed"}</span>
                    {r.reason ? <p className="provenance" style={{ marginTop: 4 }}>{r.reason}</p> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="refusal">{result.refusedBecause}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
