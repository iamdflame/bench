/**
 * Is the judge path working on the deployed site, right now?
 *
 *   npm run smoke                     against production
 *   npm run smoke -- --base <url>     against anything else
 *
 * Walks the six beats the way a judge would, with scripting off: each page is
 * fetched as HTML and checked for the thing /judges tells a judge to look at.
 * Then the JSON a monitor would watch, and the funnel against a live read of
 * the registry's own counter. Every check says what it expected, so a failure
 * at three in the morning can be read without opening the code.
 */

import { hexToBigInt } from "viem";
import { bscClient } from "@/lib/chain/rpc";
import { COUNTER_SLOT } from "@/lib/registry/count";
import { IDENTITY_REGISTRY } from "@/lib/config";

const baseIdx = process.argv.indexOf("--base");
const BASE = (baseIdx > -1 ? process.argv[baseIdx + 1]! : process.env.SMOKE_BASE ?? "https://mandate-coral.vercel.app").replace(/\/$/, "");
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT_MS ?? 45_000);
const DEMO = "0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

async function get(path: string): Promise<{ status: number; text: string; ms: number }> {
  const started = Date.now();
  try {
    const res = await fetch(BASE + path, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT), headers: { "user-agent": "mandate-smoke" } });
    return { status: res.status, text: await res.text(), ms: Date.now() - started };
  } catch (e) {
    return { status: 0, text: String((e as Error).message), ms: Date.now() - started };
  }
}

async function page(path: string, expect: { name: string; test: (html: string) => boolean | string }[]) {
  const r = await get(path);
  if (r.status !== 200) {
    record(`${path}`, false, `expected 200, got ${r.status || "no answer"} in ${r.ms} ms`);
    return;
  }
  for (const e of expect) {
    const v = e.test(r.text);
    record(`${path}: ${e.name}`, v === true, v === true ? `ok in ${r.ms} ms` : typeof v === "string" ? v : "not found in the HTML");
  }
}

async function main() {
  console.log(`smoke against ${BASE}\n`);

  await page("/judges", [
    {
      name: "six beats, each with a link",
      test: (h) => {
        const list = h.split('class="m-walkbig"')[1]?.split("</ol>")[0] ?? "";
        const items = list.split("<li").slice(1);
        if (items.length !== 6) return `expected 6 beats, found ${items.length}`;
        const bare = items.findIndex((li) => !/href="/.test(li));
        return bare === -1 ? true : `beat ${bare + 1} has no link`;
      },
    },
    { name: "the demo address is published", test: (h) => h.includes(DEMO) },
  ]);
  await page(`/diagnose?q=${DEMO}`, [
    { name: "an out-of-range position is found", test: (h) => h.includes("out of range and earning nothing") },
    { name: "a Venus health factor is read", test: (h) => /Health factor \d/.test(h) },
  ]);
  await page("/agents?live=1&category=grid-trading", [
    { name: "at least one answering grid agent to open", test: (h) => /href="\/agents\/\d+"/.test(h) },
  ]);
  await page("/agents/269706", [{ name: "Ranger's profile renders", test: (h) => h.includes("Ranger") }]);
  await page("/desk", [
    { name: "live keys are listed", test: (h) => h.includes("Keys that can act right now") },
    { name: "the KeyStore is read", test: (h) => h.includes("matches") || h.includes("registry says") || "no KeyStore verdict on the page" },
  ]);
  await page("/status", [{ name: "the beat checks render", test: (h) => h.includes("The six beats") }]);
  await page("/", [{ name: "home renders", test: (h) => h.includes("</html>") }]);
  await page("/activity", [{ name: "activity renders", test: (h) => h.includes("</html>") }]);

  const status = await get("/api/status");
  try {
    const j = JSON.parse(status.text) as { ok: boolean; checks: { beat: number; name: string; ok: boolean; detail: string }[] };
    const bad = j.checks.filter((c) => !c.ok);
    record("/api/status: every beat's data read passes", j.ok, j.ok ? `ok in ${status.ms} ms` : bad.map((c) => `beat ${c.beat} ${c.name}: ${c.detail}`).join("; "));
  } catch {
    record("/api/status", false, `expected JSON, got ${status.status}`);
  }

  const funnel = await get("/api/v1/registry/funnel");
  try {
    const j = JSON.parse(funnel.text) as Record<string, unknown>;
    const data = (j.data ?? j) as { rungs?: { population: number | null }[] };
    const reported = data.rungs?.[0]?.population ?? null;
    const raw = await bscClient().getStorageAt({ address: IDENTITY_REGISTRY as `0x${string}`, slot: COUNTER_SLOT });
    const chain = raw ? Number(hexToBigInt(raw)) : null;
    const ok = reported !== null && chain !== null && Math.abs(reported - chain) <= 500;
    record("/api/v1/registry/funnel: registered equals the registry's counter", ok, `funnel ${reported}, chain ${chain} (new registrations between the two reads are tolerated up to 500)`);
  } catch (e) {
    record("/api/v1/registry/funnel", false, `unreadable: ${(e as Error).message}`);
  }

  const width = Math.max(...checks.map((c) => c.name.length));
  for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(width)}  ${c.detail}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed} of ${checks.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
