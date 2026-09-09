/**
 * Punch geometry.
 *
 * Everything here is cut on a 24-unit grid with flat terminals and no curves
 * except where a curve carries meaning. A punch is cut, not drawn — so there
 * are no rounded joins, no soft corners, and no gradients anywhere in this
 * system.
 *
 * Marks are drawn as *filled silhouettes with the device knocked out*, rather
 * than as nested strokes. At 16px a 2.5-unit stroke inside a 16-unit shield
 * closes up into a blob; a filled surround with a void-coloured device stays
 * legible at favicon size, which is the size the mark has to survive.
 */

/** The struck punch surround: flat top, vertical sides, 45° chamfered base. */
export const SURROUND = "M4 2 H20 V15 L15 20 H9 L4 15 Z";

/**
 * Fineness shields.
 *
 * Real hallmarking uses a different frame for each metal, so the shape carries
 * the grade before the numeral is read. Below 375 there is no shield at all —
 * base metal receives no mark, and absence is the strongest signal here.
 */
export const SHIELDS = {
  /** 999–900. Fine gold. */
  octagon: "M8 2 H16 L22 8 V16 L16 22 H8 L2 16 V8 Z",
  /** 899–750. */
  hexagon: "M12 1.5 L21 6.75 V17.25 L12 22.5 L3 17.25 V6.75 Z",
  /** 749–500. Sterling. */
  rect: "M3 3 H21 V21 H3 Z",
  /** 499–375. Clipped corners — the lowest hallmarkable frame. */
  clipped: "M7 3 H17 L21 7 V17 L17 21 H7 L3 17 V7 Z",
} as const;

export type ShieldShape = keyof typeof SHIELDS;

export interface Grade {
  shape: ShieldShape | null;
  /** CSS custom property holding this grade's metal. */
  metal: string;
  label: string;
}

/**
 * The grade a fineness earns.
 *
 * 375 is the lowest grade that may legally carry a hallmark, and that is where
 * the shield stops. An agent below it is not shown with a bad mark; it is shown
 * with none.
 */
export function gradeOf(fineness: number): Grade {
  if (fineness >= 900) return { shape: "octagon", metal: "var(--gold-999)", label: "Fine" };
  if (fineness >= 750) return { shape: "hexagon", metal: "var(--gold-750)", label: "18 carat" };
  if (fineness >= 500) return { shape: "rect", metal: "var(--silver-925)", label: "Sterling" };
  if (fineness >= 375) return { shape: "clipped", metal: "var(--pewter-500)", label: "9 carat" };
  return { shape: null, metal: "var(--base)", label: "Base metal" };
}

/**
 * Category devices, one per assay office.
 *
 * Each is derived from what the strategy physically does rather than from an
 * abstract icon set: a liquidity band and its midpoint, the rungs of a ladder,
 * a compounding spiral, a plumb line measuring whether a thing is about to
 * fall over.
 */
export const CATEGORY_DEVICE: Record<string, string> = {
  // A band with a centre notch — a concentrated range and its midpoint.
  rebalancing: "M5 9 H19 V15 H5 Z M11 7 H13 V17 H11 Z",
  // Four stacked rungs — the ladder.
  "grid-trading": "M5 6 H19 V8 H5 Z M5 10 H19 V12 H5 Z M5 14 H19 V16 H5 Z M5 18 H19 V20 H5 Z",
  // Three turns, compounding. The one curve in the system, and it earns it.
  "yield-optimisation":
    "M12 4 A8 8 0 1 1 4 12 A6 6 0 1 0 16 12 A4 4 0 1 1 12 16 A2 2 0 1 0 14 12",
  // A plumb line and bob.
  "health-factor": "M11 3 H13 V15 H11 Z M12 15 L16 19 L12 22 L8 19 Z",
};

/** The date-letter shield cycles its shape, exactly as the real system does. */
export const DATE_SHIELDS: string[] = [
  "M4 3 H20 V17 L12 21 L4 17 Z",       // shaped shield
  "M3 4 H21 V20 H3 Z",                  // plain rectangle
  "M12 2 L21 12 L12 22 L3 12 Z",        // lozenge
  "M6 3 H18 L21 8 V16 L18 21 H6 L3 16 V8 Z", // cartouche
];

/** Eight historical surrounds for a sponsor's mark, chosen by seed. */
export const SPONSOR_SHIELDS: string[] = [
  "M4 4 H20 V20 H4 Z",                              // square
  "M12 2 L21 12 L12 22 L3 12 Z",                    // lozenge
  "M4 3 H20 V16 L12 22 L4 16 Z",                    // shield
  "M8 3 H16 L21 8 V16 L16 21 H8 L3 16 V8 Z",        // octagon
  "M3 7 H21 V17 H3 Z",                              // oblong
  "M12 2 L20 7 V17 L12 22 L4 17 V7 Z",              // hexagon
  "M4 4 H20 L20 20 H4 Z",                           // square, cut
  "M12 3 L21 21 H3 Z",                              // triangle
];

/**
 * A deterministic 32-bit hash of a string.
 *
 * FNV-1a rather than keccak: the sponsor's mark must be derivable in a browser
 * with no dependencies and no async, and the property that matters is
 * determinism, not collision resistance. Two agents sharing a surround is not
 * a security failure — the token id is printed beside the mark.
 */
export function seedOf(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 23 letters, not 26.
 *
 * I, O and U are omitted, as they are in the real date-letter cycles, because
 * at punch size they are indistinguishable from 1, 0 and V.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTVWXYZ";

/** The letters struck inside a sponsor's mark, from the same seed. */
export function sponsorLetters(chainId: number, tokenId: string): string {
  const seed = seedOf(`${chainId}:${tokenId}`);
  const a = ALPHABET[seed % ALPHABET.length];
  const b = ALPHABET[(seed >>> 8) % ALPHABET.length];
  return `${a}${b}`;
}

export function sponsorShield(chainId: number, tokenId: string): string {
  return SPONSOR_SHIELDS[seedOf(`${chainId}:${tokenId}`) % SPONSOR_SHIELDS.length]!;
}

/** The date letter for an assay, cycling through the 23-letter alphabet. */
export function dateLetter(epoch: number): { letter: string; shield: string } {
  const i = Math.abs(Math.floor(epoch));
  return {
    letter: ALPHABET[i % ALPHABET.length]!,
    shield: DATE_SHIELDS[Math.floor(i / ALPHABET.length) % DATE_SHIELDS.length]!,
  };
}

/**
 * The assay cycle a timestamp falls in.
 *
 * Real date letters change annually. A market settling epochs in minutes needs
 * a shorter cycle to be informative, so this is weekly — long enough that the
 * letter means something, short enough that staleness is visible.
 */
export const CYCLE_MS = 7 * 24 * 60 * 60 * 1000;
export const cycleOf = (at: number | string | Date): number =>
  Math.floor(new Date(at).getTime() / CYCLE_MS);
