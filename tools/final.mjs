import { chromium } from 'playwright-core';
const OUT = process.env.SHOT, B = 'https://mandate-coral.vercel.app';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
for (const [n, p, w, h] of [['f-home','/',1440,980],['f-agents','/agents',1440,980],['f-agent','/agents/43129',1440,980]]) {
  const pg = await b.newPage({ viewport:{width:w,height:h} });
  await pg.goto(B+p, { waitUntil:'networkidle', timeout:60000 });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `${OUT}/${n}.png` });
  await pg.close();
}
// The mark on its own, magnified, to judge it as a logo.
const pg = await b.newPage({ viewport:{width:520,height:200} });
await pg.setContent(`<body style="margin:0;display:grid;place-items:center;background:#f6f3ec;font-family:system-ui">
<div style="display:flex;gap:34px;align-items:center">
  <img src="${B}/icon.svg" width="96" height="96">
  <img src="${B}/icon.svg" width="32" height="32">
  <img src="${B}/icon.svg" width="16" height="16">
  <div style="background:#14161a;padding:14px;border-radius:4px"><img src="${B}/icon.svg" width="32" height="32"></div>
</div></body>`);
await pg.waitForTimeout(1200);
await pg.screenshot({ path: `${OUT}/f-mark.png` });
await pg.close();
await b.close();
console.log('captured');
