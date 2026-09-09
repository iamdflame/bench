import type { AssayResult } from "@/lib/assay/types";

/**
 * The certificate, the six tests, as an auditor would read them.
 *
 * Collapsed by default: the verdict said what matters, and this is here for the
 * person who wants to check the working. Each test states the claim the
 * registry made, the finding the chain returned, and evidence that clicks
 * through to a block explorer. An inconclusive test says so plainly; it never
 * pretends to a pass or a fail it did not earn.
 *
 * Native <details>, so the whole disclosure works with JavaScript off.
 */
export default function Certificate({ results }: { results: AssayResult[] }) {
  return (
    <section className="panel" style={{ overflow: "hidden" }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--color-line)" }}>
        <h2 className="hd-3">The certificate, six tests against the chain</h2>
        <p className="meta" style={{ marginTop: "0.2rem" }}>
          Every verdict carries the claim it tested and evidence you can open. Sum of the weights is
          the fineness.
        </p>
      </div>
      <ul>
        {results.map((r, i) => {
          const color =
            r.verdict === "pass" ? "var(--color-pass)" : r.verdict === "fail" ? "var(--color-fail)" : "var(--color-ink-3)";
          return (
            <li key={r.id} style={{ borderBottom: i < results.length - 1 ? "1px solid var(--color-line)" : undefined }}>
              <details>
                <summary
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.85rem 1.25rem",
                    cursor: "pointer",
                    listStyle: "none",
                  }}
                >
                  <span aria-hidden style={{ color, fontSize: "1.1rem", width: "1.1rem", textAlign: "center" }}>
                    {r.verdict === "pass" ? "✓" : r.verdict === "fail" ? "✕" : "·"}
                  </span>
                  <span className="hd-3" style={{ fontSize: "var(--text-base)", flex: 1 }}>{r.title}</span>
                  <span className="chip" style={{ color }}>{r.verdict}</span>
                  <span className="num meta">{Math.round(r.score * r.weight)}/{r.weight}</span>
                </summary>
                <div style={{ padding: "0 1.25rem 1.1rem 3rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div>
                    <span className="meta">Claim</span>
                    <p className="sub" style={{ fontSize: "var(--text-sm)" }}>{r.claim}</p>
                  </div>
                  <div>
                    <span className="meta">Finding</span>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-ink)" }}>{r.finding}</p>
                  </div>
                  {r.evidence.length ? (
                    <div>
                      <span className="meta">Evidence</span>
                      <ul style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.2rem" }}>
                        {r.evidence.map((e, j) => (
                          <li key={j} style={{ fontSize: "var(--text-sm)", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            <span className="meta" style={{ minWidth: "10rem" }}>{e.label}</span>
                            {e.url ? (
                              <a className="link-accent num" href={e.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--text-xs)", wordBreak: "break-all" }}>
                                {e.value}
                              </a>
                            ) : (
                              <span className="num" style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-2)", wordBreak: "break-all" }}>{e.value}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
