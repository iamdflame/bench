/**
 * How many times each listed agent has actually held a mandate here.
 *
 * `Listing.hires` defaulted to zero and nothing ever passed anything else, so
 * "Hired on this market" read "Not yet" for every agent on the site whether or
 * not it was true. That was harmless only by accident: the answer happens to be
 * zero for all of them, for a reason that is itself worth publishing.
 *
 * The books on this market are held by two wallets we operate. **No agent in
 * the ERC-8004 registry has ever held a mandate here.** The join below is what
 * makes the count correct the moment one does, and `OPERATED_WALLETS` is what
 * lets the site say plainly which rows are ours rather than presenting an
 * in-house book as third-party demand.
 *
 * The bridge from a registry tokenId to the wallet an agent actually signs with
 * is the assay snapshot, which resolves `agentWallet` for 257 of the 258 listed
 * agents. `agents.json` carries only `owner`, which is the NFT holder and
 * frequently a different address.
 */

import { readBook } from "@/lib/chain/book";
import { assaySnapshot } from "@/lib/market/assays";

/**
 * Wallets this project operates.
 *
 * Any mandate held by one of these is our own agent working our own book. It
 * counts as a settled epoch and it does not count as somebody choosing us.
 */
export const OPERATED_WALLETS = new Set(
  [
    "0xd6d11aa5046dc5c7be8d63b9223b60d7ad94cbe9",
    "0x090d19610cdb4d6bb011d9eb579910ac3296bb0a",
    "0x54c06cc2623aaa2dcc38b17fa07ad2e99b363c90",
  ].map((a) => a.toLowerCase()),
);

const ZERO = "0x0000000000000000000000000000000000000000";

export interface HireCounts {
  /** tokenId to the number of mandates that agent's wallet has held. */
  byTokenId: Map<string, number>;
  /** Mandates held by a wallet in the ERC-8004 registry we list. */
  thirdParty: number;
  /** Mandates held by a wallet we operate. */
  operated: number;
}

/** Registry tokenId keyed by the wallet that agent signs with. */
function walletToTokenId(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [tokenId, report] of Object.entries(assaySnapshot().reports)) {
    const wallet = report.agentWallet;
    if (wallet) out.set(wallet.toLowerCase(), tokenId);
  }
  return out;
}

export async function hireCounts(): Promise<HireCounts> {
  const byTokenId = new Map<string, number>();
  let thirdParty = 0;
  let operated = 0;

  const book = await readBook().catch(() => null);
  if (!book) return { byTokenId, thirdParty, operated };

  const bridge = walletToTokenId();
  for (const row of book.rows) {
    const agent = row.agent?.toLowerCase();
    if (!agent || agent === ZERO) continue;
    if (OPERATED_WALLETS.has(agent)) {
      operated += 1;
      continue;
    }
    const tokenId = bridge.get(agent);
    if (!tokenId) continue;
    byTokenId.set(tokenId, (byTokenId.get(tokenId) ?? 0) + 1);
    thirdParty += 1;
  }
  return { byTokenId, thirdParty, operated };
}
