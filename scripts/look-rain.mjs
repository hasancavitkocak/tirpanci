// Dev: a rainy job (Dere Kenarı), a few frames apart while walking, to see the rain streaks.
// Usage: node scripts/look-rain.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 760 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=medium`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(async () => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS.find((l) => l.weather === 'rain'));
});
await page.waitForFunction('window.__game.mode === "playing"');
for (let i = 0; i < 3; i++) {
  await page.evaluate((i) => {
    const s = window.__game.session;
    s.x += 2.5;
    s.yaw += 0.6 * i;
  }, i);
  await sleep(900);
  await page.screenshot({ path: `test-output/rain-${i}.png` });
}
await browser.close();
