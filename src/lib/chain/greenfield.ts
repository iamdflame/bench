/**
 * BNB Greenfield: where an attestation's full preimage lives.
 *
 * The contract commits `observationHash` and emits the observation struct, so
 * the *arithmetic* of a settlement is already checkable from the chain alone —
 * that is deliberate, and it is why `mandate-verify` needs no external service.
 *
 * What the event cannot carry is the working: every token balance, the pool
 * state the valuation used, the gas, the block. Putting that on chain would
 * cost more than it is worth and putting it on our own server would make the
 * evidence ours to withdraw. Greenfield is BNB Chain's own storage, so the
 * breakdown lives where neither we nor a single host can quietly remove it.
 *
 * The object's content hashes to the `breakdownRef` recorded in the
 * observation, so a reader fetches it, hashes it, and compares — the same
 * discipline as everything else here.
 */

import { keccak256, toHex } from "viem";
import type { Address } from "viem";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const GREENFIELD_RPC = "https://greenfield-chain.bnbchain.org";
export const GREENFIELD_CHAIN_ID = "1017";
/** TokenHub on BSC. The bridge in is a BSC transaction, not a Greenfield one. */
export const TOKEN_HUB = "0xeA97dF87E6c7F68C9f95A69dA79E19B834823F25" as const;
export const CROSS_CHAIN = "0x77e719b714be09F70D484AB81F70D02B0E182f7d" as const;

export const TOKEN_HUB_ABI = [
  {
    type: "function",
    name: "transferOut",
    stateMutability: "payable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export const CROSS_CHAIN_ABI = [
  {
    type: "function",
    name: "getRelayFees",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
] as const;

/**
 * The SDK's ESM build imports without file extensions, which Node's resolver
 * rejects outright. The CommonJS build is fine, so it is required rather than
 * imported — a packaging bug in a dependency, worked around explicitly so the
 * next person does not rediscover it.
 */
export async function greenfieldClient(): Promise<any> {
  return (await sdk()).Client.create(GREENFIELD_RPC, GREENFIELD_CHAIN_ID);
}

/** The SDK module itself, for the types it expects on the wire. */
export async function sdk(): Promise<any> {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  return require("@bnb-chain/greenfield-js-sdk");
}

export interface Breakdown {
  schema: "mandate.observation.breakdown/1";
  mandateId: number;
  epoch: number | "open";
  wallet: Address;
  blockNumber: string;
  valuationWei: string;
  gasSpentWei: string;
  /** Every asset counted, with the exact integer that entered the total. */
  parts: { asset: string; amount: string; wei: string }[];
  pool: {
    address: Address;
    sqrtPriceX96: string;
    priceUsdtPerBnb: string;
  };
  observationHash: string;
  takenAt: string;
}

/**
 * The canonical bytes of a breakdown.
 *
 * Sorted keys, no whitespace: two parties must derive the same digest from the
 * same facts, and JSON key order is not a fact.
 */
export function canonicalBreakdown(b: Breakdown): string {
  const sort = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(sort);
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sort(o[k])]));
  };
  return JSON.stringify(sort(b));
}

/** The digest recorded on chain as `breakdownRef`. */
export function breakdownRef(b: Breakdown): `0x${string}` {
  return keccak256(toHex(canonicalBreakdown(b)));
}

/** Deterministic object name, so a reader can find it without an index. */
export const objectName = (mandateId: number, epoch: number | "open") =>
  `mandate-${mandateId}/${epoch === "open" ? "open" : `epoch-${epoch}`}.json`;

export const bucketName = () => process.env.GREENFIELD_BUCKET ?? "mandate-attestations";

/** Public gateway URL for an object, for anyone who would rather click. */
export const objectUrl = (bucket: string, object: string) =>
  `https://greenfield-sp.bnbchain.org/view/${bucket}/${object}`;

/**
 * A body the SDK will actually upload.
 *
 * In Node, the SDK does this before sending:
 *
 *   const sendFile = isNode && contentType === 'application/json'
 *     ? file.toString() : file;
 *
 * A `File`'s `toString()` is `"[object File]"` — thirteen bytes — while the
 * request already declared `payload_size` from `file.size`. The storage
 * provider therefore rejects every JSON upload with "file payload size is
 * inconsistent with the parameter payload size".
 *
 * So the body is a plain object with an honest `size` and a `toString()` that
 * returns the content. It satisfies both the code that measures it and the
 * code that sends it, which a File does not.
 */
export function jsonBody(text: string) {
  const bytes = new TextEncoder().encode(text);
  return {
    size: bytes.byteLength,
    type: "application/json",
    toString: () => text,
    text: async () => text,
    arrayBuffer: async () => bytes.buffer,
  };
}
