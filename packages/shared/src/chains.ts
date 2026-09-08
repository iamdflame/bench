/**
 * Chain selection, and the rule that a figure never mixes two of them.
 *
 * BNB Smart Chain mainnet is 56; the testnet is 97. They are different
 * populations with different agents, different liquidity and different
 * meanings, and a marketplace that adds them together is not reporting a
 * number about anything. So the chain is resolved once, at the data layer,
 * and travels with every record. Nothing downstream filters by chain, because
 * a filter applied in a component is a filter somebody can forget.
 *
 * An unrecognised chain fails closed to mainnet rather than throwing. A
 * marketplace that 500s because a query string carried `?chain=1` is worse
 * than one that shows the real, default chain — but it must never silently
 * *read* chain 1 and label the answer 56, which is why the resolver returns a
 * `SupportedChain` and there is no other way to name a chain in this codebase.
 */

import { defineChain, type Chain } from "viem";
import { bsc, bscTestnet } from "viem/chains";

export const SUPPORTED_CHAINS = [56, 97] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export const DEFAULT_CHAIN: SupportedChain = 56;

export const isSupportedChain = (n: unknown): n is SupportedChain =>
  typeof n === "number" && (SUPPORTED_CHAINS as readonly number[]).includes(n);

/**
 * Coerce anything a URL, an env var or a JSON body can carry into a chain id.
 *
 * Fails closed to mainnet. The caller is told which it got, never left to
 * assume.
 */
export function resolveChain(input: unknown): {
  chainId: SupportedChain;
  /** True when the input named a chain we do not serve and was replaced. */
  coerced: boolean;
} {
  const n = typeof input === "string" ? Number(input) : input;
  if (isSupportedChain(n)) return { chainId: n, coerced: false };
  return { chainId: DEFAULT_CHAIN, coerced: input !== undefined && input !== null && input !== "" };
}

export const isTestnet = (chainId: SupportedChain) => chainId === 97;

export const CHAIN_LABEL: Record<SupportedChain, string> = {
  56: "BNB Smart Chain",
  97: "BNB Smart Chain Testnet",
};

/** Short badge text. Never omitted from a figure that came off a chain. */
export const CHAIN_BADGE: Record<SupportedChain, string> = {
  56: "BSC 56",
  97: "BSC 97",
};

export const EXPLORER: Record<SupportedChain, string> = {
  56: "https://bscscan.com",
  97: "https://testnet.bscscan.com",
};

export const txUrl = (chainId: SupportedChain, hash: string) => `${EXPLORER[chainId]}/tx/${hash}`;
export const addressUrl = (chainId: SupportedChain, addr: string) =>
  `${EXPLORER[chainId]}/address/${addr}`;
export const tokenUrl = (chainId: SupportedChain, registry: string, tokenId: string) =>
  `${EXPLORER[chainId]}/token/${registry}?a=${tokenId}`;

/**
 * Measured block time, used to convert a block distance into a duration.
 *
 * BSC has been running sub-second since the Maxwell upgrade. This is the
 * figure used to say "about four days of history", and it is stated rather
 * than hidden inside a magic number so a reader can check it.
 */
/**
 * Seconds per block, measured rather than quoted.
 *
 * 0.450s, sampled over 1k, 100k, 1M and 5M blocks on 2026-09-08 and identical
 * to three decimals at every span. It was 0.75 here, which is the figure the
 * documentation gave before the block-time reduction, and being 67% wrong
 * mattered: this constant converts days into block spans and blocks into
 * years, so it silently scaled the observation windows and the annualised
 * yield every agent is ranked by.
 */
export const BLOCK_SECONDS: Record<SupportedChain, number> = { 56: 0.45, 97: 0.45 };

/**
 * How far back `bsc-rpc.publicnode.com` will serve `eth_getLogs`.
 *
 * Measured by binary search: it answers for roughly the most recent 10,000
 * blocks and returns "Archive requests require a personal token" for everything
 * older, at any span. Block *headers* are served at any depth — only logs are
 * walled — so timestamps remain readable where events are not.
 *
 * This is the fallback ceiling, not the product's ceiling. `ARCHIVE_HOSTS`
 * below serves 208 days, which is what the capability scan and the
 * counterfactual replay actually run against.
 */
export const PUBLIC_LOG_WINDOW = 9_000n;

/**
 * Whether a host serving history beyond `PUBLIC_LOG_WINDOW` is available.
 *
 * True by default now that `ARCHIVE_HOSTS` ships with one. `ARCHIVE_RPC_URL`
 * remains the way to point at a paid provider when the public ones degrade —
 * which they will, being free.
 */
export const hasArchive = (): boolean => envList("ARCHIVE_RPC_URL").length > 0 || ARCHIVE_HOSTS.length > 0;

const envList = (name: string): string[] =>
  (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Read endpoints, primary first.
 *
 * Several public BSC providers serve `eth_call` happily and refuse
 * `eth_getLogs` outright, so the log hosts are configured separately rather
 * than assumed to be the same list. That is not a preference: `bsc-dataseed`
 * returns an error on any range, and reading its silence as "no events" is how
 * a capability scan quietly under-reports.
 */
export function rpcUrls(chainId: SupportedChain): string[] {
  if (chainId === 97) {
    return [
      ...envList("BSC_TESTNET_RPC_URL"),
      "https://bsc-testnet-rpc.publicnode.com",
      "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    ];
  }
  return [
    ...envList("BSC_RPC_URL"),
    "https://bsc-rpc.publicnode.com",
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc-dataseed1.defibit.io",
  ];
}

/**
 * Hosts that will answer `eth_getTransactionReceipt`.
 *
 * This is the exact inverse of the log list, and the split is real rather than
 * defensive. Measured across eleven public BSC endpoints:
 *
 *   `publicnode`  serves ranged `eth_getLogs` and refuses receipts outright —
 *                 "Archive requests require a personal token".
 *   the dataseeds serve receipts and refuse ranged `eth_getLogs`.
 *
 * So a write path that confirms on the log host hangs forever, and a log scan
 * on the receipt host finds nothing. A deployment that had already succeeded
 * was reported as a failure this way, which is how the split was found.
 */
export function receiptRpcUrls(chainId: SupportedChain): string[] {
  if (chainId === 97) {
    return [...envList("BSC_TESTNET_RPC_URL"), "https://bsc-testnet-rpc.publicnode.com"];
  }
  return [
    ...envList("WRITE_RPC_URL"),
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc-dataseed2.bnbchain.org",
    "https://bsc.meowrpc.com",
    "https://bsc-mainnet.public.blastapi.io",
  ];
}

/** Hosts that will actually answer `eth_getLogs` over a range. */
/**
 * Public BNB Chain hosts that serve historical logs, deepest first.
 *
 * Measured on 2026-09-08 across 21 public endpoints, with a 200-block filtered
 * `eth_getLogs` at 1k / 100k / 1M / 5M blocks back:
 *
 *   bsc.rpc.blxrbdn.com   served every depth tried, out to 40,000,000 blocks
 *                         — 208 days — in 200-900ms. Caps a request at 5,000
 *                         blocks and says so plainly.
 *   rpc-bsc.48.club       served to 1M blocks, then "header not found" — and
 *                         it sits behind Cloudflare, which refuses connections
 *                         from this network, so a retry there costs twenty
 *                         seconds and returns nothing. Not listed for that
 *                         reason rather than for its depth.
 *   0.48.club             the same host under another name.
 *
 * Everything else refused: 403 and archive-token walls (publicnode, nodies),
 * "limit exceeded" (both bnbchain dataseeds, nodereal), 429 (blastapi, zan),
 * `eth_getLogs` unsupported (1rpc), method-not-found (meowrpc), timeouts
 * (drpc), and five hosts whose DNS no longer resolves at all.
 *
 * This list is why the counterfactual engine is possible. An earlier reading
 * concluded that one host served ranges and only at the head, which set the
 * capability window to 75 minutes and put a 30-day replay out of reach. That
 * reading was taken with a log walker that sent no topic filter and read a
 * result-count cap as a range refusal, so it was measuring its own defects.
 */
const ARCHIVE_HOSTS = ["https://bsc.rpc.blxrbdn.com"] as const;

/** Blocks per `eth_getLogs`, the tightest cap among the hosts above. */
export const ARCHIVE_LOG_WINDOW = 5_000n;

export function logRpcUrls(chainId: SupportedChain): string[] {
  if (chainId === 97) return [...envList("LOG_RPC_URL"), "https://bsc-testnet-rpc.publicnode.com"];
  return [
    ...envList("LOG_RPC_URL"),
    ...envList("ARCHIVE_RPC_URL"),
    ...ARCHIVE_HOSTS,
    "https://bsc-rpc.publicnode.com",
  ];
}

/**
 * The viem chain object, with our RPC list rather than the bundled default.
 *
 * `bsc.rpcUrls.default` points at a host we do not control and have not
 * measured; every read in this product goes through a list we can reorder when
 * one degrades.
 */
export function viemChain(chainId: SupportedChain): Chain {
  const base = chainId === 97 ? bscTestnet : bsc;
  const urls = rpcUrls(chainId);
  return defineChain({
    ...base,
    rpcUrls: { default: { http: urls }, public: { http: urls } },
  });
}
