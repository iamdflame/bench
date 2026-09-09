/**
 * Screenshots the running site so the design can actually be looked at.
 *
 *   npx tsx src/scripts/shots.ts [baseUrl] [outDir]
 */

import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3210";
const OUT = process.argv[3] ?? "/tmp/shots";
const EXECUTABLE =
  process.env.CHROME_PATH ??
  "/home/dflame/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXECUTABLE });

interface Shot {
  name: string;
  path: string;
  width?: number;
  height?: number;
  /** Absolute scroll offset. */
  scrollTo?: number;
  /** Scroll so the section whose label matches this text is in view. */
  section?: string;
  dark?: boolean;
  full?: boolean;
  wait?: number;
}

const shots: Shot[] = [
  { name: "00-floor", path: "/", wait: 6000 },
  { name: "00-floor-dark", path: "/", wait: 6000, dark: true },
  { name: "00-floor-mobile", path: "/", width: 390, height: 844, wait: 6000 },
  { name: "01-hero", path: "/assay", scrollTo: 0 },
  { name: "02-collapse-mid", path: "/assay", scrollTo: 1150 },
  { name: "03-collapse-end", path: "/assay", scrollTo: 2300 },
  { name: "04-thesis", path: "/assay", section: "worst entry" },
  { name: "05-exhibit", path: "/assay", section: "certificate of assay" },
  { name: "06-ring", path: "/assay", section: "the reputation registry", wait: 2600 },
  { name: "07-categories", path: "/assay", section: "the marketplace" },
  { name: "08-gap", path: "/assay", section: "the gap" },
  { name: "09-bench", path: "/bench" },
  { name: "10-category", path: "/category/rebalancing" },
  { name: "11-agent", path: "/agent/304493" },
  { name: "12-hero-dark", path: "/assay", scrollTo: 0, dark: true },
  { name: "13-ring-dark", path: "/assay", section: "the reputation registry", dark: true, wait: 2600 },
  { name: "14-exhibit-dark", path: "/assay", section: "certificate of assay", dark: true },
  { name: "15-mobile", path: "/assay", width: 390, height: 844 },
  { name: "16-mobile-ring", path: "/assay", width: 390, height: 844, section: "the reputation registry", wait: 2200 },
  { name: "17-mobile-bench", path: "/bench", width: 390, height: 844 },
];

for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: s.width ?? 1512, height: s.height ?? 950 },
    deviceScaleFactor: 2,
    colorScheme: s.dark ? "dark" : "light",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle", timeout: 60_000 });
  if (s.scrollTo) {
    await page.evaluate(`window.scrollTo({top:${s.scrollTo},behavior:"instant"})`);
  } else if (s.section) {
    // Anchor to content rather than pixels, so shots survive layout changes.
    const found = await page.evaluate(`(() => {
      var want = ${JSON.stringify(s.section)}.toLowerCase();
      var els = document.querySelectorAll("h1,h2,h3,.label");
      for (var i=0;i<els.length;i++){
        if ((els[i].textContent||"").toLowerCase().indexOf(want) !== -1) {
          var y = els[i].getBoundingClientRect().top + window.scrollY - 90;
          window.scrollTo({top:y,behavior:"instant"});
          return true;
        }
      }
      return false;
    })()`);
    if (!found) console.log(`    (section not found: ${s.section})`);
  }
  await page.waitForTimeout(s.wait ?? 900);
  await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: Boolean(s.full) });
  console.log(`  ${s.name}`);
  await ctx.close();
}

// Horizontal-overflow check at the narrowest sensible width.
const ctx = await browser.newContext({ viewport: { width: 320, height: 780 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
console.log(`\nhorizontal overflow at 320px: ${overflow}px ${overflow > 0 ? "← FAIL" : "ok"}`);
await ctx.close();

await browser.close();
console.log(`\nwrote ${shots.length} shots to ${OUT}`);
