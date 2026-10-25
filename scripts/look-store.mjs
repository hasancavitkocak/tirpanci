// Dev: the menu (with the store button and the starter pack) and the store.
// Usage: node scripts/look-store.mjs [baseUrl] (default http://localhost:5173/)
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
await sleep(800);
await page.screenshot({ path: 'test-output/store-menu.png' });
await page.click('#btn-store');
await sleep(1200);
await page.screenshot({ path: 'test-output/store-store.png' });
await browser.close();
