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
import { CATEGORY_LABEL, type Category } from "@/lib/config";
// Type-only, so the mutual reference with scope.ts is erased at runtime.
import type { ProvenScope } from "./scope";
import { logClients, marketClient, MARKET_ADDRESS } from "./market";

/**
 * Two homes, because a session has a secret half and a public half.
 *
 * The serialized session contains the signer and never leaves the machine that
 * granted it. Its metadata — the public key, the allowlist, the cap, the
 * expiry — is all readable on chain by anyone, so it belongs in the repository
 * where the deployed site can show what authority exists. Keeping both in the
 * ignored directory meant production could only ever report "observing only".
 */
const SESSION_DIR = ".sessions";
const PUBLIC_INDEX_REL = "src/data/sessions.json";
/**
 * Resolved from the working directory, matching the other data readers.
 *
 * A bare relative path resolves against wherever the process happens to be,
 * which on a serverless function is not the project root — the file was
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
 * `defaultAgentPermissions` already grants the ERC-8004 identity and ERC-8183
 * commerce surfaces. These are the protocol calls a strategy makes on top, and
 * they are deliberately enumerated per selector rather than per contract: a
 * grid agent may swap, but it may not, for instance, call a router's
 * `sweepToken`.
 */
export const CATEGORY_CALLS: Record<Category, StrictAgentCallPermission[]> = {
  "grid-trading": [
    {
      to: "0x13f4ea83d0bd40e75c8222255bc855a974568dd4", // PancakeSwap V3 SwapRouter
      signature:
        "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
    },
    {
      to: "0x13f4ea83d0bd40e75c8222255bc855a974568dd4",
      signature: "exactInput((bytes,address,uint256,uint256))",
    },
  ],
  rebalancing: [
    {
      to: "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364", // V3 NonfungiblePositionManager
      signature:
        "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))",
    },
    {
      to: "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364",
      signature: "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))",
    },
    {
      to: "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364",
      signature: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))",
    },
    {
      to: "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364",
      signature: "collect((uint256,address,uint128,uint128))",
    },
  ],
  "yield-optimisation": [
    {
      to: "0x556b9306565093c855aea9ae92a594704c2cd59e", // MasterChef V3
      signature: "harvest(uint256,address)",
    },
    {
      to: "0xa07c5b74c9b40447a954e1466938b865b6bbea36", // Venus vBNB
      signature: "mint()",
    },
    {
      to: "0xa07c5b74c9b40447a954e1466938b865b6bbea36",
      signature: "redeemUnderlying(uint256)",
    },
  ],
  "health-factor": [
    {
      to: "0xa07c5b74c9b40447a954e1466938b865b6bbea36", // Venus vBNB
      signature: "mint()",
    },
    {
      to: "0xa07c5b74c9b40447a954e1466938b865b6bbea36",
      signature: "repayBorrow()",
    },
    {
      to: "0xfd36e2c2a6789db23113685031d7f16329158384", // Venus Comptroller
      signature: "enterMarkets(address[])",
    },
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
   * so there is no way to reach this function without an assay having run —
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
   * Registration is what makes the session's authority publicly verifiable —
   * a counterparty can confirm it on chain — and it costs roughly $0.50 in
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
  /** The session key's public address — this is what signs the agent's trades. */
  sessionKey: string;
  /** The wallet the session acts for. */
  walletAddress: string;
  capWei: string;
  expiry: number;
  registered: boolean;
  /**
   * The transaction that authorised this key on chain.
   *
   * `registered: true` on its own is a boolean in a JSON file on one machine —
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
 * does not reproduce, so the hash is recorded rather than recomputed — which
 * is the honest form of "here is the evidence, check it yourself".
 */
export const AUTHORIZE_TOPIC =
  "0x3d3a48be5a98628ecf98a6201185102da78bbab8f63a4b2d6b9eef354f5131f5" as const;

/**
 * Finds the transaction that authorised a key on the account.
 *
 * The principal's wallet carries an EIP-7702 delegation, so the grant is not
 * sent *from* it — the relay submits and the delegated account pays. Searching
 * for a transaction from the principal finds nothing; the account appears as a
 * log emitter instead, which is what this looks for.
 *
 * Retried, because a log index that has not caught up yet returns an empty
 * result that is indistinguishable from "no registration happened" — and
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

  const permissions = defaultAgentPermissions({
    chainId: 56,
    // The working budget. Capping at the mandate's capital is the invariant
    // that makes delegation safe: an agent can lose what it was given and
    // nothing beyond it.
    tokenSpend: { limit: opts.capWei },
    // Derived from the assay, never from the category the agent claims.
    extraCalls: opts.scope.calls,
  });

  // Pinned before the grant so the search window is exact.
  const before = await marketClient.getBlockNumber().catch(() => 0n);

  const session = await admin.grantSession({
    permissions,
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
  return granted;
}

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
  const stored = loadRaw(mandateId);
  if (!stored) throw new Error(`no session on file for mandate ${mandateId}`);
  const session = await deserializeSession(stored);
  await admin.revokeSession(session);

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
  mkdirSync(dirname(rawPath(id)), { recursive: true });
  // The signer. Never committed, never deployed.
  writeFileSync(rawPath(id), serializeSession(session as never), { mode: 0o600 });
  writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
  writePublic(id, meta);
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
  const raw = loadRaw(mandateId);
  if (!raw) throw new Error(`no session for mandate ${mandateId}; grant one first`);
  process.env.ALTANA_SESSION = raw;
  return AltanaWalletProvider.sessionFromEnv();
}

export const describeAllowlist = (category: Category) =>
  `${CATEGORY_LABEL[category]}: ${CATEGORY_CALLS[category]
    .map((c) => `${c.to.slice(0, 8)}…${c.signature.split("(")[0]}`)
    .join(", ")}`;
