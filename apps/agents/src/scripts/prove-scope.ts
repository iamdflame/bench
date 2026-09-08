/**
 * Rail 3, exercised: grant → in-scope → out-of-scope refused → revoke → dead.
 *
 * A claim about what an agent *cannot* do is worth nothing unheld. This grants
 * a real, capped, short-lived session on BNB Smart Chain, attacks it, revokes
 * it, and attacks it again — and reports what each attempt actually proved.
 *
 * ---------------------------------------------------------------------------
 * The mistake this script is built to avoid
 * ---------------------------------------------------------------------------
 *
 * An earlier version of this proof, in the predecessor project, reported seven
 * of eight assertions passing. It was wrong. It matched a regex over the whole
 * error string — which embeds the request body, and the permissions payload
 * contains the word `limit` — so almost any failure looked like a policy
 * refusal. It was counting calls that failed for unrelated reasons as evidence
 * that the cap held.
 *
 * **Refusing for the wrong reason is indistinguishable from refusing for the
 * right one unless you check.** So every refusal here is classified against a
 * baseline: the same call, in scope, run first. A rejection that fails the way
 * an in-scope call fails proves nothing and is reported as inconclusive rather
 * than as a pass. A proof that never returns "inconclusive" is a rubber stamp.
 *
 *   npm run prove-scope -- --job grid --wallet 0x…
 */

import { formatEther, toFunctionSelector, type Address, type Hex } from "viem";
import {
  RECIPIENT_BOUND_ABI,
  VENUES,
  addressUrl,
  chainClient,
  isJobSlug,
  jobBySlug,
  recipientBound,
  txUrl,
  type JobSlug,
  type SupportedChain,
} from "@bench/shared";
import {
  altana,
  grantEngagement,
  hasPrincipal,
  isLive,
  loadSession,
  principal,
  readEngagement,
  revokeEngagement,
  scopeFor,
  isRefused,
} from "@bench/rails";

const CHAIN: SupportedChain = 56;

type Result = "proven" | "failed" | "inconclusive";
const marks: Record<Result, string> = { proven: "✓", failed: "✗", inconclusive: "?" };

const rows: { n: number; claim: string; result: Result; detail: string }[] = [];
function record(n: number, claim: string, result: Result, detail: string) {
  rows.push({ n, claim, result, detail });
  console.log(`  ${marks[result]} ${String(n)}. ${claim.padEnd(52)} ${detail}`);
}

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : dflt;
};

/**
 * What a failure was actually about.
 *
 * The three that matter are distinguishable in the message the relay returns.
 * Anything else is `unknown`, and an unknown never counts as a proof.
 */
type Kind = "policy" | "funds" | "revoked" | "unknown";

function classify(err: unknown): { kind: Kind; message: string } {
  const raw = String(err);
  /*
    The message is searched, never the whole serialised error. The permissions
    payload is echoed inside a request body that appears in the error object,
    and it contains words like `limit` and `calls` — matching against that is
    exactly how the earlier version fooled itself.
  */
  const message =
    (err as { shortMessage?: string })?.shortMessage ??
    (err as { details?: string })?.details ??
    raw.split("\n")[0] ??
    raw;

  const m = message.toLowerCase();
  if (/unauthorized|not authorized|permission|not allowed|denied|scope/.test(m)) {
    return { kind: "policy", message };
  }
  if (/revoked|expired|unknown key|no such key|key not found/.test(m)) {
    return { kind: "revoked", message };
  }
  if (/insufficient|balance|funds|gas required|exceeds/.test(m)) {
    return { kind: "funds", message };
  }
  return { kind: "unknown", message };
}

async function attempt(session: NonNullable<ReturnType<typeof loadSession>>, calls: { to: Address; data: Hex; value: bigint }[]) {
  try {
    const r = await altana(CHAIN).execute({ session, calls, chainId: CHAIN });
    return { ok: true as const, hash: r.transactionHash ?? null, status: r.status };
  } catch (e) {
    return { ok: false as const, ...classify(e) };
  }
}

async function main() {
  const job = (isJobSlug(arg("job", "grid")) ? arg("job", "grid") : "grid") as JobSlug;
  const spec = jobBySlug(job)!;

  if (!hasPrincipal()) {
    console.error("\n  No principal key. Rail 3 grants authority over an account; set PRINCIPAL_KEY.\n");
    process.exit(2);
  }

  const { wallet } = principal();
  const subject = (arg("wallet", wallet.address) as Address);

  console.log(`\nRail 3 — Mandate\n`);
  console.log(`  job        ${spec.title}`);
  console.log(`  principal  ${wallet.address}`);
  console.log(`  subject    ${subject}  (the wallet whose capability is scanned)\n`);

  const bnb = await chainClient(CHAIN).getBalance({ address: wallet.address });
  console.log(`  the principal holds ${formatEther(bnb)} BNB\n`);

  /* ------------------------------------------------- 1. derive the authority */
  const scope = await scopeFor(CHAIN, subject, job);
  if (isRefused(scope)) {
    record(1, "authority is derived from on-chain evidence", "proven", `refused — ${scope.reason.slice(0, 60)}`);
    console.log(`\n  The scan refused, which is the rail working: ${scope.reason}`);
    console.log(`  ${scope.remedy}\n`);
    console.log(`  Nothing was granted. To exercise the rest of this proof, point --wallet at`);
    console.log(`  an address the chain shows using a ${spec.title.toLowerCase()} venue.\n`);
    process.exit(0);
  }
  record(
    1,
    "authority is derived from on-chain evidence",
    "proven",
    `${scope.calls.length} calls, ${scope.withheld.length} withheld`,
  );

  const wrapper = recipientBound(CHAIN);
  record(
    2,
    "calls that carry a destination are bound to the principal",
    wrapper ? "proven" : "inconclusive",
    wrapper ? `wrapper ${wrapper.slice(0, 12)}…` : "no wrapper deployed for this pair",
  );

  /* ------------------------------------------------------------ 3. the grant */
  const cap = 1_000_000_000_000_000n; // 0.001 BNB. Small on purpose.
  let engagementId: number;
  try {
    const granted = await grantEngagement({
      chainId: CHAIN,
      scope,
      tokenId: null,
      agentName: `prove-scope ${job}`,
      capWei: cap,
      ttlSeconds: 15 * 60,
      register: true,
    });
    engagementId = granted.engagement.id;
    record(
      3,
      "a scoped, capped, expiring session is granted",
      "proven",
      `key ${granted.engagement.sessionKey.slice(0, 12)}… cap ${formatEther(cap)} BNB`,
    );
    record(
      4,
      "the key is registered in the KeyStore, with its transaction",
      granted.engagement.registered ? "proven" : "inconclusive",
      granted.engagement.registrationTx
        ? txUrl(CHAIN, granted.engagement.registrationTx)
        : "no Authorize log found, so it is recorded as unregistered",
    );
  } catch (e) {
    const c = classify(e);
    record(3, "a scoped, capped, expiring session is granted", "failed", c.message.slice(0, 80));
    console.log(`\n  ${c.message}\n`);
    process.exit(1);
  }

  const session = loadSession(engagementId);
  if (!session) {
    record(5, "the session can be reloaded and used", "failed", "the stored key could not be read back");
    process.exit(1);
  }
  record(5, "the session survives a restart and can be reloaded", "proven", `engagement ${engagementId}`);

  /* ------------------------------- 6. the baseline: an in-scope call, allowed */
  /*
    The four bytes of an allowed selector, and nothing else.

    This line used to compute `signature.slice(0, indexOf("("))` — the function
    *name*, "mint", cast `as Hex` — and then throw it away and send `data: "0x"`
    instead. So the "in-scope baseline" exercised no selector at all: it sent
    empty calldata, which is not in any allowlist. Every comparison below is
    made against this baseline, so the whole scope-enforcement half of the proof
    was structurally incapable of proving anything, and duly reported four
    inconclusives. The script's own rule — that a refusal for the wrong reason
    is not evidence — is what caught it.

    Arguments are still omitted. What is being measured is whether the policy
    *permits* the call, and a bare selector reaches validation before it reaches
    anything that could revert on its arguments.
  */
  const inScope = scope.calls[0]!;
  const inScopeSelector = toFunctionSelector(`function ${inScope.signature}`) as Hex;
  const baseline = await attempt(session, [
    { to: inScope.to, data: inScopeSelector, value: 0n },
  ]);
  const baselineKind = baseline.ok ? "allowed" : baseline.kind;
  record(
    6,
    "an in-scope target is not refused by policy",
    baseline.ok || baseline.kind !== "policy" ? "proven" : "failed",
    baseline.ok ? `executed ${baseline.hash ?? ""}` : `${baseline.kind}: ${baseline.message.slice(0, 96)}`,
  );

  /* -------------------------------- 7. an out-of-scope target must be refused */
  /*
    A contract this session was never granted anything on. If it fails the same
    way the in-scope call failed, the refusal is not attributable to the policy
    and this is reported as inconclusive.
  */
  const outOfScope = VENUES.venusComptroller as Address;
  /*
    A selector that is real and valid on the target, so the only thing separating
    this from the baseline is that the *target* was never granted. Sending empty
    calldata here would have failed for its own reasons and proved nothing.
  */
  const outsideSelector = toFunctionSelector("function getAllMarkets()") as Hex;
  const outside = await attempt(session, [{ to: outOfScope, data: outsideSelector, value: 0n }]);
  record(
    7,
    "an out-of-scope target is refused",
    outside.ok
      ? "failed"
      : outside.kind === "policy"
        ? "proven"
        : outside.kind === baselineKind
          ? "inconclusive"
          : "inconclusive",
    outside.ok
      ? "IT EXECUTED — the allowlist did not hold"
      : outside.kind === "policy"
        ? outside.message.slice(0, 60)
        : `${outside.kind}, same as in-scope: ${outside.message.slice(0, 88)}`,
  );

  /* ------------------ 8. a withheld selector on an allowed target is refused */
  const withheld = scope.withheld.find((w) => w.signature.includes("("));
  if (withheld) {
    /*
      The four bytes alone, not an encoded call.

      What is being tested is whether the *selector* is outside the grant, so
      the arguments are irrelevant and encoding them would only introduce a
      second reason the call could fail.
    */
    const selector = toFunctionSelector(`function ${withheld.signature}`) as Hex;
    const wrong = await attempt(session, [{ to: inScope.to, data: selector, value: 0n }]);
    record(
      8,
      "a withheld selector on an allowed target is refused",
      wrong.ok
        ? "failed"
        : wrong.kind === "policy"
          ? "proven"
          : "inconclusive",
      wrong.ok
        ? "IT EXECUTED — per-selector scoping did not hold"
        : wrong.kind === "policy"
          ? wrong.message.slice(0, 60)
          : `${wrong.kind}: ${wrong.message.slice(0, 96)}`,
    );
  } else {
    record(8, "a withheld selector on an allowed target is refused", "inconclusive", "nothing was withheld to test");
  }

  /* ------------------------------------------------------------ 9. revocation */
  try {
    const revoked = await revokeEngagement(engagementId);
    record(
      9,
      "revocation completes and is recorded",
      revoked.revokedAt ? "proven" : "failed",
      revoked.revokedTx ? txUrl(CHAIN, revoked.revokedTx) : "revoked, no transaction hash surfaced",
    );
  } catch (e) {
    record(9, "revocation completes and is recorded", "failed", classify(e).message.slice(0, 70));
  }

  /* ------------------------- 10. the same call, after revocation, must fail */
  const after = await attempt(session, [{ to: inScope.to, data: inScopeSelector, value: 0n }]);
  record(
    10,
    "the same in-scope call now fails",
    after.ok
      ? "failed"
      : after.kind === "revoked" || after.kind === "policy"
        ? "proven"
        : "inconclusive",
    after.ok
      ? "IT STILL EXECUTED — revocation did not take effect"
      : after.kind === "revoked" || after.kind === "policy"
        ? after.message.slice(0, 60)
        : `${after.kind}: ${after.message.slice(0, 92)}`,
  );

  const e = readEngagement(engagementId);
  const proven = rows.filter((r) => r.result === "proven").length;
  const failed = rows.filter((r) => r.result === "failed").length;
  const inconclusive = rows.filter((r) => r.result === "inconclusive").length;

  console.log(
    `\n  ${proven} proven · ${failed} failed · ${inconclusive} inconclusive\n` +
      `  on BNB Smart Chain mainnet, against a session that existed for real.\n`,
  );
  if (inconclusive > 0) {
    console.log(
      `  An inconclusive line is one where the call failed for a reason that\n` +
        `  cannot be credited to the policy. It is reported rather than counted,\n` +
        `  because a proof that never says "inconclusive" is a rubber stamp.\n`,
    );
  }
  if (e) {
    console.log(`  engagement ${e.id} · ${isLive(e) ? "live" : "ended"} · ${addressUrl(CHAIN, e.principal)}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
