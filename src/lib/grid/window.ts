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
 */

import { parseAbiItem, type Address, type Hex } from "viem";
import { logClients } from "@/lib/chain/market";
import { bscClient } from "@/lib/chain/rpc";
import { SWAP_BOUND, USDT, WBNB_USDT_POOL } from "@/lib/chain/leash";
import { memo } from "@/lib/cache";

export const SWAP_BOUND_DEPLOY_TX: Hex = "0xe1b9ce12e82556507c28b7360c3406d17c3b19efbbc599a95a90e069480a1411";
/** The block that transaction landed in. Pinned, so the window needs no receipt read to start. */
export const SWAP_BOUND_DEPLOY_BLOCK = 121_188_454n;
const SWAPPED = parseAbiItem(
  "event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)",
);
const SLOT0 = parseAbiItem("function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint32,bool)");
const CHUNK = 5_000n;

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

async function deployBlock(): Promise<bigint> {
  return SWAP_BOUND_DEPLOY_BLOCK;
}

async function swappedLogs(from: bigint, to: bigint) {
  const out: Awaited<ReturnType<(typeof logClients)[number]["getLogs"]>> = [];
  for (let start = from; start <= to; start += CHUNK) {
    const end = start + CHUNK - 1n > to ? to : start + CHUNK - 1n;
    let got: typeof out | null = null;
    let last: unknown;
    for (const c of logClients) {
      try {
        got = (await c.getLogs({ address: SWAP_BOUND, event: SWAPPED, fromBlock: start, toBlock: end })) as typeof out;
        break;
      } catch (e) {
        last = e;
      }
    }
    if (!got) throw new Error(`no provider served SwapBound logs for ${start}-${end}: ${(last as Error)?.message ?? "unknown"}`);
    out.push(...got);
  }
  return out;
}

type Lot = { side: "long" | "short"; qty: number; orig: number; price: number; tx: Hex; gasUsd: number };

async function readUncached(): Promise<GridWindow> {
  const client = bscClient();
  const [from, head, slot] = await Promise.all([
    deployBlock(),
    client.getBlockNumber(),
    client.readContract({ address: WBNB_USDT_POOL, abi: [SLOT0], functionName: "slot0" }).catch(() => null),
  ]);
  const logs = await swappedLogs(from, head);

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

  const fills: Fill[] = logs.map((l) => {
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

  const sqrt = slot ? Number((slot as readonly unknown[])[0] as bigint) / 2 ** 96 : 0;
  const mark = sqrt > 0 ? 1 / (sqrt * sqrt) : null;
  const unrealised = mark ? lots.reduce((t, l) => t + (l.side === "long" ? (mark - l.price) : (l.price - mark)) * l.qty, 0) : 0;
  const pnl = realised + unrealised - gasUsd;
  maxDrawdown = Math.max(maxDrawdown, peak - pnl);
  const wins = roundTrips.filter((r) => r.win).length;
  const start = fills[0]?.at ?? null;
  const end = fills[fills.length - 1]?.at ?? null;

  return {
    source: "chain",
    contract: SWAP_BOUND,
    fromBlock: Number(from),
    toBlock: Number(head),
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

export function readGridWindow(opts: { fresh?: boolean } = {}): Promise<GridWindow> {
  if (opts.fresh) return readUncached();
  return memo("grid-window", { freshMs: 60_000, staleMs: 15 * 60_000 }, readUncached);
}
