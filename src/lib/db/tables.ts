/**
 * Every table this deployment needs, created once, in order.
 *
 * Each module used to create its own table on first use. That is tidy until
 * several of them run inside one render: `/status` reads sessions, snapshots,
 * schedules, samples and paid calls at the same time, so five `create table if
 * not exists` statements went out concurrently over a pool of five
 * connections, took catalog locks, and waited on each other. The page stopped
 * answering at all, which is a far worse failure than a missing table, and it
 * only happened in production because only production runs them together.
 *
 * So creation happens here: one promise, one statement at a time, shared by
 * every caller and paid once per instance. Readers that arrive while it is
 * running wait for it rather than issuing their own.
 */

import { sql as pg } from "@/lib/db/client";

const STATEMENTS: { name: string; run: () => Promise<unknown> }[] = [
  {
    name: "snapshots",
    run: () => pg!`create table if not exists snapshots (name text primary key, payload jsonb not null, captured_at timestamptz not null default now())`,
  },
  {
    name: "leases",
    run: () => pg!`create table if not exists leases (name text primary key, until timestamptz not null)`,
  },
  {
    name: "schedules",
    run: () => pg!`create table if not exists schedules (name text primary key, last_run_at timestamptz, last_ok boolean, last_detail jsonb)`,
  },
  {
    name: "status_samples",
    run: () => pg!`create table if not exists status_samples (at timestamptz primary key default now(), ok boolean not null, checks jsonb not null)`,
  },
  {
    name: "paid_calls",
    run: () => pg!`
      create table if not exists paid_calls (
        id text primary key,
        token_id text not null,
        category text not null,
        paid boolean not null,
        sponsored boolean not null default false,
        tx text,
        at timestamptz not null,
        record jsonb not null
      )
    `,
  },
  {
    name: "sponsored_calls",
    run: () => pg!`create table if not exists sponsored_calls (id bigserial primary key, caller text not null, token_id text not null, at timestamptz not null default now())`,
  },
  {
    name: "sessions",
    run: () => pg!`
      create table if not exists sessions (
        id text primary key,
        kind text not null,
        label text not null,
        market text,
        mandate_id integer,
        category text,
        wallet_address text not null,
        public_key text not null,
        key_id text not null,
        permissions jsonb,
        allowlist jsonb not null default '[]',
        withheld jsonb,
        cap_wei text not null default '0',
        expiry integer not null,
        registered boolean not null default false,
        registration_tx text,
        registration_block integer,
        admin_signer text not null default 'private-key',
        granted_at timestamptz not null default now(),
        grant_tx text,
        revoked_at timestamptz,
        revoke_tx text,
        revoked_because text,
        meta jsonb,
        secret text
      )
    `,
  },
];

let once: Promise<boolean> | null = null;

/** True when the tables exist (or there is no database and nothing to do). */
export function ensureTables(): Promise<boolean> {
  if (!pg) return Promise.resolve(false);
  once ??= (async () => {
    for (const s of STATEMENTS) {
      try {
        await s.run();
      } catch {
        /* a table this deployment cannot create is reported by its reader */
      }
    }
    return true;
  })();
  return once;
}
