/**
 * Uniswap V3 tick and liquidity maths, in integer space.
 *
 * A concentrated liquidity position is not a balance — it is an amount of
 * liquidity spread between two ticks, and what that is *worth* depends on
 * where the pool currently sits. Below the range it is entirely token0, above
 * it entirely token1, inside it a mixture. Getting this wrong values a
 * rebalancing agent's whole position at zero, which is exactly what the old
 * gauge did.
 *
 * Ported from the reference implementation rather than approximated in
 * floating point: an attestation commits an exact number, and two parties have
 * to derive the identical digest from the same chain state.
 */

const Q96 = 2n ** 96n;
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

/**
 * sqrt(1.0001 ** tick) * 2 ** 96.
 *
 * The magic constants are the binary expansion of sqrt(1.0001) at successive
 * powers of two; each bit of |tick| multiplies in one factor.
 */
export function getSqrtRatioAtTick(tick: number): bigint {
  const abs = BigInt(tick < 0 ? -tick : tick);
  if (abs > BigInt(MAX_TICK)) throw new RangeError(`tick ${tick} out of range`);

  let ratio =
    (abs & 0x1n) !== 0n
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;

  const mul = (r: bigint, c: bigint) => (r * c) >> 128n;
  if ((abs & 0x2n) !== 0n) ratio = mul(ratio, 0xfff97272373d413259a46990580e213an);
  if ((abs & 0x4n) !== 0n) ratio = mul(ratio, 0xfff2e50f5f656932ef12357cf3c7fdccn);
  if ((abs & 0x8n) !== 0n) ratio = mul(ratio, 0xffe5caca7e10e4e61c3624eaa0941cd0n);
  if ((abs & 0x10n) !== 0n) ratio = mul(ratio, 0xffcb9843d60f6159c9db58835c926644n);
  if ((abs & 0x20n) !== 0n) ratio = mul(ratio, 0xff973b41fa98c081472e6896dfb254c0n);
  if ((abs & 0x40n) !== 0n) ratio = mul(ratio, 0xff2ea16466c96a3843ec78b326b52861n);
  if ((abs & 0x80n) !== 0n) ratio = mul(ratio, 0xfe5dee046a99a2a811c461f1969c3053n);
  if ((abs & 0x100n) !== 0n) ratio = mul(ratio, 0xfcbe86c7900a88aedcffc83b479aa3a4n);
  if ((abs & 0x200n) !== 0n) ratio = mul(ratio, 0xf987a7253ac413176f2b074cf7815e54n);
  if ((abs & 0x400n) !== 0n) ratio = mul(ratio, 0xf3392b0822b70005940c7a398e4b70f3n);
  if ((abs & 0x800n) !== 0n) ratio = mul(ratio, 0xe7159475a2c29b7443b29c7fa6e889d9n);
  if ((abs & 0x1000n) !== 0n) ratio = mul(ratio, 0xd097f3bdfd2022b8845ad8f792aa5825n);
  if ((abs & 0x2000n) !== 0n) ratio = mul(ratio, 0xa9f746462d870fdf8a65dc1f90e061e5n);
  if ((abs & 0x4000n) !== 0n) ratio = mul(ratio, 0x70d869a156d2a1b890bb3df62baf32f7n);
  if ((abs & 0x8000n) !== 0n) ratio = mul(ratio, 0x31be135f97d08fd981231505542fcfa6n);
  if ((abs & 0x10000n) !== 0n) ratio = mul(ratio, 0x9aa508b5b7a84e1c677de54f3e99bc9n);
  if ((abs & 0x20000n) !== 0n) ratio = mul(ratio, 0x5d6af8dedb81196699c329225ee604n);
  if ((abs & 0x40000n) !== 0n) ratio = mul(ratio, 0x2216e584f5fa1ea926041bedfe98n);
  if ((abs & 0x80000n) !== 0n) ratio = mul(ratio, 0x48a170391f7dc42444e8fa2n);

  // Positive ticks are the reciprocal of the negative expansion above.
  if (tick > 0) ratio = (2n ** 256n - 1n) / ratio;

  // Q128.128 down to Q64.96, rounding up so a position never values low.
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

/** token0 owed by `liquidity` between two sqrt prices. */
export function getAmount0Delta(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  const [lo, hi] = sqrtA > sqrtB ? [sqrtB, sqrtA] : [sqrtA, sqrtB];
  if (lo === 0n) return 0n;
  return (liquidity * Q96 * (hi - lo)) / hi / lo;
}

/** token1 owed by `liquidity` between two sqrt prices. */
export function getAmount1Delta(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  const [lo, hi] = sqrtA > sqrtB ? [sqrtB, sqrtA] : [sqrtA, sqrtB];
  return (liquidity * (hi - lo)) / Q96;
}

/**
 * What a position is actually holding right now.
 *
 * The three cases are the whole point: a position the price has moved past is
 * entirely one token, and an agent that let that happen still holds value. The
 * old gauge saw none of it.
 */
export function positionAmounts(params: {
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  sqrtPriceX96: bigint;
}): { amount0: bigint; amount1: bigint } {
  const { liquidity, tickLower, tickUpper, sqrtPriceX96 } = params;
  if (liquidity === 0n) return { amount0: 0n, amount1: 0n };

  const lower = getSqrtRatioAtTick(tickLower);
  const upper = getSqrtRatioAtTick(tickUpper);

  if (sqrtPriceX96 <= lower) {
    return { amount0: getAmount0Delta(lower, upper, liquidity), amount1: 0n };
  }
  if (sqrtPriceX96 >= upper) {
    return { amount0: 0n, amount1: getAmount1Delta(lower, upper, liquidity) };
  }
  return {
    amount0: getAmount0Delta(sqrtPriceX96, upper, liquidity),
    amount1: getAmount1Delta(lower, sqrtPriceX96, liquidity),
  };
}
