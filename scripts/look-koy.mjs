// Dev: the shop's village tab, both parts (paints, yard), and the menu's purse.
// Usage: node scripts/look-koy.mjs [baseUrl] (default http://localhost:5173/)
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
await sleep(500);
await page.screenshot({ path: 'test-output/koy-menu.png' });
for (const part of ['boya', 'avlu']) {
  await page.evaluate((part) => {
    const g = window.__game;
    g.shopTab = 'koy';
    g.koyPart = part;
    g.openShop();
  }, part);
  await sleep(600);
  await page.screenshot({ path: `test-output/koy-${part}.png` });
}
await browser.close();
