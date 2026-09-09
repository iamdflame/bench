import Mark from "./Mark";
import { isHallmarked, hallmarkFor } from "@/lib/assay/types";

/**
 * The hallmark, the memorable object, and the only place boldness is spent.
 *
 * Compact and horizontal: a struck brass punch carrying the office mark, then
 * the fineness numeral engraved in mono. `[◉ 812]`. At most one of these should
 * be brass in a viewport; everything else on the page stays quiet.
 *
 * Absence is designed, three states:
 *   - struck    fineness ≥ 375, brass, the numeral engraved. Metal worth a mark.
 *   - unmarked  0 ≤ fineness < 375, a quiet grey punch and the number. Not a
 *               zero, not a blank: resolvable metal that did not reach the bar.
 *   - unassayed fineness null, a dashed outline and the words "not assayed".
 *               An agent nobody has measured is different from one that failed.
 */
export default function Hallmark({
  fineness,
  size = "md",
  strike = false,
  title,
}: {
  fineness: number | null | undefined;
  size?: "sm" | "md" | "lg";
  strike?: boolean;
  title?: string;
}) {
  const has = fineness != null && Number.isFinite(fineness);
  const value = has ? Math.max(0, Math.min(999, Math.round(fineness))) : 0;
  const struck = has && isHallmarked(value);

  const dim = size === "lg" ? { pad: "0.4rem 0.7rem", mark: 26, num: "1.6rem" }
    : size === "sm" ? { pad: "0.15rem 0.4rem", mark: 15, num: "0.95rem" }
    : { pad: "0.28rem 0.55rem", mark: 20, num: "1.25rem" };

  const state = !has ? "unassayed" : struck ? "struck" : "unmarked";

  const bg =
    state === "struck" ? "var(--color-struck-wash)"
    : state === "unmarked" ? "var(--color-paper-2)"
    : "transparent";
  const border =
    state === "struck" ? "color-mix(in srgb, var(--color-struck) 45%, white)"
    : "var(--color-line-2)";
  const numColor =
    state === "struck" ? "var(--color-struck)"
    : state === "unmarked" ? "var(--color-ink-2)"
    : "var(--color-ink-3)";

  const grade = has ? hallmarkFor(value) : null;
  const label =
    title ??
    (state === "struck" ? `Struck at fineness ${value}, ${grade!.name}`
      : state === "unmarked" ? `Below the hallmark bar: fineness ${value}`
      : "Not assayed to a fineness yet");

  return (
    <span
      className={strike ? "strike" : undefined}
      role="img"
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: dim.pad,
        borderRadius: "var(--radius-chip)",
        background: bg,
        border: `1px solid ${border}`,
        borderStyle: state === "unassayed" ? "dashed" : "solid",
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <Mark size={dim.mark} tone={struck ? "struck" : "mute"} title="" />
      {state === "unassayed" ? (
        <span style={{ fontSize: "var(--text-2xs)", color: numColor }}>not assayed</span>
      ) : (
        <span
          className="num"
          style={{ fontSize: dim.num, fontWeight: 500, color: numColor }}
        >
          {value}
        </span>
      )}
    </span>
  );
}
