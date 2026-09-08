import type { Address, PublicClient } from "viem";
import type { Adapter, AdapterValue } from "./types";

/** Native BNB. The one thing the old gauge always got right. */
export function nativeAdapter(client: PublicClient): Adapter {
  return {
    id: "native",
    async value(wallet: Address, block: bigint): Promise<AdapterValue | null> {
      try {
        const wei = await client.getBalance({ address: wallet, blockNumber: block });
        return {
          assetsWei: wei,
          liabilitiesWei: 0n,
          parts:
            wei > 0n
              ? [
                  {
                    adapter: "native",
                    asset: "BNB",
                    amount: wei,
                    decimals: 18,
                    bnbWei: wei,
                    kind: "asset" as const,
                  },
                ]
              : [],
        };
      } catch {
        return null;
      }
    },
  };
}
