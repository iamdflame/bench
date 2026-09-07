"use client";

import type { JobSpec } from "@/lib/categories";

/**
 * The leash, in plain language.
 *
 * Every permission legible, before anyone signs. What the agent may do, what it
 * may not do, the cap it can never exceed, and when the authority dies. The
 * auditor's version, the ERC-8183 allowlist, target and selector, sits one
 * line down; the surface is a sentence a person can actually read.
 */
export default function ScopeCard({
  job,
  capBnb,
  ttlDays,
  onCap,
  onTtl,
}: {
  job: JobSpec;
  capBnb: number;
  ttlDays: number;
  onCap: (v: number) => void;
  onTtl: (v: number) => void;
}) {
  return (
    <div className="card" style={{ padding: "1.25rem" }}>
      <div className="scope-grid">
        <div>
          <div className="meta" style={{ color: "var(--color-pass)", marginBottom: "0.3rem" }}>It may</div>
          <p style={{ fontSize: "var(--text-sm)" }}>{cap1(job.may)}.</p>
        </div>
        <div>
          <div className="meta" style={{ color: "var(--color-fail)", marginBottom: "0.3rem" }}>It may not</div>
          <ul style={{ fontSize: "var(--text-sm)", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            <li>· withdraw to any other address</li>
            <li>· do anything outside &ldquo;{job.door.toLowerCase()}&rdquo;</li>
            <li>· exceed the cap, or act after it expires</li>
          </ul>
        </div>
      </div>

      <hr className="rule" style={{ marginBlock: "1.1rem" }} />

      <div className="scope-grid">
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <span className="meta">Spend cap, the most it can ever lose</span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="number"
              min={0}
              step={0.01}
              value={capBnb}
              onChange={(e) => onCap(Math.max(0, Number(e.target.value)))}
              className="num"
              style={inputStyle}
            />
            <span className="meta">BNB</span>
          </span>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <span className="meta">Expires in, after which the key dies on its own</span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="number"
              min={1}
              step={1}
              value={ttlDays}
              onChange={(e) => onTtl(Math.max(1, Math.round(Number(e.target.value))))}
              className="num"
              style={inputStyle}
            />
            <span className="meta">days</span>
          </span>
        </label>
      </div>

      <p className="meta" style={{ marginTop: "1rem", lineHeight: 1.5 }}>
        Under the hood: an ERC-8183 session key whose call allowlist is the intersection of this
        job&rsquo;s calls with what the chain has shown this agent actually doing (granted ⊆ proven),
        a spend cap of {capBnb} BNB, a {ttlDays}-day expiry, and a registration in the Altana
        KeyStore so the authority is readable on chain. You can revoke it any time from the dashboard.
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "7rem",
  padding: "0.4rem 0.6rem",
  border: "1px solid var(--color-line-2)",
  borderRadius: "var(--radius-chip)",
  background: "var(--color-panel)",
};

const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
