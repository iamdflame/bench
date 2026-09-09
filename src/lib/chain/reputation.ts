/**
 * Writing measurements back into the ERC-8004 Reputation Registry.
 *
 * Our own research says this registry is worthless: 3,000 feedback records on
 * BSC written by 32 wallets, 99% of them by the 14 that flag as a coordinated
 * cohort. The easy response is to route around it and publish a better score
 * elsewhere, which is what every other reader of this registry does.
 *
 * The better response is to repair it. Every assay this market runs produces a
 * measurement that is reproducible from public chain state by anyone, and
 * writing those back makes the registry more honest whether or not anybody
 * adopts our front door — including for competitors reading the same data.
 *
 * The registry address and calldata shape are not documented anywhere we could
 * find. Both were recovered from the chain: a real feedback record's
 * transaction named the contract, and its selector resolved to
 * `giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)`.
 */

import { keccak256, parseAbi, toHex, type Address, type Hex } from "viem";
import { marketChain, marketClient, walletFor } from "./market";

/** Recovered from a real feedback transaction, not from documentation. */
export const REPUTATION_REGISTRY = "0x8004baa17c55a88189ae136b182e5fda19de9b63" as const;

export const REPUTATION_ABI = parseAbi([
  "function giveFeedback(uint256 agentId, int128 score, uint8 scoreType, string tag1, string tag2, string fileuri, string comment, bytes32 filehash)",
]);

/** The tag every record from this market carries, so ours can be filtered out. */
export const MANDATE_TAG = "mandate-assay";

/**
 * Our own ERC-8004 identity, written into every record we leave.
 *
 * The registry's existing records are unattributable: a score from a wallet
 * with no standing and no way to check it. Ours name the agent that wrote
 * them, so anyone reading a MANDATE record can turn the same instrument back
 * on us — which is the only thing that makes writing to this registry
 * different from adding to the noise.
 */
export const MANDATE_AGENT_ID = process.env.NEXT_PUBLIC_MANDATE_TOKEN_ID ?? "336161";

export interface WriteBack {
  agentId: string;
  /** Our fineness, 0–1000, rescaled to the 0–100 the registry's records use. */
  score: number;
  fineness: number;
  hallmark: string;
  /** Where the full assay can be read and re-run. */
  fileuri: string;
  /** Digest of the assay's findings, so the record commits to what it saw. */
  filehash: Hex;
  comment: string;
  /** The block the assay read. A measurement without one is an opinion. */
  blockNumber: string | null;
  /** Our own ERC-8004 token id, so a reader can assay the assayer. */
  writtenBy: string;
}

/**
 * Builds the record for one assay.
 *
 * The comment is deliberately not a recommendation. It says what was measured
 * and how to re-run it, because a registry full of opinions is how this one got
 * into its current state.
 */
export function buildWriteBack(opts: {
  agentId: string;
  fineness: number;
  /** The grade's name — "9 carat", "Base metal" — not its mark. A reader of
   *  the registry has no way to interpret "—". */
  hallmark: string;
  findings: string[];
  /** The block the assay read at, carried into the record. */
  blockNumber?: bigint | string | null;
  siteBase?: string;
}): WriteBack {
  const base = opts.siteBase ?? "https://mandate-coral.vercel.app";
  const fileuri = `${base}/agent/${opts.agentId}`;
  const block = opts.blockNumber?.toString() ?? null;

  /*
    The comment carries the block and the writer's own token id.

    Every other record in this registry is an unattributable number. One that
    names the state it was read from, and the agent that wrote it, can be
    checked and can be held to account — including by pointing the same
    instrument back at us, which is why our own id is in there.
  */
  const provenance = [
    `Machine assay, ${opts.fineness}/1000 fineness (${opts.hallmark}).`,
    block ? `Opened at block ${block}.` : "Block not recorded.",
    `Written by ERC-8004 ${MANDATE_AGENT_ID} — assay us too.`,
    `Reproduce: npm run assay -- ${opts.agentId}`,
  ].join(" ");

  return {
    agentId: opts.agentId,
    // Millesimal fineness is 0–1000; the registry's existing records are 0–100.
    score: Math.max(0, Math.min(100, Math.round(opts.fineness / 10))),
    fineness: opts.fineness,
    hallmark: opts.hallmark,
    fileuri,
    // Commits to the findings *and* the block, so a record cannot be quietly
    // re-attributed to a different reading of the chain.
    filehash: keccak256(toHex([block ?? "no-block", ...opts.findings].join("\n"))),
    comment: provenance,
    blockNumber: block,
    writtenBy: MANDATE_AGENT_ID,
  };
}

/** Sends one record. Returns the transaction hash. */
export async function publishFeedback(record: WriteBack, privateKey?: string): Promise<Hex> {
  const key = privateKey ?? process.env.PRIVATE_KEY;
  if (!key) throw new Error("no key to write with");
  const wallet = walletFor((key.startsWith("0x") ? key : `0x${key}`) as Hex);

  return wallet.writeContract({
    address: REPUTATION_REGISTRY as Address,
    abi: REPUTATION_ABI,
    functionName: "giveFeedback",
    args: [
      BigInt(record.agentId),
      BigInt(record.score),
      0,
      MANDATE_TAG,
      record.hallmark,
      record.fileuri,
      record.comment,
      record.filehash,
    ],
    chain: marketChain,
    account: wallet.account!,
  });
}

export { marketClient };
