/**
 * x402 / b402 — selling access for money, over HTTP.
 *
 * A mandate is a heavy way to buy something. It needs a bond, a term, an
 * adjudicator and a principal willing to escrow capital. Most of what this
 * marketplace knows is worth far less than that ceremony: what an agent's
 * assay says, what a strategy would do right now. x402 is the light path —
 * a request, a 402, a signed payment, an answer.
 *
 * **The asset is not USDT.** x402's `exact` scheme settles with EIP-3009
 * `transferWithAuthorization`, and neither BSC USDT nor BSC USDC implements
 * it — checked directly: both are missing `authorizationState` and
 * `DOMAIN_SEPARATOR`. USD1 does, and its EIP-712 domain was confirmed by
 * recomputing the separator and matching it against the one the contract
 * returns. Pricing this rail in USDT would have produced a challenge no
 * client could ever satisfy.
 */

import {
  encodeFunctionData,
  keccak256,
  parseAbi,
  recoverTypedDataAddress,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";

/** World Liberty Financial USD — the EIP-3009 stablecoin on BSC. */
export const USD1 = "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d" as const;
export const USD1_DECIMALS = 18;

export const EIP3009_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
]);

/** Confirmed against the contract's own DOMAIN_SEPARATOR, not assumed. */
export const USD1_DOMAIN = {
  name: "World Liberty Financial USD",
  version: "1",
  chainId: 56,
  verifyingContract: USD1 as Address,
} as const;

export const TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface PaymentRequirement {
  scheme: "exact";
  /** CAIP-2. */
  network: string;
  asset: string;
  payTo: string;
  /** Atomic units. */
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string; transferMethod: "eip3009" };
}

export interface Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

export interface PaymentPayload {
  x402Version: 1;
  scheme: "exact";
  network: string;
  payload: { signature: Hex; authorization: Authorization };
}

const payTo = (): Address =>
  (process.env.X402_PAY_TO ?? process.env.AGENT_A_ADDR ?? "0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90") as Address;

/** The body of a 402, in the shape an x402 client expects. */
export function challenge(opts: {
  resource: string;
  description: string;
  priceAtomic: bigint;
}): { x402Version: 1; error: string; accepts: PaymentRequirement[] } {
  return {
    x402Version: 1,
    error: "payment required",
    accepts: [
      {
        scheme: "exact",
        network: `eip155:${marketChain.id}`,
        asset: USD1,
        payTo: payTo(),
        maxAmountRequired: opts.priceAtomic.toString(),
        resource: opts.resource,
        description: opts.description,
        mimeType: "application/json",
        maxTimeoutSeconds: 120,
        extra: {
          name: USD1_DOMAIN.name,
          version: USD1_DOMAIN.version,
          transferMethod: "eip3009",
        },
      },
    ],
  };
}

export interface Verified {
  ok: true;
  authorization: Authorization;
  payer: Address;
}
export interface Rejected {
  ok: false;
  reason: string;
}

/**
 * Checks a payment before doing any work for it.
 *
 * Every guard here fails closed. A payment that cannot be checked is not a
 * payment, and serving the resource anyway is how a paid endpoint becomes a
 * free one with extra steps.
 */
export async function verifyPayment(
  header: string | null,
  expect: { priceAtomic: bigint },
): Promise<Verified | Rejected> {
  if (!header) return { ok: false, reason: "no X-PAYMENT header" };

  let payload: PaymentPayload;
  try {
    payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as PaymentPayload;
  } catch {
    return { ok: false, reason: "X-PAYMENT is not base64 JSON" };
  }

  const a = payload?.payload?.authorization;
  const sig = payload?.payload?.signature;
  if (!a || !sig) return { ok: false, reason: "payload is missing the authorization or signature" };

  if (a.to.toLowerCase() !== payTo().toLowerCase()) {
    return { ok: false, reason: `pays ${a.to}, not ${payTo()}` };
  }
  if (BigInt(a.value) < expect.priceAtomic) {
    return { ok: false, reason: `offers ${a.value}, the price is ${expect.priceAtomic}` };
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (BigInt(a.validAfter) > now) return { ok: false, reason: "authorization is not yet valid" };
  if (BigInt(a.validBefore) <= now) return { ok: false, reason: "authorization has expired" };

  let payer: Address;
  try {
    payer = await recoverTypedDataAddress({
      domain: USD1_DOMAIN,
      types: TRANSFER_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: a.from,
        to: a.to,
        value: BigInt(a.value),
        validAfter: BigInt(a.validAfter),
        validBefore: BigInt(a.validBefore),
        nonce: a.nonce,
      },
      signature: sig,
    });
  } catch (e) {
    return { ok: false, reason: `signature does not recover: ${String(e).slice(0, 90)}` };
  }
  if (payer.toLowerCase() !== a.from.toLowerCase()) {
    return { ok: false, reason: `signed by ${payer}, claims to be ${a.from}` };
  }

  // A nonce already used on chain is a replay, not a payment.
  try {
    const used = (await marketClient.readContract({
      address: USD1,
      abi: EIP3009_ABI,
      functionName: "authorizationState",
      args: [a.from, a.nonce],
    })) as boolean;
    if (used) return { ok: false, reason: "this authorization has already been used" };
  } catch {
    return { ok: false, reason: "could not check the authorization against the chain" };
  }

  return { ok: true, authorization: a, payer };
}

/**
 * Settles a verified payment on chain.
 *
 * The seller submits, so the buyer needs no BNB at all — which is the point of
 * the scheme, and the reason this is a genuinely low-friction path next to a
 * bonded mandate.
 */
export async function settle(a: Authorization, signature: Hex): Promise<Hex> {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("no key to settle with");
  const wallet = walletFor((key.startsWith("0x") ? key : `0x${key}`) as Hex);

  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  let v = parseInt(signature.slice(130, 132), 16);
  if (v < 27) v += 27;

  return wallet.writeContract({
    address: USD1,
    abi: EIP3009_ABI,
    functionName: "transferWithAuthorization",
    args: [
      a.from,
      a.to,
      BigInt(a.value),
      BigInt(a.validAfter),
      BigInt(a.validBefore),
      a.nonce,
      v,
      r,
      s,
    ],
    chain: marketChain,
    account: wallet.account!,
  });
}

export const priceOf = (usd1: string) =>
  BigInt(Math.round(Number(usd1) * 10 ** USD1_DECIMALS));

export { encodeFunctionData, keccak256, toHex };
