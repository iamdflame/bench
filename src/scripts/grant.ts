/**
 * Grants a mandate's session.
 *
 *   npm run grant -- <mandateId> <category> [--cap 0.02] [--ttl 30d] [--register]
 *   npm run grant -- revoke <mandateId>
 *
 * `--register` publishes the key in the Altana KeyStore so a third party can
 * verify its authority on chain. That costs about $0.50 in BNB, so it is
 * opt-in; without it the session enforces identically but is not publicly
 * verifiable. For anything a judge or a counterparty is asked to trust, use it.
 *
 * `--cap` is in BNB and `--ttl` takes a duration with a unit (30d, 12h, 90m).
 * They were environment variables, which is the wrong shape for the two values
 * a person actually varies per grant, and it meant the command the interface
 * printed was not a command that ran. The environment still sets the defaults.
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
  console.error("usage: npm run grant -- <mandateId> <category> [--cap 0.02] [--ttl 30d] [--register]");
  console.error(`  categories: ${CATEGORIES.join(", ")}`);
  process.exit(1);
}

/** Reads `--flag value`, returning null when the flag is absent. */
function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/** `30d`, `12h`, `90m`, or bare seconds. Refuses anything else rather than guessing. */
function duration(v: string): number {
  const m = v.match(/^(\d+(?:\.\d+)?)([dhms])?$/);
  if (!m) {
    console.error(`  cannot read "${v}" as a duration. Use 30d, 12h, 90m, or seconds.`);
    process.exit(1);
  }
  const n = Number(m[1]);
  const unit = m[2] ?? "s";
  return Math.round(n * { d: 86_400, h: 3_600, m: 60, s: 1 }[unit as "d" | "h" | "m" | "s"]);
}

const capFlag = flag("cap");
const capWei = capFlag
  ? BigInt(Math.round(Number(capFlag) * 1e18))
  : BigInt(process.env.SESSION_CAP_WEI ?? "300000000000000"); // 0.0003 BNB
const ttl = flag("ttl") ? duration(flag("ttl")!) : Number(process.env.SESSION_TTL ?? 86_400);

if (capWei <= 0n) {
  console.error("  a cap must be positive: an uncapped session is not a bounded one.");
  process.exit(1);
}

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
