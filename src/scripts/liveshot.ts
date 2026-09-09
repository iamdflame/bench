import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const URL = process.argv[2] ?? "https://mandate-coral.vercel.app";
const b = await chromium.launch({
  executablePath: "/home/dflame/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
for (const [name, dark] of [["live-dark", true], ["live-light", false]] as const) {
  const ctx = await b.newContext({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light" });
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") console.log("  err:", m.text().slice(0, 120)); });
  await p.goto(URL, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(12000);
  const cdp = await ctx.newCDPSession(p);
  const s = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
  writeFileSync(`/tmp/shots/${name}.png`, Buffer.from(s.data, "base64"));
  console.log(`  ${name}`);
  await ctx.close();
}
await b.close();
