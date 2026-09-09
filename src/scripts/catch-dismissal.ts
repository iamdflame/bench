/** Watches the floor until a dismissal lands, then captures the shockwave. */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const b = await chromium.launch({
  executablePath: "/home/dflame/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await b.newContext({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2, colorScheme: "dark" });
const p = await ctx.newPage();
await p.goto("http://localhost:3210/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(6000);
const cdp = await ctx.newCDPSession(p);

let shots = 0;
for (let i = 0; i < 160; i++) {
  const seen = await p.evaluate(`document.body.innerText.indexOf("dismissed") !== -1`);
  if (seen) {
    // Grab a few frames across the shockwave's life.
    for (let f = 0; f < 4; f++) {
      const s = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
      writeFileSync(`/tmp/shots/rupture-${f}.png`, Buffer.from(s.data, "base64"));
      await p.waitForTimeout(320);
    }
    shots = 4;
    console.log(`caught a dismissal at poll ${i}`);
    break;
  }
  await p.waitForTimeout(700);
}
if (!shots) console.log("no dismissal within the window");
await b.close();
