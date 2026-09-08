/**
 * The half of Rail 1 that is the same whoever pays.
 *
 * Resolving a listing to an endpoint, fetching its 402, parsing the challenge
 * and refusing an unpayable one are identical work whether the cent comes from
 * this deployment's float or from a visitor's own wallet. Sharing it is not
 * only economy: the two paths have to agree on what is payable, or a visitor
 * could be shown a quote the house path would have refused.
 */

import { safeFetch, resolveChain, type SupportedChain } from "@bench/shared";
import { parseChallenge, type Challenge } from "@bench/probe";
import { formatEther } from "viem";
import { findRow } from "@/lib/board";

/** Nothing on this rail may cost more than five cents, whoever is paying. */
export const MAX_PER_CALL = 50_000_000_000_000_000n; // 0.05 USD1

export type Resolved =
  | { ok: true; chainId: SupportedChain; target: string; challenge: Challenge; name: string }
  | { ok: false; status: number; refusedBecause: string };

export async function resolveAndChallenge(body: {
  chainId?: number;
  id?: string;
  resource?: string | null;
}): Promise<Resolved> {
  const no = (refusedBecause: string, status = 200): Resolved => ({ ok: false, status, refusedBecause });

  const { chainId } = resolveChain(body.chainId);
  const hit = findRow(chainId, String(body.id ?? ""));
  if (!hit) return no("This id is not on the board, so there is no endpoint to call.", 404);

  const target = hit.service?.resource ?? hit.agent?.endpoint ?? body.resource ?? null;
  if (!target) return no("This listing declares no endpoint, so there is nothing to call.");

  const unpaid = await safeFetch(target, { timeoutMs: 15_000 });
  if (!unpaid.ok) return no(unpaid.detail);
  if (unpaid.status !== 402) {
    return no(
      `It answered ${unpaid.status} rather than asking for payment, so there is no priced call to buy right now.`,
    );
  }

  const challenge = parseChallenge(unpaid.body, chainId);
  if (!challenge) return no("It answered 402 with a body we could not read as an x402 challenge.");
  if (!challenge.payable || !challenge.best) return no(challenge.unpayableReason ?? "This challenge is not payable here.");
  if (challenge.best.amount! > MAX_PER_CALL) {
    return no(
      `It asks ${formatEther(challenge.best.amount!)} ${challenge.best.assetSymbol}, above the per-call ceiling on this rail.`,
    );
  }

  return { ok: true, chainId, target, challenge, name: hit.row?.name ?? target };
}

/**
 * Decode the seller's settlement receipt.
 *
 * Base64 JSON carrying the transaction hash. Decoded so the answer can link to
 * the transfer on BscScan rather than asking a reader to trust one happened.
 */
export function txFromSettlement(settlement: string | null): string | null {
  if (!settlement) return null;
  try {
    const decoded = JSON.parse(Buffer.from(settlement, "base64").toString("utf8")) as { transaction?: string };
    return typeof decoded.transaction === "string" ? decoded.transaction : null;
  } catch {
    /* a receipt we cannot decode is not a failure of the call */
    return null;
  }
}

/**
 * What happened to the money, in words.
 *
 * `paid: null, txHash: null` is ambiguous to anything that is not a person: it
 * reads equally as "the call was free" and as "we owe them a cent". §14.1's
 * rule is that an absence carries a reason, so this states which it is.
 */
export function settlementOf(txHash: string | null, paid: unknown) {
  return txHash
    ? { state: "settled" as const, why: "The transfer is on chain at the hash below." }
    : paid
      ? {
          state: "outstanding" as const,
          why: "The buyer signed a valid EIP-3009 authorisation and the seller verified it and answered. The transfer itself was not submitted here, so the seller is owed the amount above and can still submit the authorisation itself.",
        }
      : {
          state: "unpaid" as const,
          why: "This endpoint answered without requiring payment, so nothing was owed and nothing was signed.",
        };
}
