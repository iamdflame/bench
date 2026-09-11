import { describe, expect, it } from "vitest";
import { hireHref, hirePath, primaryRail } from "../market/hire-law";
import type { Listing } from "../market/listing";
import type { Quote } from "../x402/quote";

const NOW = Date.parse("2026-09-11T18:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const quote = (payable: boolean, unpayable: string | null = null): Quote => ({
  endpoint: "https://example.test/x402",
  amount: "20000000000000000",
  decimals: 18,
  asset: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
  assetName: "World Liberty Financial USD",
  network: "eip155:56",
  chainId: 56,
  payTo: "0xcd10D44703D6989290E0A8219f345fA0a5BF4c64",
  scheme: "eip3009",
  description: null,
  resource: null,
  x402Version: 2,
  header: "PAYMENT-SIGNATURE",
  transferMethod: "eip3009",
  payable,
  unpayable,
});

type L = Parameters<typeof hirePath>[0];
const stranger = (over: Partial<L> = {}): L => ({
  tokenId: "999999001",
  owner: "0x1111111111111111111111111111111111111111",
  probe: { answered: true, status: 402, latencyMs: 300, endpoint: "https://example.test/x402", at: minutesAgo(5) },
  liveness: "live" as Listing["liveness"],
  quote: quote(true),
  priceLabel: "0.02 USD1",
  ...over,
});

describe("the hire law", () => {
  it("offers a stranger that answered recently and quoted a price we can pay, over x402", () => {
    const v = hirePath(stranger(), { now: NOW });
    expect(v.ok).toBe(true);
    expect(v.answeringNow).toBe(true);
    expect(primaryRail(v)).toMatchObject({ kind: "x402", price: "0.02 USD1" });
    expect(hireHref("999999001", v)).toBe("/agents/999999001#call");
  });

  it("never offers our market's job form for a stranger that does not bid in it", () => {
    const v = hirePath(stranger({ quote: null, priceLabel: null }), { now: NOW });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/does not bid on jobs in this market/);
    expect(hireHref("999999001", v)).toBeNull();
  });

  it("offers the job form for a stranger that has bid in this market", () => {
    const v = hirePath(stranger({ quote: null, priceLabel: null }), {
      now: NOW,
      bidders: new Set(["0x1111111111111111111111111111111111111111"]),
    });
    expect(v.ok).toBe(true);
    expect(primaryRail(v)).toEqual({ kind: "mandate" });
  });

  it("shows the seller's unpayable reason instead of a button", () => {
    const v = hirePath(stranger({ quote: quote(false, "it settles on eip155:8453, not BNB Smart Chain") }), { now: NOW });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("It quoted a price we cannot pay: it settles on eip155:8453, not BNB Smart Chain.");
  });

  it("refuses an answer older than a day, a silent agent, and one never called", () => {
    expect(hirePath(stranger({ probe: { answered: true, status: 402, latencyMs: 1, endpoint: "x", at: minutesAgo(26 * 60) } }), { now: NOW }).reason).toMatch(/last answered 26 h ago/);
    expect(hirePath(stranger({ probe: { answered: false, status: null, latencyMs: null, endpoint: "x", at: minutesAgo(3) }, liveness: "silent" }), { now: NOW }).ok).toBe(false);
    expect(hirePath(stranger({ probe: null, liveness: "untested" }), { now: NOW }).reason).toMatch(/not called it yet/);
    expect(hirePath(stranger({ liveness: "no-endpoint" }), { now: NOW }).reason).toMatch(/names nothing to call/);
  });

  it("refuses an agent that took our money and returned nothing, quoting what happened", () => {
    const seen = new Map([
      [
        "999999001",
        {
          tokenId: "999999001",
          delivered: 0,
          paidNotDelivered: 1,
          refused: 0,
          lastAt: new Date(NOW - 3 * 3600_000).toISOString(),
          lastWhy: "it answered 402 to the signed payment: settlement failed",
          lastTx: "0xabc",
        },
      ],
    ]);
    const v = hirePath(stranger(), { now: NOW, outcomes: seen });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/We paid it on .* and it answered with an error/);
    expect(v.reason).toMatch(/settlement failed/);
  });

  it("refuses an agent that turned down a correctly signed payment", () => {
    const seen = new Map([
      ["999999001", { tokenId: "999999001", delivered: 0, paidNotDelivered: 0, refused: 1, lastAt: new Date(NOW - 3600_000).toISOString(), lastWhy: "No x402 facilitator is configured", lastTx: null }],
    ]);
    expect(hirePath(stranger(), { now: NOW, outcomes: seen }).reason).toMatch(/it refused: No x402 facilitator/);
  });

  it("offers an agent again once it has delivered", () => {
    const seen = new Map([
      ["999999001", { tokenId: "999999001", delivered: 1, paidNotDelivered: 1, refused: 0, lastAt: new Date(NOW - 600_000).toISOString(), lastWhy: null, lastTx: "0xdef" }],
    ]);
    expect(hirePath(stranger(), { now: NOW, outcomes: seen }).ok).toBe(true);
  });

  it("knows the answer is not 'now' after fifteen minutes, while still offering the hire", () => {
    const v = hirePath(stranger({ probe: { answered: true, status: 402, latencyMs: 1, endpoint: "x", at: minutesAgo(40) } }), { now: NOW });
    expect(v.ok).toBe(true);
    expect(v.answeringNow).toBe(false);
  });
});
