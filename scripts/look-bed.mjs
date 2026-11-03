// Dev: look into the pat pat trailer (fuel can and line).
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const p = await b.newPage();
await p.setViewport({ width: 860, height: 412 });
await p.goto('http://localhost:5173/?quality=medium');
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// First visit of the day: the daily reward pops up over the menu.
await p.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await p.evaluate(() => (window.__game.save.camera = 'follow'));
await p.click('#btn-play');
await sleep(300);
await p.evaluate(() => document.querySelector('#level-list .saga-node.next, #level-list .saga-node.current, #level-list .saga-node:not(.locked)')?.click());
await sleep(400);
await p.click('#btn-call-ok');
await p.waitForFunction('window.__game.mode === "playing"');
await p.evaluate(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x;
  s.z = v.z - 2.2;
  s.yaw = 0;
  window.__game.view.debugCam = { side: 1, up: 3.2, back: 1.2, lookY: 0.3 };
});
await sleep(1200);
await p.screenshot({ path: 'test-output/patpat-bed.png' });
await b.close();
console.log('done');
