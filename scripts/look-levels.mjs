// Dev: the job list, each of its tabs.
// Usage: node scripts/look-levels.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=low`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await page.click('#btn-play');
await sleep(500);
const n = await page.evaluate(() => document.querySelectorAll('#level-tabs button').length);
for (let i = 0; i < n; i++) {
  await page.evaluate((i) => document.querySelectorAll('#level-tabs button')[i].click(), i);
  await sleep(400);
  await page.screenshot({ path: `test-output/levels-${i}.png` });
}
await browser.close();
