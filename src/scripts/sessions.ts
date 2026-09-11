/**
 * What authority exists on the principal's account, and what we hold for it.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/sessions.ts list
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/sessions.ts revoke <keyId> [reason]
 *
 * `list` reads every key the KeyStore holds for the account and matches each
 * against the session store. A valid key the store does not know is the case
 * that matters: authority nobody here can account for. `revoke` ends one by
 * key id, reading its public key back from the KeyStore so a key whose signer
 * was lost can still be revoked, and records it in the store as what it was.
 */

import type { Address, Hex } from "viem";
import { activeKeys, readKey } from "@/lib/chain/keystore";
import { adminProvider, listSessions } from "@/lib/chain/session";
import { saveSession, toJson } from "@/lib/chain/session-store";
import { closeDb } from "@/lib/db/client";

const cmd = process.argv[2] ?? "list";
const principal = (process.env.DEMO_ADDRESS ?? "0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90") as Address;

async function list() {
  const [keys, stored] = await Promise.all([activeKeys(principal), listSessions()]);
  const byKey = new Map(stored.map((s) => [s.keyId.toLowerCase(), s]));
  console.log(`${keys.length} keys on ${principal}`);
  for (const k of keys) {
    const e = await readKey(principal, k);
    const s = byKey.get(k.toLowerCase());
    const when = e.expiry ? new Date(e.expiry * 1000).toISOString().slice(0, 16) : "no expiry";
    console.log(`${k}  ${e.valid ? "VALID  " : "invalid"}  ${when}  ${s ? `${s.id} (${s.revokedAt ? "revoked" : "held"})` : e.valid ? "NOT IN THE STORE" : "-"}`);
  }
}

async function revoke(keyId: Hex, reason: string) {
  const e = await readKey(principal, keyId);
  if (!e.publicKey) throw new Error("the KeyStore has no public key for that id");
  if (!e.valid) {
    console.log("already not valid; nothing to revoke");
    return;
  }
  const result = await adminProvider().revokeSession(e.publicKey);
  console.log(`revoked: ${result.transactionHash ?? "(relay did not report a hash)"} status ${result.status}`);
  const after = await readKey(principal, keyId);
  console.log(`isValidKey after: ${after.valid}`);
  await saveSession({
    id: `orphan:${keyId.slice(0, 18)}`,
    kind: "house",
    label: "Orphaned key, revoked",
    walletAddress: principal,
    publicKey: e.publicKey,
    keyId,
    permissions: null,
    allowlist: [],
    capWei: "0",
    expiry: e.expiry ?? 0,
    registered: true,
    adminSigner: "private-key",
    grantedAt: new Date().toISOString(),
    revokedAt: new Date().toISOString(),
    revokeTx: result.transactionHash,
    revokedBecause: reason,
  });
  console.log(toJson({ keyId, revokeTx: result.transactionHash, validAfter: after.valid }));
}

(async () => {
  if (cmd === "list") await list();
  else if (cmd === "revoke") await revoke(process.argv[3] as Hex, process.argv.slice(4).join(" ") || "revoked by the operator");
  else throw new Error(`unknown command ${cmd}`);
})()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
