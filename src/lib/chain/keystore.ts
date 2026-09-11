/**
 * Reads the Altana KeyStore on BNB Smart Chain.
 *
 * A session's authority is enforced by the account contract, and its
 * *visibility* comes from the KeyStore registry: `registerSessionKey` writes
 * the key id, its expiry and its revocation state where any third party can
 * read them. `/desk` shows the policy this site holds beside what the
 * registry holds, so "matches" is a comparison, not a claim.
 *
 * Addresses and call shapes are lifted from `@altananetwork/sdk`'s config and
 * `internal/keystore` (v0.7.1). Key id convention: `keccak256(publicKey)`,
 * SEC1 uncompressed for secp256k1 and P-256 alike.
 */

import { keccak256, parseAbi, type Address, type Hex } from "viem";
import { bscClient } from "./rpc";

export const KEYSTORE: Address = "0x6572427ED530BadcF7375Cf9A4709D8d2b0E7E0a";
export const KEYSTORE_CONTROLLER: Address = "0x0834Ee2C9BdC3E3efF0a2dC34393D4B0e546A555";

const ABI = parseAbi([
  "function getKeys(address user) view returns (bytes32[])",
  "function isValidKey(address user, bytes32 keyId) view returns (bool)",
  "function getPublicKey(address user, bytes32 keyId) view returns (bytes)",
  // Not in the SDK's fragment list; found by probing the deployed contract
  // (returns the stored uint40 expiry, checked against four known sessions).
  "function getExpiry(address user, bytes32 keyId) view returns (uint256)",
]);

export const keyIdOf = (publicKey: Hex): Hex => keccak256(publicKey);

export interface KeystoreEntry {
  keyId: Hex;
  /** `isValidKey`: registered, unexpired, unrevoked. */
  valid: boolean;
  /** The registry's stored expiry, 0 when the key was never registered. */
  expiry?: number;
  /**
   * Inferred: the registry exposes no revoked getter, but a key whose
   * expiry is in the future and is still not valid can only be revoked.
   */
  revoked?: boolean;
  /** The stored public key; empty when never registered. */
  publicKey?: Hex;
}

export async function activeKeys(user: Address): Promise<Hex[]> {
  const keys = await bscClient().readContract({ address: KEYSTORE, abi: ABI, functionName: "getKeys", args: [user] });
  return [...keys];
}

export async function isValidKey(user: Address, keyId: Hex): Promise<boolean> {
  return bscClient().readContract({ address: KEYSTORE, abi: ABI, functionName: "isValidKey", args: [user, keyId] });
}

/** Everything the registry will say about one key, tolerant of missing views. */
export async function readKey(user: Address, keyId: Hex): Promise<KeystoreEntry> {
  const c = bscClient();
  const valid = await c.readContract({ address: KEYSTORE, abi: ABI, functionName: "isValidKey", args: [user, keyId] }).catch(() => false);
  const [expiry, publicKey] = await Promise.all([
    c.readContract({ address: KEYSTORE, abi: ABI, functionName: "getExpiry", args: [user, keyId] }).then(Number).catch(() => undefined),
    c.readContract({ address: KEYSTORE, abi: ABI, functionName: "getPublicKey", args: [user, keyId] }).catch(() => undefined),
  ]);
  const registered = Boolean(publicKey && publicKey !== "0x");
  const revoked = registered && !valid && expiry !== undefined && expiry * 1000 > Date.now();
  return { keyId, valid, expiry, revoked, publicKey: registered ? (publicKey as Hex) : undefined };
}

export interface PolicyMatch {
  /** What the comparison concluded. */
  verdict: "matches" | "registry says revoked" | "registry says expired" | "not registered" | "expiry differs" | "unreadable";
  registry: KeystoreEntry | null;
  block?: number;
}

/**
 * Compares the policy this site holds for a session with the registry.
 *
 * "Matches" means: the key id derived from the public key we hold is a valid
 * entry on the wallet, and where the registry exposes an expiry it equals the
 * one we hold. A revoked session should read "registry says revoked", which is
 * the correct state after a revoke and is shown as such, not as a failure.
 */
export async function comparePolicy(opts: {
  wallet: Address;
  publicKey: Hex;
  expiry: number;
  registered: boolean;
  revoked: boolean;
}): Promise<PolicyMatch> {
  const keyId = keyIdOf(opts.publicKey);
  let entry: KeystoreEntry;
  let block: number | undefined;
  try {
    [entry, block] = await Promise.all([readKey(opts.wallet, keyId), bscClient().getBlockNumber().then(Number)]);
  } catch {
    return { verdict: "unreadable", registry: null };
  }
  if (!entry.publicKey) return { verdict: "not registered", registry: entry, block };
  if (entry.valid) {
    if (entry.expiry && entry.expiry !== opts.expiry) return { verdict: "expiry differs", registry: entry, block };
    return { verdict: "matches", registry: entry, block };
  }
  if (entry.revoked || opts.revoked) return { verdict: "registry says revoked", registry: entry, block };
  if (opts.expiry * 1000 < Date.now()) return { verdict: "registry says expired", registry: entry, block };
  return { verdict: "not registered", registry: entry, block };
}
