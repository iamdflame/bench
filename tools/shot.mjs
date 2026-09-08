/**
 * Screenshot the running site.
 *
 * A design brief cannot be checked by reading the markup. This drives a real
 * browser against a real build so every screen can be looked at, at the two
 * widths that matter: the desktop board and a 360px phone.
 *
 *   node tools/shot.mjs http://127.0.0.1:3130 .shots
 *
 * `--no-sandbox` is required in this environment, and the target must be
 * 127.0.0.1 rather than localhost: Chromium prefers IPv6 for the name and the
 * dev server binds v4.
 */

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = (process.argv[2] ?? "http://127.0.0.1:3130").replace(/\/$/, "");
const outDir = process.argv[3] ?? ".shots";
const only = process.argv[4] ?? null;

const PAGES = [
  ["board", "/"],
  ["job", "/j/yield"],
  ["register", "/register"],
  ["data", "/data"],
  ["advantage", "/advantage"],
  ["list", "/list"],
  ["desk", "/desk"],
];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function shoot(label, path, width, height, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  const res = await page.goto(base + path, { waitUntil: "networkidle", timeout: 45_000 }).catch(() => null);
  // Fonts settle after paint; without this the first shot catches a fallback.
  await page.waitForTimeout(600);
  const file = join(outDir, `${label}-${tag}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`${String(res?.status() ?? "ERR").padEnd(4)} ${tag.padEnd(7)} ${path.padEnd(14)} → ${file}`);
  await ctx.close();
}

for (const [label, path] of PAGES) {
  if (only && label !== only) continue;
  await shoot(label, path, 1440, 900, "desktop");
  await shoot(label, path, 360, 760, "phone");
}

await browser.close();
