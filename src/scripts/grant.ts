/**
 * Grants a mandate's session.
 *
 *   npx tsx --env-file=.env src/scripts/grant.ts <mandateId> <category> [--register]
 *   npx tsx --env-file=.env src/scripts/grant.ts revoke <mandateId>
 *
 * `--register` publishes the key in the Altana KeyStore so a third party can
 * verify its authority on chain. That costs about $0.50 in BNB, so it is
 * opt-in; without it the session enforces identically but is not publicly
 * verifiable.
 */
import { CATEGORIES, type Category } from "@/lib/config";
import { grantMandateSession, revokeMandateSession, loadMeta } from "@/lib/chain/session";
import { isRefused, scopeFromChain } from "@/lib/chain/scope";
import { readMandate } from "@/lib/chain/market";

const cmd = process.argv[2];

if (cmd === "revoke") {
  const id = Number(process.argv[3]);
  await revokeMandateSession(id);
  console.log(`session for mandate ${id} revoked — the agent can no longer act`);
  process.exit(0);
}

const id = Number(cmd);
const category = process.argv[3] as Category;
const register = process.argv.includes("--register");

if (!Number.isFinite(id) || !CATEGORIES.includes(category)) {
  console.error("usage: grant.ts <mandateId> <category> [--register]");
  console.error(`  categories: ${CATEGORIES.join(", ")}`);
  process.exit(1);
}

const capWei = BigInt(process.env.SESSION_CAP_WEI ?? "300000000000000"); // 0.0003 BNB
const ttl = Number(process.env.SESSION_TTL ?? 86_400);

console.log(`granting a session for mandate ${id} (${category})`);
console.log(`  cap      ${(Number(capWei) / 1e18).toFixed(8)} BNB`);
console.log(`  expires  in ${Math.round(ttl / 3600)}h`);
console.log(`  keystore ${register ? "registered (~$0.50)" : "ephemeral (free)"}`);

// granted ⊆ proven. The allowlist is derived from what the chain has shown
// this agent doing, so a grant cannot exceed the evidence for it.
const mandate = await readMandate(id);
const holder = mandate.agent;
if (!holder || /^0x0+$/.test(holder)) {
  console.error(`\nmandate ${id} has no holder, so there is no agent whose capability could be proven.`);
  process.exit(1);
}

console.log(`\n  deriving scope from the chain for ${holder}…`);
const scope = await scopeFromChain(holder, category);

if (isRefused(scope)) {
  console.error(`\n  REFUSED — ${scope.reason}`);
  console.error(`  ${scope.remedy}\n`);
  process.exit(1);
}

console.log(`  ${scope.rationale}\n`);
for (const w of scope.withheld) console.log(`    withheld  ${w.signature.split("(")[0]} — ${w.because}`);

const s = await grantMandateSession({ mandateId: id, scope, capWei, ttlSeconds: ttl, register });

console.log(`\ngranted`);
console.log(`  session key ${s.sessionKey}`);
console.log(`  wallet      ${s.walletAddress}`);
console.log(`  may call:`);
for (const c of s.allowlist) console.log(`    ${c.to}  ${c.signature}`);
console.log(`\nstored. loadMeta says: ${JSON.stringify(loadMeta(id)?.sessionKey)}`);
