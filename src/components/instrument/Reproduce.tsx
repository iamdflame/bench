"use client";

import { useState } from "react";

/**
 * Copy-the-command, for any number on the page.
 *
 * A figure whose derivation cannot be re-run is the same unverifiable claim as
 * an agent card. So every panel that shows a measurement can show the command
 * that reproduces it, right there. The command is in the HTML and selectable
 * with JavaScript off; the copy button is the only thing that needs a script,
 * and its absence costs nothing but a keystroke.
 */
export default function Reproduce({
  commands,
  title = "Reproduce every number on this page",
}: {
  commands: { label: string; cmd: string }[];
  title?: string;
}) {
  const [copied, setCopied] = useState<number | null>(null);

  return (
    <section className="panel" style={{ padding: "1.1rem 1.25rem" }}>
      <h2 className="hd-3">{title}</h2>
      <p className="meta" style={{ marginTop: "0.2rem", marginBottom: "0.75rem" }}>
        Open, unauthenticated. Run any of these against BNB Smart Chain and you get the same figure.
      </p>
      <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {commands.map((c, i) => (
          <li key={i}>
            <div className="meta" style={{ marginBottom: "0.2rem" }}>{c.label}</div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
              <pre
                className="num"
                style={{
                  flex: 1,
                  margin: 0,
                  padding: "0.5rem 0.7rem",
                  background: "var(--color-paper-2)",
                  border: "1px solid var(--color-line)",
                  borderRadius: "var(--radius-chip)",
                  fontSize: "var(--text-xs)",
                  overflowX: "auto",
                  whiteSpace: "pre",
                }}
              >
                {c.cmd}
              </pre>
              <button
                className="btn btn--sm"
                onClick={() => {
                  navigator.clipboard?.writeText(c.cmd).then(
                    () => {
                      setCopied(i);
                      setTimeout(() => setCopied((v) => (v === i ? null : v)), 1500);
                    },
                    () => {},
                  );
                }}
                aria-label={`Copy: ${c.label}`}
              >
                {copied === i ? "Copied" : "Copy"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
