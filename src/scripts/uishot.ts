import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const b = await chromium.launch({
  executablePath: "/home/dflame/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await b.newContext({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2, colorScheme: "dark" });
const p = await ctx.newPage();
p.on("console", (m) => { if (m.type() === "error") console.log("  err:", m.text().slice(0, 140)); });
await p.goto("http://localhost:3210/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(9000);
const cdp = await ctx.newCDPSession(p);

// open-a-mandate drawer
await p.getByText("open a mandate", { exact: true }).first().click().catch(() => console.log("  no open button"));
await p.waitForTimeout(1200);
let s = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
writeFileSync("/tmp/shots/ui-open.png", Buffer.from(s.data, "base64"));

// close, then a mandate detail with the bid panel
await p.getByText("close", { exact: true }).first().click().catch(() => {});
await p.waitForTimeout(600);
const labels = await p.locator("button.fig").all();
if (labels.length) { await labels[0].click(); await p.waitForTimeout(1200); }
s = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
writeFileSync("/tmp/shots/ui-bid.png", Buffer.from(s.data, "base64"));
console.log("captured");
await b.close();
