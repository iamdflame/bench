import { CATEGORY_DEVICE } from "./geometry";
import { CATEGORY_LABEL, type Category } from "@/lib/config";

/**
 * The assay office that struck it — four offices, four devices.
 *
 * Each device is what the strategy physically does, not an abstract icon: a
 * liquidity band and its midpoint, the rungs of a ladder, a compounding
 * spiral, a plumb line.
 */
export default function CategoryMark({
  category,
  size = 24,
  metal = "var(--silver-925)",
}: {
  category: Category | null | undefined;
  size?: number;
  metal?: string;
}) {
  if (!category || !CATEGORY_DEVICE[category]) {
    return <span className="mark-absent" style={{ width: size, height: size }} aria-hidden />;
  }
  const label = CATEGORY_LABEL[category] ?? category;
  const isSpiral = category === "yield-optimisation";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      className="category-mark"
    >
      <title>{label}</title>
      <path
        d={CATEGORY_DEVICE[category]}
        fill={isSpiral ? "none" : metal}
        stroke={isSpiral ? metal : "none"}
        strokeWidth={isSpiral ? 2.2 : undefined}
        strokeLinecap={isSpiral ? "butt" : undefined}
      />
    </svg>
  );
}
