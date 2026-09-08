import Link from "next/link";
import { RAILS, RAIL_COPY, REFUSAL_TEXT, type Job, type RailRefusal } from "@bench/shared";
import type { Row } from "@/lib/board";
import Thumb from "./Thumb";

/**
 * Two or three agents, side by side, on identical fields.
 *
 * The rule that makes this worth building is the last clause of §10.2:
 * `not measured` is shown where it is true. A comparison that quietly omits
 * the fields one side lacks is an advertisement for that side, and it is the
 * single easiest way for a marketplace to put its thumb on the scale without
 * anybody being able to point at the lie.
 *
 * So every row of the table is rendered for every column, always. Where a
 * value is missing the cell says so and why, and where a rail is closed the
 * cell names the condition that closed it. A column with nothing measured
 * looks empty, and that is the correct impression.
 *
 * It works without JavaScript: the selection is checkboxes in a form that
 * submits to this same page, so the comparison is a URL somebody can send to
 * a colleague.
 */

export default function Compare({ rows, job }: { rows: Row[]; job: Job }) {
  if (rows.length < 2) return null;

  const fields = job.metrics;

  return (
    <section className="panel" style={{ marginTop: 18, padding: 0, overflowX: "auto" }} aria-labelledby="cmp-h">
      <h2 id="cmp-h" className="meta" style={{ padding: "14px 16px 0" }}>
        Side by side, on the same fields
      </h2>

      <table className="compare">
        <caption className="meta">
          Every field is shown for every agent. Where one has not been measured the cell says so and why —
          a comparison that drops the fields one side lacks is an advertisement for that side.
        </caption>
        <thead>
          <tr>
            <th scope="col" />
            {rows.map((r) => (
              <th key={r.key} scope="col">
                <span className="board__id">
                  <Thumb seed={r.address ?? r.tokenId ?? r.key} size={22} />
                  <Link href={r.href} className="board__name">
                    {r.name}
                  </Link>
                </span>
                <span className="board__sub num">{r.tokenId ?? r.originHost}</span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* ------------------------------------------------ the three rails */}
          {RAILS.map((rail) => (
            <tr key={rail}>
              <th scope="row">
                <span className={`chip chip--${rail}`}>{RAIL_COPY[rail].verb}</span>
              </th>
              {rows.map((r) => {
                const s = r.rails[rail];
                return (
                  <td key={r.key}>
                    {s.open ? (
                      <span className="num">{s.price ?? "priced on what it earns"}</span>
                    ) : (
                      <span className="unmeasured">
                        unavailable
                        <span className="unmeasured__why">
                          {s.detail ?? (s.reason ? REFUSAL_TEXT[s.reason as RailRefusal] : "No reason recorded.")}
                        </span>
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* ------------------------------- the job's own three measurements */}
          {fields.map((f) => (
            <tr key={f.key}>
              <th scope="row">
                {f.label}
                <span className="board__sub">{f.better === "higher" ? "higher is better" : "lower is better"}</span>
              </th>
              {rows.map((r) => {
                const m = r.metrics[f.method];
                return (
                  <td key={r.key}>
                    {m ? (
                      <span className="num">{m.value}</span>
                    ) : (
                      <span className="unmeasured">
                        not measured
                        <span className="unmeasured__why">{r.trackMissing ?? "No reading for this field."}</span>
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* ----------------------------------------- how fresh, and how fast */}
          <tr>
            <th scope="row">Last called</th>
            {rows.map((r) => (
              <td key={r.key}>
                {r.probedAt ? (
                  <span className="num">
                    {new Date(r.probedAt).toISOString().replace("T", " ").slice(0, 16)} UTC
                  </span>
                ) : (
                  <span className="unmeasured">
                    never
                    <span className="unmeasured__why">It has not come up in the probe queue yet.</span>
                  </span>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Answered in</th>
            {rows.map((r) => (
              <td key={r.key}>
                {r.latencyMs === null ? (
                  <span className="unmeasured">not measured</span>
                ) : (
                  <span className="num">{r.latencyMs.toLocaleString("en-US")} ms</span>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Host</th>
            {rows.map((r) => (
              <td key={r.key}>
                <span className="num">{r.originHost ?? "none declared"}</span>
                {r.originCohortSize > 1 ? (
                  <span className="board__sub">{r.originCohortSize} listings share it</span>
                ) : null}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Operated by</th>
            {rows.map((r) => (
              <td key={r.key}>{r.isOurs ? "BENCH" : "somebody else"}</td>
            ))}
          </tr>
          {rows.some((r) => r.mismatch) ? (
            <tr>
              <th scope="row">Listing vs reality</th>
              {rows.map((r) => (
                <td key={r.key}>
                  {r.mismatch ? (
                    <span style={{ color: "var(--color-rail-mandate)" }}>{r.mismatch}</span>
                  ) : (
                    <span className="dim">its listing and its endpoint agree</span>
                  )}
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
