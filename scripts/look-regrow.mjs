// Dev: the job list with a field growing back, the "grow it now" offer, and the vehicles in the shop.
// Usage: node scripts/look-regrow.mjs [baseUrl] (default http://localhost:5173/)
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
await page.evaluate(() => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  g.save.mownAt = { 1: Date.now() - 30 * 60_000, 3: Date.now() - 2 * 3600_000 };
  g.save.money = 45000;
});
await page.click('#btn-play');
await sleep(500);
await page.screenshot({ path: 'test-output/regrow-list.png' });
await page.click('.level');
await sleep(500);
await page.screenshot({ path: 'test-output/regrow-offer.png' });
await page.evaluate(() => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  window.__game.openShop();
});
await page.evaluate(() => [...document.querySelectorAll('#shop-tabs button')].find((b) => b.textContent === 'Araçlar').click());
await sleep(800);
await page.screenshot({ path: 'test-output/regrow-shop.png' });
await browser.close();
