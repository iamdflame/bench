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
 *   x402 v2  `{ x402Version: 2, accepts: [{ scheme, amount, network:
 *              "eip155:56", extra: { assetTransferMethod } }] }`, often in a
 *              base64 `PAYMENT-REQUIRED` header, paid with `PAYMENT-SIGNATURE`.
 *
 * Both are parsed by the same reader the paying client uses (`./pay`), so a
 * price the site calls payable is one the client can actually pay, and a
 * price it calls unpayable carries the exact reason.
 */

import { readCapped, readRequirements, whyUnpayable, type TransferMethod } from "./pay";

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
  /** How the payment moves: EIP-3009 by signature, or Permit2 for tokens without it. */
  transferMethod: TransferMethod | null;
  /**
   * Whether this marketplace can actually settle it: BNB Smart Chain, a token
   * it pays in, and a transfer method it signs. Reading a price we cannot pay
   * is still worth doing.
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

const HUMAN = (amount: string, decimals: number): string => {
  const v = BigInt(amount);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
};

export const humanAmount = HUMAN;

/**
 * Parses a 402 into a quote, or null when it is not one we understand.
 *
 * Why we cannot settle is said precisely. The interesting case is BNB Smart
 * Chain's USDT: it has neither `DOMAIN_SEPARATOR` nor
 * `transferWithAuthorization`, so nobody can pay it by EIP-3009. It can be
 * paid by Permit2, though, and a seller that offers Permit2 for USDT is
 * payable. That distinction used to be collapsed into "USDT cannot be paid",
 * which was true of our client and false of the seller.
 */
export function parseChallenge(endpoint: string, body: unknown, paymentRequiredHeader?: string | null): Quote | null {
  const offers = readRequirements(body, paymentRequiredHeader);
  if (!offers.length) return null;
  // The offer we can pay if there is one; otherwise the first, so the price
  // is still shown with the reason under it.
  const offer = offers.find((o) => !whyUnpayable(o)) ?? offers[0];
  const extra = (offer.raw.extra ?? {}) as { name?: string; decimals?: number };
  /*
    Decimals, and why guessing eighteen is not good enough. Servers are not
    obliged to state them. Defaulting to eighteen turned USDC's 200000 into
    "0.00", a price of nothing next to a button that charges. Known tokens are
    looked up; an unknown one keeps eighteen, shown with its asset name.
  */
  const decimals = Number(extra.decimals ?? KNOWN_DECIMALS[offer.asset.toLowerCase()] ?? 18);
  const reason = whyUnpayable(offer);
  return {
    endpoint,
    amount: offer.amount.toString(),
    decimals,
    asset: offer.asset,
    assetName: extra.name ?? null,
    network: offer.network,
    chainId: offer.chainId,
    payTo: offer.payTo,
    scheme: offer.scheme,
    description: (offer.raw.description as string | undefined) ?? offer.resource?.description ?? null,
    resource: offer.resource?.url ?? null,
    x402Version: offer.x402Version,
    header: offer.header,
    transferMethod: offer.method,
    payable: reason === null,
    unpayable: reason,
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
    const { text } = await readCapped(res);
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return parseChallenge(endpoint, body, res.headers.get("payment-required"));
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
    const { text } = await readCapped(res);
    const body = JSON.parse(text) as Record<string, unknown>;
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
