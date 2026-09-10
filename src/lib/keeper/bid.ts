/**
 * The bid that stops a buyer staring at an empty book.
 *
 * A mandate opens and then nothing happens until an agent decides to post a
 * bond against it. On a market this young that could be never, which means the
 * first thing a person sees after committing capital is a job nobody wants.
 * The product is a two-sided market with one side missing, and no amount of
 * interface fixes that.
 *
 * So we bid. This is our own agent taking our own risk on the same terms as
 * anyone else: a real bond, at the contract's own floor, slashable on exactly
 * the same schedule. It is not a favour to the buyer and it is not a fake
 * order. It is market making, and the site says so wherever a keeper bid
 * appears rather than dressing it up as third-party demand.
 *
 * Everything about it is bounded, because it spends real money on an input a
 * stranger controls:
 *
 *   - only the canonical market, only mandates in `Open`
 *   - never twice on the same mandate
 *   - bond is `requiredBond` plus a small margin, never an arbitrary amount
 *   - a hard ceiling per bid and a daily ceiling across all of them
 *   - the wallet must keep enough left to pay gas afterwards
 *
 * The worst a caller can do by hammering it is make us post bonds on genuinely
 * open mandates, which is the thing it exists to do.
 */

import { formatEther, type Address } from "viem";
import { marketClient, walletFor } from "@/lib/chain/market";
import { MARKET_V2 } from "@/lib/chain/deployments";
import { MANDATE_MARKET_V2_ABI } from "@/lib/chain/abiV2";
import { bid as sendBid, requiredBond, marketParameters } from "@/lib/chain/marketV2";

/** The most a single keeper bid may ever post. */
export const MAX_BOND_WEI = 200_000_000_000_000n; // 0.0002 BNB

/** The most the keeper may post across all bids in a rolling day. */
export const DAILY_BOND_CAP_WEI = 1_000_000_000_000_000n; // 0.001 BNB

/** Left unspent so the wallet can still pay for the transactions it signs. */
export const GAS_RESERVE_WEI = 300_000_000_000_000n; // 0.0003 BNB

/** The return the keeper undertakes to beat the benchmark by, per epoch. */
const TARGET_ALPHA_BPS = 100;

export type BidOutcome =
  | { ok: true; hash: string; bondWei: string; mandateId: number }
  | { ok: false; why: string; code: "already" | "state" | "funds" | "cap" | "paused" | "error" };

/*
  Spend is tracked in the process rather than a database.

  A serverless instance is short-lived, so this is a floor on the cap and not a
  ceiling: several instances could each spend up to it. The real ceiling is the
  wallet, which holds a deliberately small amount, and `MAX_BOND_WEI` bounds any
  single call. Saying so is better than implying a guarantee this does not make.
*/
const spent: { at: number; wei: bigint }[] = [];

function spentToday(): bigint {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  while (spent.length && spent[0]!.at < cutoff) spent.shift();
  return spent.reduce((t, s) => t + s.wei, 0n);
}

function keeperWallet() {
  const key = process.env.AGENT_A_KEY ?? process.env.AGENT_B_KEY;
  if (!key) return null;
  return walletFor((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
}

/** Whether the keeper is configured at all. Used to decide what the UI promises. */
export const keeperConfigured = () => Boolean(process.env.AGENT_A_KEY ?? process.env.AGENT_B_KEY);

export async function keeperBid(mandateId: number): Promise<BidOutcome> {
  const wallet = keeperWallet();
  if (!wallet) return { ok: false, why: "No keeper key is configured.", code: "error" };
  const me = wallet.account!.address as Address;

  try {
    const params = await marketParameters();
    if (params.paused) return { ok: false, why: "The market is paused.", code: "paused" };

    const mandate = (await marketClient.readContract({
      address: MARKET_V2,
      abi: MANDATE_MARKET_V2_ABI,
      functionName: "getMandate",
      args: [BigInt(mandateId)],
    } as never)) as { state: number; capital: bigint };

    if (mandate.state !== 0) {
      return { ok: false, why: `Mandate ${mandateId} is not open for bids.`, code: "state" };
    }

    // Never twice. A second bond on a mandate we already back is money spent
    // for nothing, and it is the obvious way a retry loop turns into a leak.
    const bids = (await marketClient.readContract({
      address: MARKET_V2,
      abi: MANDATE_MARKET_V2_ABI,
      functionName: "getBids",
      args: [BigInt(mandateId)],
    } as never)) as readonly { agent: string; spent: boolean }[];
    if (bids.some((b) => b.agent.toLowerCase() === me.toLowerCase())) {
      return { ok: false, why: `Already bid on mandate ${mandateId}.`, code: "already" };
    }

    const floor = await requiredBond(mandateId);
    // A little over, so a rounding difference between what we read and what the
    // contract recomputes can never refuse the bid.
    const bond = (floor * 105n) / 100n;

    if (bond > MAX_BOND_WEI) {
      return {
        ok: false,
        why: `Mandate ${mandateId} needs a ${formatEther(bond)} BNB bond, over the keeper's ${formatEther(MAX_BOND_WEI)} ceiling.`,
        code: "cap",
      };
    }
    if (spentToday() + bond > DAILY_BOND_CAP_WEI) {
      return { ok: false, why: "The keeper has reached its daily bond ceiling.", code: "cap" };
    }

    const balance = await marketClient.getBalance({ address: me });
    if (balance < bond + GAS_RESERVE_WEI) {
      return {
        ok: false,
        why: `The keeper wallet holds ${formatEther(balance)} BNB and needs ${formatEther(bond + GAS_RESERVE_WEI)} to bid and still pay gas.`,
        code: "funds",
      };
    }

    const hash = await sendBid(wallet, mandateId, TARGET_ALPHA_BPS, bond);
    spent.push({ at: Date.now(), wei: bond });
    return { ok: true, hash, bondWei: bond.toString(), mandateId };
  } catch (e) {
    return {
      ok: false,
      why: e instanceof Error ? e.message.slice(0, 200) : "The bid failed.",
      code: "error",
    };
  }
}

/** Every canonical mandate still waiting for its first bid. */
export async function openMandatesNeedingBids(): Promise<number[]> {
  const count = Number(
    await marketClient.readContract({
      address: MARKET_V2,
      abi: MANDATE_MARKET_V2_ABI,
      functionName: "mandateCount",
    } as never),
  );
  const out: number[] = [];
  for (let id = 0; id < count; id++) {
    const m = (await marketClient
      .readContract({
        address: MARKET_V2,
        abi: MANDATE_MARKET_V2_ABI,
        functionName: "getMandate",
        args: [BigInt(id)],
      } as never)
      .catch(() => null)) as { state: number } | null;
    if (m?.state === 0) out.push(id);
  }
  return out;
}
