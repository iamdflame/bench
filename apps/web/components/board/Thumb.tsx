/**
 * A deterministic identity mark, one per row.
 *
 * The board sorts, filters and refreshes under the reader. Without a visual
 * handle, finding the row you were just looking at means re-reading names —
 * which is what makes a dense table feel like a spreadsheet rather than an
 * instrument. A stable mark gives the eye something to return to.
 *
 * Three constraints shape it:
 *
 *   DETERMINISTIC   derived from the string that identifies the row — an
 *                   address, or the resource URL for a paid endpoint — so it
 *                   is the same mark on every surface and every reload, with
 *                   no state and no network.
 *
 *   IN THE RAMP     colour in this interface means rail availability, so the
 *                   mark is drawn in the colour of the *highest rail this row
 *                   has open* — teal if you can only call it, gold if you can
 *                   hire it, ember if it can hold a session, grey if nothing is
 *                   open. It spends no colour the board was not already
 *                   spending, and it makes the answer to "can I act on this
 *                   row" visible in the first column rather than the second.
 *
 *                   The earlier version was monochrome, on the reasoning that
 *                   decoration must not compete with meaning. That was right
 *                   about the principle and wrong about the conclusion: drawn
 *                   in the ramp, the mark *is* the meaning.
 *
 *   CHEAP           inline SVG, no image request, no library, a few hundred
 *                   bytes. It renders on the server with everything else.
 *
 * The pattern is a 4×4 grid mirrored down the middle, which is what makes a
 * random-looking arrangement read as a mark rather than as noise.
 */

/** FNV-1a. Small, fast, and good enough to spread short strings evenly. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export default function Thumb({
  seed,
  size = 36,
  rail,
}: {
  seed: string;
  size?: number;
  /** The highest rail open on this row, or nothing if none is. */
  rail?: "call" | "hire" | "mandate";
}) {
  const h = hash(seed.toLowerCase());

  /*
    A five-by-five grid, mirrored down the middle: three columns are decided by
    the hash and the outer two are their reflection. Symmetry is what turns a
    random arrangement into something the eye files as a shape rather than as
    noise, and twenty-five cells is enough resolution to tell two rows apart —
    fifteen decided bits, so thirty-two thousand distinct marks and no visible
    collision across fifty rows.

    It is drawn at 36px rather than 26. At the old size the cells were under
    four pixels and the whole thing read as a fragment of a QR code; the grid
    was never the problem, the scale was.

    Two hash streams feed it. One value's bits run out before the grid is full,
    and reusing them produces visibly repeating rows — which reads as a
    rendering fault rather than as an identity.
  */
  const h2 = hash(`${seed.toLowerCase()}:2`);
  const bit = (n: number) => ((n < 16 ? h >>> n : h2 >>> (n - 16)) & 1) === 1;

  const cells: { x: number; y: number }[] = [];
  let i = 0;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const on = bit(i++);
      if (!on) continue;
      cells.push({ x, y });
      if (x < 2) cells.push({ x: 4 - x, y });
    }
  }

  /*
    A mark with nothing lit is indistinguishable from a missing one, and one
    that is entirely lit is a block. Both extremes get the centre column, so
    every row keeps a handle.
  */
  if (cells.length < 3 || cells.length > 22) {
    cells.length = 0;
    for (let y = 0; y < 5; y += 2) cells.push({ x: 1, y }, { x: 2, y }, { x: 3, y });
  }

  /*
    Two tones, so the mark has depth. The base is the row's highest open rail
    and the second is the same hue held back, which keeps the mark inside the
    ramp instead of introducing a fourth colour. A row with nothing open is
    drawn in `--color-dim`, the same grey every other absence uses.
  */
  const base = rail ? `var(--color-rail-${rail})` : "var(--color-dim)";
  const held = rail
    ? `color-mix(in srgb, var(--color-rail-${rail}) 45%, var(--color-panel))`
    : "color-mix(in srgb, var(--color-dim) 55%, var(--color-panel))";
  const tone = (x: number, y: number) => (bit((x + y * 5) % 32) ? base : held);

  return (
    <svg
      className="thumb"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      role="presentation"
      shapeRendering="crispEdges"
    >
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={1.5 + c.x * 3.5}
          y={1.5 + c.y * 3.5}
          width={3}
          height={3}
          rx={0.6}
          fill={tone(c.x, c.y)}
        />
      ))}
    </svg>
  );
}
