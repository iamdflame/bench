import { chromium } from 'playwright-core';
const OUT = process.env.SHOT;
const B = 'https://mandate-coral.vercel.app';
const pages = [['live-home','/'],['live-agents','/agents'],['live-agent','/agents/43129'],['live-hire','/hire/43129'],['live-activity','/activity'],['live-verify','/verify'],['live-jobs','/jobs']];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
for (const [n, path] of pages) {
  const p = await b.newPage({ viewport: { width: 1440, height: 980 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,120)));
  p.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,120)); });
  try { await p.goto(B + path, { waitUntil: 'networkidle', timeout: 60000 }); } catch(e) { console.log(n,'NAV',String(e).slice(0,80)); }
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
  const r = await p.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    h1: document.querySelector('h1')?.textContent?.slice(0,60) ?? null,
    bg: getComputedStyle(document.querySelector('.m-app') || document.body).backgroundColor,
  }));
  console.log(n.padEnd(14), 'overflow:', r.sw > r.cw+1 ? 'YES' : 'no', '| h1:', JSON.stringify(r.h1), '| bg:', r.bg, '| err:', errs.length?errs.join(' ~ '):'none');
  await p.close();
}
await b.close();
