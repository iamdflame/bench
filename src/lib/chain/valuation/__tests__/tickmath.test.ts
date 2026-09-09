import { describe, expect, it } from "vitest";
import { getSqrtRatioAtTick, positionAmounts } from "../tickmath";

const Q96 = 2n ** 96n;

/**
 * The reference values are from Uniswap's own TickMath test suite.
 *
 * This maths decides what a rebalancing agent's position is worth, and an
 * error here is indistinguishable from the agent having lost money — which is
 * precisely the failure that made the old gauge slash agents for working. It
 * gets checked against the canonical implementation rather than eyeballed.
 */
describe("getSqrtRatioAtTick", () => {
  it("is exactly 2^96 at tick 0", () => {
    expect(getSqrtRatioAtTick(0)).toBe(Q96);
  });

  it("matches the reference at the extremes", () => {
    expect(getSqrtRatioAtTick(-887272)).toBe(4295128739n);
    expect(getSqrtRatioAtTick(887272)).toBe(
      1461446703485210103287273052203988822378723970342n,
    );
  });

  it("is monotonic across the sampled range", () => {
    let previous = 0n;
    for (let t = -887272; t <= 887272; t += 9973) {
      const v = getSqrtRatioAtTick(t);
      expect(v).toBeGreaterThan(previous);
      previous = v;
    }
  });

  it("refuses a tick outside the representable range", () => {
    expect(() => getSqrtRatioAtTick(887273)).toThrow(RangeError);
  });
});

describe("positionAmounts", () => {
  const lower = -60;
  const upper = 60;
  const liquidity = 10n ** 18n;

  it("is entirely token0 below the range", () => {
    const a = positionAmounts({
      liquidity,
      tickLower: lower,
      tickUpper: upper,
      sqrtPriceX96: getSqrtRatioAtTick(-120),
    });
    expect(a.amount0).toBeGreaterThan(0n);
    expect(a.amount1).toBe(0n);
  });

  it("is entirely token1 above the range", () => {
    const a = positionAmounts({
      liquidity,
      tickLower: lower,
      tickUpper: upper,
      sqrtPriceX96: getSqrtRatioAtTick(120),
    });
    expect(a.amount0).toBe(0n);
    expect(a.amount1).toBeGreaterThan(0n);
  });

  it("holds both inside the range", () => {
    const a = positionAmounts({
      liquidity,
      tickLower: lower,
      tickUpper: upper,
      sqrtPriceX96: getSqrtRatioAtTick(0),
    });
    expect(a.amount0).toBeGreaterThan(0n);
    expect(a.amount1).toBeGreaterThan(0n);
  });

  /**
   * The case the old gauge got wrong, stated as a test.
   *
   * An out-of-range position is the normal outcome of price moving, not a
   * loss. It must never value at zero.
   */
  it("never values an out-of-range position at zero", () => {
    for (const at of [-887000, -1000, 1000, 887000]) {
      const a = positionAmounts({
        liquidity,
        tickLower: lower,
        tickUpper: upper,
        sqrtPriceX96: getSqrtRatioAtTick(at),
      });
      expect(a.amount0 + a.amount1).toBeGreaterThan(0n);
    }
  });

  it("holds nothing at zero liquidity", () => {
    const a = positionAmounts({
      liquidity: 0n,
      tickLower: lower,
      tickUpper: upper,
      sqrtPriceX96: Q96,
    });
    expect(a.amount0).toBe(0n);
    expect(a.amount1).toBe(0n);
  });
});
