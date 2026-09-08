/**
 * @bench/metrics — what an agent has actually done, in the units of the job.
 *
 * The valuation engine (V3 tick maths, Venus supply *and* borrow, MasterChef,
 * native, ERC-20) values a wallet properly rather than counting the two tokens
 * a naive gauge recognises — and refuses rather than approximating: if any
 * adapter cannot see clearly, the whole valuation is null.
 *
 * `readTrack` turns that into the four job-specific measurements the board
 * renders, and names what it could not compute rather than returning zero.
 */

export * from "./track";
export {
  valueWallet,
  settlementValuation,
  defaultAdapters,
  priceSource,
  positionAmounts,
  getSqrtRatioAtTick,
  MAX_DEVIATION_BPS,
  TWAP_WINDOW_SECONDS,
} from "./valuation/value";
export type { Part, AdapterValue, PriceSource, Adapter, WalletValuation } from "./valuation/types";
