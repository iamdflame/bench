/**
 * The two types the Data Quality criterion rests on.
 *
 * `Measurement` refuses to exist without a block and a method; `Maybe` refuses
 * to have a third state. Both refusals are the product, so both are tested
 * rather than trusted.
 */

import { describe, expect, it } from "vitest";
import { measure, known, unknown, isKnown, mapMaybe, orElse, toWire, fromWire } from "../types";
import { formatValue, displayBasis, displayProvenance, displayUnknown, freshness, formatPrice } from "../format";

const base = {
  name: "Time in range",
  value: 94.2,
  unit: "%" as const,
  window: "30d rolling",
  block: 120_590_203n,
  method: "time-in-range",
  source: "chain" as const,
  chainId: 56,
};

describe("measure", () => {
  it("builds a figure that carries where it came from", () => {
    const m = measure({ ...base, numerator: 27.4, denominator: 29.1 });
    expect(m.block).toBe(120_590_203n);
    expect(m.method).toBe("time-in-range");
    expect(m.observedAt).toBeTruthy();
  });

  it("refuses a figure with no block, because that is an assertion", () => {
    expect(() => measure({ ...base, block: 0n })).toThrow(/no block/);
  });

  it("refuses a figure with no method, because nobody could reproduce it", () => {
    expect(() => measure({ ...base, method: "" })).toThrow(/no method/);
  });

  it("refuses a rate with no period, because that is not a rate", () => {
    expect(() => measure({ ...base, window: "" })).toThrow(/no window/);
  });

  it("refuses a value that is not a finite number", () => {
    expect(() => measure({ ...base, value: Number.NaN })).toThrow(/finite/);
    expect(() => measure({ ...base, value: Number.POSITIVE_INFINITY })).toThrow(/finite/);
  });

  it("keeps its block across the wire, as a string a reader can still check", () => {
    const m = measure(base);
    const wire = toWire(m);
    expect(typeof wire.block).toBe("string");
    expect(JSON.parse(JSON.stringify(wire)).block).toBe("120590203");
    expect(fromWire(wire).block).toBe(m.block);
  });
});

describe("Maybe", () => {
  it("has exactly two states, and the empty one carries a reason", () => {
    const k = known(42);
    const u = unknown<number>("the provider declined the range");
    expect(isKnown(k)).toBe(true);
    expect(isKnown(u)).toBe(false);
    expect(u.known === false && u.reason).toBe("the provider declined the range");
  });

  it("keeps the reason through a transformation", () => {
    const u = mapMaybe(unknown<number>("could not read it"), (n) => n * 2);
    expect(u.known).toBe(false);
    expect(u.known === false && u.reason).toBe("could not read it");
  });

  it("makes the caller name the fallback out loud", () => {
    expect(orElse(unknown<number>("nope"), -1)).toBe(-1);
    expect(orElse(known(7), -1)).toBe(7);
  });
});

describe("format", () => {
  it("groups digits and fixes the decimals so a column cannot reflow", () => {
    expect(formatValue(1234.5, "%")).toBe("1,234.5%");
    expect(formatValue(7, "count")).toBe("7");
    expect(formatValue(-3.14159, "ratio")).toBe("−3.14");
    expect(formatValue(2.5, "USD")).toBe("$2.50");
  });

  it("renders the basis of a ratio, or nothing when there is none", () => {
    expect(displayBasis(measure({ ...base, numerator: 27.4, denominator: 29.1 }))).toBe("27.4 of 29.1");
    expect(displayBasis(measure(base))).toBeNull();
  });

  it("puts the block on every provenance line", () => {
    expect(displayProvenance(measure(base))).toContain("block 120,590,203");
    expect(displayProvenance(measure(base))).toContain("read from chain");
  });

  it("renders an unknown as words and a reason, never as a number", () => {
    const u = displayUnknown(unknown("the endpoint did not answer"));
    expect(u).not.toBeNull();
    expect(u!.label).toBe("not measured");
    expect(u!.reason).toBe("the endpoint did not answer");
    expect(u!.label).not.toMatch(/^[0-9-—]*$/);
    expect(displayUnknown(known(1))).toBeNull();
  });

  it("ages a reading toward stale, so a green rail cannot stay green forever", () => {
    const now = Date.now();
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
    expect(freshness(iso(60_000), 900_000, now)).toBe("fresh");
    expect(freshness(iso(1_800_000), 900_000, now)).toBe("ageing");
    expect(freshness(iso(10_800_000), 900_000, now)).toBe("stale");
    expect(freshness("not a date", 900_000, now)).toBe("stale");
  });

  it("never rounds a real payment away to zero", () => {
    // 0.01 USD1, the price of the call this marketplace actually made.
    expect(formatPrice(10_000_000_000_000_000n, 18, "USD1")).toBe("0.01 USD1");
    expect(formatPrice(1n, 18, "USD1")).not.toBe("0.00 USD1");
  });
});
