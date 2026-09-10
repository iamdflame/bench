/**
 * The ninety-second walk, recorded.
 *
 *   npm run tape                 record against the live site
 *   npm run tape -- http://localhost:3311
 *
 * A judge with a stack of submissions should be able to watch the product work
 * rather than read a claim that it does. This drives the real site in a real
 * browser at a pace a person could follow, and records it. There is no
 * narration, no cuts and no compositing: what the file shows is what the site
 * did, in one take, at the speed it did it.
 *
 * It records the deployed site by default, deliberately. A recording of a
 * localhost build proves the build; this has to prove the deployment.
 */

import { mkdirSync, renameSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://mandate-coral.vercel.app";
const OUT = join(process.cwd(), "docs/tape");
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const WIDTH = 1280;
const HEIGHT = 800;

const log = (...a: unknown[]) => console.log("·", ...a);

/** A beat, so a viewer can read the screen before it changes. */
const beat = (page: { waitForTimeout: (ms: number) => Promise<void> }, ms: number) =>
  page.waitForTimeout(ms);

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const go = async (path: string, settle = 2_500) => {
    log(`→ ${path}`);
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60_000 });
    await beat(page, settle);
  };

  /* The walk, in the order the site itself proposes it. */

  await go("/", 4_000);
  // Down the front page, slowly enough to read the four doors and the numbers.
  for (const y of [500, 1000, 1600, 2200]) {
    await page.mouse.wheel(0, 550);
    await beat(page, 900);
  }

  await go("/diagnose", 2_500);
  // Type the position number rather than pasting it, so the input is legible.
  await page.fill('input[name="q"]', "");
  await page.type('input[name="q"]', "7331221", { delay: 90 });
  await beat(page, 800);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.click('button[type="submit"]'),
  ]);
  await beat(page, 4_000);
  await page.mouse.wheel(0, 700);
  await beat(page, 3_500);

  await go("/agents?live=1", 3_000);
  await page.mouse.wheel(0, 500);
  await beat(page, 2_000);

  await go("/agents/265375", 4_500);
  await page.mouse.wheel(0, 900);
  await beat(page, 4_000);

  await go("/activity", 3_500);
  await page.mouse.wheel(0, 500);
  await beat(page, 2_500);

  await go("/receipts/2", 4_000);
  await page.mouse.wheel(0, 600);
  await beat(page, 3_000);

  await go("/verify", 3_000);
  await beat(page, 2_000);

  await context.close();
  await browser.close();

  const webm = readdirSync(OUT).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("no video was written");
  const src = join(OUT, webm);
  const target = join(OUT, "judge-walk.webm");
  renameSync(src, target);
  log(`wrote ${target}`);

  // mp4 as well: webm will not autoplay everywhere, and a judge should not
  // have to think about a container format.
  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-i", target, "-c:v", "libx264", "-preset", "slow", "-crf", "28",
       "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
       join(OUT, "judge-walk.mp4")],
      { stdio: "ignore" },
    );
    log(`wrote ${join(OUT, "judge-walk.mp4")}`);
  } catch {
    log("ffmpeg not available; the webm stands on its own");
  }
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
