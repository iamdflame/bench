import type { Address, PublicClient } from "viem";
import { decimalsOf, ERC20_ABI, WBNB, USDT, USDC, BTCB, CAKE } from "./prices";
import type { Adapter, AdapterValue, Part, PriceSource } from "./types";

/**
 * The tokens this market's strategies can end up holding.
 *
 * WBNB is first and matters most: a grid agent swapping BNB for WBNB has not
 * lost anything, but the old gauge counted native balance and no tokens, so
 * the wrap read as a total loss of everything swapped.
 */
export const TRACKED_TOKENS: { address: Address; symbol: string }[] = [
  { address: WBNB, symbol: "WBNB" },
  { address: USDT, symbol: "USDT" },
  { address: USDC, symbol: "USDC" },
  { address: BTCB, symbol: "BTCB" },
  { address: CAKE, symbol: "CAKE" },
];

export function erc20Adapter(
  client: PublicClient,
  tokens: { address: Address; symbol: string }[] = TRACKED_TOKENS,
): Adapter {
  return {
    id: "erc20",
    async value(
      wallet: Address,
      block: bigint,
      prices: PriceSource,
    ): Promise<AdapterValue | null> {
      const parts: Part[] = [];
      let assetsWei = 0n;

      for (const { address, symbol } of tokens) {
        let balance: bigint;
        try {
          balance = (await client.readContract({
            address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [wallet],
            blockNumber: block,
          })) as bigint;
        } catch {
          // A balance we could not read is not a balance of zero.
          return null;
        }
        if (balance === 0n) continue;

        const decimals = await decimalsOf(client, address);
        if (decimals === null) return null;

        const perUnit = await prices.bnbWeiPerUnit(address);
        // Holding something we cannot price means we cannot say what the
        // wallet is worth. Refusing is the only honest answer available.
        if (perUnit === null) return null;

        const bnbWei = (balance * perUnit) / 10n ** BigInt(decimals);
        assetsWei += bnbWei;
        parts.push({
          adapter: "erc20",
          asset: symbol,
          amount: balance,
          decimals,
          bnbWei,
          kind: "asset",
        });
      }

      return { assetsWei, liabilitiesWei: 0n, parts };
    },
  };
}
