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
 *   MONOCHROME      colour in this interface means rail availability. Spending
 *                   it on decoration would make the one thing that carries
 *                   meaning harder to see, so the mark is drawn in the same
 *                   greys as the rules around it.
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

export default function Thumb({ seed, size = 26 }: { seed: string; size?: number }) {
  const h = hash(seed.toLowerCase());

  /*
    A five-by-five grid, mirrored down the middle: three columns are decided by
    the hash and the outer two are their reflection. Symmetry is what turns a
    random arrangement into something the eye files as a shape rather than as
    noise, and twenty-five cells is enough resolution to tell two rows apart at
    26px.

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
    Two tones, so the mark has depth without leaving the greys. Both sit above
    the panel it is drawn on: a mark that needs looking for is not a handle.
  */
  const tone = (x: number, y: number) =>
    bit((x + y * 5) % 32) ? "var(--color-text)" : "var(--color-muted)";

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
          x={2 + c.x * 3.2}
          y={2 + c.y * 3.2}
          width={2.6}
          height={2.6}
          rx={0.5}
          fill={tone(c.x, c.y)}
        />
      ))}
    </svg>
  );
}
