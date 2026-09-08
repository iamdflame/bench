/**
 * The 402 parser, which decides what can be sold on Rail 1.
 *
 * These are the cases that were actually met in the field, not invented ones:
 * a v1 challenge with `maxAmountRequired` and a bare `network: "base"`, a v2
 * challenge with `amount` and CAIP-2, a challenge quoting a BSC stablecoin
 * that cannot settle an EIP-3009 transfer, and a listing that disagrees with
 * the endpoint that produced it.
 */

import { describe, expect, it } from "vitest";
import { parseChallenge, compareAdvertised } from "../challenge";

const USD1 = "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d";
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYEE = "0xb5998e11E666Fd1e7f3B8e8d9122A755eec1E9b7";

describe("parseChallenge", () => {
  it("reads a v2 challenge payable on BNB Smart Chain", () => {
    const c = parseChallenge(
      JSON.stringify({
        x402Version: 2,
        accepts: [
          { scheme: "exact", network: "eip155:56", asset: USD1, amount: "10000000000000000", payTo: PAYEE },
        ],
      }),
      56,
    );
    expect(c).not.toBeNull();
    expect(c!.payable).toBe(true);
    expect(c!.best!.amount).toBe(10_000_000_000_000_000n);
    expect(c!.best!.chainId).toBe(56);
    expect(c!.best!.assetSymbol).toBe("USD1");
  });

  it("reads a v1 challenge, where the amount lives under a different key", () => {
    const c = parseChallenge(
      JSON.stringify({
        x402Version: 1,
        accepts: [
          { scheme: "exact", network: "bsc", asset: USD1, maxAmountRequired: "50000", payTo: PAYEE },
        ],
      }),
      56,
    );
    expect(c!.payable).toBe(true);
    expect(c!.best!.amount).toBe(50_000n);
  });

  /*
    This is the shape 941 of 979 B402 listings actually answer with. It is a
    perfectly valid challenge and it cannot be paid from here, and those are
    different things — so it parses, and it is refused with the reason.
  */
  it("refuses a challenge that wants payment on another chain, and says which", () => {
    const c = parseChallenge(
      JSON.stringify({
        x402Version: 1,
        accepts: [{ scheme: "exact", network: "base", asset: USDC_BASE, maxAmountRequired: "50000", payTo: PAYEE }],
      }),
      56,
    );
    expect(c!.payable).toBe(false);
    expect(c!.unpayableReason).toContain("8453");
    expect(c!.routes[0]!.chainId).toBe(8453);
  });

  it("refuses BSC USDT, because it cannot settle an EIP-3009 transfer", () => {
    const c = parseChallenge(
      JSON.stringify({
        x402Version: 2,
        accepts: [{ scheme: "exact", network: "eip155:56", asset: USDT_BSC, amount: "1000", payTo: PAYEE }],
      }),
      56,
    );
    expect(c!.payable).toBe(false);
    expect(c!.unpayableReason).toContain("EIP-3009");
  });

  it("picks the cheapest payable route when several are offered", () => {
    const c = parseChallenge(
      JSON.stringify({
        x402Version: 2,
        accepts: [
          { scheme: "exact", network: "eip155:8453", asset: USDC_BASE, amount: "10", payTo: PAYEE },
          { scheme: "exact", network: "eip155:56", asset: USD1, amount: "9000", payTo: PAYEE },
          { scheme: "exact", network: "eip155:56", asset: USD1, amount: "3000", payTo: PAYEE },
        ],
      }),
      56,
    );
    expect(c!.payable).toBe(true);
    expect(c!.best!.amount).toBe(3_000n);
    // The cheaper Base route is not chosen: it cannot be settled from here.
    expect(c!.best!.chainId).toBe(56);
  });

  it("treats a challenge with an empty accepts list as offering no way to pay", () => {
    const c = parseChallenge(JSON.stringify({ x402Version: 2, accepts: [] }), 56);
    expect(c!.payable).toBe(false);
    expect(c!.unpayableReason).toContain("no way to pay");
  });

  it("returns null for a body that is not a challenge at all", () => {
    expect(parseChallenge("not json", 56)).toBeNull();
    expect(parseChallenge(JSON.stringify({ hello: "world" }), 56)).toBeNull();
  });

  it("refuses a route with no amount rather than treating it as free", () => {
    const c = parseChallenge(
      JSON.stringify({ x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:56", asset: USD1, payTo: PAYEE }] }),
      56,
    );
    expect(c!.payable).toBe(false);
  });
});

describe("compareAdvertised", () => {
  it("names the disagreement when a listing and its endpoint differ", () => {
    const live = parseChallenge(
      JSON.stringify({
        x402Version: 1,
        accepts: [{ scheme: "exact", network: "base", asset: USDC_BASE, maxAmountRequired: "50000", payTo: PAYEE }],
      }),
      56,
    )!;
    const said = compareAdvertised([{ network: "eip155:56", asset: USD1 as `0x${string}` }], live);
    expect(said).toContain("advertises");
    expect(said).toContain("8453");
  });

  it("says nothing when they agree", () => {
    const live = parseChallenge(
      JSON.stringify({
        x402Version: 2,
        accepts: [{ scheme: "exact", network: "eip155:56", asset: USD1, amount: "1000", payTo: PAYEE }],
      }),
      56,
    )!;
    expect(compareAdvertised([{ network: "eip155:56", asset: USD1 as `0x${string}` }], live)).toBeNull();
  });
});
