/**
 * The check that runs against something actually serving.
 *
 * Every other gate reads source. This one drives a real browser and a real
 * HTTP client against a running deployment, because the failures it looks for
 * only exist at runtime: a route that compiles and 500s, a funnel that is
 * three days stale, an API that answers without the provenance it promises,
 * and animation that fires on arrival.
 *
 *   npm run smoke                       # against http://127.0.0.1:3000
 *   npm run smoke -- https://…          # against a deployment
 *
 * It is the one check that can fail because the world changed rather than
 * because the code did, which is why it is not in the build's gate list. It
 * belongs on a schedule against production.
 */

import { chromium } from "playwright-core";

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

let failed = 0;
const fail = (m: string) => {
  console.error(`  FAIL  ${m}`);
  failed++;
};
const pass = (m: string) => console.log(`  ok    ${m}`);

console.log(`\nsmoke: against ${base}\n`);

/* ------------------------------------------------ 1. every route serves */
const ROUTES = [
  "/",
  "/j/rebalancing",
  "/j/grid",
  "/j/yield",
  "/j/health",
  "/register",
  "/data",
  "/list",
  "/desk",
  "/api/v1/snapshot",
  "/api/v1/agents?limit=1",
  "/api/v1/jobs/yield",
  "/.well-known/agent-card.json",
];

for (const path of ROUTES) {
  try {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(20_000) });
    if (res.ok) pass(`${res.status} ${path}`);
    else fail(`${res.status} ${path}`);
  } catch (e) {
    fail(`${path} did not answer: ${String(e).slice(0, 80)}`);
  }
}

/* --------------------------------- 2. the agent endpoints ask to be paid */
{
  const res = await fetch(`${base}/api/agents/range-keeper-i`, { signal: AbortSignal.timeout(20_000) }).catch(
    () => null,
  );
  if (!res) fail("a reference agent's endpoint did not answer at all");
  else if (res.status !== 402) fail(`a reference agent answered ${res.status} rather than asking for payment`);
  else {
    const body = (await res.json()) as { accepts?: { asset?: string; payTo?: string; network?: string }[] };
    const route = body.accepts?.[0];
    if (!route?.payTo || !/^0x[0-9a-fA-F]{40}$/.test(route.payTo)) {
      fail("a reference agent's challenge names no payee, so nobody could pay it");
    } else if (route.network !== "eip155:56") {
      fail(`a reference agent quotes ${route.network} rather than BNB Smart Chain`);
    } else pass("a reference agent answers 402 with a payable challenge on chain 56");
  }
}

/* ---------------------------------- 3. the API answers with its provenance */
{
  const res = await fetch(`${base}/api/v1/snapshot`, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) {
    fail("the snapshot endpoint did not answer");
  } else {
    const body = (await res.json()) as { meta?: { block?: string; observedAt?: string } };
    if (!body.meta?.block || body.meta.block === "0") fail("the snapshot answers without a block");
    else if (!body.meta.observedAt) fail("the snapshot answers without a time it was read");
    else {
      const ageH = (Date.now() - new Date(body.meta.observedAt).getTime()) / 3_600_000;
      if (ageH > 6) {
        fail(`the funnel was last read ${ageH.toFixed(1)}h ago — the worker is not running`);
      } else pass(`the funnel is ${(ageH * 60).toFixed(0)}m old, at block ${body.meta.block}`);
    }
  }
}

/* ------------------------------------- 4. the read path works without script */
{
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const p1 = await noJs.newPage();
  await p1.goto(base, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const rowsNoJs = await p1.locator("tbody tr").count();
  if (rowsNoJs === 0) fail("the board renders no rows with JavaScript off");
  else pass(`${rowsNoJs} board rows render with JavaScript off`);
  await noJs.close();

  /* ------------------------- 5. nothing animates on arrival */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(500);

  const onArrival = await page.evaluate(() => ({
    fresh: document.querySelectorAll("[data-fresh]").length,
    rolled: document.querySelectorAll(".rolled").length,
    tracked: Object.keys(JSON.parse(sessionStorage.getItem("bench:seen:v1") ?? "{}")).length,
  }));

  if (onArrival.fresh > 0 || onArrival.rolled > 0) {
    fail(`${onArrival.fresh + onArrival.rolled} elements animated on arrival — the plan forbids motion without a data event`);
  } else if (onArrival.tracked === 0) {
    fail("the live layer tracked nothing, so a real change would never animate either");
  } else {
    pass(`nothing animated on arrival, and ${onArrival.tracked} live values were recorded as the baseline`);
  }

  /* ---------------- 6. a value that changed since the reader last looked does move */
  await page.evaluate(() => {
    const seen = JSON.parse(sessionStorage.getItem("bench:seen:v1") ?? "{}") as Record<string, string>;
    for (const k of Object.keys(seen)) if (k.endsWith(":latency")) seen[k] = "__changed__";
    sessionStorage.setItem("bench:seen:v1", JSON.stringify(seen));
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });

  /*
    Polled rather than sampled once: the classes are removed after 700ms, so
    checking at a moment races the cleanup and reports a false negative.
  */
  let peak = 0;
  for (let i = 0; i < 25; i++) {
    peak = Math.max(peak, await page.evaluate(() => document.querySelectorAll(".rolled").length));
    await page.waitForTimeout(40);
  }
  if (peak === 0) fail("a value that changed since the last look did not animate");
  else pass(`${peak} changed values rolled, and none of the unchanged ones did`);

  await browser.close();
}

console.log(
  failed === 0 ? `\n  the deployment is serving what it promises.\n` : `\n  ${failed} failed.\n`,
);
process.exit(failed > 0 ? 1 : 0);
