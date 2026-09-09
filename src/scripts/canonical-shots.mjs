/**
 * The two canonical screenshots.
 *
 * A judge pastes one image into a deck. These are the two images designed for
 * that: the register with its mark column almost entirely blank, and a single
 * certificate with the reputation autopsy — the official score beside the one
 * that survives de-duplication.
 *
 * Captured at 1600x1000 and again at 2x for retina decks.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] ?? "docs/screenshots";
/**
 * Where to shoot from.
 *
 * Production by default: it reads the market with the deployed environment,
 * which is where the struck hallmarks actually are. A local server with a
 * different `MARKET_ADDRESS` shows an empty mark column for every row, which
 * is a true picture of that machine and a misleading one of the product.
 */
const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
/**
 * The exhibit for the certificate shot.
 *
 * 2410 (`@binance · Ensoul`) is the most-reviewed agent on the BSC registry
 * and the one whose published score moves under de-duplication, so it is the
 * agent the reputation autopsy actually has something to say about.
 */
const AGENT = process.argv[3] ?? "2410";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});

for (const scale of [1, 2]) {
  const suffix = scale === 2 ? "@2x" : "";
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: scale,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/agents`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/register${suffix}.png`, animations: "disabled" });
  console.log("register", scale);

  /*
    "commit", not "domcontentloaded".

    The certificate streams its slow panels and holds an SSE connection for
    the live assay, so the document is never "loaded" in the sense Playwright
    waits for — the page is perfectly usable and the navigation promise simply
    never settles. The waits below are on the content that actually matters.
  */
  await page.goto(`${BASE}/agent/${AGENT}`, { waitUntil: "commit", timeout: 120000 });
  /*
    The assay streams over SSE and the autopsy is a server read behind
    Suspense. Both have to have landed, or the shot shows six pulsing bars and
    a hairline — which is honest about the loading state and useless as the
    image a judge pastes into a deck.
  */
  await page
    .waitForFunction(
      // A pending row renders `.assay__verdict` too; only a resolved one
      // carries a verdict modifier.
      () => document.querySelectorAll('[class*="assay__verdict--"]').length >= 6,
      null,
      { timeout: 90000 },
    )
    .catch(() => console.log("  assay did not finish in time"));
  await page
    .waitForSelector(".autopsy", { timeout: 90000 })
    .catch(() => console.log("  autopsy did not resolve in time"));
  await page.waitForTimeout(2500);
  const panel = await page.$(".autopsy");
  if (panel) await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/certificate${suffix}.png`, animations: "disabled" });
  console.log("certificate", scale);

  await ctx.close();
}

await browser.close();
