/**
 * Rail 1 — Call. A cent, an answer, and nothing handed over.
 *
 * The cheapest possible real transaction between a stranger and an agent they
 * have never met: a request, a 402, a signed authorization, an answer. No key
 * changes hands, no funds are escrowed, no authority is granted. If the agent
 * is useless the buyer is out one cent, which is the correct price of finding
 * that out.
 *
 * It matters disproportionately for a marketplace, for a reason that has
 * nothing to do with the money. It is the only rail with real third-party
 * supply on BNB Smart Chain today: Binance's B402 Bazaar lists hundreds of
 * paid endpoints on chain 56, none of which we operate, and most of which
 * answer a live challenge when called. A marketplace whose first honest
 * transaction is against somebody else's agent is a marketplace. One whose
 * cheapest path leads back to its own four agents is a portfolio.
 *
 * ---------------------------------------------------------------------------
 * Why USD1 and $U, and not the stablecoin everyone holds
 * ---------------------------------------------------------------------------
 *
 * x402's `exact` scheme settles through EIP-3009 `transferWithAuthorization`.
 * Neither BSC USDT nor BSC USDC implements it — checked against both
 * contracts, both missing `authorizationState` and `DOMAIN_SEPARATOR`. Quoting
 * this rail in USDT would produce a challenge no client could ever satisfy. So
 * the payable assets are USD1 and $U, and a challenge asking for anything else
 * on this chain is reported as unpayable with that reason rather than as a
 * broken agent.
 *
 * The buyer never needs BNB. They sign an authorization; the seller's
 * facilitator submits the transfer. Hiring here does not require holding the
 * chain's gas token at all.
 */

import {
  encodeXPaymentHeader,
  buildEip3009TypedData,
  normalizeResource,
  type X402Requirement,
  type X402PaymentPayload,
} from "@altananetwork/sdk";
import { toHex, type Account, type Address, type Hex, type WalletClient } from "viem";
import { safeFetch, viemChain, type SupportedChain } from "@bench/shared";
import type { Challenge, ChallengeRoute } from "@bench/probe";

const randomNonce = (): Hex => {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return toHex(b);
};

export interface PaidCallResult {
  ok: boolean;
  /** The endpoint's answer once paid. Returned to the buyer verbatim. */
  body: string | null;
  status: number | null;
  /** What the payment cost, in the asset it settled in. */
  paid: { amount: bigint; asset: Address; symbol: string | null } | null;
  /** The settlement receipt the seller returned, when it returned one. */
  settlement: string | null;
  latencyMs: number;
  /** The failed condition, when it failed. Never "something went wrong". */
  refusedBecause: string | null;
}

/**
 * Turn our parsed challenge back into the SDK's requirement shape.
 *
 * The `extra.name` and `extra.version` are the token's EIP-712 domain and the
 * signature is worthless without them, so a route missing either is refused
 * here rather than producing a signature the facilitator will silently reject.
 */
function toRequirement(challenge: Challenge, route: ChallengeRoute, resourceUrl: string): X402Requirement | null {
  if (!route.asset || !route.payTo || route.amount === null) return null;
  return {
    scheme: route.scheme,
    network: route.networkRaw,
    asset: route.asset,
    amount: route.amount.toString(),
    maxAmountRequired: route.amount.toString(),
    payTo: route.payTo,
    ...(route.maxTimeoutSeconds === null ? {} : { maxTimeoutSeconds: route.maxTimeoutSeconds }),
    x402Version: challenge.x402Version,
    resource: challenge.resource ?? resourceUrl,
    extra: {},
  } as X402Requirement;
}

/**
 * The token's EIP-712 domain, read from the token rather than assumed.
 *
 * A challenge is supposed to carry `extra.name` and `extra.version`, and many
 * do not. Recomputing them from the contract is one call and removes a whole
 * class of "the signature does not recover" failures that look like our bug
 * and are the merchant's omission.
 */
export async function tokenDomain(
  chainId: SupportedChain,
  token: Address,
): Promise<{ name: string; version: string } | null> {
  const { chainClient, EIP3009_ABI } = await import("@bench/shared");
  const client = chainClient(chainId);
  try {
    const [name, version] = await Promise.all([
      client.readContract({ address: token, abi: EIP3009_ABI, functionName: "name" }),
      client
        .readContract({ address: token, abi: EIP3009_ABI, functionName: "version" })
        .catch(() => "1"),
    ]);
    return { name: name as string, version: (version as string) ?? "1" };
  } catch {
    return null;
  }
}

/**
 * Pay a challenge from an ordinary account and return what the endpoint said.
 *
 * The envelope mirrors the one Altana's SDK builds for a session, field for
 * field, including echoing the chosen requirement as `accepted` and the
 * resource descriptor — B402 merchants reject an envelope without either, and
 * they reject it with a message about our payload rather than about their
 * requirement, which costs an hour to diagnose the first time.
 */
/**
 * Everything up to the signature, and nothing after it.
 *
 * The split exists because the buyer is not always in this process. When a
 * visitor pays from their own wallet, the typed data has to be built on the
 * server — `tokenDomain` is an RPC read and the challenge parser lives here —
 * carried to the browser, signed there, and carried back. Doing that with one
 * monolithic `payAndCall` would mean either shipping the challenge parser to
 * the client or trusting the client's idea of what it is paying for, and the
 * second of those is how a marketplace signs its users into a transfer they
 * did not agree to.
 *
 * So this returns the exact EIP-712 document and the exact authorization it
 * commits to. What the user's wallet displays and what the facilitator settles
 * are constructed once, here, from the same values.
 */
export interface PreparedPayment {
  /** The EIP-712 document to sign. Handed to the wallet verbatim. */
  typed: unknown;
  /** The authorization the signature commits to, in wire form. */
  authorization: {
    from: Address;
    to: Address;
    value: string;
    validAfter: "0";
    validBefore: string;
    nonce: Hex;
  };
  /** The envelope, complete except for `payload.signature`. */
  envelope: Omit<X402PaymentPayload, "payload">;
  /** What this will cost, for the confirmation the user reads before signing. */
  cost: { amount: bigint; asset: Address; symbol: string | null };
}

export type Prepared = { ok: true; prepared: PreparedPayment } | { ok: false; refusedBecause: string };

export async function preparePayment(input: {
  chainId: SupportedChain;
  url: string;
  challenge: Challenge;
  /** Who pays. An address is enough; no key is needed to build the document. */
  from: Address;
  maxAmount: bigint;
}): Promise<Prepared> {
  const no = (refusedBecause: string): Prepared => ({ ok: false, refusedBecause });

  const route = input.challenge.best;
  if (!route) return no(input.challenge.unpayableReason ?? "This challenge offers no route we can settle.");
  if (route.amount === null || !route.asset || !route.payTo) return no("The challenge is missing an amount or a payee.");
  if (route.amount > input.maxAmount) {
    return no("It asks for more than the per-call ceiling this marketplace will spend without you raising it.");
  }

  const req = toRequirement(input.challenge, route, input.url);
  if (!req) return no("The challenge could not be turned into a payable requirement.");

  const domain = await tokenDomain(input.chainId, route.asset);
  if (!domain) return no("The token's EIP-712 domain could not be read, so no valid authorization can be signed.");

  const now = Math.floor(Date.now() / 1000);
  const validBefore = BigInt(now + (route.maxTimeoutSeconds ?? 300));
  const nonce = randomNonce();

  const typed = buildEip3009TypedData({
    chainId: input.chainId,
    token: route.asset,
    name: domain.name,
    version: domain.version,
    from: input.from,
    to: route.payTo,
    value: route.amount,
    validAfter: 0n,
    validBefore,
    nonce,
  });

  /*
    `accepted` must mirror the challenge's requirement verbatim, so our own
    transport-only fields are stripped rather than echoed. A facilitator
    matching this against its config will not recognise a requirement we
    decorated.
  */
  const accepted: Record<string, unknown> = { ...(req as unknown as Record<string, unknown>) };
  delete accepted.x402Version;
  delete accepted.resource;
  delete accepted.mimeType;
  const resource = normalizeResource(req.resource, input.url);

  return {
    ok: true,
    prepared: {
      typed,
      authorization: {
        from: input.from,
        to: route.payTo,
        value: route.amount.toString(),
        validAfter: "0",
        validBefore: validBefore.toString(),
        nonce,
      },
      envelope: {
        x402Version: input.challenge.x402Version,
        scheme: req.scheme,
        network: req.network,
        accepted: accepted as X402Requirement,
        ...(resource ? { resource } : {}),
      } as Omit<X402PaymentPayload, "payload">,
      cost: { amount: route.amount, asset: route.asset, symbol: route.assetSymbol },
    },
  };
}

/**
 * The second half: attach a signature and call the endpoint.
 *
 * Kept server-side even when the signature came from a browser. The endpoint is
 * somebody else's host and will not carry CORS headers for us, so a fetch from
 * the page would fail for a reason that has nothing to do with the payment.
 */
export async function deliverPayment(input: {
  url: string;
  prepared: PreparedPayment;
  signature: Hex;
  method?: string;
  body?: string;
  timeoutMs?: number;
}): Promise<PaidCallResult> {
  const started = Date.now();
  const payload: X402PaymentPayload = {
    ...input.prepared.envelope,
    payload: { signature: input.signature, authorization: input.prepared.authorization },
  } as X402PaymentPayload;

  const res = await safeFetch(input.url, {
    method: input.method ?? "GET",
    headers: { "X-PAYMENT": encodeXPaymentHeader(payload), "content-type": "application/json" },
    ...(input.body === undefined ? {} : { body: input.body }),
    timeoutMs: input.timeoutMs ?? 30_000,
    maxBytes: 512 * 1024,
  });

  const fail = (why: string): PaidCallResult => ({
    ok: false,
    body: null,
    status: null,
    paid: null,
    settlement: null,
    latencyMs: Date.now() - started,
    refusedBecause: why,
  });

  if (!res.ok) return fail(res.detail);
  if (res.status === 402) {
    return {
      ...fail("The payment was submitted and the endpoint asked for payment again, so it did not accept it."),
      status: 402,
      body: res.body.slice(0, 2_000),
    };
  }
  if (res.status >= 400) {
    return { ...fail(`The endpoint answered ${res.status} after payment.`), status: res.status, body: res.body.slice(0, 2_000) };
  }

  return {
    ok: true,
    body: res.body,
    status: res.status,
    paid: input.prepared.cost,
    settlement: res.headers["x-payment-response"] ?? null,
    latencyMs: Date.now() - started,
    refusedBecause: null,
  };
}

export async function payAndCall(input: {
  chainId: SupportedChain;
  url: string;
  challenge: Challenge;
  account: Account;
  walletClient?: WalletClient;
  /** Refuse to spend more than this, whatever the challenge asks. */
  maxAmount: bigint;
  method?: string;
  body?: string;
  timeoutMs?: number;
}): Promise<PaidCallResult> {
  const started = Date.now();
  const fail = (why: string): PaidCallResult => ({
    ok: false,
    body: null,
    status: null,
    paid: null,
    settlement: null,
    latencyMs: Date.now() - started,
    refusedBecause: why,
  });

  const prep = await preparePayment({
    chainId: input.chainId,
    url: input.url,
    challenge: input.challenge,
    from: input.account.address,
    maxAmount: input.maxAmount,
  });
  if (!prep.ok) return fail(prep.refusedBecause);
  const { typed } = prep.prepared;

  let signature: Hex;
  try {
    if (input.account.signTypedData) {
      signature = await input.account.signTypedData(typed as never);
    } else if (input.walletClient) {
      signature = await input.walletClient.signTypedData({
        ...(typed as Record<string, unknown>),
        account: input.account,
        chain: viemChain(input.chainId),
      } as never);
    } else {
      return fail("No signer was available to authorise the payment.");
    }
  } catch (e) {
    return fail(`The payment authorization could not be signed: ${String(e).slice(0, 120)}`);
  }

  return deliverPayment({
    url: input.url,
    prepared: prep.prepared,
    signature,
    method: input.method,
    body: input.body,
    timeoutMs: input.timeoutMs,
  });
}
