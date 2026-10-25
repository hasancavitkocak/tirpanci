// Dev: the articulated pat pat from the side, turning, and from the driver's seat.
// Usage: node scripts/look-patpat.mjs [baseUrl] (default http://localhost:5173/)
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 600, height: 700 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('error', m.text()));
await page.goto(`${base}?quality=medium`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await page.click('#btn-play');
await sleep(300);
await page.click('.level');
await sleep(300);
await page.click('#btn-call-ok');
await page.waitForFunction('window.__game.mode === "playing"');
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const v = s.field.vehicle;
  s.x = v.x - 1.3;
  s.z = v.z;
  s.board();
  g.view.mode = 'follow';
});
const shot = async (name, orbit) => {
  await page.evaluate((o) => (window.__game.view.driveOrbit = o), orbit);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/patpat-${name}.png` });
};
await shot('side', -Math.PI / 2);
await shot('front', Math.PI * 0.8);
// Full lock to the right while rolling slowly.
await page.evaluate(() => {
  const s = window.__game.session;
  for (let i = 0; i < 60 * 1.5; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: 0.3, steer: 1 } });
  for (let i = 0; i < 30; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: 0, steer: 1 } });
});
await shot('turn', -Math.PI * 0.75);
await shot('turn-top', 0);
await page.evaluate(() => (window.__game.view.mode = 'fpv'));
await shot('fpv', 0);
console.log(await page.evaluate(() => JSON.stringify({ art: window.__game.session.field.vehicle.art })));
await browser.close();
