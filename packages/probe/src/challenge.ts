/**
 * Reading a 402 and deciding whether we could actually pay it.
 *
 * x402 has been through two versions and the field runs both, so the same
 * concept arrives under different field names: `maxAmountRequired` in v1 and
 * `amount` in v2; `network: "base"` in the old string form and
 * `network: "eip155:56"` in CAIP-2; the asset transfer method sometimes at the
 * top level and sometimes inside `extra`. All of it is normalised here, once,
 * so nothing downstream has to guess which dialect it is holding.
 *
 * The decision that matters is `payable`. A challenge is payable when there is
 * at least one accepted route on a chain we hold funds on, in an asset that
 * can actually settle: on BNB Smart Chain the `exact` scheme goes through
 * EIP-3009 `transferWithAuthorization`, and neither BSC USDT nor BSC USDC
 * implements it — checked directly against both contracts, and both are
 * missing `authorizationState` and `DOMAIN_SEPARATOR`. USD1 and $U implement
 * it. So a challenge quoting USDT on BSC is well-formed and unpayable, and the
 * row says exactly that instead of offering a button that cannot work.
 */

import { getAddress, type Address } from "viem";
import { TOKENS, type SupportedChain } from "@bench/shared";

export interface ChallengeRoute {
  scheme: string;
  /** Normalised to a numeric chain id where we recognise the network. */
  chainId: number | null;
  networkRaw: string;
  asset: Address | null;
  assetSymbol: string | null;
  /** Raw token units. Never a float. */
  amount: bigint | null;
  payTo: Address | null;
  maxTimeoutSeconds: number | null;
  /** eip3009 / permit2 / whatever the endpoint named. */
  transferMethod: string | null;
  /** Set when we cannot settle this route, with the reason. */
  unpayableBecause: string | null;
}

export interface Challenge {
  x402Version: number;
  resource: string | null;
  description: string | null;
  routes: ChallengeRoute[];
  /** The route we would actually take, cheapest payable first. */
  best: ChallengeRoute | null;
  payable: boolean;
  /** Why nothing is payable, when nothing is. A sentence, not a code. */
  unpayableReason: string | null;
}

/** CAIP-2 and the older bare names both appear in the wild. */
function toChainId(network: string): number | null {
  const n = network.trim().toLowerCase();
  const caip = n.match(/^eip155:(\d+)$/);
  if (caip?.[1]) return Number(caip[1]);
  if (/^\d+$/.test(n)) return Number(n);
  const named: Record<string, number> = {
    bsc: 56,
    "bsc-mainnet": 56,
    "binance-smart-chain": 56,
    "bsc-testnet": 97,
    base: 8453,
    "base-sepolia": 84532,
    ethereum: 1,
    mainnet: 1,
    polygon: 137,
    avalanche: 43114,
    arbitrum: 42161,
    optimism: 10,
  };
  return named[n] ?? null;
}

function asAddress(v: unknown): Address | null {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(v)) return null;
  try {
    return getAddress(v);
  } catch {
    return null;
  }
}

/**
 * Assets that can settle an `exact` payment on a chain we serve.
 *
 * Keyed by chain then by lowercased address, because this is a membership
 * test against whatever the endpoint quoted.
 */
function settleableAssets(chainId: SupportedChain): Map<string, string> {
  const t = TOKENS[chainId];
  const m = new Map<string, string>();
  if (t.USD1) m.set(t.USD1.address.toLowerCase(), t.USD1.symbol);
  if (t.U) m.set(t.U.address.toLowerCase(), t.U.symbol);
  return m;
}

const NOT_EIP3009 = new Set(
  [TOKENS[56].USDT.address, TOKENS[56].USDC.address, TOKENS[97].USDT.address, TOKENS[97].USDC.address].map((a) =>
    a.toLowerCase(),
  ),
);

/**
 * Parse a 402 body into routes, and judge each one.
 *
 * Returns null only when the body is not an x402 challenge at all — an empty
 * `accepts` array is a challenge that offers nothing, which is a different
 * finding and is reported as such.
 */
export function parseChallenge(body: string, ourChain: SupportedChain): Challenge | null {
  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const accepts = o.accepts;
  if (!Array.isArray(accepts)) return null;

  const settleable = settleableAssets(ourChain);

  const routes: ChallengeRoute[] = accepts.map((raw) => {
    const a = (raw ?? {}) as Record<string, unknown>;
    const extra = (a.extra ?? {}) as Record<string, unknown>;
    const networkRaw = typeof a.network === "string" ? a.network : "";
    const chainId = toChainId(networkRaw);
    const asset = asAddress(a.asset);
    const amountRaw = a.maxAmountRequired ?? a.amount;
    let amount: bigint | null = null;
    try {
      amount = typeof amountRaw === "string" || typeof amountRaw === "number" ? BigInt(amountRaw) : null;
    } catch {
      amount = null;
    }
    const transferMethod =
      (typeof extra.assetTransferMethod === "string" ? extra.assetTransferMethod : null) ??
      (typeof a.scheme === "string" && a.scheme === "eip3009" ? "eip3009" : null);

    let unpayableBecause: string | null = null;
    if (chainId === null) {
      unpayableBecause = `It quotes a network we do not recognise (${networkRaw || "unnamed"}).`;
    } else if (chainId !== ourChain) {
      unpayableBecause = `It wants payment on chain ${chainId}, and this marketplace settles on ${ourChain}.`;
    } else if (!asset) {
      unpayableBecause = "It names no asset address to pay in.";
    } else if (NOT_EIP3009.has(asset.toLowerCase())) {
      unpayableBecause =
        "It asks for a BSC stablecoin that does not implement EIP-3009, so an x402 exact payment cannot settle in it.";
    } else if (!settleable.has(asset.toLowerCase())) {
      unpayableBecause = "It asks for an asset this marketplace does not hold.";
    } else if (amount === null || amount <= 0n) {
      unpayableBecause = "It states no amount to pay.";
    } else if (!asAddress(a.payTo)) {
      unpayableBecause = "It names no address to pay.";
    }

    return {
      scheme: typeof a.scheme === "string" ? a.scheme : "unknown",
      chainId,
      networkRaw,
      asset,
      assetSymbol: asset ? (settleable.get(asset.toLowerCase()) ?? null) : null,
      amount,
      payTo: asAddress(a.payTo),
      maxTimeoutSeconds: typeof a.maxTimeoutSeconds === "number" ? a.maxTimeoutSeconds : null,
      transferMethod,
      unpayableBecause,
    };
  });

  const payables = routes.filter((r) => r.unpayableBecause === null && r.amount !== null);
  payables.sort((a, b) => (a.amount! < b.amount! ? -1 : a.amount! > b.amount! ? 1 : 0));
  const best = payables[0] ?? null;

  const resourceObj = o.resource;
  const resource =
    typeof resourceObj === "string"
      ? resourceObj
      : resourceObj && typeof resourceObj === "object" && typeof (resourceObj as { url?: unknown }).url === "string"
        ? ((resourceObj as { url: string }).url)
        : null;

  return {
    x402Version: typeof o.x402Version === "number" ? o.x402Version : 1,
    resource,
    description:
      typeof o.description === "string"
        ? o.description
        : resourceObj && typeof resourceObj === "object" && typeof (resourceObj as { description?: unknown }).description === "string"
          ? ((resourceObj as { description: string }).description)
          : null,
    routes,
    best,
    payable: best !== null,
    unpayableReason:
      best !== null
        ? null
        : routes.length === 0
          ? "It returned a payment challenge that offers no way to pay it."
          : (routes[0]!.unpayableBecause ?? "None of the routes it offers can be settled from here."),
  };
}

/**
 * Does the live challenge match what an index advertised?
 *
 * Returns a sentence when it does not, which is often: entries listing USD1 on
 * chain 56 whose endpoint asks for USDC on Base were the first disagreement
 * found, in the first forty sampled. The listing is the merchant's claim; this
 * is what the endpoint actually said; and a marketplace that renders the first
 * is selling something it never checked.
 */
export function compareAdvertised(
  advertised: { network: string; asset: Address }[],
  live: Challenge,
): string | null {
  if (advertised.length === 0 || live.routes.length === 0) return null;
  const advKey = new Set(
    advertised.map((a) => `${toChainId(a.network) ?? a.network}:${a.asset.toLowerCase()}`),
  );
  const liveKeys = live.routes.map((r) => `${r.chainId ?? r.networkRaw}:${r.asset?.toLowerCase() ?? "none"}`);
  if (liveKeys.some((k) => advKey.has(k))) return null;
  const liveDesc = live.routes
    .map((r) => `${r.assetSymbol ?? r.asset?.slice(0, 8) ?? "an unnamed asset"} on chain ${r.chainId ?? r.networkRaw}`)
    .join(", ");
  const advDesc = advertised.map((a) => `chain ${toChainId(a.network) ?? a.network}`).join(", ");
  return `The B402 listing advertises payment on ${advDesc}; the endpoint actually asks for ${liveDesc}.`;
}
