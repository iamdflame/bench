/**
 * Proves an ERC-8183 session key is actually bounded.
 *
 *   npm run prove-session          # ephemeral session, costs nothing
 *   npm run prove-session -- --register   # registers in the Altana KeyStore
 *
 * A session key is a claim about what an agent *cannot* do. Claims like that
 * are worth nothing unheld, so this asserts them by trying: it grants a
 * session, attempts calls inside and outside its scope, revokes it, and
 * attempts them again.
 *
 * The three refusals are the assertions that matter and they cost nothing to
 * run, because a call outside the policy never reaches the chain. If any of
 * them were to pass silently the delegation would be theatre.
 *
 * The script grants its own throwaway session rather than testing a live one,
 * since assertion 6 destroys whatever it is pointed at.
 */

import { encodeFunctionData, parseAbi, type Abi } from "viem";
import { marketClient } from "@/lib/chain/market";
import {
  agentProvider,
  grantMandateSession,
  loadMeta,
  revokeMandateSession,
  CATEGORY_CALLS,
} from "@/lib/chain/session";
import { isRefused, scopeFromChain } from "@/lib/chain/scope";
import { walletFor } from "@/lib/chain/market";

/** A mandate id no real mandate will collide with. */
const PROBE_ID = 999_001;
const CATEGORY = "grid-trading" as const;
const CAP_WEI = 100_000_000_000_000n; // 0.0001 BNB
const REGISTER = process.argv.includes("--register");

const V3_ROUTER = "0x13f4ea83d0bd40e75c8222255bc855a974568dd4" as const;
const USDT = "0x55d398326f99059fF775485246999027B3197955" as const;
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;
/** Not on any allowlist. Chosen because it is a real, valuable token. */
const OFF_LIST_TOKEN = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" as const; // USDC

const ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256)",
  "function sweepToken(address token, uint256 amountMinimum, address recipient) payable",
]);
const ERC20_ABI = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

type Outcome = "pass" | "fail" | "inconclusive";

interface Assertion {
  n: number;
  name: string;
  expectation: string;
  outcome: Outcome;
  detail: string;
}

const results: Assertion[] = [];
const record = (n: number, name: string, expectation: string, outcome: Outcome, detail: string) => {
  results.push({ n, name, expectation, outcome, detail });
  const mark =
    outcome === "pass" ? "\x1b[32m✓\x1b[0m" : outcome === "fail" ? "\x1b[31m✗\x1b[0m" : "\x1b[33m?\x1b[0m";
  console.log(`  ${mark} ${n}. ${name}`);
  console.log(`       ${detail}`);
};

const swapCall = (amountIn: bigint, recipient: `0x${string}`) => ({
  address: V3_ROUTER as `0x${string}`,
  abi: ROUTER_ABI as unknown as Abi,
  functionName: "exactInputSingle",
  args: [
    {
      tokenIn: USDT,
      tokenOut: WBNB,
      fee: 500,
      recipient,
      amountIn,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n,
    },
  ] as const,
});

/**
 * Classifies a failure, which is the whole difficulty here.
 *
 * An earlier version of this script matched a regex against the entire error
 * string and scored a pass whenever the call did not send. That was wrong
 * twice over: the error text embeds the request body, which contains the word
 * "limit" from the permission payload, so almost anything looked like a policy
 * refusal — and, worse, a call that fails for an unrelated reason was being
 * counted as proof that the cap held. It is not. Refusing for the wrong reason
 * looks identical to refusing for the right one unless you check.
 *
 * So refusals are classified against a baseline: whatever the in-scope call
 * does. If a probe fails the same way the in-scope call fails, the failure is
 * not attributable to scope and the assertion is inconclusive.
 */
function classify(error: unknown): { kind: "policy" | "infrastructure" | "other"; reason: string } {
  const s = String(error);
  // Altana names its policy rejections explicitly, before any simulation.
  if (/UnauthorizedCall|Unauthorized\b|InvalidKey|KeyNotFound|key.*not.*author/i.test(s)) {
    const m = s.match(/Reason:\s*(\w+)/);
    return { kind: "policy", reason: m ? m[1]! : "policy rejection" };
  }
  // The relay's own upstream failing is not a decision about our permissions.
  if (/please assign a tracer|-32602|InternalRpcError/i.test(s)) {
    return { kind: "infrastructure", reason: "Altana relay upstream: -32602 please assign a tracer" };
  }
  return { kind: "other", reason: s.replace(/\s+/g, " ").slice(0, 120) };
}

async function attempt(mandateId: number, call: ReturnType<typeof swapCall> | {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}): Promise<{ sent: boolean; error?: unknown }> {
  try {
    const provider = await agentProvider(mandateId);
    const executor = provider.makeExecutor({ client: marketClient });
    await executor.execute({ call: call as never, description: "session scope probe" });
    return { sent: true };
  } catch (error) {
    return { sent: false, error };
  }
}

console.log(`\n  ERC-8183 session scope, proven by attempting`);
console.log(`  category ${CATEGORY} · cap ${CAP_WEI} wei · ${REGISTER ? "KeyStore-registered" : "ephemeral"}\n`);

if (!REGISTER) {
  console.log(`  \x1b[2mrunning ephemeral: enforcement is identical, but the key is not\x1b[0m`);
  console.log(`  \x1b[2mpublicly verifiable. Pass --register once funds allow.\x1b[0m\n`);
}

// ---------------------------------------------------------------- 1. granted
// A session cannot be granted without a proof, so the probe needs one too.
const probeAgent = walletFor(
  (process.env.AGENT_A_KEY?.startsWith("0x")
    ? process.env.AGENT_A_KEY
    : `0x${process.env.AGENT_A_KEY}`) as `0x${string}`,
).account!.address;

const scope = await scopeFromChain(probeAgent, CATEGORY);
if (isRefused(scope)) {
  console.log(`  \x1b[33mgranted ⊆ proven refused this grant before it was made\x1b[0m`);
  console.log(`    agent  ${probeAgent}`);
  console.log(`    reason ${scope.reason}`);
  console.log(`    remedy ${scope.remedy}`);
  console.log(
    `\n  That is the invariant working, and it means the session-enforcement`,
  );
  console.log(`  assertions below cannot run: there is no authority to test.\n`);
  process.exit(2);
}
console.log(`  scope: ${scope.rationale}\n`);

const granted = await grantMandateSession({
  mandateId: PROBE_ID,
  scope,
  capWei: CAP_WEI,
  ttlSeconds: 600,
  register: REGISTER,
});

const meta = loadMeta(PROBE_ID);
record(
  1,
  "the session key exists after granting",
  "a public key, a wallet, an expiry in the future",
  Boolean(meta?.sessionKey) && (meta?.expiry ?? 0) > Math.floor(Date.now() / 1000) ? "pass" : "fail",
  `key ${granted.sessionKey.slice(0, 22)}… for ${granted.walletAddress}, expires ${new Date(granted.expiry * 1000).toISOString()}`,
);

record(
  2,
  "the allowlist is bound to selector, not just contract",
  "every entry names a function signature",
  CATEGORY_CALLS[CATEGORY].every((c) => c.signature.includes("(")) ? "pass" : "fail",
  CATEGORY_CALLS[CATEGORY].map((c) => `${c.to.slice(0, 10)}…${c.signature.split("(")[0]}`).join(", "),
);

// -------------------------------------------------- 3. in-scope call admitted
const inScope = await attempt(PROBE_ID, swapCall(1000n, granted.walletAddress as `0x${string}`));
const baseline = inScope.sent ? null : classify(inScope.error);
record(
  3,
  "an in-scope call is admitted by the policy",
  "the swap reaches the chain, or fails for a reason that is not scope",
  inScope.sent ? "pass" : baseline!.kind === "policy" ? "fail" : "inconclusive",
  inScope.sent
    ? "sent"
    : baseline!.kind === "policy"
      ? `the policy refused a call it should permit — ${baseline!.reason}`
      : `cannot tell: the call never reached a policy decision. ${baseline!.reason}`,
);

/** A probe that fails the same way the in-scope call fails proves nothing. */
const attribute = (error: unknown): { outcome: Outcome; reason: string } => {
  const c = classify(error);
  if (c.kind === "policy") return { outcome: "pass", reason: `refused by policy — ${c.reason}` };
  if (baseline && c.kind === baseline.kind)
    return {
      outcome: "inconclusive",
      reason: `refused, but the same way an in-scope call is refused, so this is not evidence of scope — ${c.reason}`,
    };
  return { outcome: "inconclusive", reason: `refused for an unattributable reason — ${c.reason}` };
};

// --------------------------------------------------- 4. out-of-scope target
const offTarget = await attempt(PROBE_ID, {
  address: OFF_LIST_TOKEN,
  abi: ERC20_ABI as unknown as Abi,
  functionName: "transfer",
  args: [granted.walletAddress as `0x${string}`, 1n],
});
record(
  4,
  "an out-of-scope target is refused",
  "a transfer on a token that is on no allowlist never signs",
  offTarget.sent ? "fail" : attribute(offTarget.error).outcome,
  offTarget.sent ? "IT WAS SENT. The allowlist is not binding." : attribute(offTarget.error).reason,
);

// ------------------------------------- 5. wrong selector on an allowed target
const wrongSelector = await attempt(PROBE_ID, {
  address: V3_ROUTER,
  abi: ROUTER_ABI as unknown as Abi,
  functionName: "sweepToken",
  args: [USDT, 0n, granted.walletAddress as `0x${string}`],
});
record(
  5,
  "the wrong selector on an allowed target is refused",
  "sweepToken on the router the agent may swap through never signs",
  wrongSelector.sent ? "fail" : attribute(wrongSelector.error).outcome,
  wrongSelector.sent ? "IT WAS SENT. The allowlist is per-contract, not per-selector." : attribute(wrongSelector.error).reason,
);

// ------------------------------------------------------------ 6. cap breach
const overCap = await attempt(
  PROBE_ID,
  swapCall(CAP_WEI * 1_000n, granted.walletAddress as `0x${string}`),
);
record(
  6,
  "a call above the spend cap is refused",
  `${CAP_WEI * 1_000n} wei against a ${CAP_WEI} wei cap never signs`,
  overCap.sent ? "fail" : attribute(overCap.error).outcome,
  overCap.sent ? "IT WAS SENT. The cap is not binding." : attribute(overCap.error).reason,
);

// ------------------------------------------------------------- 7. revocation
let revoked = false;
let revokeError = "";
try {
  await revokeMandateSession(PROBE_ID);
  revoked = true;
} catch (e) {
  revokeError = String(e).slice(0, 150);
}
const afterMeta = loadMeta(PROBE_ID);
record(
  7,
  "revocation completes and is recorded",
  "the session is marked revoked in the index the interface reads",
  revoked && Boolean(afterMeta?.revokedAt) ? "pass" : "fail",
  revoked ? `revoked at ${afterMeta?.revokedAt}` : `revoke failed — ${revokeError}`,
);

// ------------------------------------- 8. the previously-admitted call now fails
const afterRevoke = await attempt(PROBE_ID, swapCall(1000n, granted.walletAddress as `0x${string}`));
record(
  8,
  "the call that was admitted in 3 is now refused",
  "revocation ends authority, it does not merely record an intention",
  afterRevoke.sent ? "fail" : attribute(afterRevoke.error).outcome,
  afterRevoke.sent
    ? "IT WAS SENT AFTER REVOCATION. The key is still live."
    : attribute(afterRevoke.error).reason,
);

// The probe is not a mandate. Leaving it in the committed index would put a
// fake session on the deployed site.
try {
  const { readFileSync, writeFileSync, existsSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const index = join(process.cwd(), "src/data/sessions.json");
  if (existsSync(index)) {
    const all = JSON.parse(readFileSync(index, "utf8")) as Record<string, unknown>;
    delete all[String(PROBE_ID)];
    writeFileSync(index, `${JSON.stringify(all, null, 2)}\n`);
  }
  for (const ext of [".session", ".json"]) {
    const f = join(process.cwd(), `.sessions/mandate-${PROBE_ID}${ext}`);
    if (existsSync(f)) rmSync(f);
  }
} catch {
  // Cleanup failing must not change the result of the proof.
}

const passed = results.filter((r) => r.outcome === "pass").length;
const failed = results.filter((r) => r.outcome === "fail").length;
const unknown = results.filter((r) => r.outcome === "inconclusive").length;

console.log(`\n  ${passed} proven · ${failed} failed · ${unknown} inconclusive`);

if (unknown && baseline?.kind === "infrastructure") {
  console.log(
    `\n  \x1b[33mThe inconclusive ones are not a result.\x1b[0m Altana's relay is answering`,
  );
  console.log(`  every simulated call with \x1b[2m-32602: please assign a tracer\x1b[0m — its`);
  console.log(`  upstream node has no tracer configured. Nothing reaches a policy`);
  console.log(`  decision, so a refusal there cannot be credited to the cap.`);
  console.log(`  The allowlist assertions still hold because Altana rejects those`);
  console.log(`  before simulating, with a named UnauthorizedCall.`);
}
if (!REGISTER) {
  console.log(
    `\n  \x1b[2mnot KeyStore-registered, so a third party cannot yet confirm this key on chain\x1b[0m`,
  );
}
console.log();

// Inconclusive is not success. It is also not a failure of the thing under
// test, so it exits 2 rather than 1.
process.exit(failed > 0 ? 1 : unknown > 0 ? 2 : 0);
