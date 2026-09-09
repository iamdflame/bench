/**
 * Is the deployed site actually working, right now?
 *
 *   npm run smoke                     against production
 *   npm run smoke -- --base <url>     against anything else
 *
 * Eligibility requires the submission to be functional and publicly accessible
 * throughout a fourteen-day judging window. A build that passed once tells
 * nobody whether the site is up on day twelve, so this runs on a schedule and
 * checks the things that actually break: a route that 500s, a funnel that has
 * gone stale, sessions that stopped being readable, a market that stopped
 * answering.
 *
 * Every check states what it expected. A smoke test that only prints "ok" is a
 * smoke test nobody can debug at three in the morning.
 */

const baseIdx = process.argv.indexOf("--base");
const BASE = (baseIdx > -1 ? process.argv[baseIdx + 1]! : process.env.SMOKE_BASE ?? "https://mandate-coral.vercel.app").replace(/\/$/, "");
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT_MS ?? 25_000);

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** A failure that is about the world rather than about us. */
  soft?: boolean;
}

const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string, soft = false) => {
  checks.push({ name, ok, detail, soft });
  const mark = ok ? "\x1b[32m✓\x1b[0m" : soft ? "\x1b[33m?\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${mark} ${name}`);
  console.log(`      ${detail}`);
};

async function get(path: string): Promise<{ status: number; body: string; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(TIMEOUT) });
  const body = await res.text();
  return { status: res.status, body, ms: Date.now() - t0 };
}

console.log(`\n  smoke · ${BASE}\n`);

// Every route a judge might open. A 500 on any of them is the failure that
// matters most, because it is the one that makes the whole thing look broken.
const ROUTES = [
  "/",
  "/start",
  "/agents",
  "/agents?rung=2",
  "/floor",
  "/evidence",
  "/authority",
  "/list-your-agent",
  "/assay",
  "/bench",
  "/agent/2410",
  "/mandate/0",
];

let slowest = 0;
for (const route of ROUTES) {
  try {
    const r = await get(route);
    slowest = Math.max(slowest, r.ms);
    record(`GET ${route}`, r.status === 200, `${r.status} in ${r.ms}ms`);
  } catch (e) {
    record(`GET ${route}`, false, `unreachable — ${String(e).slice(0, 90)}`);
  }
}

// The ladder is the front door, so its numbers being present and plausible is
// the difference between a working product and a shell.
try {
  const r = await get("/");
  const registered = r.body.match(/rung-count">([\d,]+)/)?.[1] ?? "";
  const n = Number(registered.replace(/,/g, ""));
  record(
    "the ladder renders a real registry count",
    n > 100_000,
    n > 0 ? `rung 0 shows ${registered}` : "no rung count found in the page",
  );
  record(
    "the population discontinuity is stated",
    r.body.includes("came up the ladder"),
    r.body.includes("came up the ladder")
      ? "rungs 5 and 6 still carry it"
      : "the sentence that stops the funnel over-claiming is missing",
  );
} catch (e) {
  record("the ladder renders a real registry count", false, String(e).slice(0, 90));
}

// Sessions readable, and their authority still described.
try {
  const r = await get("/api/sessions");
  const j = JSON.parse(r.body) as { sessions?: { registered: boolean }[] };
  const n = j.sessions?.length ?? 0;
  const registered = j.sessions?.filter((s) => s.registered).length ?? 0;
  record(
    "sessions are readable",
    n > 0,
    `${n} session${n === 1 ? "" : "s"}, ${registered} KeyStore-registered`,
  );
} catch (e) {
  record("sessions are readable", false, String(e).slice(0, 90));
}

// The market answering is about BSC as much as about us, so a failure here is
// soft: it should be visible without turning the badge red for an RPC outage.
try {
  const r = await get("/api/floor");
  const j = JSON.parse(r.body) as { mandates?: unknown[] };
  record(
    "the market responds",
    Array.isArray(j.mandates),
    Array.isArray(j.mandates) ? `${j.mandates.length} mandates` : "no mandates array",
    true,
  );
} catch (e) {
  record("the market responds", false, `chain unreachable — ${String(e).slice(0, 70)}`, true);
}

const hard = checks.filter((c) => !c.ok && !c.soft);
const soft = checks.filter((c) => !c.ok && c.soft);
console.log(`\n  ${checks.length - hard.length - soft.length}/${checks.length} passing · slowest ${slowest}ms`);
if (soft.length) console.log(`  ${soft.length} soft failure(s) — about the world, not the build`);
if (hard.length) {
  console.log(`\n  FAILING:`);
  for (const c of hard) console.log(`    · ${c.name} — ${c.detail}`);
}
console.log();
process.exit(hard.length > 0 ? 1 : 0);

export {};
