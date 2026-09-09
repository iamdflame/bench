/**
 * The agents this office operates itself, and the wallets they act from.
 *
 * The register's top rungs were occupied by two bare addresses. They hold
 * mandates, settle epochs and get slashed, but they are not ERC-8004
 * identities — so the funnel had to say, in the product's own words, that "the
 * registry's population and the market's do not yet overlap at all". A
 * marketplace whose only bonded participants are outside the registry it
 * indexes is a studio with a directory attached.
 *
 * These wallets are registered as ERC-8004 identities so that the tokenId and
 * the holder are the same thing, and rung 5 counts registrations rather than
 * addresses.
 *
 * One identity per wallet, not one per office. 0xd6d11Aa5 holds mandates in
 * all four offices, and minting four registrations for it would have made rung
 * five read `4` for one participant — the same manufactured plurality this
 * register flags when one wallet holds forty-four BORT tokens. The card names
 * every office the wallet actually works in, and the count stays honest.
 */

import type { Category } from "@/lib/config";

export interface HouseAgent {
  /** URL segment and card identifier. */
  slug: string;
  name: string;
  description: string;
  /** The wallet it acts from. This is the mandate holder. */
  wallet: `0x${string}`;
  /** Offices it holds mandates in. Read from the book, not aspirational. */
  offices: Category[];
  /**
   * Its ERC-8004 token id, once registered.
   *
   * Absent until the registration lands. The site says "not yet registered"
   * rather than reserving a number, because a token id that does not exist is
   * the kind of claim this product exists to refuse.
   */
  tokenId: string | null;
}

export const HOUSE: HouseAgent[] = [
  {
    slug: "keeper-a",
    name: "MANDATE House Keeper A",
    description:
      "Operates mandates in four offices on BNB Smart Chain: grid trading, rebalancing, yield optimisation and health factor monitoring. It bids by escrowing its own capital, is settled hourly against a benchmark committed to chain before the outcome is known, and has been slashed. Its record — including the epochs it lost — is public at mandate-coral.vercel.app and re-derivable with npx mandate-verify.",
    wallet: "0xd6d11Aa5046dc5C7BE8d63B9223b60D7AD94cBe9",
    offices: ["grid-trading", "rebalancing", "yield-optimisation", "health-factor"],
    tokenId: process.env.NEXT_PUBLIC_HOUSE_A_TOKEN_ID ?? null,
  },
  {
    slug: "keeper-b",
    name: "MANDATE House Keeper B",
    description:
      "Operates a grid trading mandate on BNB Smart Chain. It escrowed its own capital as a bond against a target it committed to, and is settled against a benchmark whose hash was on chain before the outcome was known. Its running alpha is negative and stays on the tape.",
    wallet: "0x090d19610cdb4d6bb011d9EB579910Ac3296BB0a",
    offices: ["grid-trading"],
    tokenId: process.env.NEXT_PUBLIC_HOUSE_B_TOKEN_ID ?? null,
  },
];

export const houseBySlug = (slug: string): HouseAgent | null =>
  HOUSE.find((h) => h.slug === slug) ?? null;

export const houseByWallet = (wallet: string): HouseAgent | null =>
  HOUSE.find((h) => h.wallet.toLowerCase() === wallet.toLowerCase()) ?? null;

/** Registered house agents, by token id, for joining the register to the book. */
export const houseByTokenId = (tokenId: string): HouseAgent | null =>
  HOUSE.find((h) => h.tokenId === tokenId) ?? null;
