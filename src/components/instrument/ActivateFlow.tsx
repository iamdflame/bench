"use client";

import { useState } from "react";
import type { JobSpec } from "@/lib/categories";
import ScopeCard from "./ScopeCard";

/**
 * The zero-friction hire: passkey → gas → leash → confirm.
 *
 * Four steps, no seed phrase, every permission legible before a signature. The
 * button says exactly what happens and keeps its name through the flow, "Hire"
 * becomes "Hired.", never "Submit" then "Success". The passkey is a real
 * WebAuthn credential created in the browser; the leash is the exact authority
 * the grant will carry; the confirmation returns the true plan, not a fiction.
 */
type Plan = {
  agentName: string;
  allowlistSummary: string;
  capBnb: number;
  ttlDays: number;
  expiry: number;
  invariant: string;
};

const STEPS = ["Create a signer", "Fund gas", "Set the leash", "Confirm"] as const;

export default function ActivateFlow({
  tokenId,
  job,
  agentName,
}: {
  tokenId: string;
  job: JobSpec;
  agentName: string;
}) {
  const [step, setStep] = useState(0);
  const [passkey, setPasskey] = useState<string | null>(null);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [capBnb, setCapBnb] = useState(0.2);
  const [ttlDays, setTtlDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; plan?: Plan; next?: string; reason?: string; executed?: boolean } | null>(null);

  async function createPasskey() {
    setPasskeyError(null);
    if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials) {
      setPasskeyError("This browser has no passkey support. On a device that does, this is a Face/Touch prompt and no seed phrase.");
      return;
    }
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "MANDATE" },
          user: { id: userId, name: `hire-${tokenId}`, displayName: agentName },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: { userVerification: "preferred", residentKey: "preferred" },
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
      if (cred) {
        setPasskey(cred.id.slice(0, 16));
        setStep(1);
      } else {
        setPasskeyError("No credential was created. Try again.");
      }
    } catch (e) {
      setPasskeyError(`Passkey creation was cancelled or unavailable: ${String((e as Error).message ?? e).slice(0, 120)}`);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch("/api/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenId, job: job.segment, capBnb, ttlDays, passkey }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ ok: false, reason: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  if (result?.ok && result.plan) {
    return <Hired plan={result.plan} next={result.next} executed={result.executed} agentName={agentName} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* stepper */}
      <ol style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {STEPS.map((s, i) => (
          <li key={s} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              className="num"
              style={{
                width: "1.5rem", height: "1.5rem", borderRadius: "50%",
                display: "grid", placeItems: "center", fontSize: "var(--text-xs)",
                background: i < step ? "var(--color-pass)" : i === step ? "var(--color-assay)" : "var(--color-paper-2)",
                color: i <= step ? "#fff" : "var(--color-ink-3)",
                border: "1px solid " + (i <= step ? "transparent" : "var(--color-line-2)"),
              }}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span style={{ fontSize: "var(--text-sm)", color: i === step ? "var(--color-touchstone)" : "var(--color-ink-3)", fontWeight: i === step ? 500 : 400 }}>{s}</span>
            {i < STEPS.length - 1 ? <span className="meta" style={{ marginInline: "0.25rem" }}>›</span> : null}
          </li>
        ))}
      </ol>

      <div className="panel" style={{ padding: "1.5rem" }}>
        {step === 0 && (
          <Step title="Create your signer" body="A passkey: Face ID, Touch ID, or your device PIN. No seed phrase to lose, and only you hold it. This is the key the agent will act under, on a smart account scoped to exactly what you allow next.">
            <button className="btn btn--primary" onClick={createPasskey}>Create a passkey</button>
            {passkey ? <span className="chip chip--pass" style={{ marginLeft: "0.75rem" }}>passkey created · {passkey}…</span> : null}
            {passkeyError ? <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.75rem", color: "var(--color-fail)" }}>{passkeyError}<br /><button className="btn btn--sm" style={{ marginTop: "0.5rem" }} onClick={() => setStep(1)}>Continue anyway →</button></p> : null}
          </Step>
        )}

        {step === 1 && (
          <Step title="Fund gas, once" body="A one-time top-up so the agent can pay for its own transactions on BNB Chain. It is small, it is yours, and it is the only funding the agent ever touches outside the cap you set. Nothing here can spend it except gas.">
            <div style={{ display: "flex", gap: "1.5rem", alignItems: "baseline", marginBottom: "1rem" }}>
              <div><div className="num" style={{ fontSize: "var(--text-xl)" }}>~0.002 BNB</div><div className="meta">one-time gas reserve</div></div>
              <div><div className="num" style={{ fontSize: "var(--text-xl)", color: "var(--color-ink-2)" }}>≈ $1.20</div><div className="meta">at current price</div></div>
            </div>
            <button className="btn btn--primary" onClick={() => setStep(2)}>Gas funded, continue</button>
            <button className="btn btn--ghost" style={{ marginLeft: "0.5rem" }} onClick={() => setStep(0)}>Back</button>
          </Step>
        )}

        {step === 2 && (
          <Step title="Set the leash" body="This is the whole point. The agent gets a key that can do exactly this and nothing else, up to a cap, until it expires, and you can pull it any time.">
            <ScopeCard job={job} capBnb={capBnb} ttlDays={ttlDays} onCap={setCapBnb} onTtl={setTtlDays} />
            <div style={{ marginTop: "1rem" }}>
              <button className="btn btn--primary" onClick={() => setStep(3)}>Set the leash</button>
              <button className="btn btn--ghost" style={{ marginLeft: "0.5rem" }} onClick={() => setStep(1)}>Back</button>
            </div>
          </Step>
        )}

        {step === 3 && (
          <Step title="Confirm the hire" body={`${agentName} will be able to ${job.may}, up to ${capBnb} BNB, for ${ttlDays} days. One tap and it is live on your dashboard.`}>
            {result && !result.ok ? (
              <p className="sub" style={{ fontSize: "var(--text-sm)", color: "var(--color-fail)", marginBottom: "0.75rem" }}>{result.reason}</p>
            ) : null}
            <button className="btn btn--primary" onClick={confirm} disabled={busy}>{busy ? "Hiring…" : "Hire"}</button>
            <button className="btn btn--ghost" style={{ marginLeft: "0.5rem" }} onClick={() => setStep(2)} disabled={busy}>Back</button>
          </Step>
        )}
      </div>
    </div>
  );
}

function Step({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>{title}</h2>
      <p className="sub read" style={{ fontSize: "var(--text-sm)", marginTop: "0.4rem", marginBottom: "1.1rem" }}>{body}</p>
      {children}
    </div>
  );
}

function Hired({ plan, next, executed, agentName }: { plan: Plan; next?: string; executed?: boolean; agentName: string }) {
  return (
    <div className="panel strike" style={{ padding: "1.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <span className="dot dot--pass" />
        <h2 className="hd-2" style={{ color: "var(--color-pass)" }}>{executed ? "Hired." : "Ready to hire."}</h2>
      </div>
      <p className="sub" style={{ marginTop: "0.6rem" }}>
        {executed
          ? `${agentName} is live on your dashboard, acting under the leash you set.`
          : `Here is the exact authority ${agentName} will hold, computed rather than promised. This deployment completes the on-chain grant from the operator side; the plan below is what it signs.`}
      </p>
      <dl style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.4rem 1rem", fontSize: "var(--text-sm)" }}>
        <dt className="meta">May</dt><dd className="num" style={{ fontSize: "var(--text-xs)", wordBreak: "break-all" }}>{plan.allowlistSummary}</dd>
        <dt className="meta">Cap</dt><dd className="num">{plan.capBnb} BNB</dd>
        <dt className="meta">Expires</dt><dd className="num">{new Date(plan.expiry * 1000).toISOString().slice(0, 10)} ({plan.ttlDays}d)</dd>
        <dt className="meta">Invariant</dt><dd className="num">{plan.invariant}</dd>
      </dl>
      {next ? <p className="meta" style={{ marginTop: "1rem", lineHeight: 1.5 }}>{next}</p> : null}
      <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem" }}>
        <a href="/dashboard" className="btn btn--primary">Go to your dashboard →</a>
        <a href="/registry" className="btn">Browse more agents</a>
      </div>
    </div>
  );
}
