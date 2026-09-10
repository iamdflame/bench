import { chromium } from 'playwright-core';
const OUT = process.env.SHOT;
const WALLET = process.env.WALLET || '';
const pages = (process.env.PAGES || 'home:/,agents:/agents,agent-detail:/agents/43129,hire:/hire/43129,dashboard:/dashboard,jobs:/jobs,activity:/activity,verify:/verify,compare:/compare?category=rebalancing')
  .split(',').map(s => { const i = s.indexOf(':'); return [s.slice(0,i), s.slice(i+1)]; });
const FULL = process.env.FULL === '1';

const inject = `
window.ethereum = {
  isMetaMask: true,
  request: async ({ method }) => {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return ['${WALLET}'];
    if (method === 'eth_chainId') return '0x38';
    return null;
  },
  on: () => {}, removeListener: () => {},
};
try { localStorage.setItem('mandate:wallet-connected', '1'); } catch {}
`;

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
for (const [name, path] of pages) {
  const p = await b.newPage({ viewport: { width: 1440, height: 980 } });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0,140)); });
  p.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0,140)));
  if (WALLET) await p.addInitScript(inject);
  try { await p.goto('http://localhost:3311' + path, { waitUntil: 'networkidle', timeout: 60000 }); }
  catch (e) { console.log(name, 'NAV', String(e).slice(0,100)); }
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: FULL });
  const probe = await p.evaluate(() => {
    const de = document.documentElement;
    let widest = null, w = de.clientWidth;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right > w + 2 && r.width > 0) { if (!widest || r.right > widest.right) widest = { sel: el.tagName + '.' + (el.className||'').toString().slice(0,50), right: Math.round(r.right) }; }
    }
    const t = document.querySelector('.m-tape__row p, .m-card__what, .m-body');
    return { sw: de.scrollWidth, cw: de.clientWidth, widest, font: t ? getComputedStyle(t).fontFamily.slice(0,40) : null };
  });
  console.log(name.padEnd(13), 'overflow:', probe.sw > probe.cw + 1 ? `YES ${probe.sw}>${probe.cw} ${JSON.stringify(probe.widest)}` : 'no', '| font:', probe.font, '| err:', errs.length ? errs.join(' ~ ') : 'none');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(600);
  const ph = await p.evaluate(() => {
    const de = document.documentElement;
    let widest = null;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right > de.clientWidth + 2 && r.width > 0) { if (!widest || r.right > widest.right) widest = { sel: el.tagName + '.' + (el.className||'').toString().slice(0,60), right: Math.round(r.right), w: Math.round(r.width) }; }
    }
    return { sw: de.scrollWidth, cw: de.clientWidth, widest };
  });
  await p.screenshot({ path: `${OUT}/${name}-phone.png`, fullPage: false });
  console.log(' '.repeat(13), 'phone   :', ph.sw > ph.cw + 1 ? `YES ${ph.sw}>${ph.cw} ${JSON.stringify(ph.widest)}` : 'no');
  await p.close();
}
await b.close();
