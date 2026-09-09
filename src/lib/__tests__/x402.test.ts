import { describe, expect, it } from "vitest";
import { challenge, priceOf, USD1, USD1_DECIMALS } from "@/lib/x402";

/**
 * The seller's guards. Every one of them fails closed, because a paid endpoint
 * whose checks fail open is a free endpoint with extra steps.
 *
 * `verifyPayment` reads the chain to reject a replayed nonce, so it is not
 * exercised here; what is exercised is the shape of the challenge a client has
 * to be able to satisfy, and the arithmetic of the price.
 */
describe("x402 challenge", () => {
  it("prices in an asset that can actually settle", () => {
    const c = challenge({ resource: "/x", description: "d", priceAtomic: priceOf("0.01") });
    const accept = c.accepts[0]!;
    // Neither BSC USDT nor BSC USDC implements EIP-3009, so a challenge
    // denominated in either could never be satisfied by any client.
    expect(accept.asset).toBe(USD1);
    expect(accept.extra.transferMethod).toBe("eip3009");
  });

  it("names the EIP-712 domain a client needs to sign", () => {
    const accept = challenge({ resource: "/x", description: "d", priceAtomic: 1n }).accepts[0]!;
    expect(accept.extra.name).toBe("World Liberty Financial USD");
    expect(accept.extra.version).toBe("1");
  });

  it("states the price in atomic units, not decimals", () => {
    const accept = challenge({
      resource: "/x",
      description: "d",
      priceAtomic: priceOf("0.01"),
    }).accepts[0]!;
    expect(accept.maxAmountRequired).toBe((10n ** BigInt(USD1_DECIMALS) / 100n).toString());
  });

  it("carries a CAIP-2 network identifier", () => {
    const accept = challenge({ resource: "/x", description: "d", priceAtomic: 1n }).accepts[0]!;
    expect(accept.network).toMatch(/^eip155:\d+$/);
  });
});

describe("priceOf", () => {
  it("converts a decimal string to atomic units without float drift", () => {
    expect(priceOf("1")).toBe(10n ** 18n);
    expect(priceOf("0.01")).toBe(10n ** 16n);
    expect(priceOf("0.02")).toBe(2n * 10n ** 16n);
  });
});
