// Dev: stand at the right-hand fence and look at the stream (dere). Usage: node scripts/look-stream.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(m.type(), m.text()));
await page.goto(`${base}?quality=${process.env.QUALITY ?? 'medium'}`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
// First visit of the day: the daily reward pops up over the menu.
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await page.click('#btn-play');
await sleep(300);
await page.click('.level');
await page.click('#btn-call-ok');
await page.waitForFunction('window.__game.mode === "playing"');
await page.evaluate(() => {
  const s = window.__game.session;
  s.x = s.field.width / 2 - 0.8;
  s.z = 0;
  s.yaw = Math.PI / 2;
});
await sleep(1500);
await page.screenshot({ path: `${OUT}/stream-fpv.png` });
await page.keyboard.press('KeyC');
await sleep(1200);
await page.screenshot({ path: `${OUT}/stream-tpv.png` });
await browser.close();
console.log('done');
