// Dev: a locked field's gate (chain, padlock, the board) and the mosque yard's iron gate, from the lane.
// Usage: node scripts/look-locked.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 500, height: 560 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=medium`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const names = await page.evaluate(async () => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  g.save.unlocked = 1;
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS[0]);
  return g.session.field.others.map((o) => `${o.level.id} ${o.level.theme}`);
});
console.log(names.join(', '));
await page.waitForFunction('window.__game.mode === "playing"');
for (const theme of ['findik', 'mezarlik']) {
  const ok = await page.evaluate((theme) => {
    const g = window.__game;
    const o = g.session.field.others.find((x) => x.level.id < 100 && x.level.id > 1 && (theme === 'mezarlik' ? x.level.theme === 'mezarlik' : x.level.theme !== 'mezarlik'));
    if (!o) return false;
    const gx = theme === 'mezarlik' ? (o.minX + o.maxX) / 2 : o.entryX;
    const gz = o.maxZ + 1.5;
    const y = g.session.field.height(gx, gz);
    const c = { x: gx + 2.5, y: y + 1.7, z: gz + 5 };
    const dx = gx - c.x, dy = y + 0.6 - c.y, dz = gz - c.z;
    g.view.freeCam = { ...c, yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    return true;
  }, theme);
  if (!ok) continue;
  await sleep(1200);
  await page.screenshot({ path: `test-output/locked-${theme}.png` });
}
await browser.close();
