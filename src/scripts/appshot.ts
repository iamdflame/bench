import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const URL = process.argv[2] ?? "http://localhost:3210";
const b = await chromium.launch({
  executablePath: "/home/dflame/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const shots: [string, boolean, number, number, number][] = [
  ["app-top",    true,  1512, 950, 0],
  ["app-market", true,  1512, 950, 700],
  ["app-book",   true,  1512, 950, 1500],
  ["app-light",  false, 1512, 950, 0],
  ["app-mobile", true,  390,  844, 0],
];
for (const [name, dark, w, h, scroll] of shots) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light" });
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") console.log("  err:", m.text().slice(0, 120)); });
  await p.goto(URL, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(14000);
  if (scroll) { await p.evaluate(`window.scrollTo({top:${scroll},behavior:"instant"})`); await p.waitForTimeout(1200); }
  const cdp = await ctx.newCDPSession(p);
  const s = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
  writeFileSync(`/tmp/shots/${name}.png`, Buffer.from(s.data, "base64"));
  console.log(" ", name);
  await ctx.close();
}
// overflow check
const ctx = await b.newContext({ viewport: { width: 320, height: 780 } });
const p = await ctx.newPage();
await p.goto(URL, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4000);
const o = await p.evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
console.log(`\nhorizontal overflow at 320px: ${o}px ${Number(o) > 0 ? "← FAIL" : "ok"}`);
await b.close();
