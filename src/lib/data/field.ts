/**
 * The field: agents this office did not crawl, indexed because they are real.
 *
 * Our own crawl walks the registry in token order and has reached 3,808 of
 * 304,787. That is an honest sample and a useless front door, because the
 * agents a BNB Chain judge will actually look for — the ones being submitted
 * to this hackathon, minted in the last fortnight, at token ids far past where
 * the crawl has got to — are all in the 300,979 it has not seen.
 *
 * So these are named explicitly and read from the chain rather than waited
 * for. Every one is a public mainnet ERC-8004 identity that somebody else
 * operates. Listing a competitor's agents is not a courtesy: the brief asks
 * for the canonical front door for every agent on BSC, and a front door that
 * only opens onto its own tenants is a shop.
 *
 * Nothing here is rated more highly for being on the list. They enter the same
 * register, at whatever rung the same tests place them, and the ones that
 * cannot be reached say so exactly as ours do.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Category } from "@/lib/config";

export interface FieldAgent {
  tokenId: string;
  owner: string;
  name: string | null;
  description: string | null;
  category: Category | null;
  confidence: number;
  matched: string[];
  /** Endpoints the card advertises. A claim, never evidence. */
  services: { name: string; endpoint: string }[];
  x402Endpoint: string | null;
  /** Where the card came from, or why it did not resolve. */
  cardSource: "data-uri" | "http" | "unresolved";
  cardError: string | null;
  /**
   * How many identities in this list share this agent's owner wallet.
   *
   * One wallet holding forty-four registrations is not forty-four agents, and
   * a register that counts them as such is manufacturing the diversity it is
   * supposed to be measuring. The number is shown rather than the rows being
   * hidden — they are real registrations and they belong in the register; they
   * just do not each get a vote in an office count.
   */
  siblings: number;
  /** Who we understand to operate it, for attribution. */
  operator: string | null;
  blockNumber: string | null;
}

export interface FieldIndex {
  capturedAt: string;
  chainId: number;
  agents: FieldAgent[];
}

const EMPTY: FieldIndex = { capturedAt: new Date(0).toISOString(), chainId: 56, agents: [] };

let cached: FieldIndex | null = null;

export function getField(): FieldIndex {
  if (cached) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src/data/field.json"), "utf8"),
    ) as FieldIndex;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

/**
 * The token ids this office indexes on purpose, and who runs them.
 *
 * Kept as source rather than configuration: each entry is a claim about who
 * operates a public identity, and that belongs somewhere a reader can see it
 * and contradict it.
 */
export const FIELD_SOURCES: { operator: string; note: string; tokenIds: string[] }[] = [
  {
    operator: "Agripinaa",
    note: "Eight mainnet identities, two per category, operated by agripinaa.vercel.app.",
    tokenIds: [
      "269703",
      "307485",
      "269704",
      "307486",
      "269705",
      "307487",
      "269706",
      "307488",
    ],
  },
  {
    operator: "SMEAI-listed",
    note: "Mainnet identities SMEAI's census reports as hireable, resolved here from the registry rather than from their API.",
    tokenIds: [
      "265375",
      "293902",
      "302257",
      "302258",
      "304493",
      "304494",
      "331625",
      "331698",
      "331794",
    ],
  },
  {
    operator: "BORT / Yi He Nexus",
    note: "A batch mint: forty-four identities on one wallet, cards on IPFS. Counted as registrations, not as forty-four operators.",
    tokenIds: [
      "153662", "153666", "153672", "153674", "153677", "153691", "153692",
      "153696", "153698", "153700", "153704", "153705", "153710", "153713",
      "153714", "153725", "153726", "153727", "153728", "153730", "153732",
      "153733", "153744", "153745", "153749", "153753", "153760", "153763",
      "153769", "153770", "153771", "153774", "153776", "153786", "153790",
      "153795", "153798", "153804", "153809", "153811", "153816", "153817",
      "153818", "153820",
    ],
  },
];
