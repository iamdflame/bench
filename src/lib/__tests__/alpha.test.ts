import { describe, expect, it } from "vitest";
import { alphaFrom } from "@/lib/settlement";

/**
 * Alpha is the number every slash and every fee turns on, and the TypeScript
 * that computes it must agree with the Solidity that re-checks it — bit for
 * bit, in integer arithmetic. A floating-point drift here does not produce a
 * wrong answer; it produces a settlement that reverts for reasons that look
 * like a bug.
 */
describe("alphaFrom", () => {
  it("is the proportional change in basis points", () => {
    expect(alphaFrom(10_000n, 11_000n)).toBe(1_000n); // +10%
    expect(alphaFrom(10_000n, 9_000n)).toBe(-1_000n); // -10%
    expect(alphaFrom(10_000n, 10_000n)).toBe(0n);
  });

  it("multiplies before dividing, so a single basis point survives", () => {
    // (now * 10000) / prev - 10000, not ((now / prev) - 1) * 10000. The order
    // matters: dividing first would round a 1bp move to nothing, and the
    // contract does it this way too, which is why the two agree.
    expect(alphaFrom(10_000n, 10_001n)).toBe(1n);
    expect(alphaFrom(1_000_000n, 1_000_001n)).toBe(0n); // genuinely below 1bp
  });

  it("truncates toward zero, as Solidity integer division does", () => {
    expect(alphaFrom(3n, 4n)).toBe(3_333n); // 33.33%, not 33.34%
  });

  it("cannot fall below total loss", () => {
    // A ratio of non-negative valuations bottoms out at -10000 bps. This is
    // why the contract's fuzz bound is what it is.
    expect(alphaFrom(10_000n, 0n)).toBe(-10_000n);
    expect(alphaFrom(1n, 0n)).toBe(-10_000n);
  });

  it("handles wei-scale magnitudes without loss", () => {
    const prev = 1_000_000_000_000_000_000n;
    expect(alphaFrom(prev, prev + prev / 100n)).toBe(100n); // +1%
  });
});
