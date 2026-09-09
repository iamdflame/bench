import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const routes = [["/", "home"], ["/agents", "register"], ["/agent/2410", "certificate"], ["/start", "start"], ["/evidence", "evidence"], ["/assay", "method"], ["/bench", "bench"], ["/authority", "authority"], ["/list-your-agent", "supply"], ["/mandate/0", "mandate"], ["/floor", "floor"]];
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
const page = await ctx.newPage();
for (const [path, name] of routes) {
  await page.goto(`http://localhost:3000${path}`, { waitUntil: "commit", timeout: 60000 }).catch((e) => console.log("NAV", path, e.message));
  await page.waitForTimeout(3500);
  // Horizontal overflow is the failure mode a narrow viewport actually has.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(name.padEnd(12), "overflow", overflow, "px");
  await page.screenshot({ path: `${OUT}/${name}-390.png`, animations: "disabled", timeout: 60000 }).catch(() => {});
}
await browser.close();
