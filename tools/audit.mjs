import { chromium } from 'playwright-core';
const B = process.env.BASE || 'http://localhost:3311';
const WALLET = process.env.WALLET || '';
const OUT = process.env.SHOT;
// PAGES="name:/path,name:/path" audits just those.
const ONLY = (process.env.PAGES || '').split(',').filter(Boolean).map((x) => { const i = x.indexOf(':'); return [x.slice(0, i), x.slice(i + 1)]; });
const ALL = [
  ['home','/'], ['agents','/agents'], ['agent','/agents/43129'], ['hire','/hire/43129'],
  ['dashboard','/dashboard'], ['jobs','/jobs'], ['activity','/activity'],
  ['verify','/verify'], ['compare','/compare?category=rebalancing'],
  ['diagnose','/diagnose'], ['diagnosed','/diagnose?q=7331221'], ['receipt','/receipts/1'],
  ['judges','/judges'], ['grid','/agents?live=1&category=grid-trading'], ['priced','/agents/342379'],
  ['desk','/desk'], ['status','/status'],
];
const PAGES = ONLY.length ? ONLY : ALL;
const inject = `
window.ethereum = { isMetaMask:true,
  request: async ({method}) => method==='eth_requestAccounts'||method==='eth_accounts' ? ['${WALLET}'] : method==='eth_chainId' ? '0x38' : null,
  on(){}, removeListener(){} };
try { localStorage.setItem('mandate:wallet-connected','1'); } catch {}
`;

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
let total = 0;
for (const [name, path] of PAGES) {
  for (const [label, w, h] of [['desktop',1440,980],['tablet',834,1100],['phone',390,844]]) {
    const p = await b.newPage({ viewport:{width:w,height:h} });
    const errs = [];
    p.on('pageerror', e => errs.push('JS: ' + String(e).slice(0,100)));
    p.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text().slice(0,100)); });
    p.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) errs.push(`HTTP ${r.status()} ${r.url().replace(B,'').slice(0,60)}`); });
    if (WALLET) await p.addInitScript(inject);
    try { await p.goto(B+path, { waitUntil:'networkidle', timeout:60000 }); } catch(e){ errs.push('NAV '+String(e).slice(0,60)); }
    await p.waitForTimeout(1800);

    const f = await p.evaluate(() => {
      const out = [];
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth + 1) {
        let worst = null;
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.right > de.clientWidth + 2 && r.width > 0 && (!worst || r.right > worst.r)) {
            worst = { r: Math.round(r.right), sel: el.tagName+'.'+String(el.className).slice(0,40) };
          }
        }
        out.push(`OVERFLOW ${de.scrollWidth}>${de.clientWidth} worst=${worst?.sel}@${worst?.r}`);
      }
      // Text too small to read.
      const small = new Set();
      for (const el of document.querySelectorAll('body *')) {
        if (!el.childNodes.length) continue;
        const hasText = [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim().length>2);
        if (!hasText) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs && fs < 10.5) small.add(`${el.tagName}.${String(el.className).slice(0,30)}@${fs}px`);
      }
      if (small.size) out.push('TINY_TEXT ' + [...small].slice(0,3).join(' | '));
      // A control the eye reads as unusable with NO explanation beside it.
      // A disabled button with a stated reason next to it is the intended
      // behaviour; only a silent one is a dead end.
      const dead = [...document.querySelectorAll('button[disabled],a[aria-disabled="true"]')]
        .filter(e => {
          // A reason the control names itself through aria-describedby counts
          // wherever it sits, provided it is on screen and says something.
          const ids = (e.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
          const linked = ids.map(id => document.getElementById(id))
            .find(t => t && t.textContent.trim() && t.getClientRects().length);
          if (linked) return false;
          const scope = e.closest('form,section,div');
          const said = scope && scope.querySelector('.m-error,.m-gate__why,.m-field__hint,.m-absent__t');
          return !said || !said.textContent.trim();
        })
        .map(e => e.textContent.trim().slice(0,30)).filter(Boolean);
      if (dead.length) out.push('UNEXPLAINED_DISABLED ' + dead.slice(0,3).join(' | '));
      // Elements painted over each other.
      const clipped = [];
      for (const el of document.querySelectorAll('p,h1,h2,h3,dd,dt,td,th,li,span.m-stat__v')) {
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') {
          const t = el.textContent.trim().slice(0,28);
          if (t && getComputedStyle(el).textOverflow !== 'ellipsis' && !el.className.includes('clamp')) clipped.push(t);
        }
      }
      if (clipped.length) out.push('CLIPPED ' + clipped.slice(0,3).join(' | '));
      // Touch targets under the usual 40px floor.
      if (innerWidth < 500) {
        const tiny = [...document.querySelectorAll('a.m-btn,button.m-btn,nav a')]
          .filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 34; })
          .map(e => e.textContent.trim().slice(0,20));
        if (tiny.length) out.push('SMALL_TAP ' + tiny.slice(0,3).join(' | '));
      }
      return out;
    });

    const all = [...errs, ...f];
    total += all.length;
    if (all.length) console.log(`${name}/${label}`.padEnd(20), all.join('\n' + ' '.repeat(21)));
    if (label === 'desktop' && OUT) await p.screenshot({ path: `${OUT}/a-${name}.png`, fullPage: true });
    if (label === 'phone' && OUT) await p.screenshot({ path: `${OUT}/a-${name}-phone.png`, fullPage: false });
    await p.close();
  }
}
console.log(total === 0 ? '\nCLEAN: no findings' : `\n${total} findings`);
await b.close();
