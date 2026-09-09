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
await p.waitForTimeout(8000);
await p.getByText("the book", { exact: true }).first().click();
await p.waitForTimeout(6000);
const cdp = await ctx.newCDPSession(p);
const s = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
writeFileSync("/tmp/shots/ui-book.png", Buffer.from(s.data, "base64"));
console.log("captured");
await b.close();
