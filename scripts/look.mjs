// Dev: start the first field on the dev server, start the engine and take screenshots from both cameras.
// Usage: node scripts/look.mjs [baseUrl] (default http://localhost:5190/)
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5190/';
const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(m.type(), m.text()));
await page.goto(`${base}?quality=medium`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
// First visit of the day: the daily reward pops up over the menu.
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await page.click('#btn-play');
await sleep(300);
await page.click('.level');
await page.click('#btn-call-ok');
await page.waitForFunction('window.__game.mode === "playing"');
// Start the engine and walk into the grass.
await page.evaluate(() => {
  const s = window.__game.session;
  for (let i = 0; i < 3; i++) s.starter.prime();
  s.temp = 0.3;
  s.pull(1);
  s.x = 0;
  s.z = 4;
});
await sleep(1500);
await page.keyboard.down('Space');
await sleep(1200);
await page.screenshot({ path: `${OUT}/look-fpv.png` });
await page.evaluate(() => (window.__game.view.pitch = -0.95));
await sleep(600);
await page.screenshot({ path: `${OUT}/look-fpv-down.png` });
await page.keyboard.up('Space');
await page.keyboard.press('KeyC');
await sleep(1200);
await page.screenshot({ path: `${OUT}/look-tpv.png` });
await page.keyboard.press('KeyC');
await browser.close();
console.log('done');
