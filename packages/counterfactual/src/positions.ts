/**
 * Somebody's actual positions, read from the chain and made replayable.
 *
 * This is the step that turns the engine into the product. Until now the
 * replay opened a *synthetic* position — a stated amount in a stated band — and
 * answered "what would these agents have done to a position like this". With a
 * real position it answers the question the plan is actually built around:
 * **what would this agent have done to yours.**
 *
 * ---------------------------------------------------------------------------
 * No wallet connection, on purpose
 * ---------------------------------------------------------------------------
 *
 * Reading somebody's positions needs an address, not a signature. A wallet
 * connector would cost tens of kilobytes of client JavaScript, break the read
 * path with scripting off, and buy nothing — the only thing a signature would
 * add is the ability to *act*, which is Rail 2 and Rail 3's job, not this
 * file's.
 *
 * So an address is enough, it runs on the server, and the page keeps working
 * with JavaScript disabled. A viewer who wants the answer for their own money
 * pastes the address they already know.
 *
 * ---------------------------------------------------------------------------
 * What is refused
 * ---------------------------------------------------------------------------
 *
 * A position with zero liquidity has been closed; replaying it would produce a
 * column of zeros that looks like a measurement. A position on a pool this
 * deployment has no history access for cannot be replayed at all. Both are
 * returned as refusals with the reason, never as an empty result — the
 * distinction between "we looked and it is not there" and "we could not look"
 * is the one this whole product turns on.
 */

import { chainClient, type SupportedChain } from "@bench/shared";
import { getAddress, type Address } from "viem";
import type { Position } from "./types";

/** PancakeSwap V3's position manager and factory on BNB Chain. */
export const POSITION_MANAGER = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364" as const;
export const V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as const;

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

const FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
] as const;

/** One position somebody owns, with everything a replay needs. */
export interface OwnedPosition {
  tokenId: string;
  pool: Address;
  token0: Address;
  token1: Address;
  feePips: number;
  position: Position;
  /** How wide the band is, in ticks. Shown so a reader can judge the strategy. */
  widthTicks: number;
}

/** Why a wallet produced nothing, when it produced nothing. */
export interface PositionsRefused {
  ok: false;
  reason: string;
  /** What the reader can do about it, when there is something. */
  remedy: string | null;
}

export type PositionsResult = { ok: true; positions: OwnedPosition[] } | PositionsRefused;

/**
 * Every open PancakeSwap V3 position an address holds.
 *
 * Closed positions are dropped rather than listed at zero: a row of zeros is
 * indistinguishable from a measurement at a glance, and this page is about not
 * publishing those. If every position is closed, that is said in the reason.
 */
export async function readPositions(
  chainId: SupportedChain,
  owner: string,
  opts: { max?: number } = {},
): Promise<PositionsResult> {
  let address: Address;
  try {
    address = getAddress(owner.trim());
  } catch {
    return {
      ok: false,
      reason: `"${owner.slice(0, 24)}" is not an address this chain would recognise.`,
      remedy: "Paste a 20-byte hex address, the one that holds the position.",
    };
  }

  const client = chainClient(chainId);

  let count: bigint;
  try {
    count = (await client.readContract({
      address: POSITION_MANAGER,
      abi: NPM_ABI,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;
  } catch (e) {
    return {
      ok: false,
      reason: `The position manager could not be read for this address: ${String(e).slice(0, 90)}`,
      remedy: "This is our problem rather than yours. Try again in a moment.",
    };
  }

  if (count === 0n) {
    return {
      ok: false,
      reason: "This address holds no PancakeSwap V3 position NFTs.",
      remedy:
        "The replay needs a concentrated-liquidity position to run against. An address that has never provided liquidity on PancakeSwap V3 has nothing to replay.",
    };
  }

  const max = BigInt(opts.max ?? 12);
  const take = count < max ? count : max;

  const ids = await Promise.all(
    Array.from({ length: Number(take) }, (_, i) =>
      client
        .readContract({
          address: POSITION_MANAGER,
          abi: NPM_ABI,
          functionName: "tokenOfOwnerByIndex",
          args: [address, BigInt(i)],
        })
        .catch(() => null),
    ),
  );

  const positions: OwnedPosition[] = [];
  let closed = 0;

  for (const id of ids) {
    if (id === null) continue;
    const tokenId = id as bigint;
    const raw = await client
      .readContract({ address: POSITION_MANAGER, abi: NPM_ABI, functionName: "positions", args: [tokenId] })
      .catch(() => null);
    if (!raw) continue;

    const p = raw as readonly unknown[];
    const token0 = p[2] as Address;
    const token1 = p[3] as Address;
    const feePips = Number(p[4]);
    const tickLower = Number(p[5]);
    const tickUpper = Number(p[6]);
    const liquidity = p[7] as bigint;
    const owed0 = p[10] as bigint;
    const owed1 = p[11] as bigint;

    if (liquidity === 0n) {
      closed++;
      continue;
    }

    const pool = await client
      .readContract({
        address: V3_FACTORY,
        abi: FACTORY_ABI,
        functionName: "getPool",
        args: [token0, token1, feePips],
      })
      .catch(() => null);
    if (!pool || pool === "0x0000000000000000000000000000000000000000") continue;

    positions.push({
      tokenId: tokenId.toString(),
      pool: pool as Address,
      token0,
      token1,
      feePips,
      position: { tickLower, tickUpper, liquidity, owed0, owed1 },
      widthTicks: tickUpper - tickLower,
    });
  }

  if (positions.length === 0) {
    return {
      ok: false,
      reason:
        closed > 0
          ? `This address holds ${closed} PancakeSwap V3 position${closed === 1 ? "" : "s"}, and all of ${closed === 1 ? "it has" : "them have"} been closed — the liquidity is withdrawn.`
          : "No open position could be read for this address.",
      remedy:
        closed > 0
          ? "A closed position has nothing left to replay. Open one, or try an address that still has liquidity in a pool."
          : null,
    };
  }

  return { ok: true, positions };
}
