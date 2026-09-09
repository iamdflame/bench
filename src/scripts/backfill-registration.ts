/**
 * Attaches on-chain evidence to sessions whose registration was recorded
 * before the evidence was being captured.
 *
 * `registered: true` in a JSON file is a claim. The account emits one
 * Authorize log per grant, so the claim has a transaction behind it; this
 * finds it and writes it down.
 *
 * Matching is by position in the account's authorisation sequence against the
 * order the sessions were granted, because Altana derives its key hash in a
 * way this code does not reproduce. That is weaker than matching on the key
 * itself, so the method is recorded in the file alongside the result rather
 * than left for a reader to assume.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logClients } from "@/lib/chain/market";
import { AUTHORIZE_TOPIC, readPublicIndex, type GrantedSession } from "@/lib/chain/session";

const INDEX = join(process.cwd(), "src/data/sessions.json");
type Row = GrantedSession & { revokedAt?: string; registrationMatch?: string };

const all = readPublicIndex() as Record<string, Row>;
const rows = Object.entries(all).sort(
  (a, b) => Date.parse(a[1].grantedAt) - Date.parse(b[1].grantedAt),
);
const missing = rows.filter(([, r]) => r.registered && !r.registrationTx);

if (missing.length === 0) {
  console.log("\n  every registered session already carries its transaction.\n");
  process.exit(0);
}

const wallet = rows[0]![1].walletAddress as `0x${string}`;
const earliest = Math.min(...rows.map((r) => Date.parse(r[1].grantedAt)));

// A generous window back from head; the grants are all recent.
let found: { tx: string; block: number; keyHash: string; ts: number }[] = [];
for (const client of logClients) {
  try {
    const head = await client.getBlockNumber();
    // ~0.45s blocks; go back to comfortably before the earliest grant.
    const span = BigInt(Math.ceil(((Date.now() - earliest) / 1000 / 0.45) * 1.5) + 2_000);
    const logs = await client.getLogs({
      address: wallet,
      fromBlock: head > span ? head - span : 0n,
      toBlock: head,
    });
    const auth = logs.filter((l) => l.topics[0] === AUTHORIZE_TOPIC);
    found = auth.map((l) => ({
      tx: l.transactionHash!,
      block: Number(l.blockNumber),
      keyHash: l.topics[1] ?? "",
      ts: 0,
    }));
    if (found.length) break;
  } catch {
    continue;
  }
}

console.log(`\n  ${rows.length} sessions · ${missing.length} without evidence`);
console.log(`  ${found.length} Authorize events found from ${wallet}\n`);

if (found.length < rows.filter(([, r]) => r.registered).length) {
  console.error(`  refusing: fewer authorisations than registered sessions.`);
  console.error(`  Matching by position would be guesswork. Nothing written.\n`);
  process.exit(1);
}

// Newest authorisations correspond to the most recent grants.
const registered = rows.filter(([, r]) => r.registered);
const tail = found.slice(-registered.length);

registered.forEach(([id, row], i) => {
  const ev = tail[i]!;
  if (row.registrationTx) {
    const ok = row.registrationTx === ev.tx;
    console.log(`  mandate ${id}  already recorded  ${ok ? "✓ agrees with position" : "✗ DISAGREES"}`);
    if (!ok) console.log(`      recorded ${row.registrationTx}\n      position ${ev.tx}`);
    return;
  }
  all[id] = {
    ...row,
    registrationTx: ev.tx,
    registrationBlock: ev.block,
    registrationKeyHash: ev.keyHash,
    registrationMatch: "by position in the account's authorisation sequence, not by key",
  };
  console.log(`  mandate ${id}  backfilled  ${ev.tx}  block ${ev.block}`);
});

writeFileSync(INDEX, `${JSON.stringify(all, null, 2)}\n`);
console.log(`\n  written to src/data/sessions.json\n`);
