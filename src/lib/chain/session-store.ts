/**
 * Where sessions live so that a deployed instance can act on them.
 *
 * A session has a secret half (the session signer) and a public half (the
 * key, the allowlist, the cap, the expiry). Both used to live in `.sessions/`
 * on the machine that granted them, which meant the site on Vercel could show
 * a session but never execute through it or revoke it: `POST /api/sessions/
 * revoke` failed on every id because there was no file. Worse, the directory
 * on this machine held no mandate sessions at all, so revocation was broken
 * locally too.
 *
 * Sessions now live in Postgres. The public half is plain columns; the secret
 * half is AES-256-GCM under `SESSION_SECRET`, a key that exists on Vercel and
 * on the operator's machine and nowhere else. Without `DATABASE_URL` the
 * module falls back to the old files so local development still works.
 *
 * The table is created on first use rather than by a migration step, so a
 * deploy that adds this module needs nothing but the two environment variables.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sql as pg } from "@/lib/db/client";
import { ensureTables } from "@/lib/db/tables";

export type SessionKind = "mandate" | "house" | "passkey" | "demo";

export interface SessionRecord {
  /** Stable id: `mandate:<market>:<id>`, `house:<slug>`, `passkey:<n>`. */
  id: string;
  kind: SessionKind;
  label: string;
  market?: string;
  mandateId?: number;
  category?: string;
  /** The account the session acts on. */
  walletAddress: string;
  /** The session key's public key, the on-chain identifier for revocation. */
  publicKey: string;
  /** keccak256(publicKey), the KeyStore key id. */
  keyId: string;
  permissions: unknown;
  allowlist: { to: string; signature: string }[];
  withheld?: { to: string; signature: string; because: string }[];
  capWei: string;
  expiry: number;
  registered: boolean;
  registrationTx?: string;
  registrationBlock?: number;
  /** The signer type behind the admin that granted this session. */
  adminSigner: "private-key" | "passkey";
  grantedAt: string;
  grantTx?: string;
  revokedAt?: string;
  revokeTx?: string;
  revokedBecause?: string;
  /** Anything else worth showing: execution tx hashes, notes. */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Encryption of the secret half
// ---------------------------------------------------------------------------

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set; the session signer cannot be stored or read");
  return createHash("sha256").update(secret).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

export function open(sealed: string): string {
  const [v, iv, tag, ct] = sealed.split(":");
  if (v !== "v1") throw new Error("unknown sealed session format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

async function ensure(): Promise<boolean> {
  if (!pg) return false;
  // Created with every other table, in one sequential pass: see lib/db/tables.
  await ensureTables();
  return true;
}

type Row = {
  id: string;
  kind: SessionKind;
  label: string;
  market: string | null;
  mandate_id: number | null;
  category: string | null;
  wallet_address: string;
  public_key: string;
  key_id: string;
  permissions: unknown;
  allowlist: SessionRecord["allowlist"];
  withheld: SessionRecord["withheld"] | null;
  cap_wei: string;
  expiry: number;
  registered: boolean;
  registration_tx: string | null;
  registration_block: number | null;
  admin_signer: SessionRecord["adminSigner"];
  granted_at: Date;
  grant_tx: string | null;
  revoked_at: Date | null;
  revoke_tx: string | null;
  revoked_because: string | null;
  meta: Record<string, unknown> | null;
};

const fromRow = (r: Row): SessionRecord => ({
  id: r.id,
  kind: r.kind,
  label: r.label,
  market: r.market ?? undefined,
  mandateId: r.mandate_id ?? undefined,
  category: r.category ?? undefined,
  walletAddress: r.wallet_address,
  publicKey: r.public_key,
  keyId: r.key_id,
  permissions: r.permissions,
  allowlist: r.allowlist ?? [],
  withheld: r.withheld ?? undefined,
  capWei: r.cap_wei,
  expiry: Number(r.expiry),
  registered: r.registered,
  registrationTx: r.registration_tx ?? undefined,
  registrationBlock: r.registration_block ?? undefined,
  adminSigner: r.admin_signer,
  grantedAt: new Date(r.granted_at).toISOString(),
  grantTx: r.grant_tx ?? undefined,
  revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : undefined,
  revokeTx: r.revoke_tx ?? undefined,
  revokedBecause: r.revoked_because ?? undefined,
  meta: r.meta ?? undefined,
});

// ---------------------------------------------------------------------------
// File fallback (local development without a database)
// ---------------------------------------------------------------------------

const DIR = ".sessions";
const recPath = (id: string) => `${DIR}/${id.replace(/[^a-z0-9_-]/gi, "_")}.json`;
const rawPath = (id: string) => `${DIR}/${id.replace(/[^a-z0-9_-]/gi, "_")}.session`;

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * JSON that survives bigints.
 *
 * Session permissions carry spend limits as bigints. `JSON.stringify` throws
 * on them, and it threw here once after a grant had already landed on chain,
 * before the signer was stored: a registered key, paid for, that nobody held.
 * Every serialisation in this module goes through this.
 */
export const toJson = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

/**
 * Stores a session. `serialized` is the SDK's serialized session, the secret half.
 *
 * The local file is written first, before anything that can fail: the one
 * unrecoverable outcome is a key granted on chain whose signer exists nowhere.
 */
export async function saveSession(rec: SessionRecord, serialized?: string): Promise<void> {
  // On the machine that granted it; a serverless filesystem is read-only and
  // the write simply fails, which is fine because the database below holds it.
  try {
    mkdirSync(dirname(recPath(rec.id)), { recursive: true });
    if (serialized) writeFileSync(rawPath(rec.id), serialized, { mode: 0o600 });
    writeFileSync(recPath(rec.id), toJson(rec) + "\n");
  } catch {
    /* read-only filesystem */
  }
  if (await ensure()) {
    const secret = serialized ? seal(serialized) : null;
    await pg!`
      insert into sessions (id, kind, label, market, mandate_id, category, wallet_address, public_key, key_id,
        permissions, allowlist, withheld, cap_wei, expiry, registered, registration_tx, registration_block,
        admin_signer, granted_at, grant_tx, revoked_at, revoke_tx, revoked_because, meta, secret)
      values (${rec.id}, ${rec.kind}, ${rec.label}, ${rec.market ?? null}, ${rec.mandateId ?? null}, ${rec.category ?? null},
        ${rec.walletAddress}, ${rec.publicKey}, ${rec.keyId}, ${toJson(rec.permissions ?? null)}::jsonb,
        ${toJson(rec.allowlist)}::jsonb, ${rec.withheld ? toJson(rec.withheld) : null}::jsonb,
        ${rec.capWei}, ${rec.expiry}, ${rec.registered}, ${rec.registrationTx ?? null}, ${rec.registrationBlock ?? null},
        ${rec.adminSigner}, ${rec.grantedAt}, ${rec.grantTx ?? null}, ${rec.revokedAt ?? null}, ${rec.revokeTx ?? null},
        ${rec.revokedBecause ?? null}, ${rec.meta ? toJson(rec.meta) : null}::jsonb, ${secret})
      on conflict (id) do update set
        label = excluded.label, permissions = excluded.permissions, allowlist = excluded.allowlist,
        withheld = excluded.withheld, cap_wei = excluded.cap_wei, expiry = excluded.expiry,
        registered = excluded.registered, registration_tx = coalesce(excluded.registration_tx, sessions.registration_tx),
        registration_block = coalesce(excluded.registration_block, sessions.registration_block),
        grant_tx = coalesce(excluded.grant_tx, sessions.grant_tx),
        revoked_at = excluded.revoked_at, revoke_tx = excluded.revoke_tx, revoked_because = excluded.revoked_because,
        meta = excluded.meta, secret = coalesce(excluded.secret, sessions.secret)
    `;
  }
}

/** The secret half, decrypted. Null when this deployment does not hold it. */
export async function loadSerialized(id: string): Promise<string | null> {
  if (await ensure()) {
    const rows = (await pg!`select secret from sessions where id = ${id}`) as { secret: string | null }[];
    if (rows[0]?.secret) return open(rows[0].secret);
  }
  const p = rawPath(id);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  if (await ensure()) {
    const rows = (await pg!`select * from sessions where id = ${id}`) as Row[];
    if (rows[0]) return fromRow(rows[0]);
  }
  const p = recPath(id);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as SessionRecord) : null;
}

/** Every session this deployment knows about, newest first. */
export async function listSessions(): Promise<SessionRecord[]> {
  if (await ensure()) {
    const rows = (await pg!`select * from sessions order by granted_at desc`) as Row[];
    return rows.map(fromRow);
  }
  if (!existsSync(DIR)) return [];
  const { readdirSync } = await import("node:fs");
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) as SessionRecord)
    .filter((r) => r && r.id && r.publicKey)
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
}

export async function markRevoked(
  id: string,
  revokeTx: string | undefined,
  because?: string,
): Promise<void> {
  const rec = await getSession(id);
  if (!rec) return;
  await saveSession({
    ...rec,
    revokedAt: new Date().toISOString(),
    revokeTx: revokeTx ?? rec.revokeTx,
    revokedBecause: because ?? rec.revokedBecause,
  });
}

/** Adds execution evidence to a session's `meta.executions` list. */
export async function recordExecution(
  id: string,
  entry: { tx?: string; description: string; at?: string; status?: string },
): Promise<void> {
  const rec = await getSession(id);
  if (!rec) return;
  const executions = ((rec.meta?.executions as unknown[]) ?? []).concat({
    at: new Date().toISOString(),
    ...entry,
  });
  await saveSession({ ...rec, meta: { ...(rec.meta ?? {}), executions } });
}

export const mandateSessionId = (market: string, mandateId: number) =>
  `mandate:${market.toLowerCase()}:${mandateId}`;
