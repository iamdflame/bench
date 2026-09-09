import type { Address, PublicClient } from "viem";
import { decimalsOf, CAKE } from "./prices";
import { valuePosition } from "./v3";
import type { Adapter, AdapterValue, Part, PriceSource } from "./types";

export const MASTERCHEF_V3 = "0x556B9306565093C855AEA9AE92A594704c2Cd59e" as const;

const MC_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "pendingCake",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * V3 positions staked into MasterChef, and the CAKE they have earned.
 *
 * A staked position leaves the wallet entirely — MasterChef holds the NFT —
 * so to a gauge reading the position manager it has simply vanished. It is the
 * same failure as the unstaked case, one indirection further out.
 *
 * The position itself is valued through the same function the unstaked
 * adapter uses. Pending CAKE is added because it is earned and claimable, on
 * the same reasoning that includes uncollected V3 fees.
 */
export function masterChefAdapter(client: PublicClient): Adapter {
  return {
    id: "masterchef",
    async value(
      wallet: Address,
      block: bigint,
      prices: PriceSource,
    ): Promise<AdapterValue | null> {
      let count: bigint;
      try {
        count = (await client.readContract({
          address: MASTERCHEF_V3,
          abi: MC_ABI,
          functionName: "balanceOf",
          args: [wallet],
          blockNumber: block,
        })) as bigint;
      } catch {
        return null;
      }
      if (count === 0n) return { assetsWei: 0n, liabilitiesWei: 0n, parts: [] };

      const parts: Part[] = [];
      let assetsWei = 0n;
      let pendingCake = 0n;

      for (let i = 0n; i < count; i++) {
        let tokenId: bigint;
        try {
          tokenId = (await client.readContract({
            address: MASTERCHEF_V3,
            abi: MC_ABI,
            functionName: "tokenOfOwnerByIndex",
            args: [wallet, i],
            blockNumber: block,
          })) as bigint;
        } catch {
          return null;
        }

        const valued = await valuePosition(client, tokenId, block, prices, "masterchef");
        if (!valued) return null;
        assetsWei += valued.bnbWei;
        parts.push(...valued.parts);

        try {
          pendingCake += (await client.readContract({
            address: MASTERCHEF_V3,
            abi: MC_ABI,
            functionName: "pendingCake",
            args: [tokenId],
            blockNumber: block,
          })) as bigint;
        } catch {
          return null;
        }
      }

      if (pendingCake > 0n) {
        const decimals = await decimalsOf(client, CAKE);
        if (decimals === null) return null;
        const perUnit = await prices.bnbWeiPerUnit(CAKE);
        if (perUnit === null) return null;
        const bnbWei = (pendingCake * perUnit) / 10n ** BigInt(decimals);
        assetsWei += bnbWei;
        parts.push({
          adapter: "masterchef",
          asset: "CAKE pending",
          amount: pendingCake,
          decimals,
          bnbWei,
          kind: "asset",
        });
      }

      return { assetsWei, liabilitiesWei: 0n, parts };
    },
  };
}
