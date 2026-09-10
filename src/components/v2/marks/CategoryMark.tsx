import type { Category } from "@/lib/config";

/**
 * Four drawn marks, one per category.
 *
 * A marketplace of three hundred agents rendered as three hundred identical
 * tiles is unreadable, and the usual fixes — a coloured pill, an emoji, a
 * generic icon set — are the reason every project in this field looks like the
 * one next to it. So each category gets a picture of what the strategy
 * actually does, built from one stroke weight in one 48-unit box:
 *
 *   rebalancing        two weights pulled back onto a centre line
 *   grid trading       a ladder of levels with a price crossing them
 *   yield optimisation a curve that compounds away from a flat baseline
 *   health factor      an arc with a needle held clear of the red end
 *
 * They are line drawings rather than fills so they read at 20px in a table row
 * and at 200px behind a page heading, which is exactly the range they are used
 * across.
 */

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Rebalancing() {
  return (
    <>
      <line x1="24" y1="6" x2="24" y2="42" strokeWidth="1" strokeDasharray="2 3" opacity="0.5" {...S} />
      <rect x="8" y="13" width="12" height="7" strokeWidth="1.5" {...S} />
      <rect x="28" y="28" width="12" height="7" strokeWidth="1.5" {...S} />
      <path d="M20 16.5h6.5" strokeWidth="1.5" {...S} />
      <path d="M24.5 13.5l3 3-3 3" strokeWidth="1.5" {...S} />
      <path d="M28 31.5h-6.5" strokeWidth="1.5" {...S} />
      <path d="M23.5 28.5l-3 3 3 3" strokeWidth="1.5" {...S} />
    </>
  );
}

function GridTrading() {
  return (
    <>
      {[12, 18, 24, 30, 36].map((y) => (
        <line key={y} x1="6" y1={y} x2="42" y2={y} strokeWidth="1" opacity="0.45" {...S} />
      ))}
      <polyline
        points="6,33 13,21 19,27 26,15 32,23 42,11"
        strokeWidth="1.75"
        {...S}
      />
      <circle cx="13" cy="21" r="1.9" strokeWidth="1.4" {...S} />
      <circle cx="26" cy="15" r="1.9" strokeWidth="1.4" {...S} />
    </>
  );
}

function Yield() {
  return (
    <>
      <line x1="6" y1="38" x2="42" y2="38" strokeWidth="1" opacity="0.5" {...S} />
      <line x1="6" y1="38" x2="6" y2="8" strokeWidth="1" opacity="0.5" {...S} />
      <path d="M6 38 L14 36 L21 32 L28 25 L34 17 L41 8" strokeWidth="1.75" {...S} />
      <path d="M6 38 L42 27" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" {...S} />
      <circle cx="41" cy="8" r="2.2" strokeWidth="1.4" {...S} />
    </>
  );
}

function HealthFactor() {
  return (
    <>
      <path d="M9 34a15 15 0 0 1 30 0" strokeWidth="1.5" {...S} />
      <path d="M9 34a15 15 0 0 1 4.4-10.6" strokeWidth="3" opacity="0.35" {...S} />
      <line x1="24" y1="34" x2="32.5" y2="24.5" strokeWidth="1.75" {...S} />
      <circle cx="24" cy="34" r="2" strokeWidth="1.4" {...S} />
      <line x1="24" y1="19" x2="24" y2="16.5" strokeWidth="1" opacity="0.6" {...S} />
    </>
  );
}

const MARKS: Record<Category, () => React.JSX.Element> = {
  rebalancing: Rebalancing,
  "grid-trading": GridTrading,
  "yield-optimisation": Yield,
  "health-factor": HealthFactor,
};

export default function CategoryMark({
  category,
  size = 48,
  className = "",
}: {
  category: Category;
  size?: number;
  className?: string;
}) {
  const Draw = MARKS[category];
  if (!Draw) return null;
  return (
    <svg
      className={`m-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="presentation"
      aria-hidden="true"
    >
      <Draw />
    </svg>
  );
}
