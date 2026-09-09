/**
 * Captures the floor.
 *
 * Playwright's screenshot waits for a stable frame, which a page driven by a
 * continuous rAF loop never produces. CDP's captureScreenshot takes whatever
 * is on screen, which is what a live floor requires.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const b = await chromium.launch({
  executablePath: "/home/dflame/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

for (const [name, dark] of [["floor-light", false], ["floor-dark", true]] as const) {
  const ctx = await b.newContext({
    viewport: { width: 1512, height: 950 },
    deviceScaleFactor: 2,
    colorScheme: dark ? "dark" : "light",
  });
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error") console.log("  err:", m.text().slice(0, 140));
  });
  await p.goto("http://localhost:3210/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(10_000);

  const glOk = await p.evaluate(`(() => {
    var c = document.querySelector("canvas");
    if (!c) return "no canvas";
    var gl = c.getContext("webgl2");
    return gl ? "webgl2 ok " + c.width + "x" + c.height : "no webgl2";
  })()`);
  console.log(`  ${name}: ${glOk}`);

  const cdp = await ctx.newCDPSession(p);
  const shot = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
  writeFileSync(`/tmp/shots/${name}.png`, Buffer.from(shot.data, "base64"));
  await ctx.close();
}
await b.close();
console.log("done");
