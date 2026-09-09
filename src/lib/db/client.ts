/**
 * Postgres connection.
 *
 * Optional by design. With DATABASE_URL set the app reads the materialised
 * index; without it, it falls back to the committed snapshot. That keeps the
 * site deployable and demoable before any infrastructure exists, and keeps it
 * up when 8004scan returns DATABASE_ERROR — which it does under load.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

if (url) {
  sql = postgres(url, {
    max: process.env.NODE_ENV === "production" ? 5 : 1,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false, // pooled connections (Neon/Supabase pgbouncer)
  });
  dbInstance = drizzle(sql, { schema });
}

export const db = dbInstance;
export const hasDb = Boolean(dbInstance);
export { schema, sql };

export async function closeDb() {
  await sql?.end({ timeout: 5 });
}
