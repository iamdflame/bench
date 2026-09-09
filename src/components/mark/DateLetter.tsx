import { cycleOf, dateLetter } from "./geometry";

/**
 * Freshness as a visual object.
 *
 * Real hallmarks carry a date letter whose typeface and shield shape change
 * each cycle, so the age of an assay is legible without reading a date. A
 * judge can see at a glance that one agent was struck this cycle and another
 * three cycles ago — which is what "freshness per row" actually looks like
 * when it is designed rather than tabulated.
 */
export default function DateLetter({
  assayedAt,
  size = 24,
  metal = "var(--pewter-500)",
}: {
  assayedAt: string | number | Date | null | undefined;
  size?: number;
  metal?: string;
}) {
  if (!assayedAt) {
    return <span className="mark-absent" style={{ width: size, height: size }} aria-hidden />;
  }

  const cycle = cycleOf(assayedAt);
  const { letter, shield } = dateLetter(cycle);
  const now = cycleOf(Date.now());
  const age = Math.max(0, now - cycle);
  const label =
    age === 0 ? "Struck this cycle" : `Struck ${age} cycle${age === 1 ? "" : "s"} ago`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      className="date-letter"
      // Older strikes recede. Not greyed out apologetically — dimmed, which is
      // how this system says "less recent" everywhere else too.
      style={{ opacity: age === 0 ? 1 : age === 1 ? 0.72 : 0.45 }}
    >
      <title>{label}</title>
      <path d={shield} fill={metal} />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--void)"
        style={{ fontFamily: "var(--serif)", fontSize: 11 }}
      >
        {letter}
      </text>
    </svg>
  );
}
