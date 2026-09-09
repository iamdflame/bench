import type { Address, PublicClient } from "viem";
import { erc20Adapter } from "./erc20";
import { nativeAdapter } from "./native";
import { priceSource, MAX_DEVIATION_BPS } from "./prices";
import { v3PositionAdapter } from "./v3";
import { venusAdapter } from "./venus";
import { masterChefAdapter } from "./masterchef";
import type { Adapter, Part, WalletValuation } from "./types";

export * from "./types";
export { MAX_DEVIATION_BPS, TWAP_WINDOW_SECONDS, bpsBetween, readPoolBoth, priceSource } from "./prices";
export { positionAmounts, getSqrtRatioAtTick } from "./tickmath";
export { POSITION_MANAGER } from "./v3";
export { COMPTROLLER, VBNB } from "./venus";

export function defaultAdapters(client: PublicClient): Adapter[] {
  return [
    nativeAdapter(client),
    erc20Adapter(client),
    v3PositionAdapter(client),
    venusAdapter(client),
    masterChefAdapter(client),
  ];
}

export interface ValuationOptions {
  /** Which price to use. Settlement takes the average and guards deviation. */
  kind?: "execution" | "settlement";
  /** Pin the block. Omitted, the chain head is read once and used throughout. */
  block?: bigint;
  adapters?: (client: PublicClient) => Adapter[];
}

export interface ValuationResult {
  valuation: WalletValuation | null;
  /** Why it refused, when it did. Never a silent zero. */
  refusedBy?: string;
  /** The worst spot-to-average gap seen while pricing, in basis points. */
  maxDeviationBps: bigint;
  /** True when a settlement must not be made from this reading. */
  deviationExceeded: boolean;
  blockNumber: bigint;
}

/**
 * What a wallet is worth, in BNB wei, at one block.
 *
 * Three rules, and every one of them exists because breaking it slashed a real
 * agent on mainnet:
 *
 *   1. An adapter that cannot see clearly returns null, and null propagates.
 *      A total assembled from the adapters that happened to succeed is not a
 *      valuation of the wallet; it is a valuation of the part we understood,
 *      reported as though it were the whole. That reads as a loss.
 *   2. Liabilities subtract. Assets alone make debt repayment look like theft.
 *   3. Every adapter reads the same pinned block. Balances gathered at
 *      different heights are a measurement of nothing.
 */
export async function valueWallet(
  client: PublicClient,
  wallet: Address,
  options: ValuationOptions = {},
): Promise<ValuationResult> {
  const kind = options.kind ?? "execution";
  const blockNumber = options.block ?? (await client.getBlockNumber());
  const prices = await priceSource(client, blockNumber, kind);
  const adapters = (options.adapters ?? defaultAdapters)(client);

  const results = await Promise.all(
    adapters.map(async (a) => ({ id: a.id, value: await a.value(wallet, blockNumber, prices) })),
  );

  const maxDeviationBps = [...prices.deviations.values()].reduce(
    (m, v) => (v > m ? v : m),
    0n,
  );
  const deviationExceeded = kind === "settlement" && maxDeviationBps > MAX_DEVIATION_BPS;

  const refused = results.find((r) => r.value === null);
  if (refused) {
    return {
      valuation: null,
      refusedBy: refused.id,
      maxDeviationBps,
      deviationExceeded,
      blockNumber,
    };
  }

  let assetsWei = 0n;
  let liabilitiesWei = 0n;
  const parts: Part[] = [];
  for (const r of results) {
    assetsWei += r.value!.assetsWei;
    liabilitiesWei += r.value!.liabilitiesWei;
    parts.push(...r.value!.parts);
  }

  return {
    valuation: {
      netWei: assetsWei - liabilitiesWei,
      assetsWei,
      liabilitiesWei,
      parts,
      adapters: adapters.map((a) => a.id),
      blockNumber,
      priceKind: kind,
      at: new Date().toISOString(),
    },
    maxDeviationBps,
    deviationExceeded,
    blockNumber,
  };
}

/**
 * A valuation fit to settle against.
 *
 * Refuses on three counts rather than one: an adapter that could not see, a
 * pool with no usable average, or spot pushed too far from that average. The
 * caller is expected to defer the epoch, not to fall back on something softer.
 */
export async function settlementValuation(
  client: PublicClient,
  wallet: Address,
  block?: bigint,
): Promise<ValuationResult> {
  const result = await valueWallet(client, wallet, { kind: "settlement", block });
  if (result.deviationExceeded) {
    return { ...result, valuation: null, refusedBy: "deviation-guard" };
  }
  return result;
}

/**
 * The shape the attestation pipeline already commits.
 *
 * Bridged rather than replaced, because the `Observation` struct is hashed on
 * chain and its field order is part of a digest two parties have to agree on.
 * The one field that changes meaning is the total: it is now assets minus
 * liabilities, which is what it always should have been.
 */
export interface LegacyValuation {
  bnb: number;
  weiTotal: bigint;
  usd: number;
  parts: { asset: string; amount: number; bnb: number; wei: bigint }[];
  priceUsd: number;
  sqrtPriceX96: bigint;
  blockNumber: bigint;
  at: string;
}

/**
 * A wallet whose debts exceed its assets cannot be committed.
 *
 * The observation commits the total as a `uint96`, which has no room for a
 * negative. Rather than clamping to zero — which would report an insolvent
 * wallet as merely empty, and hand its holder a free floor — this is a
 * refusal, and settlement defers.
 */
export class NegativeNetValue extends Error {
  constructor(readonly netWei: bigint) {
    super(`net value is negative (${netWei}); an insolvent wallet cannot be committed as uint96`);
    this.name = "NegativeNetValue";
  }
}

export function toLegacyValuation(
  valuation: WalletValuation,
  reference: { sqrtPriceX96: bigint; usdPerBnb: number },
): LegacyValuation {
  if (valuation.netWei < 0n) throw new NegativeNetValue(valuation.netWei);
  const bnb = Number(valuation.netWei) / 1e18;
  return {
    bnb,
    weiTotal: valuation.netWei,
    usd: bnb * reference.usdPerBnb,
    parts: valuation.parts.map((p) => ({
      asset: p.kind === "liability" ? `-${p.asset}` : p.asset,
      amount: Number(p.amount) / 10 ** p.decimals,
      bnb: (p.kind === "liability" ? -1 : 1) * (Number(p.bnbWei) / 1e18),
      wei: p.kind === "liability" ? -p.bnbWei : p.bnbWei,
    })),
    priceUsd: reference.usdPerBnb,
    sqrtPriceX96: reference.sqrtPriceX96,
    blockNumber: valuation.blockNumber,
    at: valuation.at,
  };
}
