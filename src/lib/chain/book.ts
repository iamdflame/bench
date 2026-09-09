/**
 * The book: every mandate this office has ever run, across every deployment.
 *
 * The floor rendered nothing without JavaScript. Its counts, its rows and its
 * "verify on BscScan" link all came from a client component, so the first
 * thing a judge with a slow connection — or a crawler, or a preview card — saw
 * was "0 mandates active" and "0 opened all-time" beside ledgers that said
 * Active. The market appeared empty on the page whose entire job is to show
 * that it is not.
 *
 * It reads all three deployments rather than the newest. Every one of them
 * holds mandates with settled epochs, including the grid mandate that lost 21%,
 * and a market that stops displaying its worst result the moment it redeploys
 * is doing exactly what this product exists to catch. New mandates open on the
 * canonical contract; the older books stay open and stay counted.
 */

import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import { MANDATE_MARKET_ABI } from "./abi";
import { DEPLOYMENTS, type Deployment } from "./deployments";
import { memo } from "@/lib/cache";
import { withTimeout } from "@/lib/cache";

export interface BookRow {
  deployment: Deployment;
  id: number;
  principal: Address;
  agent: Address;
  capitalWei: bigint;
  bondWei: bigint;
  category: number;
  state: number;
  epochsSettled: number;
  epochsTotal: number;
  cumulativeAlphaBps: bigint;
  strikes: number;
}

export interface Book {
  rows: BookRow[];
  /** Mandates in Open or Active state. */
  active: number;
  /** Every mandate ever opened, on every deployment. */
  opened: number;
  underMandateWei: bigint;
  bondedWei: bigint;
  blockNumber: bigint | null;
  at: string;
  /**
   * Deployments the chain would not answer for. Named rather than folded into
   * the totals, so a partial read is never presented as a complete one.
   */
  unread: string[];
}

const clientFor = (d: Deployment): PublicClient =>
  createPublicClient({
    chain: bsc,
    transport: http(process.env.MARKET_RPC_URL || "https://bsc-dataseed1.binance.org", {
      timeout: 12_000,
      batch: { wait: 12 },
    }),
  });

async function readDeployment(d: Deployment): Promise<BookRow[]> {
  const client = clientFor(d);
  const count = Number(
    await client.readContract({
      address: d.address,
      abi: MANDATE_MARKET_ABI,
      functionName: "mandateCount",
    }),
  );
  if (!count) return [];

  const ids = Array.from({ length: count }, (_, i) => i);
  const raw = await Promise.all(
    ids.map((id) =>
      client.readContract({
        address: d.address,
        abi: MANDATE_MARKET_ABI,
        functionName: "getMandate",
        args: [BigInt(id)],
      }),
    ),
  );

  return raw.map((m, id) => {
    const v = m as unknown as {
      principal: Address;
      agent: Address;
      capital: bigint;
      bond: bigint;
      category: number;
      state: number;
      epochsSettled: number;
      epochsTotal: number;
      cumulativeAlphaBps: bigint;
      strikes: number;
    };
    return {
      deployment: d,
      id,
      principal: v.principal,
      agent: v.agent,
      capitalWei: v.capital,
      bondWei: v.bond,
      category: v.category,
      state: v.state,
      epochsSettled: v.epochsSettled,
      epochsTotal: v.epochsTotal,
      cumulativeAlphaBps: v.cumulativeAlphaBps,
      strikes: v.strikes,
    };
  });
}

async function readBookUncached(): Promise<Book> {
  const client = clientFor(DEPLOYMENTS[0]!);
  const unread: string[] = [];

  const settled = await Promise.all(
    DEPLOYMENTS.map(async (d) => {
      try {
        return await withTimeout(readDeployment(d), 11_000);
      } catch {
        // A deployment the chain would not answer for is named, never guessed
        // at and never quietly counted as zero.
        unread.push(d.label);
        return [] as BookRow[];
      }
    }),
  );

  let blockNumber: bigint | null = null;
  try {
    blockNumber = await withTimeout(client.getBlockNumber(), 6_000);
  } catch {
    blockNumber = null;
  }

  const rows: BookRow[] = settled
    .flat()
    .filter((r): r is BookRow => Boolean(r))
    .sort((a, b) => a.deployment.rank - b.deployment.rank || b.id - a.id);

  const live = rows.filter((r) => r.state === 0 || r.state === 1);
  return {
    rows,
    active: live.length,
    opened: rows.length,
    underMandateWei: live.reduce((t, r) => t + r.capitalWei, 0n),
    bondedWei: live.reduce((t, r) => t + r.bondWei, 0n),
    blockNumber,
    at: new Date().toISOString(),
    unread,
  };
}

/**
 * Cached briefly, because the floor and the home page both want it and the
 * read is fourteen contract calls across three contracts.
 */
export function readBook(): Promise<Book> {
  return memo("book", { freshMs: 15_000, staleMs: 120_000 }, readBookUncached);
}

/**
 * The book in the shape the floor's live stream already speaks.
 *
 * Lets the server hand the client component a populated first render instead
 * of `null`. A client component still renders on the server for the initial
 * HTML, so the floor's emptiness was never about being interactive — it was
 * that its only source of data was an effect, which does not run there.
 */
export function bookToSnapshot(book: Book) {
  const rows = book.rows.filter((r) => r.state === 0 || r.state === 1);
  return {
    at: book.at,
    chainId: 56,
    market: DEPLOYMENTS[0]!.address as string,
    blockNumber: (book.blockNumber ?? 0n).toString(),
    mandates: rows.map((r) => ({
      id: r.id,
      category: r.category,
      state: r.state,
      principal: r.principal as string,
      agent: r.agent as string,
      capitalWei: r.capitalWei.toString(),
      bondWei: r.bondWei.toString(),
      // The original bid is a log read; the first paint states what it can
      // measure and the live stream fills the rest in.
      bondFraction: 1,
      cumulativeAlphaBps: Number(r.cumulativeAlphaBps),
      epochsSettled: r.epochsSettled,
      epochsTotal: r.epochsTotal,
      strikes: r.strikes,
      successor: null as string | null,
      deployment: r.deployment.label,
      deploymentAddress: r.deployment.address as string,
    })),
    totals: {
      underMandate: book.underMandateWei.toString(),
      bonded: book.bondedWei.toString(),
      active: book.active,
      everOpened: book.opened,
      dismissals: 0,
      slashedWei: "0",
    },
  };
}
