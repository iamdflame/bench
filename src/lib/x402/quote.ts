/**
 * What an agent actually charges, read from its own 402.
 *
 * The site has been saying "says it charges per call" on the strength of a
 * boolean in the agent's registry card. That is a claim, and this project's
 * whole argument is that a claim is not a price. This asks the endpoint,
 * unpaid, and reads the number it answers with.
 *
 * Two protocol versions are in the wild and they disagree about names:
 *
 *   x402 v1  `{ x402Version: 1, accepts: [{ scheme: "exact", maxAmountRequired,
 *              network: "bsc", asset, payTo }] }`, paid with an `X-PAYMENT`
 *              header.
 *   x402 v2  `{ x402Version: 2, accepts: [{ scheme: "eip3009", amount,
 *              network: "eip155:56", ... }] }`, and the resource may name a
 *              different URL from the one that answered.
 *
 * Both are parsed. Whether we can *pay* one is a separate question from
 * whether we can *read* it, and the two are reported separately, because a
 * button that fails is worse than a price with an honest note under it.
 */

import { USD1 } from "./index";

export interface Quote {
  /** The URL that answered with a price. */
  endpoint: string;
  /** Atomic units, as a decimal string. */
  amount: string;
  decimals: number;
  asset: string;
  assetName: string | null;
  /** CAIP-2 or the loose name the server used. */
  network: string;
  chainId: number | null;
  payTo: string;
  scheme: string;
  description: string | null;
  /** The resource the challenge says payment buys, when it names one. */
  resource: string | null;
  x402Version: number;
  /** The header the server wants the signed payment in. */
  header: "X-PAYMENT" | "PAYMENT-SIGNATURE";
  /**
   * Whether this wallet could actually settle it: BNB Smart Chain, USD1, and
   * an EIP-3009 scheme we already sign, carried in the header we know how to
   * build. Reading a price we cannot pay is still worth doing.
   */
  payable: boolean;
  /** Why not, when not. */
  unpayable: string | null;
}

/** Decimals for tokens whose servers do not say. Read from chain, not guessed. */
const KNOWN_DECIMALS: Record<string, number> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6, // USDC, Base
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6, // USDC, Ethereum
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": 18, // USDC, BSC
  "0x55d398326f99059ff775485246999027b3197955": 18, // USDT, BSC
  "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": 18, // USD1, BSC
  "0xce24439f2d9c6a2289f741120fe202248b666666": 18, // U, BSC
};

/**
 * Tokens on BNB Smart Chain that cannot carry an EIP-3009 payment.
 *
 * Verified by calling the token, not assumed: `DOMAIN_SEPARATOR()` and
 * `transferWithAuthorization(...)` both revert on BSC USDT, while USD1 answers
 * with a real separator.
 */
const NO_EIP3009: Record<string, string> = {
  "0x55d398326f99059ff775485246999027b3197955":
    "it prices in USDT, and BNB Smart Chain's USDT has no transferWithAuthorization, so an EIP-3009 payment in it cannot be signed by anyone",
};

const HUMAN = (amount: string, decimals: number): string => {
  const v = BigInt(amount);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
};

export const humanAmount = HUMAN;

function chainOf(network: string): number | null {
  const caip = /^eip155:(\d+)$/.exec(network);
  if (caip) return Number(caip[1]);
  if (/^(bsc|bnb|binance)/i.test(network)) return 56;
  if (/^base/i.test(network)) return 8453;
  return null;
}

/** Parses a 402 body into a quote, or null when it is not one we understand. */
export function parseChallenge(
  endpoint: string,
  body: unknown,
  headerHint?: string,
): Quote | null {
  const b = body as {
    x402Version?: number;
    accepts?: Record<string, unknown>[];
    error?: string;
  } | null;
  const first = b?.accepts?.[0];
  if (!first) return null;

  const amount = String(first.maxAmountRequired ?? first.amount ?? "");
  if (!amount || !/^\d+$/.test(amount)) return null;

    const extra = (first.extra ?? {}) as { name?: string; decimals?: number };
  const asset0 = String(first.asset ?? "");
  /*
    Decimals, and why guessing eighteen is not good enough.

    Servers are not obliged to state them. Defaulting to eighteen turned
    USDC's 200000 into "0.00", which is a price of nothing next to a button
    that charges. Known tokens are looked up; an unknown one keeps the
    eighteen-decimal default because that is what almost every BSC token uses,
    and the figure is shown with its asset name so a reader can tell.
  */
  const decimals = Number(extra.decimals ?? KNOWN_DECIMALS[asset0.toLowerCase()] ?? 18);
  const network = String(first.network ?? "");
  const chainId = chainOf(network);
  const asset = asset0;
  const scheme = String(first.scheme ?? "");
  const version = Number(b?.x402Version ?? 1);

  // The server tells us which header it wants, either by saying so in its
  // error or by speaking v1, which only ever used X-PAYMENT.
  const wantsSignature =
    /PAYMENT-SIGNATURE/i.test(String(b?.error ?? "")) || /PAYMENT-SIGNATURE/i.test(headerHint ?? "");
  const header: Quote["header"] = wantsSignature ? "PAYMENT-SIGNATURE" : "X-PAYMENT";

  /*
    Why we cannot settle, said precisely.

    "We do not hold that token" is the lazy answer and it is often false. The
    interesting case is BNB Smart Chain's USDT: it has neither
    `DOMAIN_SEPARATOR` nor `transferWithAuthorization` — both revert, checked
    against the token itself — so no amount of holding it makes an EIP-3009
    payment possible. An agent pricing in USDT over that scheme has to settle
    some other way, and saying that is more useful to its operator than saying
    we are short of funds.
  */
  const reasons: string[] = [];
  if (chainId !== 56) reasons.push(`it settles on ${network}, not BNB Smart Chain`);
  else if (NO_EIP3009[asset.toLowerCase()]) reasons.push(NO_EIP3009[asset.toLowerCase()]!);
  else if (asset.toLowerCase() !== USD1.toLowerCase()) {
    reasons.push(`it prices in ${extra.name ?? "a token"} and this wallet settles in USD1`);
  }
  if (!/^(exact|eip3009)$/i.test(scheme)) reasons.push(`its "${scheme}" scheme is one we do not sign`);
  if (header !== "X-PAYMENT") {
    reasons.push(
      "it wants the payment in a PAYMENT-SIGNATURE header whose envelope it does not publish",
    );
  }

  return {
    endpoint,
    amount,
    decimals,
    asset,
    assetName: extra.name ?? null,
    network,
    chainId,
    payTo: String(first.payTo ?? ""),
    scheme,
    description: (first.description as string) ?? null,
    resource: (first.resource as string) ?? null,
    x402Version: version,
    header,
    payable: reasons.length === 0,
    unpayable: reasons.length ? reasons.join("; ") : null,
  };
}

/** Ask an endpoint, unpaid, and read the price it names. */
export async function readQuote(endpoint: string, timeoutMs = 8_000): Promise<Quote | null> {
  try {
    const res = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status !== 402) return null;
    const body = await res.json().catch(() => null);
    return parseChallenge(endpoint, body, res.headers.get("payment-required") ?? undefined);
  } catch {
    return null;
  }
}

export interface Preview {
  agent: string | null;
  summary: string | null;
  human: string | null;
  inputs: { name: string; description?: string; required?: boolean }[];
  raw: unknown;
}

/**
 * The free half of the transaction, where an agent offers one.
 *
 * Some agents serve a preview describing exactly what a paid call returns, for
 * nothing. It is the most honest thing a paid endpoint can do and it lets a
 * buyer read the goods before they sign, so where it exists the site shows it.
 */
export async function readPreview(endpoint: string, timeoutMs = 8_000): Promise<Preview | null> {
  const url = endpoint.includes("?") ? `${endpoint}&preview=1` : `${endpoint}?preview=1`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object" || "accepts" in body) return null;
    const price = (body.price ?? {}) as { human?: string };
    return {
      agent: (body.agent as string) ?? null,
      summary: (body.summary as string) ?? null,
      human: price.human ?? null,
      inputs: Array.isArray(body.inputs) ? (body.inputs as Preview["inputs"]) : [],
      raw: body,
    };
  } catch {
    return null;
  }
}
