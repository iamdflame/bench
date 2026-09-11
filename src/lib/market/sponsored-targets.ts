/**
 * The agents Mandate will pay for, and what each call asks about.
 *
 * A sponsored call spends our money on somebody else's endpoint, so the list
 * is short and explicit rather than "anything payable": each entry names the
 * agent, how its input is built, and what the answer can be checked against.
 * Every one of these has already taken our payment and answered with work.
 */

import { DEMO_ADDRESS } from "@/lib/demo";

export interface SponsoredTarget {
  tokenId: string;
  category: "rebalancing" | "grid-trading" | "yield-optimisation" | "health-factor";
  /** What the call is about, in the page's words. */
  asks: string;
  /** Whether a visitor may name the wallet or position it reads. */
  takesSubject: boolean;
  method: "GET" | "POST";
  url: (subject?: string) => string;
  body?: unknown;
  /** What a reader can check the answer against. */
  checkWith: string;
}

const MUSTER = "https://muster.zkasuran.dev/api/agent";
/** The demo address's out-of-range Pancake position, pool and ticks. */
const DEMO_POOL = "0x36696169C63e42cd08ce11f5deeBbCeBae652050";
const NFT_A = { lower: -67380, upper: -67180 };

export const SPONSORED: Record<string, SponsoredTarget> = {
  "342377": {
    tokenId: "342377",
    category: "health-factor",
    asks: "the health factor of a Venus borrower, and how far prices would have to fall to liquidate it",
    takesSubject: true,
    method: "GET",
    url: (subject) => `${MUSTER}/health-factor?account=${/^0x[0-9a-fA-F]{40}$/.test(subject ?? "") ? subject : DEMO_ADDRESS}`,
    checkWith: "Venus's own comptroller, read at the block its answer names",
  },
  "342379": {
    tokenId: "342379",
    category: "rebalancing",
    asks: "whether a PancakeSwap v3 range is still in range, and how far the price has drifted from each bound",
    takesSubject: false,
    method: "GET",
    url: () => `${MUSTER}/rebalancing?pool=${DEMO_POOL}&lowerTick=${NFT_A.lower}&upperTick=${NFT_A.upper}`,
    checkWith: "the pool's own slot0 tick",
  },
  "338253": {
    tokenId: "338253",
    category: "yield-optimisation",
    asks: "the Hyperliquid vaults with the most capital, their APR, leader and withdrawal terms",
    takesSubject: false,
    method: "POST",
    url: () => "https://hyperliquidvault.space/x402",
    body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_vaults", arguments: {} } },
    checkWith: "Hyperliquid's public API, which is where it reads",
  },
};

export const sponsoredIds = () => Object.keys(SPONSORED);
