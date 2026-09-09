import type { Address } from "viem";

/**
 * One line of a valuation.
 *
 * Every part names the adapter that produced it, so a total can always be
 * decomposed back into the reads that made it. An attestation carries the
 * parts as well as the sum, because a number nobody can take apart is a claim.
 */
export interface Part {
  adapter: string;
  asset: string;
  /** Raw amount in the asset's own decimals, exactly as the chain returned it. */
  amount: bigint;
  decimals: number;
  /** What that amount is worth, in BNB wei. Always non-negative. */
  bnbWei: bigint;
  /** Liabilities are held separately and subtracted; they are never negative assets. */
  kind: "asset" | "liability";
  detail?: string;
}

export interface AdapterValue {
  assetsWei: bigint;
  liabilitiesWei: bigint;
  parts: Part[];
}

/**
 * Prices, pinned to a block and to a purpose.
 *
 * `kind` is load-bearing. Execution prices come from spot, because spot is
 * what the router will actually trade against. Settlement prices come from a
 * TWAP, because spot is the canonical manipulation vector and a settlement
 * that can be pushed is a settlement anyone can force against a competitor.
 * Mixing them up is the difference between a market and a trap.
 */
export interface PriceSource {
  readonly block: bigint;
  readonly kind: "execution" | "settlement";
  /**
   * BNB wei per one whole unit of `token`.
   *
   * Returns null when the token cannot be priced. A caller that turns that
   * into a zero has silently valued an asset at nothing, which is how an
   * agent gets slashed for holding something the gauge does not recognise.
   */
  bnbWeiPerUnit(token: Address): Promise<bigint | null>;
}

export interface Adapter {
  id: string;
  /**
   * What this adapter can see of `wallet` at `block`.
   *
   * Returns null when it cannot see clearly — an unknown token, a call that
   * reverted, a market it could not enumerate. Null propagates: the whole
   * valuation refuses rather than reporting a partial total as if it were
   * complete.
   */
  value(wallet: Address, block: bigint, prices: PriceSource): Promise<AdapterValue | null>;
}

export interface WalletValuation {
  /** Assets minus liabilities, in BNB wei. Can be negative for an underwater wallet. */
  netWei: bigint;
  assetsWei: bigint;
  liabilitiesWei: bigint;
  parts: Part[];
  adapters: string[];
  blockNumber: bigint;
  priceKind: "execution" | "settlement";
  at: string;
}

/** Why a valuation refused. Carried so a caller can say more than "failed". */
export class ValuationRefused extends Error {
  constructor(
    readonly adapter: string,
    readonly why: string,
  ) {
    super(`${adapter}: ${why}`);
    this.name = "ValuationRefused";
  }
}
