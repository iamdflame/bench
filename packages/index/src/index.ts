/**
 * @bench/index — where the board's supply comes from.
 *
 * Four sources, merged into one record and deduplicated: the ERC-8004 registry
 * read straight from the chain, 8004scan for enrichment, Binance's B402 Bazaar
 * for paid endpoints that have no registry identity at all, and our own probe.
 * Plus the classifier that decides which of the four jobs an agent is claiming,
 * and the origin clustering that stops one operator's batch registration
 * dominating everything.
 */

export * from "./registry";
export * from "./sweep-chain";
export * from "./scan";
export * from "./bazaar";
export * from "./origins";
export * from "./classify";
