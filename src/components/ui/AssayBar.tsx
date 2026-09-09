import type { AssayResult } from "@/lib/assay/types";
import { gradeOf } from "@/components/mark/geometry";

const SEGMENTS = 10;

/** Hashes and addresses are elided in the middle, never truncated at the end. */
const trim = (v: string) => (v.length > 52 ? `${v.slice(0, 22)}…${v.slice(-14)}` : v);

/**
 * The assay, broken into the six things it actually tested.
 *
 * The failure reason sits inline under the row that failed, not behind a
 * tooltip. An assay that says "custody: FAILED" and makes you hunt for why is
 * the same unaccountable verdict this product was built to replace — so the
 * finding is always on screen beside the bar, in the agent's own terms:
 * `agent_wallet == owner_address`, `nonce 1 · balance 0`.
 *
 * Bars are struck in the metal the whole assay earned, not per-dimension.
 * A single passing dimension does not make an agent gold.
 */
export default function AssayBar({
  results,
  fineness,
  pending,
  halted = false,
}: {
  results: AssayResult[];
  fineness: number | null;
  /** Dimensions still running, drawn as a hairline pulse rather than a spinner. */
  pending?: string[];
  /**
   * The run stopped before these could be reached.
   *
   * A bar that pulses "running" forever after the stream has died is the one
   * dishonest state this component can be in — it claims work is happening
   * that stopped. Halted rows say "not run", still, and the reason sits above
   * them.
   */
  halted?: boolean;
}) {
  const metal = gradeOf(fineness ?? 0).metal;

  return (
    <div className="assay">
      {results.map((r) => (
        <div className="assay__row" key={r.id}>
          <span className="assay__name">{r.title}</span>
          <span
            className="assay__bar"
            role="img"
            aria-label={`${r.title}: ${Math.round(r.score * 100)} per cent`}
          >
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <i
                key={i}
                className="assay__seg"
                data-on={i < Math.round(r.score * SEGMENTS) ? "1" : undefined}
                style={{ background: i < Math.round(r.score * SEGMENTS) ? metal : undefined }}
              />
            ))}
          </span>
          <span className={`assay__verdict assay__verdict--${r.verdict}`}>
            {r.verdict === "pass" ? "passed" : r.verdict === "fail" ? "FAILED" : "inconclusive"}
          </span>
          <span className="assay__weight num dim">
            {Math.round(r.score * r.weight)}/{r.weight}
          </span>
          {/* The reason, always. Never behind a hover. */}
          <p className="assay__finding">{r.finding}</p>

          {r.evidence.length ? (
            <ul className="assay__ev">
              {r.evidence.map((e, i) => (
                <li key={`${e.label}-${i}`}>
                  <span className="mark-label">{e.label}</span>
                  {e.url ? (
                    <a
                      className="num link-underline"
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {trim(e.value)}
                    </a>
                  ) : (
                    <span className="num">{trim(e.value)}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}

      {(pending ?? []).map((id) => (
        <div
          className="assay__row"
          data-loading={halted ? undefined : "1"}
          key={`pending-${id}`}
        >
          <span className="assay__name dim">{id}</span>
          <span className="assay__bar">
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <i key={i} className="assay__seg" />
            ))}
          </span>
          <span className="assay__verdict dim">{halted ? "not run" : "running"}</span>
          <span />
        </div>
      ))}
    </div>
  );
}
