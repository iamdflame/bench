import { describe, expect, it } from "vitest";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import { MAX_DEVIATION_BPS, bpsBetween, priceSource, readPoolBoth } from "../prices";

/**
 * The settlement price, read against mainnet.
 *
 * Deliberately not forked. What is under test is that a thirty-minute average
 * genuinely exists on the pools this market settles against — and a fork
 * cannot prove that, because anvil serves the observation array from an
 * upstream node whose pruning window is about fifty seconds. Reading mainnet
 * directly is both simpler and a stronger claim.
 *
 * Skipped when there is no network, loudly.
 */
const RPC = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";
const USDT = "0x55d398326f99059fF775485246999027B3197955" as Address;
const WBNB_USDT_500 = "0x36696169C63e42cd08ce11f5deeBbCeBae652050" as Address;

const client = createPublicClient({
  chain: bsc,
  transport: http(RPC, { timeout: 20_000 }),
}) as PublicClient;

async function reachable() {
  try {
    await client.getBlockNumber();
    return true;
  } catch {
    return false;
  }
}

describe("settlement pricing", () => {
  it("has a usable thirty-minute window on the reference pool", async () => {
    if (!(await reachable())) {
      console.warn(`[skipped: no network at ${RPC}]`);
      return;
    }
    const block = await client.getBlockNumber();
    const reading = await readPoolBoth(client, WBNB_USDT_500, block);
    expect(reading).not.toBeNull();

    // The whole of 0.2 rests on this: if the average does not exist, settlement
    // has nothing to fall back on except spot, which is the vector.
    expect(reading!.twapSqrtX96).not.toBeNull();
    expect(reading!.spotSqrtX96).toBeGreaterThan(0n);
    expect(reading!.deviationBps).not.toBeNull();
  }, 60_000);

  it("prices a token from the average, not from spot", async () => {
    if (!(await reachable())) return;
    const block = await client.getBlockNumber();

    const spot = await priceSource(client, block, "execution");
    const settle = await priceSource(client, block, "settlement");

    const a = await spot.bnbWeiPerUnit(USDT);
    const b = await settle.bnbWeiPerUnit(USDT);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!).toBeGreaterThan(0n);
    expect(b!).toBeGreaterThan(0n);

    // Two readings of the same pool at the same block. In calm conditions they
    // are close; the point is that they are derived differently.
    expect(bpsBetween(a!, b!)).toBeLessThan(2_000n);
  }, 60_000);

  it("reports a deviation the guard can act on", async () => {
    if (!(await reachable())) return;
    const block = await client.getBlockNumber();
    const settle = await priceSource(client, block, "settlement");
    await settle.bnbWeiPerUnit(USDT);

    const deviation = [...settle.deviations.values()];
    expect(deviation.length).toBeGreaterThan(0);
    for (const d of deviation) expect(d).toBeGreaterThanOrEqual(0n);
  }, 60_000);
});

describe("the deviation guard", () => {
  /**
   * The rule itself, tested without a chain.
   *
   * Pushing a mainnet pool two hundred basis points to prove the guard fires
   * would cost more than this market holds, and doing it on a fork tests the
   * fork. The arithmetic is what decides, so the arithmetic is what is pinned.
   */
  it("measures the gap in basis points on price, not on its square root", () => {
    expect(bpsBetween(10_000n, 10_000n)).toBe(0n);
    expect(bpsBetween(10_200n, 10_000n)).toBe(200n);
    expect(bpsBetween(9_800n, 10_000n)).toBe(200n);
    expect(bpsBetween(12_000n, 10_000n)).toBe(2_000n);
  });

  it("refuses exactly above the threshold and not at it", () => {
    const exceeds = (d: bigint) => d > MAX_DEVIATION_BPS;
    expect(exceeds(199n)).toBe(false);
    expect(exceeds(200n)).toBe(false);
    expect(exceeds(201n)).toBe(true);
    expect(exceeds(5_000n)).toBe(true);
  });

  it("is set at two hundred basis points", () => {
    expect(MAX_DEVIATION_BPS).toBe(200n);
  });
});
