// Dev: the job list (coffee-house jobs, both villages), Karadere from above and its map, a
// coffee-house job's garden.
// Usage: node scripts/look-regions.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=medium`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await page.click('#btn-play');
await sleep(500);
await page.screenshot({ path: 'test-output/reg-list.png' });
await page.evaluate(() => document.querySelector('#level-list').scrollTop = 10000);
await sleep(300);
await page.screenshot({ path: 'test-output/reg-list2.png' });
await page.evaluate(async () => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  const { LEVELS } = await import('/src/game/config.ts');
  window.__game.start(LEVELS.find((l) => l.id === 9));
});
await page.waitForFunction('window.__game.mode === "playing"');
await sleep(1500);
await page.screenshot({ path: 'test-output/reg-k-start.png' });
await page.evaluate(() => {
  const s = window.__game.session;
  const h = s.field.house;
  window.__game.view.freeCam = { x: h.x + 25, y: 45, z: h.z + 30, yaw: Math.atan2(15, 40) + Math.PI * 0.85, pitch: -0.5 };
  document.body.classList.add('freecam');
});
await sleep(1500);
await page.screenshot({ path: 'test-output/reg-k-air.png' });
await page.evaluate(() => {
  window.__game.view.freeCam = null;
  document.body.classList.remove('freecam');
});
await page.click('#btn-map');
await sleep(800);
await page.screenshot({ path: 'test-output/reg-k-map.png' });
await browser.close();
