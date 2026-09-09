import { hallmarkFor, isHallmarked } from "@/lib/assay/types";

/**
 * The fineness dial, a 0–999 instrument gauge, pure SVG.
 *
 * This is the product's native data-viz primitive and the one place a number is
 * allowed to be large and engraved. A 270° arc with the opening at the bottom,
 * a filled reading, the hallmark bar marked at 375, and the reading itself in
 * the centre in tabular mono.
 *
 * Three states, because absence is designed:
 *   - a reading ≥ 375 fills in brass, this is metal that may be struck;
 *   - a reading < 375 fills in graphite, resolvable, but below the bar;
 *   - no reading at all is a dashed, empty track and the word, never a zero.
 *
 * Renders identically with JavaScript off. The arc is drawn from explicit
 * polar coordinates rather than dash tricks, so it is correct at any size.
 */

const TOP = -90; // 0° at 12 o'clock
const START = -135; // gauge opening at the bottom
const SWEEP = 270;
const MAX = 999;
const BAR = 375;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg + TOP + 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function FinenessDial({
  fineness,
  size = 200,
  strike = false,
  showGrade = true,
}: {
  /** 0..999, or null/undefined when never assayed. */
  fineness: number | null | undefined;
  size?: number;
  /** Play the one strike reveal on mount. */
  strike?: boolean;
  showGrade?: boolean;
}) {
  const has = fineness != null && Number.isFinite(fineness);
  const value = has ? Math.max(0, Math.min(MAX, Math.round(fineness))) : 0;
  const struck = has && isHallmarked(value);
  const f = value / MAX;
  const valueEnd = START + f * SWEEP;
  const barAngle = START + (BAR / MAX) * SWEEP;

  const cx = 100;
  const cy = 100;
  const r = 82;
  const stroke = 12;

  const readColor = !has
    ? "var(--color-ink-3)"
    : struck
      ? "var(--color-struck)"
      : "var(--color-ink-2)";

  const grade = has ? hallmarkFor(value) : null;

  return (
    <figure
      className={strike ? "strike" : undefined}
      style={{ width: size, margin: 0, display: "inline-block" }}
    >
      <svg viewBox="0 0 200 200" width={size} height={size} role="img"
        aria-label={has ? `Fineness ${value} of 999` : "Not assayed to a fineness"}>
        {/* track */}
        <path
          d={arc(cx, cy, r, START, START + SWEEP)}
          fill="none"
          stroke="var(--color-pewter)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={has ? undefined : "1 10"}
        />
        {/* reading */}
        {has && value > 0 ? (
          <path
            className={strike ? "dial-sweep" : undefined}
            pathLength={1}
            d={arc(cx, cy, r, START, valueEnd)}
            fill="none"
            stroke={readColor}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        ) : null}
        {/* the hallmark bar at 375 */}
        <line
          {...(() => {
            const [x1, y1] = polar(cx, cy, r - stroke / 2 - 3, barAngle);
            const [x2, y2] = polar(cx, cy, r + stroke / 2 + 3, barAngle);
            return { x1, y1, x2, y2 };
          })()}
          stroke="var(--color-struck)"
          strokeWidth="2"
          opacity="0.85"
        />
        {/* centre reading, or the shape of its absence */}
        {has ? (
          <>
            <text
              x={cx}
              y={cy + 2}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 52,
                fontWeight: 500,
                fill: readColor,
                letterSpacing: "-0.03em",
              }}
            >
              {value}
            </text>
            <text
              x={cx}
              y={cy + 30}
              textAnchor="middle"
              style={{ fontFamily: "var(--font-sans)", fontSize: 11, fill: "var(--color-ink-3)" }}
            >
              / 999 fineness
            </text>
          </>
        ) : (
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontFamily: "var(--font-sans)", fontSize: 15, fill: "var(--color-ink-3)" }}
          >
            not assayed
          </text>
        )}
      </svg>
      {showGrade && grade ? (
        <figcaption
          style={{
            textAlign: "center",
            fontSize: "var(--text-2xs)",
            color: struck ? "var(--color-struck)" : "var(--color-ink-3)",
            marginTop: "-0.35rem",
          }}
        >
          {struck ? `Hallmarkable · ${grade.name}` : grade.name}
        </figcaption>
      ) : null}
    </figure>
  );
}
