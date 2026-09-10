/**
 * Live market state.
 *
 * Server-sent events rather than polling from the browser: the floor needs a
 * steady tick, and the chain read is cheap on the server and expensive to fan
 * out to every viewer. One reader, many watchers.
 */

import { MARKET_ADDRESS, marketClient } from "@/lib/chain/market";
import { MANDATE_MARKET_V2_ABI } from "@/lib/chain/abiV2";
import { readBook, bookToSnapshot } from "@/lib/chain/book";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Serverless functions are capped; ask for the longest window available. */
export const maxDuration = 60;

const TICK_MS = 2_000;
/**
 * Close the stream before the platform kills it.
 *
 * An SSE response that runs forever is fine on a long-lived server and
 * impossible on a serverless function, which is terminated at the duration
 * limit mid-write. Ending deliberately just inside the window lets EventSource
 * reconnect on its own, which it does automatically, instead of the client
 * seeing a truncated stream and a network error.
 */
const STREAM_MS = 45_000;

export interface FloorMandate {
  id: number;
  category: number;
  state: number;
  principal: string;
  agent: string;
  capitalWei: string;
  bondWei: string;
  /** Bond as a fraction of the winning bid, so slashing is visible. */
  bondFraction: number;
  cumulativeAlphaBps: number;
  epochsSettled: number;
  epochsTotal: number;
  strikes: number;
  successor: string | null;
  /** Which deployment this row came from: v2, v1 or v0. */
  deployment?: string;
  deploymentAddress?: string;
}

export interface FloorSnapshot {
  at: string;
  chainId: number;
  market: string;
  blockNumber: string;
  mandates: FloorMandate[];
  totals: {
    underMandate: string;
    bonded: string;
    active: number;
    /** Every mandate ever opened, including those long since closed. */
    everOpened: number;
    dismissals: number;
    slashedWei: string;
  };
}

async function readSnapshot(): Promise<FloorSnapshot> {
  /*
    The whole book, not one contract's share of it.

    The page is now server-rendered from every deployment this office has run,
    so a stream that read only the canonical market would have replaced eight
    rows with one the instant it connected — the floor filling in correctly and
    then emptying itself in front of the visitor, which is worse than never
    having rendered.

    Successors and original bids are still read from the canonical contract,
    because those are the only rows anyone can act on.
  */
  const book = await readBook();
  const base = bookToSnapshot(book);
  const mandates = book.rows
    .filter((r) => r.state === 0 || r.state === 1)
    .filter((r) => r.deployment.status === "canonical");
  const total = book.opened;
  const blockNumber = book.blockNumber ?? 0n;

  /*
    The successor, derived rather than asked for.

    This used to call `successor(uint256)`, which V1 has and **V2 does not** —
    so on the canonical market every one of these reverted, the `.catch`
    swallowed it, and the column has been permanently blank rather than wrong.
    Blank is the better failure of the two, but it is still a column that has
    never once told the truth.

    V2 answers the same question from the bid queue: the next live bid is the
    first that is neither spent nor expired, which is exactly what the
    contract's own `_nextLiveBid` picks.
  */
  const now = BigInt(Math.floor(Date.now() / 1000));
  const bidQueues = await Promise.all(
    mandates.map((m) =>
      marketClient
        .readContract({
          address: MARKET_ADDRESS,
          abi: MANDATE_MARKET_V2_ABI,
          functionName: "getBids",
          args: [BigInt(m.id)],
        })
        .catch(() => null),
    ),
  );

  const successors = bidQueues.map((q) => {
    const bids = q as readonly { agent: string; spent: boolean; expiresAt: bigint }[] | null;
    if (!bids) return null;
    const next = bids.find((b) => !b.spent && (b.expiresAt === 0n || b.expiresAt > now));
    return next?.agent ?? null;
  });

  // The original bid backing each holder, so a slashed bond reads as a
  // fraction rather than an absolute nobody can calibrate against.
  const originals = await Promise.all(
    mandates.map(async (m) => {
      try {
        /*
          Read with V2's ABI, because V2's `Bid` carries a fifth field.

          Decoded with V1's four-field shape the first element happens to be
          right and every element after it is read at the wrong stride — so the
          floor would attribute bonds to addresses that do not exist. The live
          market has one bid, which is the only reason this has not shown yet;
          the second bid anybody places would have made it visible.
        */
        const bids = (await marketClient.readContract({
          address: MARKET_ADDRESS,
          abi: MANDATE_MARKET_V2_ABI,
          functionName: "getBids",
          args: [BigInt(m.id)],
        })) as readonly { agent: string; bond: bigint }[];
        const held = bids.find((b) => b.agent.toLowerCase() === m.agent.toLowerCase());
        return held?.bond ?? m.bondWei;
      } catch {
        return m.bondWei;
      }
    }),
  );

  // Enrich the canonical rows with what only the canonical contract can say,
  // and leave every other deployment's row exactly as the book read it.
  const extra = new Map(
    mandates.map((m, i) => {
      const original = originals[i] ?? m.bondWei;
      return [
        m.id,
        {
          bondFraction: original > 0n ? Number((m.bondWei * 1000n) / original) / 1000 : 0,
          successor: (successors[i] as string | null) ?? null,
        },
      ] as const;
    }),
  );

  return {
    ...base,
    blockNumber: blockNumber.toString(),
    mandates: base.mandates.map((row) =>
      row.deployment === "v2" && extra.has(row.id) ? { ...row, ...extra.get(row.id)! } : row,
    ),
    totals: { ...base.totals, everOpened: total },
  };
}

export async function GET(req: Request) {
  if (!MARKET_ADDRESS) {
    return new Response(
      JSON.stringify({ error: "MARKET_ADDRESS not configured" }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          send("state", await readSnapshot());
        } catch (error) {
          send("stale", { message: String(error).slice(0, 160) });
        }
      };

      await tick();
      timer = setInterval(tick, TICK_MS);

      // Hand back to the client before the platform pulls the rug.
      endTimer = setTimeout(() => {
        closed = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already gone */
        }
      }, STREAM_MS);

      req.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearInterval(timer);
        if (endTimer) clearTimeout(endTimer);
        try {
          controller.close();
        } catch {
          /* already gone */
        }
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
      if (endTimer) clearTimeout(endTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
