/**
 * The mark, and why it is the only one this product could have.
 *
 * Three bars, ascending, in teal then gold then ember: it is the rail ramp
 * itself. Call it and you give a payment, hire it and you give an escrow,
 * mandate it and you give standing authority — the mark climbs exactly as the
 * exposure does, in exactly the colours the board uses for it. A reader who
 * learns the logo has learned the product's one idea, and every lit dot on
 * every row afterwards is the same three colours saying the same thing.
 *
 * It also means the brand costs nothing extra: no second accent, no decorative
 * face, no raster asset. §13.2 says the rail ramp is the entire chromatic
 * system, and a logotype outside that system would be the first exception.
 *
 * Size-parameterised because the same lockup has to work at 20px in the bar and
 * at 72px in the hero without a second drawing.
 */

export function Mark({ size = 18 }: { size?: number }) {
  /*
    Drawn in a 18×14 box and scaled, so the proportions are identical at every
    size and the bars stay on whole units at the two sizes actually used.
  */
  const h = Math.round((size / 18) * 14);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 18 14"
      aria-hidden="true"
      role="presentation"
      style={{ display: "block", flex: "none" }}
    >
      <rect x="0" y="8" width="4" height="6" rx="1" fill="var(--color-rail-call)" />
      <rect x="7" y="4" width="4" height="10" rx="1" fill="var(--color-rail-hire)" />
      <rect x="14" y="0" width="4" height="14" rx="1" fill="var(--color-rail-mandate)" />
    </svg>
  );
}

/**
 * The full lockup.
 *
 * `hero` is not merely a larger `nav`. At 20px the wordmark needs a little
 * positive tracking to stay legible; at 72px it needs negative tracking or it
 * falls apart into letters. A single scaled component would get one of the two
 * wrong, so the two sizes carry their own tracking and weight.
 */
export default function Logotype({ scale = "nav" }: { scale?: "nav" | "hero" }) {
  const hero = scale === "hero";
  return (
    <span className={hero ? "logotype logotype--hero" : "logotype"}>
      <Mark size={hero ? 64 : 20} />
      <span className="logotype__word">BENCH</span>
    </span>
  );
}
