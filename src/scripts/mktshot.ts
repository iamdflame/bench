import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const URL = process.argv[2] ?? "http://localhost:3210";
const b = await chromium.launch({
  executablePath: "/home/dflame/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const shots: [string, string, boolean, number, number, number][] = [
  ["mkt-top",     "/",             true,  1512, 950, 0],
  ["mkt-grid",    "/",             true,  1512, 950, 900],
  ["mkt-cat",     "/",             true,  1512, 950, 2200],
  ["mkt-light",   "/",             false, 1512, 950, 900],
  ["mkt-mobile",  "/",             true,  390,  844, 0],
  ["mkt-agent",   "/agent/304493", true,  1512, 950, 0],
  ["mkt-market",  "/market",       true,  1512, 950, 0],
];
for (const [name, path, dark, w, h, scroll] of shots) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light" });
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") console.log("  err:", m.text().slice(0, 120)); });
  await p.goto(URL + path, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(path === "/" ? 3500 : 13000);
  if (scroll) { await p.evaluate(`window.scrollTo({top:${scroll},behavior:"instant"})`); await p.waitForTimeout(900); }
  const cdp = await ctx.newCDPSession(p);
  const s = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
  writeFileSync(`/tmp/shots/${name}.png`, Buffer.from(s.data, "base64"));
  console.log(" ", name);
  await ctx.close();
}
const ctx = await b.newContext({ viewport: { width: 320, height: 780 } });
const p = await ctx.newPage();
await p.goto(URL, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3000);
const o = await p.evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
console.log(`\noverflow at 320px: ${o}px ${Number(o) > 0 ? "← FAIL" : "ok"}`);
await b.close();
