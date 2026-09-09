"use client";

import { useState } from "react";

/**
 * The growth loop, as a box.
 *
 * Anyone can assay any registered agent on demand, that is what turns the
 * instrument from a lens we point at a few into a public service that grades the
 * whole registry, one token at a time. Type a token id (or paste a registry
 * URL) and it opens that agent's live assay.
 */
export default function AssaySearch() {
  const [q, setQ] = useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    const m = q.trim().match(/(\d{2,})/);
    if (m) window.location.href = `/agents/${m[1]}`;
  }

  return (
    <form onSubmit={go} className="card" style={{ padding: "1rem 1.15rem", display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: "14rem" }}>
        <label className="meta" htmlFor="assay-q">Assay any agent on BNB Chain</label>
        <input
          id="assay-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="token id, e.g. 336161"
          className="num"
          style={{ width: "100%", marginTop: "0.25rem", padding: "0.55rem 0.7rem", border: "1px solid var(--color-line-2)", borderRadius: "var(--radius-ui)", background: "var(--color-panel)" }}
        />
      </div>
      <button type="submit" className="btn btn--primary" style={{ alignSelf: "flex-end" }}>Assay it →</button>
    </form>
  );
}
