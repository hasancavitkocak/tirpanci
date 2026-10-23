// Dev: screenshots of the hazelnut bushes (third-person close-up, a field overview and first person).
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(m.type(), m.text()));
await p.goto('http://localhost:5190/?quality=medium');
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// First visit of the day: the daily reward pops up over the menu.
await p.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await sleep(1500);
await p.screenshot({ path: 'test-output/bush-menu.png' });
await p.click('#btn-play');
await sleep(300);
await p.click('.level');
await p.click('#btn-call-ok');
await p.waitForFunction('window.__game.mode === "playing"');
// Stand between a few bushes.
await p.evaluate(() => {
  const s = window.__game.session;
  const bs = s.field.bushes;
  s.x = bs[0].x + 2.2;
  s.z = bs[0].z + 2.6;
});
await sleep(1500);
await p.screenshot({ path: 'test-output/bush-fpv.png' });
await p.evaluate(() => (window.__game.view.pitch = 0.05));
await sleep(500);
await p.screenshot({ path: 'test-output/bush-fpv-up.png' });
// Mid distance, looking straight at a bush.
await p.evaluate(() => {
  const s = window.__game.session;
  const bs = s.field.bushes[1];
  s.x = bs.x;
  s.z = bs.z + 6;
  window.__game.lookYaw = Math.PI;
  window.__game.view.pitch = -0.05;
});
await sleep(800);
await p.screenshot({ path: 'test-output/bush-mid.png' });
await p.keyboard.press('KeyC');
await sleep(1200);
await p.screenshot({ path: 'test-output/bush-tpv.png' });
await b.close();
console.log('done');
