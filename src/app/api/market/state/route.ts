/**
 * The whole book, as plain JSON, including the rows the floor hides.
 *
 * `/api/floor` streams and shows only live mandates, which is right for a
 * ticker and wrong for a dashboard: the first thing a person wants to see
 * after a job ends is the job that ended. This returns every mandate on every
 * deployment, with the bid queue attached to the ones that still need a
 * decision, so the dashboard can render a complete history and the action that
 * moves each row forward.
 */

import { NextResponse } from "next/server";
import { MARKET_ADDRESS, marketClient } from "@/lib/chain/market";
import { MANDATE_MARKET_V2_ABI } from "@/lib/chain/abiV2";
import { readBook } from "@/lib/chain/book";

export const runtime = "nodejs";
export const revalidate = 0;

export interface MarketBid {
  index: number;
  agent: string;
  bondWei: string;
  targetAlphaBps: number;
  spent: boolean;
  expiresAt: string;
}

export interface MarketMandate {
  id: number;
  deployment: string;
  deploymentAddress: string;
  canonical: boolean;
  category: number;
  state: number;
  principal: string;
  agent: string;
  capitalWei: string;
  bondWei: string;
  epochsSettled: number;
  epochsTotal: number;
  cumulativeAlphaBps: number;
  strikes: number;
  /** Only read for canonical mandates still awaiting a decision. */
  bids: MarketBid[];
  /**
   * The smallest bond the contract will accept on this job, in wei.
   *
   * Read from `requiredBond` rather than reconstructed in the browser: it is
   * the larger of a flat market minimum and a share of the capital, and both
   * are owner-settable, so a client that recomputed it would be right until
   * the day it silently was not.
   */
  requiredBondWei: string | null;
}

export async function GET() {
  if (!MARKET_ADDRESS) {
    return NextResponse.json({ error: "The market address is not configured." }, { status: 503 });
  }

  try {
    const book = await readBook();

    // Bids are only actionable on the canonical deployment and only while a
    // mandate is still Open, so that is the only place we spend a read.
    const needsBids = book.rows.filter(
      (r) => r.deployment.status === "canonical" && r.state === 0,
    );
    const queues = await Promise.all(
      needsBids.map((r) =>
        marketClient
          .readContract({
            address: MARKET_ADDRESS,
            abi: MANDATE_MARKET_V2_ABI,
            functionName: "getBids",
            args: [BigInt(r.id)],
          })
          .catch(() => null),
      ),
    );

    const floors = await Promise.all(
      needsBids.map((r) =>
        marketClient
          .readContract({
            address: MARKET_ADDRESS,
            abi: MANDATE_MARKET_V2_ABI,
            functionName: "requiredBond",
            args: [BigInt(r.id)],
          })
          .catch(() => null),
      ),
    );
    const floorById = new Map(
      needsBids.map((r, i) => [r.id, floors[i] == null ? null : String(floors[i] as bigint)]),
    );
    const byId = new Map(
      needsBids.map((r, i) => [
        r.id,
        ((queues[i] ?? []) as readonly {
          agent: string;
          bond: bigint;
          targetAlphaBps: number;
          spent: boolean;
          expiresAt: bigint;
        }[]).map((b, index) => ({
          index,
          agent: b.agent,
          bondWei: b.bond.toString(),
          targetAlphaBps: Number(b.targetAlphaBps),
          spent: b.spent,
          expiresAt: b.expiresAt.toString(),
        })),
      ]),
    );

    const mandates: MarketMandate[] = book.rows.map((r) => ({
      id: r.id,
      deployment: r.deployment.label,
      deploymentAddress: r.deployment.address,
      canonical: r.deployment.status === "canonical",
      category: r.category,
      state: r.state,
      principal: r.principal,
      agent: r.agent,
      capitalWei: r.capitalWei.toString(),
      bondWei: r.bondWei.toString(),
      epochsSettled: r.epochsSettled,
      epochsTotal: r.epochsTotal,
      cumulativeAlphaBps: Number(r.cumulativeAlphaBps),
      strikes: r.strikes,
      bids: byId.get(r.id) ?? [],
      requiredBondWei: floorById.get(r.id) ?? null,
    }));

    return NextResponse.json(
      {
        at: book.at,
        blockNumber: (book.blockNumber ?? 0n).toString(),
        market: MARKET_ADDRESS,
        // Named rather than folded into the totals: a partial read must never
        // be presented as a complete one.
        unread: book.unread,
        mandates,
        totals: {
          opened: book.opened,
          active: book.active,
          underMandateWei: book.underMandateWei.toString(),
          bondedWei: book.bondedWei.toString(),
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "The chain would not answer." },
      { status: 502 },
    );
  }
}
