import { describe, expect, it } from "vitest";
import { breakdownRef, canonicalBreakdown, jsonBody, objectName, type Breakdown } from "@/lib/chain/greenfield";

const sample = (): Breakdown => ({
  schema: "mandate.observation.breakdown/1",
  mandateId: 0,
  epoch: 1,
  wallet: "0xd6d11Aa5046dc5C7BE8d63B9223b60D7AD94cBe9",
  blockNumber: "119924716",
  valuationWei: "310045900000000",
  gasSpentWei: "0",
  parts: [{ asset: "BNB", amount: "0.0003100459", wei: "310045900000000" }],
  pool: { address: "0x36696169C63e42cd08ce11f5deeBbCeBae652050", sqrtPriceX96: "0", priceUsdtPerBnb: "0" },
  observationHash: "0xabc",
  takenAt: "1788000000",
});

describe("canonicalBreakdown", () => {
  it("does not depend on the order keys were written in", () => {
    // Two parties must derive the same digest from the same facts, and key
    // order is not a fact.
    const a = sample();
    const b = { ...sample() };
    const reordered = Object.fromEntries(Object.entries(b).reverse()) as unknown as Breakdown;
    expect(canonicalBreakdown(reordered)).toBe(canonicalBreakdown(a));
    expect(breakdownRef(reordered)).toBe(breakdownRef(a));
  });

  it("changes when any fact changes", () => {
    const a = sample();
    const b = { ...sample(), valuationWei: "310045900000001" };
    expect(breakdownRef(b)).not.toBe(breakdownRef(a));
  });

  it("emits no whitespace, so the bytes are the content", () => {
    expect(canonicalBreakdown(sample())).not.toMatch(/\n|\s{2}/);
  });
});

describe("jsonBody", () => {
  it("reports the byte length, not the character count", () => {
    // The SDK declares payload_size from .size and then uploads toString().
    // If those disagree the storage provider rejects the upload, which is
    // exactly what a File does.
    const text = '{"a":"café"}';
    const body = jsonBody(text);
    expect(body.size).toBe(new TextEncoder().encode(text).byteLength);
    expect(body.size).toBeGreaterThan(text.length);
    expect(body.toString()).toBe(text);
  });
});

describe("objectName", () => {
  it("is derivable without an index", () => {
    expect(objectName(7, "open")).toBe("mandate-7/open.json");
    expect(objectName(7, 3)).toBe("mandate-7/epoch-3.json");
  });
});
