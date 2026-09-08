/**
 * @bench/probe — we call it before we list it.
 *
 * The endpoint probe with its three-input identity check, the 402 challenge
 * parser that decides whether a price is payable from BNB Chain, the ERC-8183
 * quote request that is the only real proof of hireability, and the on-chain
 * capability scan that Rail 3's authority is derived from.
 *
 * Everything here returns the condition that failed rather than a boolean.
 */

export * from "./endpoint";
export * from "./challenge";
export * from "./quote";
export * from "./capability";
