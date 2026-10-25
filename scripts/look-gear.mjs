// Dev: the worker from close behind and the side, with the ear muffs and the backpack engine.
// Usage: node scripts/look-gear.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=medium`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  g.save.introDone = true;
  g.save.equipment = { machine: 'sirt', lineType: 'yuvarlak', owned: ['standart', 'yuvarlak', 'sirt', 'kulaklik'] };
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(1));
});
await page.waitForFunction('window.__game.mode === "playing"');
for (const [name, side, back] of [['gear-back', 0.4, 1.6], ['gear-side', 1.6, 0.2]]) {
  await page.evaluate(([s, b]) => (window.__game.view.debugCam = { side: s, up: 1.75, back: b, lookY: 1.45 }), [side, back]);
  if ((await page.evaluate(() => window.__game.view.mode)) === 'fpv') await page.keyboard.press('KeyC');
  await sleep(1200);
  await page.screenshot({ path: `test-output/${name}.png` });
}
await browser.close();
console.log('done');
