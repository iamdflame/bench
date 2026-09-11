/**
 * Bounded delegation, via Altana ERC-8183 session keys.
 *
 * This is the half of the mandate that was missing. Until now an agent won a
 * mandate and then "traded off-vault", which in practice meant it did nothing
 * and the adjudicator invented a number. A mandate now carries real authority:
 *
 *   - a spend cap, no larger than the capital under mandate
 *   - a call allowlist bound to target *and* selector, containing only the
 *     protocols the agent's category actually needs
 *   - an expiry that ends with the mandate's term
 *   - revocation, which is the same event as being dismissed
 *
 * The principal keeps its keys. The agent gets a scoped session key and can do
 * nothing else with it. That is the whole point: the bond makes an agent
 * accountable for outcomes, and the session makes it incapable of anything
 * outside its brief.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  AltanaWalletProvider,
  defaultAgentPermissions,
  serializeSession,
  deserializeSession,
  type StrictAgentCallPermission,
} from "@bnbagent/sdk/wallets";
import { keccak256, type Hex } from "viem";
import { CATEGORY_LABEL, type Category } from "@/lib/config";
// Type-only, so the mutual reference with scope.ts is erased at runtime.
import type { ProvenScope } from "./scope";
import { logClients, marketClient, MARKET_ADDRESS } from "./market";
import { GRID_CALLS, RANGE_CALLS } from "./leash";
import {
  getSession,
  listSessions,
  loadSerialized,
  mandateSessionId,
  markRevoked,
  saveSession,
  type SessionKind,
  type SessionRecord,
} from "./session-store";

/**
 * Two homes, because a session has a secret half and a public half.
 *
 * The serialized session contains the signer and never leaves the machine that
 * granted it. Its metadata, the public key, the allowlist, the cap, the
 * expiry, is all readable on chain by anyone, so it belongs in the repository
 * where the deployed site can show what authority exists. Keeping both in the
 * ignored directory meant production could only ever report "observing only".
 */
const SESSION_DIR = ".sessions";
const PUBLIC_INDEX_REL = "src/data/sessions.json";
/**
 * Resolved from the working directory, matching the other data readers.
 *
 * A bare relative path resolves against wherever the process happens to be,
 * which on a serverless function is not the project root, the file was
 * deployed and simply never found, so every agent reported "observing only".
 */
const PUBLIC_INDEX = join(process.cwd(), PUBLIC_INDEX_REL);

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;

// ---------------------------------------------------------------------------
// The allowlist
// ---------------------------------------------------------------------------

/**
 * Exactly the calls each category needs, and nothing else.
 *
 * Every call here has one property in common: none of them lets the caller
 * name where value goes. That is the whole security argument, so it is a test
 * (`src/lib/__tests__/allowlist.test.ts`) rather than a comment:
 *
 *   - Rebalancing is granted on RecipientBound, never on the position manager,
 *     whose `mint` and `collect` take a `recipient`.
 *   - Grid is granted on SwapBound, never on the router, whose
 *     `exactInputSingle` takes a `recipient`.
 *   - Yield and health-factor call Venus markets directly, because `mint`,
 *     `redeemUnderlying` and `repayBorrow` act for the caller and have no
 *     recipient. `repayBorrowBehalf`, `borrow` and anything `approve`-shaped
 *     are absent on purpose.
 *   - MasterChef `harvest(uint256,address)` was here and is gone: its second
 *     argument is the recipient of the rewards.
 *
 * vUSDT sits beside vBNB because a principal whose account is EIP-7702
 * delegated cannot receive native BNB from vBNB's 2,300-gas `transfer`
 * (measured: the demo address costs 26,277 gas to receive), so a vBNB redeem
 * reverts for it. ERC-20 markets have no such limit.
 *
 * `protocol` names the contract whose use by the agent is the evidence for
 * granting the call; for a leash it is the protocol behind the leash.
 */
export type CategoryCall = StrictAgentCallPermission & { protocol?: string };

const VENUS_VUSDT = "0xfd5840cd36d94d7229439859c0112a4185bc0255" as const;
const VENUS_VBNB = "0xa07c5b74c9b40447a954e1466938b865b6bbea36" as const;
const VENUS_COMPTROLLER = "0xfd36e2c2a6789db23113685031d7f16329158384" as const;

export const CATEGORY_CALLS: Record<Category, CategoryCall[]> = {
  "grid-trading": GRID_CALLS,
  rebalancing: RANGE_CALLS,
  "yield-optimisation": [
    { to: VENUS_VUSDT, signature: "mint(uint256)" },
    { to: VENUS_VUSDT, signature: "redeemUnderlying(uint256)" },
    { to: VENUS_VBNB, signature: "mint()" },
    { to: VENUS_VBNB, signature: "redeemUnderlying(uint256)" },
  ],
  "health-factor": [
    { to: VENUS_VUSDT, signature: "repayBorrow(uint256)" },
    { to: VENUS_VUSDT, signature: "mint(uint256)" },
    { to: VENUS_VBNB, signature: "repayBorrow()" },
    { to: VENUS_VBNB, signature: "mint()" },
    { to: VENUS_COMPTROLLER, signature: "enterMarkets(address[])" },
  ],
};

// ---------------------------------------------------------------------------
// Granting
// ---------------------------------------------------------------------------

export interface GrantOptions {
  mandateId: number;
  /**
   * What the agent has been *shown* able to do.
   *
   * Not a category. A `ProvenScope` can only be produced by `scopeFromAssay`,
   * so there is no way to reach this function without an assay having run,
   * `granted ⊆ proven` is a property of the type, not a check that has to be
   * remembered.
   */
  scope: ProvenScope;
  /** Spend cap. Never larger than the capital under mandate. */
  capWei: bigint;
  /** Seconds from now until the session dies. */
  ttlSeconds: number;
  /**
   * Register the public key in the Altana KeyStore.
   *
   * Registration is what makes the session's authority publicly verifiable,
   * a counterparty can confirm it on chain, and it costs roughly $0.50 in
   * BNB. Ephemeral sessions enforce identically but are invisible to KeyStore
   * readers, which is the right trade for development and the wrong one for
   * anything a third party is asked to trust.
   */
  register?: boolean;
}

export interface GrantedSession {
  /**
   * The market the mandate id refers to.
   *
   * Sessions were keyed by mandate id alone, and a mandate id is only unique
   * within one deployment. Running the keeper against a superseded contract
   * matched its "mandate 2" to the live market's mandate 2 and revoked a
   * registered session that had nothing to do with the dismissal. An id
   * without its contract is not an identifier.
   */
  market: string;
  mandateId: number;
  category: Category;
  /** The session key's public address, this is what signs the agent's trades. */
  sessionKey: string;
  /** The wallet the session acts for. */
  walletAddress: string;
  capWei: string;
  expiry: number;
  registered: boolean;
  /**
   * The transaction that authorised this key on chain.
   *
   * `registered: true` on its own is a boolean in a JSON file on one machine,
   * the same unverifiable assertion this whole product exists to object to. So
   * registration is not reported without the transaction that proves it, found
   * by reading the chain rather than taken from the SDK's word.
   */
  registrationTx?: string;
  registrationBlock?: number;
  /** The account's own identifier for this key, from the Authorize log. */
  registrationKeyHash?: string;
  allowlist: { to: string; signature: string }[];
  /**
   * Calls the category permits that this agent was not given.
   *
   * Recorded because the interesting half of a permission set is what is
   * missing from it, and because a principal should be able to see that the
   * narrowing happened rather than take it on trust.
   */
  withheld?: { to: string; signature: string; because: string }[];
  provenProtocols?: string[];
  scopeRationale?: string;
  grantedAt: string;
  /**
   * Why the session ended.
   *
   * Revocation and dismissal were described as the same act and were two
   * separate things: the contract removed an agent from a mandate and the
   * key it held stayed live. A fired agent with working credentials is not a
   * fired agent. The keeper closes that, and this records which dismissal
   * caused which revocation so the pair can be checked rather than asserted.
   */
  revokedBecause?: string;
  dismissalTx?: string;
}

/**
 * The account's key-authorisation event.
 *
 * Found by inspecting a known registration rather than from an ABI: the
 * delegated account emits exactly one of these per grant, carrying the key's
 * hash in its indexed argument. Altana derives that hash in a way this code
 * does not reproduce, so the hash is recorded rather than recomputed, which
 * is the honest form of "here is the evidence, check it yourself".
 */
export const AUTHORIZE_TOPIC =
  "0x3d3a48be5a98628ecf98a6201185102da78bbab8f63a4b2d6b9eef354f5131f5" as const;

/**
 * Finds the transaction that authorised a key on the account.
 *
 * The principal's wallet carries an EIP-7702 delegation, so the grant is not
 * sent *from* it, the relay submits and the delegated account pays. Searching
 * for a transaction from the principal finds nothing; the account appears as a
 * log emitter instead, which is what this looks for.
 *
 * Retried, because a log index that has not caught up yet returns an empty
 * result that is indistinguishable from "no registration happened", and
 * recording no evidence when evidence exists is the failure mode that matters
 * here.
 */
export async function findRegistrationTx(
  wallet: string,
  fromBlock: bigint,
  attempts = 5,
): Promise<{ tx: string; block: number; keyHash: string } | null> {
  for (let round = 0; round < attempts; round++) {
    for (const client of logClients) {
      try {
        const head = await client.getBlockNumber();
        const logs = await client.getLogs({
          address: wallet as `0x${string}`,
          fromBlock,
          toBlock: head,
        });
        const auth = logs.filter((l) => l.topics[0] === AUTHORIZE_TOPIC).at(-1);
        if (auth?.transactionHash) {
          return {
            tx: auth.transactionHash,
            block: Number(auth.blockNumber),
            keyHash: auth.topics[1] ?? "",
          };
        }
      } catch {
        continue;
      }
    }
    await new Promise((r) => setTimeout(r, 1500 * (round + 1)));
  }
  return null;
}

export function adminProvider(privateKey = process.env.PRIVATE_KEY) {
  if (!privateKey) throw new Error("PRIVATE_KEY is required to act as the principal.");
  return new AltanaWalletProvider({ privateKey: norm(privateKey) });
}

/**
 * Grants an agent bounded authority over a mandate's capital.
 *
 * Returns the granted session and writes it to disk so the agent process, the
 * indexer and the interface can all see what authority currently exists.
 */
export async function grantMandateSession(opts: GrantOptions): Promise<GrantedSession> {
  const admin = adminProvider();
  const expiry = Math.floor(Date.now() / 1000) + opts.ttlSeconds;

  // Derived from the assay, never from the category the agent claims, and
  // nothing else: no default ERC-8004/8183 roles (see `exactPermissions`).
  // The native allowance is the working budget, capped at the mandate's
  // capital: an agent can lose what it was given and nothing beyond it.
  const permissions = exactPermissions({ calls: opts.scope.calls, capWei: 0n, nativeSpendWei: opts.capWei });

  // Pinned before the grant so the search window is exact.
  const before = await marketClient.getBlockNumber().catch(() => 0n);

  const session = await admin.grantSession({
    permissions: permissions as never,
    expiry,
    register: opts.register ?? false,
  });

  const proof =
    opts.register && before > 0n
      ? await findRegistrationTx(session.walletAddress, before).catch(() => null)
      : null;

  const granted: GrantedSession = {
    market: MARKET_ADDRESS,
    mandateId: opts.mandateId,
    category: opts.scope.category,
    // publicKey is the on-chain identifier, and what revocation is keyed on.
    sessionKey: session.publicKey,
    walletAddress: session.walletAddress,
    capWei: opts.capWei.toString(),
    expiry,
    registered: Boolean(opts.register),
    ...(proof
      ? {
          registrationTx: proof.tx,
          registrationBlock: proof.block,
          registrationKeyHash: proof.keyHash,
        }
      : {}),
    allowlist: opts.scope.calls.map((c) => ({ to: c.to, signature: c.signature })),
    /** What the category permits but this agent has not earned. */
    withheld: opts.scope.withheld,
    provenProtocols: opts.scope.proven,
    scopeRationale: opts.scope.rationale,
    grantedAt: new Date().toISOString(),
  };

  persist(opts.mandateId, session, granted);
  await saveSession(toRecord(granted, session), serializeSession(session as never));
  return granted;
}

/** The store's shape for a mandate session. */
function toRecord(g: GrantedSession, session: { permissions?: unknown }): SessionRecord {
  return {
    id: mandateSessionId(g.market, g.mandateId),
    kind: "mandate",
    label: `Mandate ${g.mandateId} (${CATEGORY_LABEL[g.category]})`,
    market: g.market,
    mandateId: g.mandateId,
    category: g.category,
    walletAddress: g.walletAddress,
    publicKey: g.sessionKey,
    keyId: keccak256(g.sessionKey as Hex),
    permissions: session.permissions ?? null,
    allowlist: g.allowlist,
    withheld: g.withheld,
    capWei: g.capWei,
    expiry: g.expiry,
    registered: g.registered,
    registrationTx: g.registrationTx,
    registrationBlock: g.registrationBlock,
    adminSigner: "private-key",
    grantedAt: g.grantedAt,
    revokedBecause: g.revokedBecause,
  };
}

// ---------------------------------------------------------------------------
// Sessions that are not tied to a mandate: reference agents, the demo, passkeys
// ---------------------------------------------------------------------------

export interface ScopedGrant {
  id: string;
  kind: SessionKind;
  label: string;
  category?: Category;
  /** Exactly the calls this session may make. Nothing is implied. */
  calls: StrictAgentCallPermission[];
  /**
   * ERC-20 outflows the session may cause, per day. The account's guard
   * counts token transfers out of the account against these; a token with
   * no entry cannot leave through the session at all.
   */
  tokenSpend?: { token: `0x${string}`; limit: bigint }[];
  /**
   * Native allowance per day. Covers value sent by a call and the relay's
   * gas fee, which the account pays; without a native entry every execute
   * reverts `NoSpendPermissions`.
   */
  nativeSpendWei?: bigint;
  /**
   * ERC-8183 roles, only for a session that hires or sells through commerce.
   * Omitted, the session gets no ERC-8004 or ERC-8183 surface at all.
   */
  roles?: ("identity" | "buyer" | "seller" | "evaluator" | "voter")[];
  /** Payment-token ($U) cap for a buyer session. Zero otherwise. */
  capWei: bigint;
  ttlSeconds: number;
  register?: boolean;
  /** Which admin grants it. Defaults to the principal's private key. */
  admin?: AltanaWalletProvider;
  adminSigner?: SessionRecord["adminSigner"];
  meta?: Record<string, unknown>;
}

/** The SDK default native allowance is 0.02 BNB a day; ours is a tenth of that. */
export const DEFAULT_NATIVE_SPEND_WEI = 2_000_000_000_000_000n;

/**
 * Permissions compiled from exactly what was asked for.
 *
 * `defaultAgentPermissions` grants all five ERC-8183 roles unless told
 * otherwise, which includes `setAgentURI` and `register` on the identity
 * registry and `createJob`/`fund` on commerce. A range keeper that can rewrite
 * its principal's agent card is not a range keeper. So a session is built
 * from its call list alone, and the commerce surface is added only for a
 * session whose job is to hire, and then only the roles it names.
 */
export function exactPermissions(opts: Pick<ScopedGrant, "calls" | "tokenSpend" | "nativeSpendWei" | "roles" | "capWei">) {
  const native = { limit: opts.nativeSpendWei ?? DEFAULT_NATIVE_SPEND_WEI, period: "day" as const };
  const tokens = (opts.tokenSpend ?? []).map((t) => ({ limit: t.limit, period: "day" as const, token: t.token }));
  if (opts.roles?.length) {
    const base = defaultAgentPermissions({
      chainId: 56,
      roles: opts.roles,
      tokenSpend: { limit: opts.capWei },
      nativeSpend: { limit: native.limit },
      extraCalls: opts.calls,
    } as never) as { calls: { to: string; signature: string }[]; spend: unknown[] };
    return { calls: base.calls, spend: [...base.spend, ...tokens] };
  }
  return {
    calls: opts.calls.map((c) => ({ to: c.to, signature: c.signature })),
    spend: [native, ...tokens],
  };
}

/**
 * Grants a session with an explicit allowlist and stores it where the
 * deployed site can execute through it and revoke it.
 *
 * `defaultAgentPermissions` adds the ERC-8004 and ERC-8183 surfaces the SDK
 * considers baseline; `extraCalls` is the whole of what the strategy may
 * touch. There is no path here that grants `approve` on any token.
 */
export async function grantScopedSession(opts: ScopedGrant): Promise<SessionRecord> {
  for (const c of opts.calls) {
    if (/^approve\(/.test(c.signature) || /^setApprovalForAll\(/.test(c.signature)) {
      throw new Error(`refused: a session may not be granted ${c.signature}`);
    }
  }
  const admin = opts.admin ?? adminProvider();
  const expiry = Math.floor(Date.now() / 1000) + opts.ttlSeconds;
  const permissions = exactPermissions(opts);
  const before = await marketClient.getBlockNumber().catch(() => 0n);
  const session = await admin.grantSession({ permissions: permissions as never, expiry, register: opts.register ?? true });
  // The signer exists only in this process until it is written down. Nothing
  // that can fail runs between the grant and this line.
  const serialized = serializeSession(session as never);
  await saveSession(
    {
      id: opts.id,
      kind: opts.kind,
      label: opts.label,
      category: opts.category,
      walletAddress: session.walletAddress,
      publicKey: session.publicKey,
      keyId: keccak256(session.publicKey),
      permissions,
      allowlist: opts.calls.map((c) => ({ to: c.to, signature: c.signature })),
      capWei: opts.capWei.toString(),
      expiry,
      registered: opts.register ?? true,
      adminSigner: opts.adminSigner ?? "private-key",
      grantedAt: new Date().toISOString(),
      meta: opts.meta,
    },
    serialized,
  );
  const proof =
    (opts.register ?? true) && before > 0n
      ? await findRegistrationTx(session.walletAddress, before).catch(() => null)
      : null;
  const rec: SessionRecord = {
    id: opts.id,
    kind: opts.kind,
    label: opts.label,
    category: opts.category,
    walletAddress: session.walletAddress,
    publicKey: session.publicKey,
    keyId: keccak256(session.publicKey),
    permissions,
    allowlist: opts.calls.map((c) => ({ to: c.to, signature: c.signature })),
    capWei: opts.capWei.toString(),
    expiry,
    registered: opts.register ?? true,
    registrationTx: proof?.tx,
    registrationBlock: proof?.block,
    adminSigner: opts.adminSigner ?? "private-key",
    grantedAt: new Date().toISOString(),
    grantTx: proof?.tx,
    meta: opts.meta,
  };
  await saveSession(rec, serialized);
  return rec;
}

/** Revokes a stored session by id and records the transaction. */
export async function revokeStoredSession(
  id: string,
  because?: string,
  admin?: AltanaWalletProvider,
): Promise<{ tx?: string }> {
  const rec = await getSession(id);
  if (!rec) throw new Error(`no session ${id}`);
  // Revocation needs only the public key and the admin. A deployment without
  // SESSION_SECRET cannot open the signer, and must still be able to revoke.
  const raw = await loadSerialized(id).catch(() => null);
  const who = admin ?? adminProvider();
  const result = raw
    ? await who.revokeSession(await deserializeSession(raw))
    : await who.revokeSession(rec.publicKey as Hex);
  await markRevoked(id, result.transactionHash, because);
  return { tx: result.transactionHash };
}

/** Session-mode provider for a stored session. Execute only, never grant. */
export async function providerFor(id: string): Promise<AltanaWalletProvider> {
  const raw = await loadSerialized(id);
  if (!raw) throw new Error(`this deployment does not hold the signer for session ${id}`);
  const session = await deserializeSession(raw);
  return new AltanaWalletProvider({ session });
}

export { listSessions, getSession };

/**
 * Ends an agent's authority.
 *
 * Revocation is the same event as dismissal: the contract removes the agent
 * from the mandate, and this removes its ability to act at all. Doing only the
 * first would leave a fired agent still holding a live key.
 */
export async function revokeMandateSession(
  mandateId: number,
  cause?: { because: string; dismissalTx?: string },
): Promise<void> {
  const admin = adminProvider();
  const id = mandateSessionId(MARKET_ADDRESS, mandateId);
  const stored = (await loadSerialized(id)) ?? loadRaw(mandateId);
  if (!stored) throw new Error(`no session on file for mandate ${mandateId}`);
  const session = await deserializeSession(stored);
  const result = await admin.revokeSession(session);
  await markRevoked(id, result.transactionHash, cause?.because).catch(() => undefined);

  const meta = loadMeta(mandateId);
  if (meta) {
    const revoked = {
      ...meta,
      revokedAt: new Date().toISOString(),
      ...(cause ? { revokedBecause: cause.because, dismissalTx: cause.dismissalTx } : {}),
    };
    writeFileSync(metaPath(mandateId), JSON.stringify(revoked, null, 2));
    writePublic(mandateId, revoked);
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const rawPath = (id: number) => `${SESSION_DIR}/mandate-${id}.session`;
const metaPath = (id: number) => `${SESSION_DIR}/mandate-${id}.json`;

function persist(id: number, session: unknown, meta: GrantedSession) {
  try {
    mkdirSync(dirname(rawPath(id)), { recursive: true });
    // The signer. Never committed, never deployed.
    writeFileSync(rawPath(id), serializeSession(session as never), { mode: 0o600 });
    writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
    writePublic(id, meta);
  } catch {
    // A serverless filesystem is read-only; the store above is the record.
  }
}

/** Public metadata, safe to commit: everything here is already on chain. */
function writePublic(id: number, meta: GrantedSession & { revokedAt?: string }) {
  const all = readPublicIndex();
  all[String(id)] = meta;
  mkdirSync(dirname(PUBLIC_INDEX), { recursive: true });
  writeFileSync(PUBLIC_INDEX, JSON.stringify(all, null, 2));
}

export function readPublicIndex(): Record<string, GrantedSession & { revokedAt?: string }> {
  if (!existsSync(PUBLIC_INDEX)) return {};
  try {
    return JSON.parse(readFileSync(PUBLIC_INDEX, "utf8")) as Record<
      string,
      GrantedSession & { revokedAt?: string }
    >;
  } catch {
    return {};
  }
}

export function loadRaw(id: number): string | null {
  const p = rawPath(id);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

/**
 * Session metadata.
 *
 * Prefers the local file when granting or acting on this machine, and falls
 * back to the committed public index so a deployed instance can still show
 * what authority exists without ever holding the signer.
 */
export function loadMeta(id: number): (GrantedSession & { revokedAt?: string }) | null {
  const p = metaPath(id);
  if (existsSync(p)) {
    return JSON.parse(readFileSync(p, "utf8")) as GrantedSession & { revokedAt?: string };
  }
  return readPublicIndex()[String(id)] ?? null;
}

/** Session-mode provider for an agent process: execute only, never grant. */
export async function agentProvider(mandateId: number) {
  const raw = (await loadSerialized(mandateSessionId(MARKET_ADDRESS, mandateId))) ?? loadRaw(mandateId);
  if (!raw) throw new Error(`no session for mandate ${mandateId}; grant one first`);
  const session = await deserializeSession(raw);
  return new AltanaWalletProvider({ session });
}

export const describeAllowlist = (category: Category) =>
  `${CATEGORY_LABEL[category]}: ${CATEGORY_CALLS[category]
    .map((c) => `${c.to.slice(0, 8)}…${c.signature.split("(")[0]}`)
    .join(", ")}`;
