import type { Address, PublicClient } from "viem";
import { decimalsOf, WBNB } from "./prices";
import type { Adapter, AdapterValue, Part, PriceSource } from "./types";

export const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384" as const;
export const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36" as const;

const COMPTROLLER_ABI = [
  {
    type: "function",
    name: "getAssetsIn",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "address[]" }],
  },
] as const;

const VTOKEN_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "borrowBalanceStored",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "exchangeRateStored", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "underlying", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/**
 * Venus supply and borrow positions.
 *
 * This adapter is the one that fixes the sharpest inversion in the old gauge.
 * A health-factor agent earns its keep by calling `repayBorrow` — spending
 * assets to retire debt. To a gauge that counts assets and ignores liabilities
 * that is pure destruction of capital, so the agent that rescued a position
 * from liquidation was measured as the one that lost the most. It was being
 * slashed precisely for working.
 *
 * Two deliberate choices about *which* reads:
 *
 *   `exchangeRateStored` and `borrowBalanceStored`, not the `Current`
 *   variants. The `Current` calls accrue interest as a side effect, so their
 *   answer depends on when they are called rather than only on the block they
 *   are called at. An attestation has to re-derive identically for anyone
 *   reading the same historical state, and a mutating read cannot promise
 *   that.
 */
export function venusAdapter(client: PublicClient): Adapter {
  return {
    id: "venus",
    async value(
      wallet: Address,
      block: bigint,
      prices: PriceSource,
    ): Promise<AdapterValue | null> {
      let markets: readonly Address[];
      try {
        markets = (await client.readContract({
          address: COMPTROLLER,
          abi: COMPTROLLER_ABI,
          functionName: "getAssetsIn",
          args: [wallet],
          blockNumber: block,
        })) as readonly Address[];
      } catch {
        return null;
      }

      // A wallet may hold vTokens without having entered the market as
      // collateral, and `getAssetsIn` would not list those. vBNB is checked
      // unconditionally because it is the market every strategy here uses.
      const candidates = new Set(markets.map((m) => m.toLowerCase()));
      candidates.add(VBNB.toLowerCase());

      const parts: Part[] = [];
      let assetsWei = 0n;
      let liabilitiesWei = 0n;

      for (const raw of candidates) {
        const vToken = raw as Address;
        let vBalance: bigint;
        let borrowed: bigint;
        let rate: bigint;
        try {
          [vBalance, borrowed, rate] = (await Promise.all([
            client.readContract({
              address: vToken,
              abi: VTOKEN_ABI,
              functionName: "balanceOf",
              args: [wallet],
              blockNumber: block,
            }),
            client.readContract({
              address: vToken,
              abi: VTOKEN_ABI,
              functionName: "borrowBalanceStored",
              args: [wallet],
              blockNumber: block,
            }),
            client.readContract({
              address: vToken,
              abi: VTOKEN_ABI,
              functionName: "exchangeRateStored",
              blockNumber: block,
            }),
          ])) as [bigint, bigint, bigint];
        } catch {
          return null;
        }

        if (vBalance === 0n && borrowed === 0n) continue;

        // vBNB has no `underlying()` — its underlying is the native coin, and
        // the call reverts rather than returning the zero address.
        let underlying: Address = WBNB;
        let symbol = "BNB";
        if (vToken.toLowerCase() !== VBNB.toLowerCase()) {
          try {
            underlying = (await client.readContract({
              address: vToken,
              abi: VTOKEN_ABI,
              functionName: "underlying",
              blockNumber: block,
            })) as Address;
            symbol = (await client.readContract({
              address: vToken,
              abi: VTOKEN_ABI,
              functionName: "symbol",
              blockNumber: block,
            })) as string;
          } catch {
            return null;
          }
        }

        const decimals = await decimalsOf(client, underlying);
        if (decimals === null) return null;
        const perUnit = await prices.bnbWeiPerUnit(underlying);
        if (perUnit === null) return null;

        // Compound's exchange rate is scaled by 1e18; the product is the
        // underlying in its own decimals.
        const supplied = (vBalance * rate) / 10n ** 18n;
        const unit = 10n ** BigInt(decimals);

        if (supplied > 0n) {
          const bnbWei = (supplied * perUnit) / unit;
          assetsWei += bnbWei;
          parts.push({
            adapter: "venus",
            asset: `${symbol} supplied`,
            amount: supplied,
            decimals,
            bnbWei,
            kind: "asset",
            detail: `${vBalance} vTokens at rate ${rate}`,
          });
        }

        if (borrowed > 0n) {
          const bnbWei = (borrowed * perUnit) / unit;
          liabilitiesWei += bnbWei;
          parts.push({
            adapter: "venus",
            asset: `${symbol} borrowed`,
            amount: borrowed,
            decimals,
            bnbWei,
            kind: "liability",
            detail: "borrowBalanceStored",
          });
        }
      }

      return { assetsWei, liabilitiesWei, parts };
    },
  };
}
