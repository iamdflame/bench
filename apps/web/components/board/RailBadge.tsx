import { RAILS, REFUSAL_TEXT, type RailName, type RailRefusal } from "@bench/shared";
import type { Row } from "@/lib/board";

/**
 * Three squares in the leading column, and the only place colour is spent.
 *
 * Lit means the rail is open on this row; dim means it is not. Eight pixels,
 * because a badge that needs a legend has failed and one that shouts is
 * decoration rather than information.
 *
 * The colour is never the only carrier: the badge has a text label for a
 * screen reader and a title for a pointer, and the row's own cells repeat the
 * state in words. Nothing in this product is knowable only by hue.
 */

const LABEL: Record<RailName, string> = {
  call: "Call",
  hire: "Hire",
  mandate: "Mandate",
};

function describe(rail: RailName, state: Row["rails"][RailName]): string {
  if (state.open) return `${LABEL[rail]}: available${state.price ? `, ${state.price}` : ""}`;
  const reason = state.reason as RailRefusal | null;
  const text = state.detail ?? (reason ? REFUSAL_TEXT[reason] : "Not available.");
  return `${LABEL[rail]}: not available. ${text}`;
}

export default function RailBadge({ row, revoked }: { row: Row; revoked?: boolean }) {
  const summary = RAILS.map((r) => describe(r, row.rails[r])).join(" ");
  /*
    The state string is what `Live` compares against what this reader saw last
    time. It changes when a rail opens or closes, so the badge lights on a real
    change and stays still on a reload where nothing moved.
  */
  const state = RAILS.map((r) => (row.rails[r].open ? "1" : "0")).join("");
  return (
    <span className="rails" role="img" aria-label={summary}>
      {RAILS.map((r) => (
        <span
          key={r}
          className="rail"
          title={describe(r, row.rails[r])}
          data-live={`${row.key}:${r}`}
          data-live-kind="rail"
          data-live-value={`${state}:${r}`}
          {...(row.rails[r].open ? { "data-on": r } : {})}
          {...(revoked ? { "data-revoked": "" } : {})}
        />
      ))}
    </span>
  );
}

/** The same three, spelled out, for the agent page and the hire screen. */
export function RailList({ row }: { row: Row }) {
  return (
    <ul className="stack" style={{ gap: 6 }}>
      {RAILS.map((r) => {
        const s = row.rails[r];
        return (
          <li key={r} className="row" style={{ gap: 8, alignItems: "baseline" }}>
            <span className={`chip ${s.open ? `chip--${r}` : "chip--refused"}`}>{LABEL[r]}</span>
            <span className="meta">
              {s.open ? (s.price ?? "available") : (s.detail ?? (s.reason ? REFUSAL_TEXT[s.reason as RailRefusal] : "not available"))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
