import type { WalletRecord } from "@/lib/board";
import { CATEGORY_LABEL } from "@/lib/config";
import { ago, blockLabel } from "./HonestCount";
import Sparkline from "./Sparkline";

/**
 * An agent's realized record, on chain, the difference between a claim and a
 * track record.
 *
 * The mandates this wallet holds, the epochs it settled, the alpha it earned
 * against a benchmark committed before the outcome, and every slash. A wallet
 * that has never bonded shows exactly that, and the absence is the finding, not
 * a zero, not a blank. Losses stay on the tape; a record that hid its worst
 * epoch would be the one thing this product exists to catch.
 */
export default function TrackRecord({ record }: { record: WalletRecord }) {
  if (record.mandates.length === 0) {
    return (
      <section className="card" style={{ padding: "1.1rem 1.25rem" }}>
        <h2 className="hd-3" style={{ fontSize: "var(--text-base)" }}>Track record</h2>
        <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.35rem" }}>
          This wallet has never bonded a mandate on MandateMarket, so there is no realized track
          record to show. That is a statement of fact, not a score of zero. The day it puts its own
          capital at risk against a benchmark, the settled epochs appear here.
        </p>
      </section>
    );
  }

  /*
    One point per mandate that has actually settled something. A mandate still
    waiting on its first epoch has no alpha to plot and is left out rather than
    drawn at zero.
  */
  const series = record.mandates
    .filter((m) => m.alpha)
    .map((m) => parseFloat(m.alpha!.replace("%", "")))
    .filter((v) => Number.isFinite(v))
    .reverse();

  return (
    <section className="panel" style={{ overflow: "hidden" }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--color-line)", display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 className="hd-3" style={{ fontSize: "var(--text-base)" }}>Track record, bonded on chain</h2>
        <span className="meta">{blockLabel(record.block) ? `${blockLabel(record.block)} · ` : ""}read {ago(record.at)}</span>
      </div>

      {/* headline figures */}
      <div style={{ display: "flex", gap: "2rem", padding: "1.1rem 1.25rem", flexWrap: "wrap", borderBottom: "1px solid var(--color-line)", alignItems: "center" }}>
        <div>
          <div className="num" style={{ fontSize: "var(--text-2xl)", color: record.cumulativeAlpha && !record.cumulativeAlpha.startsWith("-") ? "var(--color-pass)" : "var(--color-touchstone)" }}>
            {record.cumulativeAlpha ?? "none yet"}
          </div>
          <div className="meta">cumulative alpha vs benchmark</div>
        </div>
        <div>
          <div className="num" style={{ fontSize: "var(--text-2xl)", color: "var(--color-touchstone)" }}>{record.totalEpochs}</div>
          <div className="meta">epochs settled</div>
        </div>
        <div>
          <div className="num" style={{ fontSize: "var(--text-2xl)", color: record.totalStrikes > 0 ? "var(--color-fail)" : "var(--color-ink-2)" }}>{record.totalStrikes}</div>
          <div className="meta">slashes · on the tape</div>
        </div>
        {series.length > 1 ? (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <Sparkline values={series} width={96} height={26} label={`Alpha across ${series.length} mandates`} />
            <div className="meta" style={{ marginTop: "0.2rem" }}>alpha per mandate</div>
          </div>
        ) : null}
      </div>

      {/* per-mandate rows */}
      <ul>
        {record.mandates.map((m, i) => (
          <li key={`${m.deployment}-${m.id}`} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.7rem 1.25rem", borderBottom: i < record.mandates.length - 1 ? "1px solid var(--color-line)" : undefined, flexWrap: "wrap" }}>
            <span className={`dot ${m.live ? "dot--live" : ""}`} />
            <span style={{ fontSize: "var(--text-sm)", flex: 1, minWidth: "10rem" }}>
              Mandate {m.id}
              <span className="meta" style={{ marginLeft: "0.5rem" }}>{CATEGORY_LABEL[m.category]} · {m.deployment}</span>
            </span>
            <span className="chip">{m.live ? "live" : "closed"}</span>
            <span className="num" style={{ fontSize: "var(--text-sm)", minWidth: "5rem", textAlign: "right", color: m.alpha && m.alpha.startsWith("-") ? "var(--color-fail)" : m.alpha ? "var(--color-pass)" : "var(--color-ink-3)" }}>
              {m.alpha ?? "none yet"}
            </span>
            <span className="meta">{m.epochsSettled}ep{m.strikes > 0 ? ` · ${m.strikes} slashed` : ""}</span>
            <a href={`/settlement/${m.id}`} className="btn btn--sm">Tape →</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
