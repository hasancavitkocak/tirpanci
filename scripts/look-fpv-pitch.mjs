// Dev: first-person views at several look pitches (does the trimmer get in the way?).
// Usage: node scripts/look-fpv-pitch.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
mkdirSync('test-output', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 396, height: 657, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=medium`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate((lv) => {
  const g = window.__game;
  g.save.introDone = true;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(lv));
}, Number(process.env.LV ?? 1));
await page.waitForFunction('window.__game.mode === "playing"');
for (const pitch of (process.env.PITCH ?? '-0.2,0.1,0.3,0.5').split(',').map(Number)) {
  await page.evaluate((p) => (window.__game.view.pitch = p), pitch);
  await sleep(900);
  await page.screenshot({ path: `test-output/fpv-pitch${pitch}.png` });
}
await browser.close();
console.log('done');
