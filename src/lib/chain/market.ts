/**
 * Client for MandateMarket.
 *
 * The floor reads from here. Every figure it renders is a contract call or a
 * log — nothing on the floor is a number this codebase made up.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  fallback,
  formatEther,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet, foundry } from "viem/chains";
import { MANDATE_MARKET_ABI } from "./abi";
import { MARKET_V2 } from "./deployments";

/**
 * The market this site reads and writes by default.
 *
 * This used to fall back to the empty string, and production had an env var
 * still pointing at the first deployment. Between them the footer linked
 * `bscscan.com/address/` with no address at all on one page and a superseded
 * contract on another — a "verify this yourself" link that verified nothing,
 * on the site whose entire argument is that claims must be checkable.
 *
 * There is no empty fallback now. An unset environment resolves to the
 * canonical deployment rather than to a broken link, and a value that is not
 * one of ours is still honoured (a fork should be able to point this at its own
 * market) but is reported as unrecognised rather than silently labelled.
 */
export const MARKET_ADDRESS = (process.env.NEXT_PUBLIC_MARKET_ADDRESS ||
  process.env.MARKET_ADDRESS ||
  MARKET_V2) as Address;

/*
  Defaults to BNB Smart Chain, matching the default address above.

  It defaulted to 31337 while the address defaulted to empty, so an unset
  environment produced a coherent-looking client pointed at a local chain that
  was not running. Local development sets both explicitly.
*/
const MARKET_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_MARKET_CHAIN_ID ?? process.env.MARKET_CHAIN_ID ?? 56,
);

const MARKET_RPC =
  process.env.NEXT_PUBLIC_MARKET_RPC_URL ??
  process.env.MARKET_RPC_URL ??
  "http://127.0.0.1:8545";

export const marketChain =
  MARKET_CHAIN_ID === 56 ? bsc : MARKET_CHAIN_ID === 97 ? bscTestnet : foundry;

export const marketClient: PublicClient = createPublicClient({
  chain: marketChain,
  transport: MARKET_RPC.startsWith("ws")
    ? fallback([webSocket(MARKET_RPC), http()])
    : http(MARKET_RPC, { timeout: 20_000, batch: { wait: 12 } }),
});

/**
 * Providers that will actually serve eth_getLogs.
 *
 * Measured on BSC: bsc-dataseed refuses log queries entirely, answering
 * "limit exceeded" even for a thousand-block span, while publicnode serves
 * them without complaint. The read client is fine for calls and stays as it
 * is; log history needs its own list, tried in order, because a single
 * provider silently returning nothing looks exactly like an empty history.
 */
export const LOG_RPCS = [
  process.env.LOG_RPC_URL,
  // Measured across thirteen public BSC endpoints: this is the one that
  // serves eth_getLogs over a range. publicnode now answers "Archive requests
  // require a personal token" for anything more than a few hours old, and
  // drpc rate-limits a public caller within a handful of requests.
  "https://bsc.rpc.blxrbdn.com",
  "https://bsc-rpc.publicnode.com",
  "https://bsc.drpc.org",
  MARKET_RPC,
].filter(Boolean) as string[];

export const logClients: PublicClient[] = LOG_RPCS.map((url) =>
  createPublicClient({
    chain: marketChain,
    transport: http(url, { timeout: 25_000, retryCount: 0 }),
  }),
);

export function walletFor(privateKey: Hex) {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: marketChain,
    transport: http(MARKET_RPC),
  });
}

export const CATEGORY_NAMES = [
  "Rebalancing",
  "Grid Trading",
  "Yield Optimisation",
  "Health Factor",
] as const;

export const STATE_NAMES = ["Open", "Active", "Closed", "Abandoned"] as const;

export interface MandateView {
  id: number;
  principal: Address;
  capital: bigint;
  agent: Address;
  bond: bigint;
  category: number;
  state: number;
  toleranceBps: number;
  feeBps: number;
  slashBps: number;
  epochLength: number;
  epochsTotal: number;
  epochsSettled: number;
  lastSettledAt: number;
  cumulativeAlphaBps: bigint;
  strikes: number;
}

export interface BidView {
  agent: Address;
  bond: bigint;
  targetAlphaBps: number;
  spent: boolean;
}

const ZERO = "0x0000000000000000000000000000000000000000";

export const isZero = (a: string | undefined | null) =>
  !a || a.toLowerCase() === ZERO;

export async function readMandateCount(): Promise<number> {
  if (!MARKET_ADDRESS) return 0;
  const n = await marketClient.readContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: "mandateCount",
  });
  return Number(n);
}

export async function readMandate(id: number): Promise<MandateView> {
  const m = (await marketClient.readContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: "getMandate",
    args: [BigInt(id)],
  })) as Record<string, unknown>;

  return {
    id,
    principal: m.principal as Address,
    capital: m.capital as bigint,
    agent: m.agent as Address,
    bond: m.bond as bigint,
    category: Number(m.category),
    state: Number(m.state),
    toleranceBps: Number(m.toleranceBps),
    feeBps: Number(m.feeBps),
    slashBps: Number(m.slashBps),
    epochLength: Number(m.epochLength),
    epochsTotal: Number(m.epochsTotal),
    epochsSettled: Number(m.epochsSettled),
    lastSettledAt: Number(m.lastSettledAt),
    cumulativeAlphaBps: m.cumulativeAlphaBps as bigint,
    strikes: Number(m.strikes),
  };
}

export async function readBids(id: number): Promise<BidView[]> {
  const bids = (await marketClient.readContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: "getBids",
    args: [BigInt(id)],
  })) as readonly Record<string, unknown>[];

  return bids.map((b) => ({
    agent: b.agent as Address,
    bond: b.bond as bigint,
    targetAlphaBps: Number(b.targetAlphaBps),
    spent: Boolean(b.spent),
  }));
}

export async function readAllMandates(): Promise<MandateView[]> {
  const count = await readMandateCount();
  if (count === 0) return [];
  return Promise.all(Array.from({ length: count }, (_, i) => readMandate(i)));
}

/**
 * Reads only the mandates that are still live.
 *
 * Reading every mandate is O(n) RPC calls per tick, and a market that has been
 * running for a while has thousands of closed ones. At ~480 mandates that was
 * roughly 1,400 calls per two-second tick and the stream simply stopped
 * emitting.
 *
 * Mandates are created in sequence and a closed one never reopens, so scanning
 * backward from the newest finds every live mandate near the head. The scan
 * stops once it has seen a long enough run of consecutive closed mandates to
 * be confident nothing live remains behind them.
 */
export async function readLiveMandates(
  opts: { maxScan?: number; closedRunToStop?: number } = {},
): Promise<{ live: MandateView[]; total: number; scanned: number }> {
  const total = await readMandateCount();
  if (total === 0) return { live: [], total: 0, scanned: 0 };

  const maxScan = opts.maxScan ?? 200;
  const stopAfter = opts.closedRunToStop ?? 48;
  const live: MandateView[] = [];
  let closedRun = 0;
  let scanned = 0;

  // Walk backward in small batches so the calls still parallelise.
  const BATCH = 12;
  for (let end = total; end > 0 && scanned < maxScan; end -= BATCH) {
    const start = Math.max(0, end - BATCH);
    const ids = Array.from({ length: end - start }, (_, k) => start + k).reverse();
    const batch = await Promise.all(ids.map((id) => readMandate(id)));
    scanned += batch.length;

    for (const m of batch) {
      if (m.state === 0 || m.state === 1) {
        live.push(m);
        closedRun = 0;
      } else {
        closedRun += 1;
      }
    }
    if (closedRun >= stopAfter) break;
  }

  live.sort((a, b) => a.id - b.id);
  return { live, total, scanned };
}

/** Formats wei as BNB with a fixed number of places, for a ledger column. */
export const bnb = (wei: bigint, dp = 3) => Number(formatEther(wei)).toFixed(dp);

export const bps = (v: number | bigint) => {
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n / 100).toFixed(2)}%`;
};

export const shortAddr = (a: string) =>
  a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

export { MANDATE_MARKET_ABI };
