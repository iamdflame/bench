/**
 * @bench/measure — a number that knows where it came from, and an absence that
 * knows why it is absent.
 *
 * Two types and one formatter. Everything the product renders as data is built
 * from these, which is what lets `tools/checks/measurement.ts` assert the
 * property across every surface at once instead of page by page.
 */

export * from "./types";
export * from "./format";
