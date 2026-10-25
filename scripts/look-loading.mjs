// Dev: screenshot of the loading screen (before the models are in). Usage: node scripts/look-loading.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
// Phone size from the command line (e.g. 393x873 for a 20:9 phone); default 412x860.
const [vw, vh] = (process.argv[3] ?? '412x860').split('x').map(Number);
await page.setViewport({ width: vw, height: vh, isMobile: true, hasTouch: true });
// Hold the models back so the loading screen stays up.
await page.setRequestInterception(true);
page.on('request', (r) => (r.url().endsWith('.glb') ? setTimeout(() => r.continue(), 6000) : r.continue()));
await page.goto(`${base}?quality=low`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loading.show');
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: `test-output/loading-${vw}x${vh}.png` });
await browser.close();
console.log('done');
