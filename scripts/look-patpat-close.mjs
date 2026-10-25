// Dev: close-ups of the pat pat (the driver on the seat, the hitch, the steering) from a fresh page,
// on the very first boarding of the first job.
// Usage: node scripts/look-patpat-close.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 600, height: 500 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
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
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x - 1.3;
  s.z = v.z;
  s.board();
  // From outside, so the driver shows.
  window.__game.view.mode = 'follow';
});
await sleep(800);
// [name, back, side, up, lookY] relative to the driver (seat) and his heading.
for (const [name, back, side, up, lookY] of [
  ['left', 0, 3.4, 1.3, 0.8],
  ['right', 0, -3.4, 1.3, 0.8],
  ['hitch', -1.2, 2.2, 0.9, 0.3],
  ['behind', 2.6, 0, 2.1, 1.0],
  ['box', 1.6, 0.9, 2.6, 0.2],
]) {
  await page.evaluate((d) => (window.__game.view.debugCam = d), { back, side, up, lookY });
  await sleep(900);
  await page.screenshot({ path: `test-output/close-${name}.png` });
}
await browser.close();
