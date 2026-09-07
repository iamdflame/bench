"use client";

import { useState } from "react";

/**
 * One signature, and it says what it does.
 *
 * The competing flow asks for two or three passkey confirmations depending on
 * how many venues the agent touches. This asks once. Everything that would
 * have been a second confirmation is already on the page above this button, in
 * English, before it is pressed: the calls, the withheld calls, the cap, the
 * expiry, and who receives the funds.
 *
 * The button keeps its verb. "Grant" becomes "Granted."; it never becomes
 * "Success", and it never becomes "Granted." for something that did not
 * happen. Three outcomes are possible and all three are rendered honestly:
 *
 *   granted   the session exists on chain, with the transaction to prove it
 *   refused   the scope could not be derived, with the exact reason
 *   planned   this deployment holds no principal key, with the command that
 *             completes it from the operator's machine
 *
 * The third is the one every other demo would have drawn as a green tick.
 */

interface Clause {
  plain: string;
  signature: string;
  recipient: string | null;
}

export interface GrantResult {
  ok: boolean;
  executed?: boolean;
  refused?: boolean;
  reason?: string;
  remedy?: string;
  fallback?: { name: string; href: string } | null;
  session?: {
    id: number;
    sessionKey: string;
    walletAddress: string;
    registered: boolean;
    registrationTx?: string;
    expiry: number;
    capBnb: number;
    persisted: boolean;
  };
  plan?: { capBnb: number; ttlDays: number; expiry: number; command: string };
}

export default function Ticket({
  tokenId,
  job,
  agentName,
  clauses,
  defaultCap,
  fallbackName,
  fallbackHref,
}: {
  tokenId: string;
  job: string;
  agentName: string;
  clauses: Clause[];
  defaultCap: number;
  fallbackName: string | null;
  fallbackHref: string | null;
}) {
  const [capBnb, setCap] = useState(defaultCap);
  const [ttlDays, setTtl] = useState(7);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<GrantResult | null>(null);

  async function grant() {
    setBusy(true);
    try {
      const r = await fetch("/api/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenId, job, capBnb, ttlDays }),
      });
      setRes((await r.json()) as GrantResult);
    } catch (e) {
      setRes({ ok: false, reason: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  if (res) {
    return (
      <Outcome
        res={res}
        agentName={agentName}
        fallbackName={fallbackName}
        fallbackHref={fallbackHref}
        onRetry={() => setRes(null)}
      />
    );
  }

  return (
    <div>
      <div className="scope-grid" style={{ marginBottom: "1.1rem" }}>
        <label style={{ display: "block" }}>
          <span className="meta">Spend cap</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", marginTop: "0.2rem" }}>
            <input
              type="number"
              min={0.001}
              step={0.001}
              value={capBnb}
              onChange={(e) => setCap(Math.max(0.001, Number(e.target.value)))}
              aria-label="Spend cap in BNB"
              style={{
                width: "7rem", background: "#1b2027", color: "#eef1f5",
                border: "1px solid #333a45", borderRadius: "var(--radius-ui)",
                padding: "0.4rem 0.55rem", fontVariantNumeric: "tabular-nums",
              }}
            />
            <span className="meta">BNB, and never more</span>
          </div>
        </label>
        <label style={{ display: "block" }}>
          <span className="meta">Expires in</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", marginTop: "0.2rem" }}>
            <input
              type="number"
              min={1}
              max={90}
              value={ttlDays}
              onChange={(e) => setTtl(Math.min(90, Math.max(1, Number(e.target.value))))}
              aria-label="Expiry in days"
              style={{
                width: "7rem", background: "#1b2027", color: "#eef1f5",
                border: "1px solid #333a45", borderRadius: "var(--radius-ui)",
                padding: "0.4rem 0.55rem", fontVariantNumeric: "tabular-nums",
              }}
            />
            <span className="meta">days, then it is dead</span>
          </div>
        </label>
      </div>

      <p className="sub" style={{ fontSize: "var(--text-sm)", marginBottom: "1rem" }}>
        {agentName} will be able to do the {clauses.length} thing{clauses.length === 1 ? "" : "s"} listed
        above, up to <span className="num">{capBnb}</span> BNB, for {ttlDays} day{ttlDays === 1 ? "" : "s"}.
        Nothing else, to nobody else. One signature.
      </p>

      <button className="btn btn--primary" onClick={grant} disabled={busy} style={{ fontSize: "var(--text-base)", padding: "0.7rem 1.4rem" }}>
        {busy ? "Reading the chain…" : "Grant"}
      </button>
      <span className="meta" style={{ marginLeft: "0.85rem" }}>One signature. Revocable in one tap.</span>
      {busy ? (
        /*
          Twenty seconds of waiting needs a reason, or it reads as a hang.

          The grant reads four hundred thousand blocks of logs before it will
          authorise anything, because the allowlist is built from what this
          agent has actually been shown doing rather than from what it calls
          itself. That is the slow part, and it is the part worth having.
        */
        <p className="meta" style={{ marginTop: "0.7rem", lineHeight: 1.5, maxWidth: "34rem" }}>
          Reading four hundred thousand blocks for evidence this agent has done this work before,
          then building the allowlist out of what it finds. It takes about twenty seconds because
          the reads are real, and an agent the chain has not shown doing the job is refused here
          rather than at the moment it touches your money.
        </p>
      ) : null}
    </div>
  );
}

function Outcome({
  res,
  agentName,
  fallbackName,
  fallbackHref,
  onRetry,
}: {
  res: GrantResult;
  agentName: string;
  fallbackName: string | null;
  fallbackHref: string | null;
  onRetry: () => void;
}) {
  /* --------------------------------------------------------------- granted */
  if (res.ok && res.executed && res.session) {
    const s = res.session;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span className="dot dot--pass" />
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>Granted.</h2>
        </div>
        <p className="sub" style={{ marginTop: "0.5rem", fontSize: "var(--text-sm)" }}>
          {agentName} holds a live, scoped, expiring key. Here is the evidence, not a checkmark.
        </p>
        <dl style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.4rem 1rem", fontSize: "var(--text-sm)" }}>
          <dt className="meta">Session key</dt>
          <dd className="num" style={{ fontSize: "var(--text-xs)", wordBreak: "break-all" }}>{s.sessionKey.slice(0, 26)}…</dd>
          <dt className="meta">Acts for</dt>
          <dd className="num" style={{ fontSize: "var(--text-xs)" }}>{s.walletAddress}</dd>
          <dt className="meta">Cap</dt>
          <dd className="num">{s.capBnb} BNB</dd>
          <dt className="meta">Expires</dt>
          <dd className="num">{new Date(s.expiry * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</dd>
          <dt className="meta">KeyStore</dt>
          <dd>
            {s.registered && s.registrationTx ? (
              <>
                <a className="link-accent num" href={`https://bscscan.com/tx/${s.registrationTx}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--text-xs)" }}>
                  registered on chain ↗
                </a>
                {" · "}
                <a className="link-accent" href={`https://explorer.altana.network/address/${s.walletAddress}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--text-xs)" }}>
                  Altana explorer ↗
                </a>
              </>
            ) : s.registered ? (
              <span className="meta">registered; the authorising log had not indexed when we looked</span>
            ) : (
              <span className="meta">ephemeral: it enforces identically but is invisible to KeyStore readers</span>
            )}
          </dd>
        </dl>
        {s.persisted ? null : (
          <p className="meta" style={{ marginTop: "0.9rem", lineHeight: 1.5 }}>
            The grant is on chain. This deployment&rsquo;s filesystem is read only, so the public
            session index could not be updated from here: the desk row appears once the operator
            commits it. The transaction above is the fact; the index is only our copy of it.
          </p>
        )}
        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <a href="/desk" className="btn btn--primary">Go to the desk →</a>
          <a href="/proof" className="btn">See the proof</a>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------- refused */
  if (res.refused) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span className="dot dot--fail" />
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>Refused, and here is why.</h2>
        </div>
        <p className="sub" style={{ marginTop: "0.5rem", fontSize: "var(--text-sm)" }}>{res.reason}</p>
        {res.remedy ? <p className="meta" style={{ marginTop: "0.5rem", lineHeight: 1.5 }}>{res.remedy}</p> : null}
        <p className="meta" style={{ marginTop: "0.9rem", lineHeight: 1.5 }}>
          This is the whole invariant working, not a failure of the page. Authority here is the
          intersection of what the job needs with what the chain has shown this agent doing, so an
          agent the chain has not shown doing the work gets nothing, however it describes itself.
        </p>
        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {fallbackHref && fallbackName ? (
            <a href={fallbackHref} className="btn btn--primary">Hire {fallbackName} instead →</a>
          ) : null}
          <button className="btn" onClick={onRetry}>Back to the ticket</button>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------- planned */
  if (res.ok && res.plan) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span className="dot" />
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>Not granted from here.</h2>
        </div>
        <p className="sub" style={{ marginTop: "0.5rem", fontSize: "var(--text-sm)" }}>
          This deployment holds no principal key, so it cannot sign your grant, and it will not draw
          a tick over something that did not happen. The scope below is exactly what the signature
          would carry, computed against the chain just now.
        </p>
        <pre className="num" style={{ marginTop: "0.9rem", padding: "0.7rem 0.85rem", background: "#1b2027", borderRadius: "var(--radius-ui)", fontSize: "var(--text-xs)", overflowX: "auto" }}>
          {res.plan.command}
        </pre>
        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <a href="/desk" className="btn btn--primary">See live sessions on the desk →</a>
          <button className="btn" onClick={onRetry}>Back to the ticket</button>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------------- error */
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <span className="dot dot--fail" />
        <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>The grant did not go through.</h2>
      </div>
      <p className="sub" style={{ marginTop: "0.5rem", fontSize: "var(--text-sm)" }}>{res.reason ?? "No reason was returned."}</p>
      <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {fallbackHref && fallbackName ? (
          <a href={fallbackHref} className="btn btn--primary">Hire {fallbackName} instead →</a>
        ) : null}
        <button className="btn" onClick={onRetry}>Try again</button>
      </div>
    </div>
  );
}
