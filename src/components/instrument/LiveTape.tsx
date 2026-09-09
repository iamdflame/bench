import { readBook } from "@/lib/chain/book";
import { houseByWallet } from "@/lib/house";
import { CATEGORY_NAMES, bps } from "@/lib/chain/market";
import { ago, blockLabel } from "./HonestCount";

/**
 * The live tape, what is running, as rows.
 *
 * This replaces the WebGL floor entirely. No canvas, no shaders, no client
 * bundle: the mandates open for contest right now, read on the server from the
 * same three deployments the old floor read, each with its state, its running
 * alpha and its strikes. A market that stopped displaying its worst result the
 * moment it redeployed would be doing the exact thing this product catches, so
 * losses stay on the tape.
 */
export default async function LiveTape({ limit = 8 }: { limit?: number }) {
  const book = await readBook();
  const live = book.rows
    .filter((r) => (r.state === 0 || r.state === 1) && !/^0x0+$/.test(r.agent))
    .slice(0, limit);

  return (
    <section className="panel" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.9rem 1.1rem", borderBottom: "1px solid var(--color-line)" }}>
        <h2 className="hd-3" style={{ fontSize: "var(--text-base)" }}>The live tape</h2>
        <span className="meta">{blockLabel(book.blockNumber)} · read {ago(book.at)}</span>
      </div>
      {live.length === 0 ? (
        <p className="sub" style={{ padding: "1.25rem", fontSize: "var(--text-sm)" }}>
          No mandate is open for contest at this block. When one opens it appears here as a row,
          quietly, with its state and running alpha, not as a chart.
        </p>
      ) : (
        <ul>
          {live.map((r, i) => {
            const house = houseByWallet(r.agent);
            return (
              <li
                key={`${r.deployment.label}-${r.id}`}
                style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.7rem 1.1rem", borderBottom: i < live.length - 1 ? "1px solid var(--color-line)" : undefined, flexWrap: "wrap" }}
              >
                <span className={`dot ${r.state === 1 ? "dot--live" : ""}`} />
                <span style={{ fontSize: "var(--text-sm)", minWidth: "9rem", flex: 1 }}>
                  {house?.name ?? `Mandate ${r.id}`}
                  <span className="meta" style={{ marginLeft: "0.5rem" }}>{CATEGORY_NAMES[r.category] ?? "unfiled"}</span>
                </span>
                <span className="chip">{r.state === 1 ? "active" : "open"}</span>
                <span style={{ textAlign: "right", minWidth: "5rem" }}>
                  <span className="num" style={{ fontSize: "var(--text-sm)", color: r.epochsSettled > 0 ? "var(--color-touchstone)" : "var(--color-ink-3)" }}>
                    {r.epochsSettled > 0 ? bps(r.cumulativeAlphaBps) : "none yet"}
                  </span>
                  <span className="meta" style={{ display: "block" }}>alpha · {r.epochsSettled}ep</span>
                </span>
                {r.strikes > 0 ? <span className="chip chip--fail">{r.strikes} slashed</span> : null}
                <a href={`/settlement/${r.id}`} className="btn btn--sm">Tape →</a>
              </li>
            );
          })}
        </ul>
      )}
      {book.unread.length ? (
        <p className="meta" style={{ padding: "0.6rem 1.1rem", color: "var(--color-fail)" }}>
          {book.unread.join(", ")} could not be read. Named, not counted as empty.
        </p>
      ) : null}
    </section>
  );
}
