import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const URL = process.argv[2] ?? "http://localhost:3210/market";
const b = await chromium.launch({
  executablePath: "/home/dflame/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await b.newContext({ viewport: { width: 1512, height: 1100 }, deviceScaleFactor: 2, colorScheme: "dark" });
const p = await ctx.newPage();
p.on("console", (m) => { if (m.type() === "error") console.log("  err:", m.text().slice(0, 120)); });
await p.goto(URL, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(20000);
await p.evaluate(`document.getElementById("ours")?.scrollIntoView()`);
await p.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(p);
const s = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
writeFileSync("/tmp/shots/ops.png", Buffer.from(s.data, "base64"));
console.log("captured");
await b.close();
