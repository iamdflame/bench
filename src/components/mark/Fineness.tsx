import { gradeOf, SHIELDS } from "./geometry";

/**
 * A fineness figure in a shield whose shape encodes the grade.
 *
 * Below 375 this renders **nothing**. That is not an omission — it is the
 * philosophy of the whole system in one decision. Base metal receives no mark,
 * so a bad agent is never shown with a bad score; it is shown as an unmarked
 * object, which is honest, unforgeable, and devastating at scale.
 */
export default function Fineness({
  fineness,
  size = 24,
  title,
}: {
  fineness: number | null | undefined;
  size?: number;
  title?: string;
}) {
  const value = Math.max(0, Math.round(fineness ?? 0));
  const grade = gradeOf(value);

  if (!grade.shape) {
    // Nothing is struck. The column stays blank, deliberately.
    return <span className="mark-absent" style={{ width: size, height: size }} aria-label="Unmarked" />;
  }

  const label = title ?? `${value} of 999 — ${grade.label}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      className="fineness-mark"
    >
      <title>{label}</title>
      <path d={SHIELDS[grade.shape]} fill={grade.metal} />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--void)"
        // Struck numerals were serifed, and the serif reads as engraved at
        // this size where a grotesque reads as a badge.
        style={{
          fontFamily: "var(--serif)",
          fontSize: value >= 100 ? 9.5 : 11,
          letterSpacing: "-0.04em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </text>
    </svg>
  );
}
