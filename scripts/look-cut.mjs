// Dev: mow a curve and look at the cut edge from above (round, not stepped).
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 412, height: 860 });
await p.goto('http://localhost:5190/?quality=medium');
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// First visit of the day: the daily reward pops up over the menu.
await p.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await p.evaluate(() => (window.__game.save.camera = 'follow'));
await p.click('#btn-play');
await sleep(300);
await p.click('.level');
await p.click('#btn-call-ok');
await p.waitForFunction('window.__game.mode === "playing"');
await p.evaluate(() => {
  const s = window.__game.session;
  const f = s.field;
  // A curved swath, as the head would leave it.
  for (let a = 0; a < Math.PI * 1.2; a += 0.05) f.cutSegment(-6 + Math.cos(a) * 3, 6 - Math.sin(a) * 3, -6 + Math.cos(a + 0.05) * 3, 6 - Math.sin(a + 0.05) * 3, 0.45);
  s.x = -6;
  s.z = 9;
  window.__game.view.debugCam = { side: 0, up: 4.5, back: 2.5, lookY: -1.2 };
});
await sleep(1200);
await p.screenshot({ path: 'test-output/cut-edge.png' });
await b.close();
console.log('done');
