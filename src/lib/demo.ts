/**
 * The demo address and the committed evidence of what happened to it.
 *
 * Every file read here was written by a script at the moment a transaction
 * landed (`src/scripts/demo-inventory.ts`, `range-recenter.ts`,
 * `split-adjudicator.ts`, `prove-passkey.ts`). They are records with hashes
 * in them, and pages that show them also read the chain live beside them.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Address, Hex } from "viem";

export const DEMO_ADDRESS: Address = "0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90";

function read<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "src/data", name), "utf8")) as T;
  } catch {
    return null;
  }
}

export interface DemoPosition {
  tokenId: number;
  tx: Hex;
  range: { lower: number; upper: number };
}

export interface DemoRecord {
  address: Address;
  positions: { outOfRangeBelow: DemoPosition; outOfRangeAbove: DemoPosition; recenterTarget: DemoPosition };
  venus?: { opened: boolean; suppliedUsdt?: string; borrowedUsdt?: string };
  txs: Record<string, Hex>;
  tickAtMint: number;
  findings?: Record<string, string>;
}

export interface RecenterRun {
  agent: string;
  principal: Address;
  recipientBound: Address;
  session: { id: string; publicKey?: Hex; keyId?: Hex; expiry?: number; registrationTx?: Hex; keystore?: string };
  before: { tokenId: string; range: [number, number]; tick: number; liquidity: string; owner: Address };
  after: { tokenId: string; range: [number, number]; tick: number; liquidity: string; owner: Address; inRange: boolean };
  sameOwnerThroughout: boolean;
  txs: { decreaseLiquidity: Hex; collect: Hex; mint: Hex };
  blocks: { decreaseLiquidity: number; collect: number; mint: number };
  at: string;
}

export interface RolesRecord {
  market: Address;
  owner: Address;
  adjudicator: Address;
  ownerIsSafe: boolean;
  split: boolean;
  txs: { fund: Hex | null; nominate: Hex; accept: Hex };
  block: number;
  at: string;
}

export interface PasskeyRecord {
  wallet: Address;
  admin: { kind: string; keyId: Hex | null };
  session: { publicKey: Hex; keyId: Hex; calls: { to: Address; signature: string }[]; spend: { limit: string; period: string; token?: Address }[]; expiry: number };
  txs: Record<string, Hex | null>;
  keystore: Record<string, { block: number; sessionValid: boolean; adminValid?: boolean | null; keys?: number }>;
  executed: { description: string; tx: Hex | null; wbnbAfter: string };
  at: string;
  discarded: string;
}

export const demoRecord = () => read<DemoRecord>("demo.json");
export const recenterRecord = () => read<{ latest: RecenterRun; runs: RecenterRun[] }>("recenter.json");
export const rolesRecord = () => read<RolesRecord>("roles.json");
export const passkeyRecord = () => read<PasskeyRecord>("passkey.json");

export const bscscanTx = (h: string) => `https://bscscan.com/tx/${h}`;
export const bscscanAddress = (a: string) => `https://bscscan.com/address/${a}`;
export const short = (h: string, a = 10, b = 6) => (h.length > a + b ? `${h.slice(0, a)}…${h.slice(-b)}` : h);
