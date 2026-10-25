// Dev: the shop's turntable (Köy tab: the pat pat in yellow, then the gazebo), and the DÜKKAN button
// in the yard during a job. Usage: node scripts/look-preview.mjs [baseUrl]
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
  g.shopTab = 'koy';
  g.koyPart = 'boya';
  g.koyLook.boya = 'sari';
  g.openShop();
});
await sleep(1500);
await page.screenshot({ path: 'test-output/preview-paint.png' });
await page.evaluate(() => {
  const g = window.__game;
  g.koyPart = 'avlu';
  g.koyLook.avlu = 'cardak';
  g.openShop();
});
await sleep(1500);
await page.screenshot({ path: 'test-output/preview-decor.png' });
// In a job, by the house: the DÜKKAN button, then the shop over the job.
await page.evaluate(async () => {
  const g = window.__game;
  g.show('menu');
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS[0]);
});
await page.waitForFunction('window.__game.mode === "playing"');
await sleep(1500);
const has = await page.evaluate(() => [...document.querySelectorAll('#actions button, .act')].map((b) => b.textContent.trim()).join(' | '));
console.log('actions:', has);
await page.screenshot({ path: 'test-output/preview-yard.png' });
// Into the shop from the yard and back: the game's buttons are there again.
await page.evaluate(() => document.querySelector('[data-id="shop"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
await sleep(600);
await page.evaluate(() => document.getElementById('btn-shop-close').click());
await sleep(800);
console.log('after shop:', await page.evaluate(() => [...document.querySelectorAll('#actions button, .act')].map((b) => b.textContent.trim()).join(' | ')), 'hud shown:', await page.evaluate(() => document.getElementById('hud').classList.contains('show')), 'mode:', await page.evaluate(() => window.__game.mode));
await page.screenshot({ path: 'test-output/preview-back.png' });
await browser.close();
