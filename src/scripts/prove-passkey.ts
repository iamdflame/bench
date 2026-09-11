/**
 * A passkey wallet on BNB Smart Chain: grant a session, act through it, revoke it.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/prove-passkey.ts [run]
 *
 * The admin of this wallet is a P-256 passkey, not a seed phrase or a secp256k1
 * key: every admin action (the grant, the revoke, the final sweep) is a WebAuthn
 * signature verified by the Altana account on chain. The passkey here is
 * `createHeadlessPasskey()`, the SDK's Node form: the same curve and signature
 * format as a browser passkey, with the private key held in this process
 * instead of the OS keychain. It is discarded when the process exits.
 *
 * Steps, each a transaction or a registry read:
 *   1. create the wallet (counterfactual; the relay learns the admin key)
 *   2. fund it from the principal, a plain transfer
 *   3. KeyStore read: nothing registered yet
 *   4. grant a session whose whole policy is `WBNB.deposit()` and 0.0005 BNB a
 *      day, registered in the KeyStore (the first admin action also registers
 *      the passkey itself)
 *   5. KeyStore read: the session key is valid
 *   6. through the session: wrap 0.0001 BNB
 *   7. revoke the session
 *   8. KeyStore read: the session key is no longer valid
 *   9. sweep what is left back to the principal, so nothing sits behind a key
 *      that no longer exists
 *
 * Evidence: src/data/passkey.json, and a record in the session store (no
 * secret), which /desk renders beside its live KeyStore read.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeFunctionData, formatEther, keccak256, parseAbi, parseEther, type Address, type Hex } from "viem";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";
import { gasPrice } from "@/lib/chain/marketV2";
import { activeKeys, readKey } from "@/lib/chain/keystore";
import { saveSession, toJson } from "@/lib/chain/session-store";
import { WBNB } from "@/lib/chain/leash";
import { closeDb } from "@/lib/db/client";

const MODE = process.argv[2] === "run" ? "run" : "plan";
const OUT = join(process.cwd(), "src/data/passkey.json");
const FUND = parseEther("0.002");
const WRAP = parseEther("0.0001");
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"]);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function keystoreState(wallet: Address, sessionKeyId: Hex | null, adminKeyId: Hex | null) {
  const [keys, block] = await Promise.all([activeKeys(wallet).catch(() => [] as Hex[]), marketClient.getBlockNumber()]);
  const sessionValid = sessionKeyId ? (await readKey(wallet, sessionKeyId)).valid : false;
  const adminValid = adminKeyId ? (await readKey(wallet, adminKeyId)).valid : null;
  return { block: Number(block), keys: keys.length, sessionValid, adminValid };
}

async function main() {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY is required (it funds the passkey wallet)");
  const principal = walletFor((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const [bal, price] = await Promise.all([marketClient.getBalance({ address: principal.account!.address }), gasPrice()]);
  log(`principal ${principal.account!.address} holds ${formatEther(bal)} BNB; will fund ${formatEther(FUND)}; gas ${Number(price) / 1e9} gwei`);

  const sdk = (await import("@altananetwork/sdk")) as unknown as {
    createClient: (o: { chains: unknown[] }) => {
      createWallet(o: { signer: unknown }): Promise<{ address: Address; signer: unknown }>;
      grantSession(o: Record<string, unknown>): Promise<{ publicKey: Hex; walletAddress: Address; expiry: number; transactionHash?: Hex } & Record<string, unknown>>;
      execute(o: Record<string, unknown>): Promise<{ transactionHash?: Hex; status: string }>;
      revokeSession(o: Record<string, unknown>): Promise<{ transactionHash?: Hex; status: string }>;
    };
    BNB: unknown;
    createHeadlessPasskey: () => { publicKey?: Hex } & Record<string, unknown>;
  };
  const client = sdk.createClient({ chains: [sdk.BNB] });
  const passkey = sdk.createHeadlessPasskey();
  const adminPub = (passkey.publicKey ?? null) as Hex | null;
  const adminKeyId = adminPub ? keccak256(adminPub) : null;
  log(`headless passkey created (P-256); admin key id ${adminKeyId ? adminKeyId.slice(0, 18) + "…" : "(not exposed by the signer)"}`);

  if (MODE !== "run") {
    log("plan only. Re-run with `run` to create, fund, grant, execute, revoke and sweep on mainnet.");
    return;
  }

  const wallet = await client.createWallet({ signer: passkey });
  log(`wallet ${wallet.address}`);
  const txs: Record<string, Hex | null> = {};

  txs.fund = await principal.sendTransaction({ account: principal.account!, chain: marketChain, to: wallet.address, value: FUND, gasPrice: price });
  await marketClient.waitForTransactionReceipt({ hash: txs.fund });
  log(`funded: ${txs.fund}`);

  const keystore: Record<string, Awaited<ReturnType<typeof keystoreState>>> = {};
  keystore["before the grant"] = await keystoreState(wallet.address, null, adminKeyId);
  log(`KeyStore before: ${keystore["before the grant"].keys} keys`);

  const calls = [{ to: WBNB, signature: "deposit()" }];
  const spend = [{ limit: parseEther("0.0005"), period: "day" as const }];
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const session = await client.grantSession({ wallet, signer: passkey, permissions: { calls, spend }, expiry, register: true });
  txs.grant = session.transactionHash ?? null;
  const sessionKeyId = keccak256(session.publicKey);
  log(`granted: ${txs.grant ?? "(relay reported no hash)"}; session key id ${sessionKeyId.slice(0, 18)}…`);
  keystore["after the grant"] = await keystoreState(wallet.address, sessionKeyId, adminKeyId);
  log(`KeyStore after grant: session ${keystore["after the grant"].sessionValid}, admin ${keystore["after the grant"].adminValid}, ${keystore["after the grant"].keys} keys`);

  const exec = await client.execute({ session, calls: [{ to: WBNB, value: WRAP, data: encodeFunctionData({ abi: parseAbi(["function deposit() payable"]), functionName: "deposit" }) }] });
  txs.execute = exec.transactionHash ?? null;
  const wbnbAfter = await marketClient.readContract({ address: WBNB, abi: ERC20, functionName: "balanceOf", args: [wallet.address] });
  log(`executed through the session: ${txs.execute ?? "(no hash)"} status ${exec.status}; wallet WBNB ${formatEther(wbnbAfter)}`);

  const rev = await client.revokeSession({ wallet, signer: passkey, session });
  txs.revoke = rev.transactionHash ?? null;
  log(`revoked: ${txs.revoke ?? "(no hash)"} status ${rev.status}`);
  keystore["after the revoke"] = await keystoreState(wallet.address, sessionKeyId, adminKeyId);
  log(`KeyStore after revoke: session ${keystore["after the revoke"].sessionValid}`);

  // Sweep: WBNB as a token (a native unwrap would fail on this 7702 account's
  // receive), then native minus a margin for the relay's fee.
  try {
    const nativeLeft = await marketClient.getBalance({ address: wallet.address });
    const sweepNative = nativeLeft > parseEther("0.00015") ? nativeLeft - parseEther("0.00015") : 0n;
    const sweepCalls = [
      ...(wbnbAfter > 0n ? [{ to: WBNB, data: encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [principal.account!.address, wbnbAfter] }) }] : []),
      ...(sweepNative > 0n ? [{ to: principal.account!.address, value: sweepNative }] : []),
    ];
    if (sweepCalls.length) {
      const sw = await client.execute({ wallet, signer: passkey, calls: sweepCalls });
      txs.sweep = sw.transactionHash ?? null;
      log(`swept ${formatEther(wbnbAfter)} WBNB and ${formatEther(sweepNative)} BNB back: ${txs.sweep ?? "(no hash)"}`);
    }
  } catch (e) {
    log(`sweep failed (the remainder stays on the passkey wallet): ${String((e as { details?: string }).details ?? e).slice(0, 200)}`);
    txs.sweep = null;
  }

  const record = {
    wallet: wallet.address,
    admin: { kind: "passkey (P-256, WebAuthn signatures; headless, key held in the process that ran this)", keyId: adminKeyId },
    session: { publicKey: session.publicKey, keyId: sessionKeyId, calls, spend: spend.map((s) => ({ ...s, limit: s.limit.toString() })), expiry },
    txs,
    keystore,
    executed: { description: "wrap 0.0001 BNB through the session", tx: txs.execute ?? null, wbnbAfter: formatEther(wbnbAfter) },
    at: new Date().toISOString(),
    discarded: "The passkey's private key existed only in the process that ran this and was discarded when it exited. What was left on the wallet was swept back to the principal first.",
  };
  writeFileSync(OUT, toJson(record).replace(/,"/g, ',\n  "') + "\n");
  await saveSession({
    id: `passkey:${wallet.address.toLowerCase()}`,
    kind: "passkey",
    label: "Passkey wallet session",
    walletAddress: wallet.address,
    publicKey: session.publicKey,
    keyId: sessionKeyId,
    permissions: { calls, spend },
    allowlist: calls,
    capWei: "0",
    expiry,
    registered: true,
    registrationTx: txs.grant ?? undefined,
    adminSigner: "passkey",
    grantedAt: record.at,
    grantTx: txs.grant ?? undefined,
    revokedAt: new Date().toISOString(),
    revokeTx: txs.revoke ?? undefined,
    revokedBecause: "the lifecycle proof ends with a revoke",
    meta: { executions: [{ tx: txs.execute, description: record.executed.description }] },
  });
  log(`written ${OUT}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
