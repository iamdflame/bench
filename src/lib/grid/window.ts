/**
 * Grid-1's trading window, derived from the chain and nothing else.
 *
 * Every Grid-1 fill goes through SwapBound, and SwapBound emits one `Swapped`
 * event per fill with the amounts that actually moved. So the window is those
 * events and nothing we wrote down: fills, the round trips they close, win
 * rate, profit against doing nothing, and the worst drawdown along the way.
 * A simulated fill cannot appear here, because a simulated fill emits nothing.
 *
 * Accounting, stated so it can be checked:
 *   - A buy sells USDT for WBNB; a sell does the reverse. Price is USDT per
 *     WBNB from the fill's own amounts, so the pool fee is inside it.
 *   - Lots close first in, first out. A sell closes open buys; a buy closes
 *     open sells. Each close is a round trip; it wins when its profit is more
 *     than the gas of the fills that made it.
 *   - Profit is against doing nothing with the same tokens: the grid's
 *     realised gains, plus open lots marked at the current pool price, minus
 *     all gas. Drawdown is the largest fall in that figure from its high.
 *   - Gas is what the chain charged the transaction that carried each fill
 *     (gas used times effective price). The relay's fee is that plus its
 *     margin, so this understates cost slightly, and says so.
 *
 * Reading it, stated so the cost stays bounded:
 *   The one public provider that serves these logs caps a query at 5,000
 *   blocks, and BSC makes about 190,000 a day. Reading from the deploy block
 *   on every request therefore grew by some forty queries a day, and by the
 *   second day it no longer fitted inside the status check's twelve seconds.
 *   The window is now read forward from the last stored reading: stored fills
 *   before its final blocks stand, those final blocks are read again in case
 *   of a reorganisation, and everything after is read now. Each stretch of
 *   the scan is stored as it completes, so a read that is cut short still
 *   moves the cursor. A stored reading is only ever an earlier chain read,
 *   and `verify` still prints the one command that rebuilds it from nothing.
 */

import { parseAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { logClients } from "@/lib/chain/market";
import { bscClient } from "@/lib/chain/rpc";
import { SWAP_BOUND, USDT, WBNB_USDT_POOL } from "@/lib/chain/leash";
import { memo } from "@/lib/cache";
import { snapshot, store, warm } from "@/lib/data/snapshots";

export const SWAP_BOUND_DEPLOY_TX: Hex = "0xe1b9ce12e82556507c28b7360c3406d17c3b19efbbc599a95a90e069480a1411";
/** The block that transaction landed in. Pinned, so the window needs no receipt read to start. */
export const SWAP_BOUND_DEPLOY_BLOCK = 121_188_454n;
const SWAPPED = parseAbiItem(
  "event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)",
);
const SLOT0 = parseAbiItem("function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint32,bool)");
const CHUNK = 5_000n;
/** Chunk queries in flight at once. Small, because the provider is a public one. */
const PARALLEL = 4;
/** Chunks per stored stretch, so a read cut short keeps what it has read. */
const STRETCH = 8n;
/** Blocks read again from the end of a stored reading. BSC finalises in two or three; this is generous. */
const REREAD = 50n;

export interface Fill {
  tx: Hex;
  block: number;
  at: string | null;
  side: "buy" | "sell";
  usdt: number;
  wbnb: number;
  /** USDT per WBNB, from the fill's own amounts. */
  price: number;
  gasBnb: number | null;
}

export interface RoundTrip {
  openTx: Hex;
  closeTx: Hex;
  qtyWbnb: number;
  grossUsd: number;
  gasUsd: number;
  netUsd: number;
  win: boolean;
}

export interface GridWindow {
  source: "chain";
  contract: Address;
  fromBlock: number;
  toBlock: number;
  readAt: string;
  fills: Fill[];
  roundTrips: RoundTrip[];
  wins: number;
  /** Null until a round trip has closed: no closes is not a 0% win rate. */
  winRate: number | null;
  realisedUsd: number;
  unrealisedUsd: number;
  gasUsd: number;
  /** Against doing nothing, net of gas. */
  pnlUsd: number;
  maxDrawdownUsd: number;
  openWbnb: number;
  markPrice: number | null;
  window: { start: string | null; end: string | null; hours: number | null };
  verify: string;
}

/** How long a provider has before the next one is asked as well. */
const HEDGE_MS = 1_500;
/** Providers in the order to ask them; whichever answers first moves to the front. */
const preferred = logClients.map((_, i) => i);

/**
 * A provider's error, without the provider's URL.
 *
 * viem puts the full URL in its message, and a configured RPC URL can carry
 * an API key. This message ends up in `/api/status`, which is public.
 */
function reason(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  return (err?.shortMessage ?? err?.message?.split("\n")[0] ?? "unknown").replace(/https?:\/\/\S+/g, "<rpc>");
}

/**
 * One chunk of logs, hedged across providers.
 *
 * Measured on Vercel: the same one-chunk read answered in 0.2 s, then did not
 * answer for 8 s, then answered in 0.7 s. Asking providers one after another
 * meant a provider that hangs held the read for its whole 25 s timeout. Now
 * the next provider is asked as well once the first has had 1.5 s, and the
 * first answer wins; a slow provider is never cut off, only overtaken.
 */
function chunkLogs(start: bigint, end: bigint) {
  const ask = (i: number) => logClients[i].getLogs({ address: SWAP_BOUND, event: SWAPPED, fromBlock: start, toBlock: end });
  type Logs = Awaited<ReturnType<typeof ask>>;
  const order = [...preferred];
  return new Promise<Logs>((resolve, reject) => {
    const errors: string[] = [];
    let next = 0;
    let open = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const launch = () => {
      clearTimeout(timer);
      if (settled || next >= order.length) return;
      const i = order[next++];
      open++;
      ask(i).then(
        (logs) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          preferred.splice(preferred.indexOf(i), 1);
          preferred.unshift(i);
          resolve(logs);
        },
        (e) => {
          open--;
          errors.push(reason(e));
          if (settled) return;
          if (next < order.length) launch();
          else if (open === 0) {
            settled = true;
            reject(new Error(`no provider served SwapBound logs for ${start}-${end}: ${errors.join("; ").slice(0, 240)}`));
          }
        },
      );
      timer = setTimeout(launch, HEDGE_MS);
    };
    launch();
  });
}

type SwappedLog = Awaited<ReturnType<typeof chunkLogs>>[number];

async function swappedLogs(from: bigint, to: bigint): Promise<SwappedLog[]> {
  const ranges: [bigint, bigint][] = [];
  for (let start = from; start <= to; start += CHUNK) {
    ranges.push([start, start + CHUNK - 1n > to ? to : start + CHUNK - 1n]);
  }
  const out: SwappedLog[] = [];
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    const got = await Promise.all(ranges.slice(i, i + PARALLEL).map(([s, e]) => chunkLogs(s, e)));
    for (const g of got) out.push(...g);
  }
  return out;
}

async function toFills(logs: SwappedLog[], client: PublicClient): Promise<Fill[]> {
  const blocks = [...new Set(logs.map((l) => l.blockNumber!))];
  const times = new Map<bigint, string>();
  await Promise.all(
    blocks.map(async (b) => {
      const blk = await client.getBlock({ blockNumber: b }).catch(() => null);
      if (blk) times.set(b, new Date(Number(blk.timestamp) * 1000).toISOString());
    }),
  );
  const gas = new Map<Hex, number>();
  await Promise.all(
    [...new Set(logs.map((l) => l.transactionHash!))].map(async (h) => {
      const r = await client.getTransactionReceipt({ hash: h }).catch(() => null);
      if (r) gas.set(h, Number(r.gasUsed * r.effectiveGasPrice) / 1e18);
    }),
  );

  return logs.map((l) => {
    const a = (l as unknown as { args: { tokenIn: Address; amountIn: bigint; amountOut: bigint } }).args;
    const buy = a.tokenIn.toLowerCase() === USDT.toLowerCase();
    const usdt = Number(buy ? a.amountIn : a.amountOut) / 1e18;
    const wbnb = Number(buy ? a.amountOut : a.amountIn) / 1e18;
    return {
      tx: l.transactionHash!,
      block: Number(l.blockNumber),
      at: times.get(l.blockNumber!) ?? null,
      side: buy ? "buy" : "sell",
      usdt,
      wbnb,
      price: wbnb > 0 ? usdt / wbnb : 0,
      gasBnb: gas.get(l.transactionHash!) ?? null,
    };
  });
}

type Lot = { side: "long" | "short"; qty: number; orig: number; price: number; tx: Hex; gasUsd: number };

/** The accounting above, over a list of fills and a mark price. Pure. */
function build(fills: Fill[], toBlock: number, mark: number | null): GridWindow {
  const lots: Lot[] = [];
  const roundTrips: RoundTrip[] = [];
  let realised = 0;
  let gasUsd = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const f of fills) {
    const fillGas = (f.gasBnb ?? 0) * f.price;
    gasUsd += fillGas;
    let remaining = f.wbnb;
    const closing = f.side === "buy" ? "short" : "long";
    while (remaining > 1e-12 && lots.length && lots[0].side === closing) {
      const lot = lots[0];
      const m = Math.min(lot.qty, remaining);
      const gross = lot.side === "long" ? (f.price - lot.price) * m : (lot.price - f.price) * m;
      const tripGas = lot.gasUsd * (m / lot.orig) + fillGas * (m / f.wbnb);
      roundTrips.push({ openTx: lot.tx, closeTx: f.tx, qtyWbnb: m, grossUsd: gross, gasUsd: tripGas, netUsd: gross - tripGas, win: gross - tripGas > 0 });
      realised += gross;
      lot.qty -= m;
      remaining -= m;
      if (lot.qty <= 1e-12) lots.shift();
    }
    if (remaining > 1e-12) {
      lots.push({ side: f.side === "buy" ? "long" : "short", qty: remaining, orig: f.wbnb, price: f.price, tx: f.tx, gasUsd: fillGas });
    }
    const unreal = lots.reduce((t, l) => t + (l.side === "long" ? (f.price - l.price) : (l.price - f.price)) * l.qty, 0);
    const equity = realised + unreal - gasUsd;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }

  const unrealised = mark ? lots.reduce((t, l) => t + (l.side === "long" ? (mark - l.price) : (l.price - mark)) * l.qty, 0) : 0;
  const pnl = realised + unrealised - gasUsd;
  maxDrawdown = Math.max(maxDrawdown, peak - pnl);
  const wins = roundTrips.filter((r) => r.win).length;
  const start = fills[0]?.at ?? null;
  const end = fills[fills.length - 1]?.at ?? null;
  const from = SWAP_BOUND_DEPLOY_BLOCK;

  return {
    source: "chain",
    contract: SWAP_BOUND,
    fromBlock: Number(from),
    toBlock,
    readAt: new Date().toISOString(),
    fills,
    roundTrips,
    wins,
    winRate: roundTrips.length ? wins / roundTrips.length : null,
    realisedUsd: realised,
    unrealisedUsd: unrealised,
    gasUsd,
    pnlUsd: pnl,
    maxDrawdownUsd: maxDrawdown,
    openWbnb: lots.reduce((t, l) => t + (l.side === "long" ? l.qty : -l.qty), 0),
    markPrice: mark,
    window: { start, end, hours: start && end ? (Date.parse(end) - Date.parse(start)) / 3_600_000 : null },
    verify: `cast logs --address ${SWAP_BOUND} "Swapped(address indexed,address indexed,uint256,uint256)" --from-block ${from} --rpc-url https://bsc.rpc.blxrbdn.com`,
  };
}

/** The last stored reading, if it is a prefix of this window. */
async function storedReading(): Promise<GridWindow | null> {
  await warm(["grid-window"]).catch(() => undefined);
  const w = snapshot<GridWindow>("grid-window")?.payload;
  // A reading of another contract, or one that did not start at the deploy
  // block, is not a prefix of this window; the read starts again from nothing.
  if (!w || !Array.isArray(w.fills) || typeof w.toBlock !== "number") return null;
  if (w.contract?.toLowerCase() !== SWAP_BOUND.toLowerCase() || w.fromBlock !== Number(SWAP_BOUND_DEPLOY_BLOCK)) return null;
  return w;
}

async function readUncached(opts: { fromScratch?: boolean } = {}): Promise<GridWindow> {
  const client = bscClient();
  const [base, head, slot] = await Promise.all([
    opts.fromScratch ? null : storedReading(),
    client.getBlockNumber(),
    client.readContract({ address: WBNB_USDT_POOL, abi: [SLOT0], functionName: "slot0" }).catch(() => null),
  ]);
  const sqrt = slot ? Number((slot as readonly unknown[])[0] as bigint) / 2 ** 96 : 0;
  const mark = sqrt > 0 ? 1 / (sqrt * sqrt) : null;

  let cursor = base ? BigInt(base.toBlock) - REREAD + 1n : SWAP_BOUND_DEPLOY_BLOCK;
  if (cursor < SWAP_BOUND_DEPLOY_BLOCK) cursor = SWAP_BOUND_DEPLOY_BLOCK;
  // A provider behind the stored reading: nothing new to read, so re-mark it.
  if (base && cursor > head) return build(base.fills, base.toBlock, mark);

  let fills = (base?.fills ?? []).filter((f) => BigInt(f.block) < cursor);
  let latest: GridWindow | null = null;
  while (cursor <= head) {
    const end = cursor + CHUNK * STRETCH - 1n > head ? head : cursor + CHUNK * STRETCH - 1n;
    fills = fills.concat(await toFills(await swappedLogs(cursor, end), client));
    latest = build(fills, Number(end), mark);
    // A read from scratch is how the stored reading gets checked; it must not
    // replace that reading, stretch by stretch, with a shorter one as it runs.
    if (!opts.fromScratch) await store("grid-window", latest, latest.readAt).catch(() => undefined);
    cursor = end + 1n;
  }
  return latest ?? build(fills, Number(head), mark);
}

/**
 * `fresh` skips the in-process memo; `fromScratch` also ignores the stored
 * reading and reads every block from the deploy block, which is slow on
 * purpose and exists for the script that checks the stored reading is right.
 */
export function readGridWindow(opts: { fresh?: boolean; fromScratch?: boolean } = {}): Promise<GridWindow> {
  if (opts.fresh || opts.fromScratch) return readUncached({ fromScratch: opts.fromScratch });
  return memo("grid-window", { freshMs: 60_000, staleMs: 15 * 60_000 }, () => readUncached());
}
