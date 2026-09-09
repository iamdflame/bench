/**
 * Is the database reachable, and does it hold what the site expects?
 *
 * The site falls back to a committed snapshot when there is no database, which
 * keeps it deployable — and also makes a broken connection look exactly like a
 * deliberate absence. This tells the two apart.
 */
import { db, hasDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";

async function main() {
  console.log("DATABASE_URL set:", Boolean(process.env.DATABASE_URL));
  console.log("hasDb:", hasDb);
  if (!hasDb || !db) {
    console.log("\nno database — the site will serve the committed snapshot");
    process.exit(1);
  }
  try {
    const version = await db.execute(sql`select version()`);
    const v = String((version as unknown as { version?: string }[])[0]?.version ?? "").slice(0, 60);
    console.log("connected:", v);
  } catch (e) {
    const message = (e as Error).message;
    console.log("connection failed:", message.slice(0, 160));

    /*
      The two failures worth telling apart, because they need different fixes
      and the raw driver error names neither.
    */
    const cause = String((e as { cause?: { message?: string } }).cause?.message ?? "");
    const all = `${message} ${cause}`;
    if (/ENETUNREACH|Network is unreachable/i.test(all)) {
      console.log(
        "\nThe host is unreachable. Supabase's direct host (db.<ref>.supabase.co)" +
          "\nresolves IPv6-only, and most machines and all Vercel functions are IPv4." +
          "\nUse the connection pooler instead:" +
          "\n  postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres",
      );
    } else if (/password authentication failed/i.test(all)) {
      console.log(
        "\nThe host and the tenant are right — the pooler recognised the project" +
          "\nand tried to authenticate — but the password was rejected. Reset it in" +
          "\nSupabase under Settings → Database and put it in DATABASE_URL.",
      );
    } else if (/no tenant identifier/i.test(all)) {
      console.log(
        "\nThe pooler needs the project ref in the username: postgres.<ref>," +
          "\nnot bare postgres.",
      );
    }
    process.exit(2);
  }
  try {
    const rows = await db.execute(sql`select count(*)::int as n from agents`);
    console.log("agents rows:", (rows as unknown as { n: number }[])[0]?.n);
  } catch (e) {
    console.log("agents table:", (e as Error).message.slice(0, 120));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
