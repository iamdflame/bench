/**
 * How many agents the ERC-8004 identity registry holds, read from the chain.
 *
 * `totalSupply()` reverts on this registry, and 8004scan's figure (311,300 at
 * the time of writing) is whatever their indexer has reached. The registry's
 * own counter lives in one storage slot; reading it is the count, at a block,
 * with no one's indexer in between. Muster enumerates the same way.
 *
 * Slot found by diffing storage across a registration and confirmed against
 * the next minted token id. Verify:
 *
 *   cast storage 0x8004a169fb4a3325136eb29fa0ceb6d2e539a432 \
 *     0xa040f782729de4970518741823ec1276cbcd41a0c7493f62d173341566a04e00 \
 *     --rpc-url https://bsc-rpc.publicnode.com
 */

import { hexToBigInt, type Hex } from "viem";
import { IDENTITY_REGISTRY } from "@/lib/config";
import { bscClient } from "@/lib/chain/rpc";
import { memo } from "@/lib/cache";

export const COUNTER_SLOT: Hex = "0xa040f782729de4970518741823ec1276cbcd41a0c7493f62d173341566a04e00";

export interface RegistryCount {
  count: number;
  block: number;
  at: string;
  source: "chain";
  verify: string;
}

async function readUncached(): Promise<RegistryCount> {
  const c = bscClient();
  const block = await c.getBlockNumber();
  const raw = await c.getStorageAt({ address: IDENTITY_REGISTRY as `0x${string}`, slot: COUNTER_SLOT, blockNumber: block });
  if (!raw) throw new Error("registry counter slot read empty");
  return {
    count: Number(hexToBigInt(raw)),
    block: Number(block),
    at: new Date().toISOString(),
    source: "chain",
    verify: `cast storage ${IDENTITY_REGISTRY} ${COUNTER_SLOT} --block ${block} --rpc-url https://bsc-rpc.publicnode.com`,
  };
}

/** Cached one minute; every page that prints the number prints the block. */
export function registeredCount(): Promise<RegistryCount> {
  return memo("registry-count", { freshMs: 60_000, staleMs: 10 * 60_000 }, readUncached);
}
