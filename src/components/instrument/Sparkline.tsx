/**
 * A sparkline, hand rolled in SVG.
 *
 * No chart library: a polyline, a baseline and an end dot are the whole thing,
 * and a dependency for that would cost more bytes than every page on this site
 * spends on JavaScript combined.
 *
 * It is only ever drawn where a real series exists. There is no smoothing, no
 * interpolation between missing points and no synthetic history: a wallet with
 * one settled epoch has one point, and one point is drawn as one point rather
 * than as a flattering line. Two values or fewer render nothing at all, because
 * a trend needs somewhere to go before it can be shown.
 */
export default function Sparkline({
  values,
  width = 72,
  height = 22,
  baseline = 0,
  label,
}: {
  /** The series, oldest first. */
  values: number[];
  width?: number;
  height?: number;
  /** The line the series is judged against. Zero for alpha. */
  baseline?: number;
  label?: string;
}) {
  if (!values || values.length < 2) return null;

  const pad = 2;
  const min = Math.min(...values, baseline);
  const max = Math.max(...values, baseline);
  const span = max - min || 1;

  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const up = last >= baseline;
  const stroke = up ? "var(--color-pass)" : "var(--color-fail)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? `Trend across ${values.length} readings, ending at ${last}`}
      style={{ overflow: "visible", flex: "none" }}
    >
      {/* the line the series is measured against */}
      <line
        x1={pad}
        y1={y(baseline)}
        x2={width - pad}
        y2={y(baseline)}
        stroke="var(--color-line-2)"
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* where it stands now */}
      <circle cx={x(values.length - 1)} cy={y(last)} r="2" fill={stroke} />
    </svg>
  );
}
