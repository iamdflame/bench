/**
 * The MANDATE office mark.
 *
 * Not antique geometry. It is a tiny instrument dial, the same object the
 * FinenessDial draws at size, reduced to a punch: a ring, a scale of ticks, and
 * a needle at rest. The brand mark and the data primitive are the same shape,
 * so the mark reads as "this thing measures" before you know what it is.
 *
 * Pure inline SVG, no fill dependency on a theme block, legible from 16px up.
 */
export default function Mark({
  size = 24,
  tone = "ink",
  title,
  className,
}: {
  size?: number;
  /** ink = default; struck = brass; mute = quiet grey. */
  tone?: "ink" | "struck" | "mute";
  title?: string;
  className?: string;
}) {
  const color =
    tone === "struck"
      ? "var(--color-struck)"
      : tone === "mute"
        ? "var(--color-ink-3)"
        : "var(--color-touchstone)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={title ?? "MANDATE"}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="10.25" stroke={color} strokeWidth="1.4" />
      {/* a short scale of ticks along the top arc */}
      {Array.from({ length: 9 }).map((_, i) => {
        const a = (-140 + i * 35) * (Math.PI / 180);
        const r1 = 10.25;
        const r2 = i % 2 === 0 ? 8.2 : 9.1;
        return (
          <line
            key={i}
            x1={12 + r1 * Math.cos(a)}
            y1={12 + r1 * Math.sin(a)}
            x2={12 + r2 * Math.cos(a)}
            y2={12 + r2 * Math.sin(a)}
            stroke={color}
            strokeWidth="1"
            opacity="0.7"
          />
        );
      })}
      {/* the needle, at rest, pointing up-right, the reading */}
      <line x1="12" y1="12" x2="16.5" y2="6.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.7" fill={color} />
    </svg>
  );
}
