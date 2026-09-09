import type { Address, PublicClient } from "viem";
import { decimalsOf, readPoolBoth, V3_FACTORY, FACTORY_ABI, ZERO } from "./prices";
import { positionAmounts } from "./tickmath";
import type { Adapter, AdapterValue, Part, PriceSource } from "./types";

export const POSITION_MANAGER = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364" as const;

const NPM_ABI = [
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
    name: "positions",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

/**
 * What one position is holding, valued.
 *
 * Exported because a staked position is the same position — MasterChef holds
 * the NFT but the liquidity, the range and the fees are unchanged. Valuing it
 * through a second code path would be a second chance to disagree with
 * ourselves.
 */
export async function valuePosition(
  client: PublicClient,
  tokenId: bigint,
  block: bigint,
  prices: PriceSource,
  adapterId: string,
): Promise<{ bnbWei: bigint; parts: Part[] } | null> {
  let position: readonly unknown[];
  try {
    position = (await client.readContract({
      address: POSITION_MANAGER,
      abi: NPM_ABI,
      functionName: "positions",
      args: [tokenId],
      blockNumber: block,
    })) as readonly unknown[];
  } catch {
    return null;
  }

  const token0 = position[2] as Address;
  const token1 = position[3] as Address;
  const fee = Number(position[4]);
  const tickLower = Number(position[5]);
  const tickUpper = Number(position[6]);
  const liquidity = position[7] as bigint;
  const tokensOwed0 = position[10] as bigint;
  const tokensOwed1 = position[11] as bigint;

  // An empty, fully-collected position is a spent NFT worth nothing. That is a
  // fact about the position, not a failure to read it.
  if (liquidity === 0n && tokensOwed0 === 0n && tokensOwed1 === 0n) {
    return { bnbWei: 0n, parts: [] };
  }

  let pool: Address;
  try {
    pool = (await client.readContract({
      address: V3_FACTORY,
      abi: FACTORY_ABI,
      functionName: "getPool",
      args: [token0, token1, fee],
      blockNumber: block,
    })) as Address;
  } catch {
    return null;
  }
  if (!pool || pool === ZERO) return null;

  const reading = await readPoolBoth(client, pool, block);
  if (!reading) return null;

  // Valued at the same kind of price as the rest of the valuation: an average
  // at settlement, spot at execution.
  const sqrt = prices.kind === "settlement" ? reading.twapSqrtX96 : reading.spotSqrtX96;
  if (sqrt === null) return null;

  const { amount0, amount1 } = positionAmounts({
    liquidity,
    tickLower,
    tickUpper,
    sqrtPriceX96: sqrt,
  });

  const parts: Part[] = [];
  let bnbWei = 0n;

  for (const [token, amount, side] of [
    [token0, amount0 + tokensOwed0, "0"],
    [token1, amount1 + tokensOwed1, "1"],
  ] as const) {
    if (amount === 0n) continue;
    const decimals = await decimalsOf(client, token);
    if (decimals === null) return null;
    const perUnit = await prices.bnbWeiPerUnit(token);
    if (perUnit === null) return null;

    const value = (amount * perUnit) / 10n ** BigInt(decimals);
    bnbWei += value;
    parts.push({
      adapter: adapterId,
      asset: `V3#${tokenId} token${side}`,
      amount,
      decimals,
      bnbWei: value,
      kind: "asset",
      detail: `ticks ${tickLower}..${tickUpper}, fee ${fee}, liquidity ${liquidity}`,
    });
  }

  return { bnbWei, parts };
}

/**
 * PancakeSwap V3 liquidity positions.
 *
 * This is the adapter the rebalancing strategy lives or dies by. A position is
 * an ERC-721, not a balance: the agent's capital leaves its wallet entirely and
 * reappears as liquidity between two ticks. To a gauge that reads balances, a
 * correctly-managed position is indistinguishable from the money having gone.
 *
 * Uncollected fees are included. They are earned, they are claimable at any
 * time, and leaving them out would measure a profitable position as flat.
 */
export function v3PositionAdapter(client: PublicClient): Adapter {
  return {
    id: "v3-position",
    async value(
      wallet: Address,
      block: bigint,
      prices: PriceSource,
    ): Promise<AdapterValue | null> {
      let count: bigint;
      try {
        count = (await client.readContract({
          address: POSITION_MANAGER,
          abi: NPM_ABI,
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

      for (let i = 0n; i < count; i++) {
        let tokenId: bigint;
        try {
          tokenId = (await client.readContract({
            address: POSITION_MANAGER,
            abi: NPM_ABI,
            functionName: "tokenOfOwnerByIndex",
            args: [wallet, i],
            blockNumber: block,
          })) as bigint;
        } catch {
          return null;
        }

        const valued = await valuePosition(client, tokenId, block, prices, "v3-position");
        if (!valued) return null;
        assetsWei += valued.bnbWei;
        parts.push(...valued.parts);
      }

      return { assetsWei, liabilitiesWei: 0n, parts };
    },
  };
}
