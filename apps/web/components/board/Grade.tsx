/**
 * §12.4 and §9: what was projected, what happened, and how wrong we were.
 *
 * This is the component the plan calls the moat, and it is the one most easily
 * faked, so it is worth being precise about what it will and will not do.
 *
 * ---------------------------------------------------------------------------
 * A projection is only a projection if it predates the outcome
 * ---------------------------------------------------------------------------
 *
 * The figure in the first column is captured at grant time and never touched
 * again. Nothing reconstructs one afterwards. A projection computed later, by
 * code that can see how the window turned out, is not a forecast — it is a
 * postdiction, and publishing forecast error from postdictions is worse than
 * publishing nothing, because it manufactures a credential.
 *
 * So every engagement granted before this record existed shows **no
 * projection**, with that sentence, forever. There is no path in this codebase
 * that fills one in later, and there should not be.
 *
 * ---------------------------------------------------------------------------
 * The error is published whichever way it points
 * ---------------------------------------------------------------------------
 *
 * `actual − projected`. A marketplace that only surfaces the flattering half of
 * its own forecast error has told you nothing you could not have assumed. The
 * cell is coloured by the rail ramp rather than red and green, because this is
 * a measurement and not a trading terminal, and because a large error is not a
 * moral failure — it is information about how far a one-window replay
 * generalises, which is exactly the thing a reader needs before trusting one.
 */

import type { Engagement } from "@bench/rails";

const fmt = (v: string | null | undefined, digits = 4): string => {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
};

function Cell({
  value,
  absence,
  sign,
}: {
  value: string | null;
  /** Why there is no number. Required when there is none. */
  absence: string;
  sign?: -1 | 0 | 1;
}) {
  if (value === null) {
    return (
      <span className="unmeasured">
        not recorded
        <span className="unmeasured__why">{absence}</span>
      </span>
    );
  }
  return (
    <span
      className="num"
      style={{
        color:
          sign === undefined || sign === 0
            ? "var(--color-text)"
            : sign > 0
              ? "var(--color-rail-call)"
              : "var(--color-rail-mandate)",
      }}
    >
      {value}
    </span>
  );
}

export default function Grade({ engagement: e }: { engagement: Engagement }) {
  const p = e.projection ?? null;
  const o = e.outcome ?? null;

  const projected = p ? fmt(p.vsHold) : null;
  const actual = o ? fmt(o.actual) : null;
  const error = o?.error != null ? fmt(o.error) : null;

  return (
    <div className="grade">
      <div className="grade__col">
        <span className="grade__label">Projected</span>
        <Cell
          value={projected}
          sign={p ? (Number(p.vsHold) > 0 ? 1 : Number(p.vsHold) < 0 ? -1 : 0) : undefined}
          absence={
            "No replay was taken when this was granted, so there is nothing to grade it against. Nothing reconstructs one now: a projection written after the fact, by code that can see how the window turned out, would be a postdiction wearing a forecast's clothes."
          }
        />
        {p ? (
          <span className="grade__note">
            {p.strategy} against position #{p.positionTokenId}, over {p.window.hours}h and{" "}
            {p.window.swaps.toLocaleString("en-US")} swaps
          </span>
        ) : null}
      </div>

      <div className="grade__col">
        <span className="grade__label">Actual</span>
        <Cell
          value={actual}
          sign={o ? (Number(o.actual) > 0 ? 1 : Number(o.actual) < 0 ? -1 : 0) : undefined}
          absence={
            e.revokedAt || e.orphanedAt
              ? "This engagement ended without a measured outcome. It was granted to exercise the rail rather than to run a position, so there is no change to attribute to it."
              : "Still open. The outcome is read from chain once it ends, over the same window the projection covered."
          }
        />
        {o ? (
          <span className="grade__note">
            blocks {Number(o.measuredFromBlock).toLocaleString("en-US")}–
            {Number(o.measuredToBlock).toLocaleString("en-US")} · {o.method}
          </span>
        ) : null}
      </div>

      <div className="grade__col">
        <span className="grade__label">We were wrong by</span>
        <Cell
          value={error}
          sign={error ? (Number(o?.error) > 0 ? 1 : Number(o?.error) < 0 ? -1 : 0) : undefined}
          absence={
            "An error needs both halves. It appears the moment an engagement carrying a projection has an outcome to compare it with, and it is published whichever way it points."
          }
        />
        {error ? <span className="grade__note">actual − projected, in {p?.unit ?? "the pool&rsquo;s second token"}</span> : null}
      </div>
    </div>
  );
}
