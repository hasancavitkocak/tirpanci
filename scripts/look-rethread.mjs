// Dev: screenshot the HUD with the engine off and the line broken (re-thread button over the starter).
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const p = await b.newPage();
await p.setViewport({ width: 860, height: 412, isMobile: true, hasTouch: true });
await p.goto('http://localhost:5173/?quality=low');
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// First visit of the day: the daily reward pops up over the menu.
await p.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await p.click('#btn-play');
await sleep(300);
await p.evaluate(() => document.querySelector('#level-list .saga-node.next, #level-list .saga-node.current, #level-list .saga-node:not(.locked)')?.click());
await sleep(400);
await p.click('#btn-call-ok');
await p.waitForFunction('window.__game.mode === "playing"');
await p.evaluate(() => {
  const s = window.__game.session;
  s.x = 0;
  s.z = 0;
  s.broken = true;
  s.line = 0;
});
await sleep(800);
await p.screenshot({ path: 'test-output/look-rethread.png' });
await b.close();
console.log('done');
