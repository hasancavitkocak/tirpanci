// Dev: screenshot dev/bush.html (procedural hazelnut bush next to the reference photo) for each variant.
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 1000, height: 500 });
p.on('pageerror', (e) => console.log('pageerror', e.message));
for (const v of [0, 1, 2]) {
  await p.goto(`http://localhost:5190/dev/bush.html?v=${v}`);
  await p.waitForFunction('window.__done === true', { timeout: 60000 });
  console.log('variant', v, await p.title());
  await p.screenshot({ path: `test-output/bush-v${v}.png` });
}
await b.close();
