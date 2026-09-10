/**
 * The mark: an assay punch with an M struck into it.
 *
 * The shape is an octagon because that is the form a hallmarking punch
 * actually takes, which gives the brand a reason to look the way it does
 * rather than a shape chosen because it rendered nicely. It is also unusual:
 * this field is full of hexagons, orbits and abstract gradients, and none of
 * them are a picture of anything.
 *
 * Drawn as a filled surround with the letter knocked out, not as a stroked
 * letter on a plate. At sixteen pixels a stroked M closes into a blob, and
 * sixteen pixels is the size the mark has to survive.
 */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flex: "none" }}
    >
      <path
        d="M9 0 H23 L32 9 V23 L23 32 H9 L0 23 V9 Z"
        fill="var(--signal, #c8431c)"
      />
      <path
        d="M9.4 23.4 V9.6 L16 17.4 L22.6 9.6 V23.4"
        fill="none"
        stroke="var(--paper-raised, #fffefb)"
        strokeWidth="3.1"
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
    </svg>
  );
}

/**
 * The lockup.
 *
 * A serif wordmark next to a solid punch. The serif is doing real work: every
 * competing product in this category sets its name in the same geometric sans,
 * and a marketplace asking for money reads better as something printed than as
 * something shipped.
 */
export default function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="m-logo">
      <Mark size={size} />
      <span className="m-logo__word">Mandate</span>
    </span>
  );
}
