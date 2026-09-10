import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 980 } });
await p.goto('http://localhost:3311/', { waitUntil: 'networkidle' });
const r = await p.evaluate(() => {
  const out = [];
  for (const sel of ['.m-app', '.m-main', '.band', '.band .m-wrap', '.how', '.how__item', '.hero .m-wrap', '.doors']) {
    const e = document.querySelector(sel);
    if (!e) { out.push([sel, 'MISSING']); continue; }
    const c = getComputedStyle(e), b = e.getBoundingClientRect();
    out.push([sel, Math.round(b.width)+'x'+Math.round(b.height), c.display, c.gridTemplateColumns, c.maxWidth]);
  }
  return out;
});
console.log(r.map(x=>x.join(' | ')).join('\n'));
await b.close();
