/**
 * Rail 3's engine: granting, registering, pausing and revoking authority.
 *
 * A session here is standing permission over somebody's money, so every design
 * decision in this file is about making that permission small, visible, and
 * endable.
 *
 * ---------------------------------------------------------------------------
 * Four properties, in the order they matter
 * ---------------------------------------------------------------------------
 *
 * **The grant cannot be wider than the evidence.** `grantEngagement` takes a
 * `ProvenScope` and nothing else. That type carries a symbol its own module
 * does not export, so it cannot be constructed anywhere but the capability
 * scan — a grant that skipped the scan does not compile. `granted ⊆ proven`
 * is therefore a property of the type system rather than a check somebody has
 * to remember to call.
 *
 * **The session key is ours to reconstruct.** The signer is generated here and
 * its key persisted, rather than letting the SDK mint one we can only hold in
 * memory. Without that, a process restart leaves a live key on chain that
 * nothing can revoke — authority with no off switch, which is the worst
 * failure this rail has.
 *
 * **Registration is reported with its transaction or not at all.** `registered:
 * true` on its own is a boolean in a JSON file on one machine, which is exactly
 * the unverifiable assertion this product exists to refuse. So the KeyStore
 * registration is confirmed by reading the account's own `Authorize` log, and
 * if that log is not found the session is recorded as unregistered even when
 * the SDK said otherwise.
 *
 * **Revocation is the same event as ending the engagement.** A hire that ends
 * while the key stays live is not an ended hire.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  BNB,
  BNB_TESTNET,
  createClient,
  createPrivateKeySigner,
  registerSessionKey,
  signerFromPrivateKey,
  type Client,
  type NetworkConfig,
  type Session,
  type Signer,
  type Wallet,
} from "@altananetwork/sdk";
import { parseAbiItem, type Address, type Hex } from "viem";
import {
  KEYSTORE,
  chainClient,
  logClients,
  type JobSlug,
  type SupportedChain,
} from "@bench/shared";
import { leashFor, permissionsFor, type LeashDoc, type ProvenScope } from "./mandate";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const NETWORKS: Record<SupportedChain, NetworkConfig> = { 56: BNB, 97: BNB_TESTNET };

let cached: { chainId: SupportedChain; client: Client } | null = null;

export function altana(chainId: SupportedChain): Client {
  if (cached?.chainId === chainId) return cached.client;
  const client = createClient({ chains: [NETWORKS[chainId]] });
  cached = { chainId, client };
  return client;
}

const norm = (k: string): Hex => (k.startsWith("0x") ? k : `0x${k}`) as Hex;

/**
 * The principal — the account whose money a session acts on.
 *
 * Its address is the smart-account address, which for a private-key signer is
 * the signer's own address under EIP-7702. Absent a key this throws rather
 * than returning a placeholder: a caller that thinks it has a principal and
 * does not would grant against nothing.
 */
export function principal(privateKey = process.env.PRINCIPAL_KEY ?? process.env.PRIVATE_KEY): {
  wallet: Wallet;
  signer: Signer;
} {
  if (!privateKey) {
    throw new Error(
      "No principal key is configured. Rail 3 grants authority over the principal's own account, so there is nothing to grant without one.",
    );
  }
  const signer = signerFromPrivateKey(norm(privateKey));
  return { wallet: { address: signer.address }, signer };
}

export const hasPrincipal = () => Boolean(process.env.PRINCIPAL_KEY ?? process.env.PRIVATE_KEY);

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export interface Engagement {
  /** Monotonic, per deployment. The desk's row key. */
  id: number;
  chainId: SupportedChain;
  job: JobSlug;
  /** The listing this authority was granted for. */
  tokenId: string | null;
  agentName: string;
  /** The wallet whose money the session acts on. */
  principal: Address;
  /** The session key's public identifier. Revocation is keyed on this. */
  sessionKey: Hex;
  /** The account the session acts through. */
  account: Address;
  capWei: string;
  /** Unix seconds. On chain, not in a config file. */
  expiry: number;
  /** Exactly what it may call. */
  allowlist: { to: string; signature: string }[];
  /** What this job permits that this agent did not earn. The interesting half. */
  withheld: { signature: string; because: string }[];
  provenVenues: string[];
  rationale: string;
  registered: boolean;
  /** Present only when the account's own log confirmed it. */
  registrationTx?: string;
  registrationBlock?: number;
  registrationKeyHash?: string;
  /** The recipient-binding wrapper under any call that carries a destination. */
  wrapper?: Address;
  grantedAt: string;
  /** On chain and final. */
  revokedAt?: string;
  revokedTx?: string;
  /**
   * Set when the chain has no key for this engagement — a grant interrupted
   * between writing the record and authorizing the key. Distinct from
   * `revokedAt`, which is a claim about a transaction that happened.
   */
  orphanedAt?: string;
  orphanedReason?: string;
  /** Ours, off chain, reversible. A paused session exists and cannot get a signer. */
  pausedAt?: string;
  /**
   * True when the grant reached chain but this record could not be written to
   * disk — a serverless filesystem is read-only, and a real grant reported as
   * an error is worse than one reported as uncommitted.
   */
  uncommitted?: boolean;
}

/*
  Two homes, because a session has a secret half and a public half.

  The signer never leaves the machine that granted it. Everything else — the
  key's public identifier, the allowlist, the cap, the expiry — is readable on
  chain by anyone, so it belongs where the deployed site can render it. Keeping
  both in the ignored directory is why an earlier build could only ever report
  "observing only" in production.
*/
const SECRET_DIR = join(process.cwd(), ".sessions");
const PUBLIC_FILE = join(process.cwd(), "apps/web/data/engagements.json");

const secretPath = (id: number) => join(SECRET_DIR, `engagement-${id}.key`);

/** Held when the filesystem refuses. The chain is the record; this is a cache. */
const inMemory = new Map<number, Engagement>();

function writeAtomic(path: string, text: string, mode?: number) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, mode === undefined ? undefined : { mode });
  renameSync(tmp, path);
}

export function readEngagements(): Engagement[] {
  let stored: Engagement[] = [];
  try {
    if (existsSync(PUBLIC_FILE)) stored = JSON.parse(readFileSync(PUBLIC_FILE, "utf8")) as Engagement[];
  } catch {
    stored = [];
  }
  const byId = new Map(stored.map((e) => [e.id, e]));
  for (const [id, e] of inMemory) byId.set(id, e);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

export const readEngagement = (id: number): Engagement | null =>
  readEngagements().find((e) => e.id === id) ?? null;

export function nextEngagementId(): number {
  const all = readEngagements();
  return all.length === 0 ? 1 : Math.max(...all.map((e) => e.id)) + 1;
}

function persist(e: Engagement, sessionKeyHex?: Hex): Engagement {
  try {
    if (sessionKeyHex) writeAtomic(secretPath(e.id), sessionKeyHex, 0o600);
    const all = readEngagements().filter((x) => x.id !== e.id);
    writeAtomic(PUBLIC_FILE, JSON.stringify([...all, e].sort((a, b) => a.id - b.id), null, 1));
    inMemory.delete(e.id);
    return e;
  } catch {
    const uncommitted = { ...e, uncommitted: true };
    inMemory.set(e.id, uncommitted);
    return uncommitted;
  }
}

/**
 * Rebuild a live session from what was stored.
 *
 * Returns null for a paused engagement. Pausing is this deployment's own hold:
 * the session still exists on chain and still has its term running, it simply
 * cannot get a signer from here. That is a weaker guarantee than revocation
 * and the desk says so.
 */
export function loadSession(id: number): Session | null {
  const e = readEngagement(id);
  if (!e || e.revokedAt || e.pausedAt) return null;
  if (!existsSync(secretPath(id))) return null;
  const key = readFileSync(secretPath(id), "utf8").trim() as Hex;
  return {
    walletAddress: e.account,
    signer: signerFromPrivateKey(key),
    publicKey: e.sessionKey,
    permissions: { calls: e.allowlist.map((c) => ({ to: c.to as Address, signature: c.signature })) },
    expiry: e.expiry,
  };
}

// ---------------------------------------------------------------------------
// KeyStore proof
// ---------------------------------------------------------------------------

/**
 * The account's key-authorisation event.
 *
 * Recovered by inspecting a known registration rather than taken from an ABI:
 * the delegated account emits exactly one per grant, carrying the key's hash
 * in an indexed argument. Altana derives that hash in a way this code does not
 * reproduce, so it is recorded rather than recomputed — the honest form of
 * "here is the evidence, check it yourself".
 */
export const AUTHORIZE_TOPIC =
  "0x3d3a48be5a98628ecf98a6201185102da78bbab8f63a4b2d6b9eef354f5131f5" as Hex;

const AUTHORIZE = parseAbiItem("event Authorize(bytes32 indexed keyHash)");

export interface RegistrationProof {
  tx: string;
  block: number;
  keyHash: string;
}

/**
 * Find the transaction that authorised a key on the account.
 *
 * The principal's wallet carries an EIP-7702 delegation, so the grant is not
 * sent *from* it — the relay submits and the delegated account pays. Searching
 * for a transaction from the principal finds nothing; the account appears as a
 * log emitter instead, which is what this looks for.
 *
 * Retried, because a log index that has not caught up returns an empty result
 * indistinguishable from "no registration happened", and recording no evidence
 * when evidence exists is the failure that matters here.
 */
export async function findRegistrationTx(
  chainId: SupportedChain,
  account: Address,
  fromBlock: bigint,
  attempts = 5,
): Promise<RegistrationProof | null> {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2_000));
    const head = await chainClient(chainId).getBlockNumber().catch(() => fromBlock);
    for (const reader of logClients(chainId)) {
      try {
        const logs = await reader.getLogs({
          address: account,
          event: AUTHORIZE,
          fromBlock: fromBlock > 0n ? fromBlock : head - 200n,
          toBlock: head,
        });
        const last = logs.at(-1);
        if (last?.transactionHash) {
          return {
            tx: last.transactionHash,
            block: Number(last.blockNumber ?? 0n),
            keyHash: String(last.args?.keyHash ?? ""),
          };
        }
      } catch {
        // Next host. Providers decline ranges; that is ordinary here.
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Granting
// ---------------------------------------------------------------------------

export interface GrantOptions {
  chainId: SupportedChain;
  /** Derived from the capability scan. There is no other way to obtain one. */
  scope: ProvenScope;
  tokenId: string | null;
  agentName: string;
  /** Spend cap. A promise, and an unbounded one is not a promise. */
  capWei: bigint;
  ttlSeconds: number;
  /**
   * Register the key in the Altana KeyStore.
   *
   * Enforcement is identical either way — the account authorisation already
   * bounds permissions and expiry. Registration is what lets a counterparty
   * verify that authority without asking us, which is the entire reason it is
   * worth the gas.
   */
  register?: boolean;
}

export interface GrantResult {
  engagement: Engagement;
  leash: LeashDoc;
  /** The relay's transaction for the grant, when it surfaced one. */
  transactionHash?: string;
}

export async function grantEngagement(opts: GrantOptions): Promise<GrantResult> {
  const { chainId, scope } = opts;
  const client = altana(chainId);
  const { wallet, signer } = principal();

  const expiry = Math.floor(Date.now() / 1000) + opts.ttlSeconds;

  /*
    The session signer is generated here, not by the SDK.

    The SDK will mint one if asked, and hand it back inside a Session object we
    could only hold in memory. A restart would then leave a live key on chain
    that nothing could revoke. Generating it means the key can be written down,
    reloaded, and ended.
  */
  const sessionSigner = createPrivateKeySigner();

  // Pinned before the grant so the registration search window is exact.
  const before = await chainClient(chainId).getBlockNumber().catch(() => 0n);

  const granted = await client.grantSession({
    wallet,
    signer,
    sessionSigner,
    permissions: permissionsFor(scope, { capWei: opts.capWei, period: "day" }),
    expiry,
    register: opts.register ?? true,
    chainId,
  });

  /*
    Registration is confirmed from the account's own log, not from the SDK's
    return value. If the log is not there, the session is recorded as
    unregistered — a claim about on-chain visibility with no on-chain evidence
    is the thing this product exists to refuse, and our own grant is not
    exempt.
  */
  const proof = opts.register === false ? null : await findRegistrationTx(chainId, wallet.address, before);

  const engagement: Engagement = {
    id: nextEngagementId(),
    chainId,
    job: scope.job,
    tokenId: opts.tokenId,
    agentName: opts.agentName,
    principal: wallet.address,
    sessionKey: granted.publicKey,
    account: granted.walletAddress,
    capWei: opts.capWei.toString(),
    expiry,
    allowlist: scope.calls.map((c) => ({ to: c.to, signature: c.signature })),
    withheld: scope.withheld,
    provenVenues: scope.proven,
    rationale: scope.rationale,
    registered: Boolean(proof),
    ...(proof
      ? { registrationTx: proof.tx, registrationBlock: proof.block, registrationKeyHash: proof.keyHash }
      : {}),
    ...(scope.calls.some((c) => c.recipient?.by === "wrapper")
      ? { wrapper: scope.calls.find((c) => c.recipient?.by === "wrapper")!.to }
      : {}),
    grantedAt: new Date().toISOString(),
  };

  const stored = persist(engagement, (sessionSigner as { _privateKey: Hex })._privateKey);

  return {
    engagement: stored,
    leash: leashFor(scope, {
      capText: `${opts.capWei} wei per day`,
      expiryText: new Date(expiry * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC",
    }),
    ...(granted.transactionHash ? { transactionHash: granted.transactionHash } : {}),
  };
}

/**
 * Register a key granted without registration. Idempotent, and cheap to retry.
 *
 * Split out because registration costs gas and a grant should not fail for
 * want of it. A session that enforces correctly but is invisible to KeyStore
 * readers is a working session with a missing receipt.
 */
export async function registerEngagement(id: number): Promise<Engagement | null> {
  const e = readEngagement(id);
  const session = loadSession(id);
  if (!e || !session) return null;

  const { wallet, signer } = principal();
  const before = await chainClient(e.chainId).getBlockNumber().catch(() => 0n);

  await registerSessionKey(wallet, signer, session, { network: NETWORKS[e.chainId] });
  const proof = await findRegistrationTx(e.chainId, wallet.address, before);
  if (!proof) return e;

  return persist({
    ...e,
    registered: true,
    registrationTx: proof.tx,
    registrationBlock: proof.block,
    registrationKeyHash: proof.keyHash,
  });
}

// ---------------------------------------------------------------------------
// Ending it
// ---------------------------------------------------------------------------

/**
 * End an agent's authority, on chain, immediately.
 *
 * The stored key is *not* deleted on success. The engagement stays on the desk
 * showing what it was allowed to do and when it ended, because a revoked hire
 * that vanishes tells a reader less than one that stays and says "this is
 * over". What is gone is the authority, and the transaction proves it.
 */
export async function revokeEngagement(id: number): Promise<Engagement> {
  const e = readEngagement(id);
  if (!e) throw new Error(`No engagement ${id}.`);
  if (e.revokedAt) return e;

  const session = loadSession(id);
  const { wallet, signer } = principal();

  const result = await altana(e.chainId).revokeSession({
    wallet,
    signer,
    // The public key alone is enough to revoke; the full session is used when
    // it is available because the SDK can then check what it is ending.
    session: session ?? e.sessionKey,
    chainId: e.chainId,
  });

  return persist({
    ...e,
    revokedAt: new Date().toISOString(),
    ...(result.transactionHash ? { revokedTx: result.transactionHash } : {}),
  });
}

/**
 * This deployment's own hold. Off chain, reversible, and weaker than revoking.
 *
 * A paused engagement still exists on chain and its term is still running; it
 * simply cannot obtain a signer from here. The desk says exactly that, because
 * presenting a pause as though it were a revocation would be describing a
 * control that does not do what its name implies.
 */
export function pauseEngagement(id: number, paused: boolean): Engagement | null {
  const e = readEngagement(id);
  if (!e || e.revokedAt) return null;
  const next = { ...e };
  if (paused) next.pausedAt = new Date().toISOString();
  else delete next.pausedAt;
  return persist(next);
}

/** Live means granted, not revoked, not expired. Paused is live and held. */
export function isLive(e: Engagement, now = Math.floor(Date.now() / 1000)): boolean {
  return !e.revokedAt && !e.orphanedAt && e.expiry > now;
}

/**
 * Mark an engagement the chain has no key for.
 *
 * A grant is two things: a local record and a key on the account. Interrupt the
 * process between them — which happened on 2026-09-08, when a diagnostic run was
 * killed mid-grant — and the record survives while the key never existed.
 * `revokeEngagement` then answers `KeyDoesNotExist`, and `isLive` went on
 * reporting a session that was never on chain, which is `/desk` telling someone
 * they have authority outstanding that nobody ever had.
 *
 * It is recorded as orphaned rather than revoked, because revoked is a claim
 * about a transaction and there was none. The distinction is the whole point:
 * "we ended it" and "it never began" are different facts, and only one of them
 * has a hash.
 */
export function markOrphaned(id: number, reason: string): Engagement | null {
  const e = readEngagement(id);
  if (!e) return null;
  return persist({ ...e, orphanedAt: new Date().toISOString(), orphanedReason: reason });
}

export const keystoreUrl = (chainId: SupportedChain) => KEYSTORE[chainId];
