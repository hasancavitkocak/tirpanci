// Dev: the view from the seat (first person) on the pat pat and the tractor: is the steering wheel in view?
// Usage: node scripts/look-seat.mjs [baseUrl] (default http://localhost:5173/). Shots in test-output/land.
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 820, height: 360, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=medium`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
for (const vehicle of ['patpat', 'traktor']) {
  await page.evaluate((v) => {
    const g = window.__game;
    g.save.introDone = true;
    g.save.vehicles = ['patpat', 'traktor'];
    g.save.vehicle = v;
    g.save.camera = 'fpv';
    if (g.mode === 'playing') g.quitToMenu();
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.start(g.levelById(1));
  }, vehicle);
  await page.waitForFunction('window.__game.mode === "playing"');
  await page.evaluate(() => {
    const g = window.__game;
    const s = g.session;
    const f = s.field;
    Object.assign(f.vehicle, f.harmanSpot, { speed: 0, art: 0 });
    s.running = false;
    s.x = f.vehicle.x + 1.4;
    s.z = f.vehicle.z;
    s.board();
    g.view.mode = 'fpv';
  });
  await sleep(2500);
  await page.screenshot({ path: `test-output/land/seat-${vehicle}.png` });
}
await browser.close();
