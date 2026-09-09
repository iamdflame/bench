/**
 * Dismissal, made to actually end an agent's authority.
 *
 *   npm run keeper            watch for dismissals and revoke
 *   npm run keeper -- --once  sweep once and exit, for a cron
 *
 * The product has said from the start that revoking a session *is* dismissal.
 * It was not: `_dismiss` removed an agent from a mandate on chain and the
 * session key it held went on working. An agent that has been fired and can
 * still sign is not a fired agent, and the gap between the two facts was
 * exactly the kind of thing this market exists to object to elsewhere.
 *
 * This closes it. Every `AgentDismissed` event is matched to the session for
 * that mandate, the session is revoked, and the dismissal transaction is
 * recorded beside the revocation so the pair can be checked rather than taken
 * on trust.
 */

import { parseAbiItem } from "viem";
import { logClients, MARKET_ADDRESS, marketClient } from "@/lib/chain/market";
import { loadMeta, readPublicIndex, revokeMandateSession } from "@/lib/chain/session";
import { beat } from "@/lib/heartbeat";

const DISMISSED = parseAbiItem(
  "event AgentDismissed(uint256 indexed mandateId, address indexed agent, string reason)",
);

const ONCE = process.argv.includes("--once");
const INTERVAL_MS = Number(process.env.KEEPER_INTERVAL_MS ?? 30_000);
const DEPLOY = BigInt(
  process.env.NEXT_PUBLIC_MARKET_DEPLOY_BLOCK ?? process.env.MARKET_DEPLOY_BLOCK ?? "0",
);

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

interface Dismissal {
  mandateId: number;
  agent: string;
  reason: string;
  txHash: string;
  blockNumber: bigint;
}

/** Every dismissal since `from`, from whichever provider will serve the range. */
async function readDismissals(from: bigint): Promise<{ found: Dismissal[]; head: bigint } | null> {
  for (const client of logClients) {
    try {
      const head = await client.getBlockNumber();
      const found: Dismissal[] = [];
      const span = 4_000n;
      for (let cursor = from; cursor <= head; cursor += span) {
        const to = cursor + span - 1n > head ? head : cursor + span - 1n;
        const logs = await client.getLogs({
          address: MARKET_ADDRESS,
          event: DISMISSED,
          fromBlock: cursor,
          toBlock: to,
        });
        for (const l of logs) {
          const a = l.args as { mandateId?: bigint; agent?: string; reason?: string };
          found.push({
            mandateId: Number(a.mandateId ?? 0n),
            agent: a.agent ?? "",
            reason: a.reason ?? "",
            txHash: l.transactionHash ?? "",
            blockNumber: l.blockNumber ?? 0n,
          });
        }
      }
      return { found, head };
    } catch {
      continue;
    }
  }
  // Every provider refused. Returning null rather than an empty list matters:
  // "no dismissals happened" and "nobody would tell me" are different, and
  // acting on the second as though it were the first leaves fired agents armed.
  return null;
}

async function sweep(from: bigint): Promise<bigint> {
  const result = await readDismissals(from);
  if (result === null) {
    log("no provider would serve the log range — nothing concluded, nothing revoked");
    return from;
  }

  const { found, head } = result;
  if (found.length === 0) return head + 1n;

  for (const d of found) {
    const meta = loadMeta(d.mandateId);
    if (!meta) {
      log(`mandate ${d.mandateId} dismissed (${d.reason}) — no session on file, nothing to revoke`);
      continue;
    }
    if (meta.revokedAt) continue;

    // A mandate id is only unique within one deployment. Without this check,
    // pointing the keeper at a superseded contract revokes the live market's
    // session with the same id — which is exactly what happened the first time
    // this ran.
    if (meta.market && meta.market.toLowerCase() !== MARKET_ADDRESS.toLowerCase()) {
      log(
        `mandate ${d.mandateId} dismissed on ${MARKET_ADDRESS.slice(0, 10)}…, but the session on file belongs to ${meta.market.slice(0, 10)}… — left alone`,
      );
      continue;
    }

    log(`mandate ${d.mandateId}: ${d.agent.slice(0, 12)}… dismissed — ${d.reason}`);
    try {
      await revokeMandateSession(d.mandateId, {
        because: `dismissed from mandate ${d.mandateId}: ${d.reason}`,
        dismissalTx: d.txHash,
      });
      log(`  session revoked · dismissal ${d.txHash}`);
    } catch (e) {
      log(`  revocation FAILED: ${String(e).slice(0, 140)}`);
    }
  }
  return head + 1n;
}

if (!MARKET_ADDRESS) {
  console.error("no market address configured");
  process.exit(1);
}

const sessions = Object.keys(readPublicIndex()).length;
const start = DEPLOY > 0n ? DEPLOY : (await marketClient.getBlockNumber()) - 10_000n;

log(`keeper watching ${MARKET_ADDRESS}`);
log(`${sessions} session${sessions === 1 ? "" : "s"} on file · from block ${start}`);

/*
  The sweep stamps a heartbeat when it completes.

  The floor reads it, so that a market with no keeper says so instead of
  looking identical to one that has a keeper. The stamp is written after the
  work rather than before it, so it cannot report a cycle that did not happen,
  and a failed write never takes the keeper down — the floor reporting silence
  is the correct outcome of a database that will not answer.
*/
let cycles = 0;
let cursor = await sweep(start);
await beat("keeper", ++cycles, { fromBlock: start.toString(), toBlock: cursor.toString() });

if (ONCE) {
  log("one sweep done");
  process.exit(0);
}

log(`watching every ${INTERVAL_MS / 1000}s`);
for (;;) {
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
  cursor = await sweep(cursor);
  await beat("keeper", ++cycles, { toBlock: cursor.toString() });
}
