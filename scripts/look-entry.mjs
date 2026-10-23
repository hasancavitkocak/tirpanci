// Dev: the old wheel tracks into the field and the two posts at the way in, on a couple of levels.
// Usage: node scripts/look-entry.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 700, height: 500 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=medium`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
for (const lv of [0, 3]) {
  // Straight into the level (the dev server serves the sources).
  await page.evaluate(async (i) => {
    const { LEVELS } = await import('/src/game/config.ts');
    window.__game.start(LEVELS[i]);
  }, lv);
  await page.waitForFunction('window.__game.mode === "playing"');
  await sleep(800);
  await page.evaluate(() => {
    const f = window.__game.session.field;
    const posts = f.yardProps.filter((p) => p.kind === 'post');
    const x = (posts[0].x + posts[1].x) / 2;
    window.__game.view.debugLook = { x: x - 5, z: f.depth / 2 + 9, up: 3.5, atX: x, atZ: f.depth / 2 - 1, atUp: 0 };
  });
  await sleep(1200);
  await page.screenshot({ path: `test-output/entry-${lv + 1}.png` });
}
// The mosque yard's stone wall.
await page.evaluate(async () => {
  const { LEVELS } = await import('/src/game/config.ts');
  window.__game.start(LEVELS.find((l) => l.theme === 'mezarlik'));
});
await page.waitForFunction('window.__game.mode === "playing"');
await sleep(800);
await page.evaluate(() => {
  const f = window.__game.session.field;
  window.__game.view.debugLook = { x: -f.wallX + 1.5, z: f.wallBottom + 4, up: 1.6, atX: -f.wallX, atZ: f.wallBottom - 3, atUp: 0.5 };
});
await sleep(1200);
await page.screenshot({ path: 'test-output/entry-wall.png' });
await browser.close();
