import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await p.goto('file://' + process.argv[2], { waitUntil: 'networkidle' });
await p.waitForTimeout(600);
await p.screenshot({ path: process.argv[3] });
await b.close();
console.log('wrote', process.argv[3]);
