// Dev: the back-pack machine (sırt motoru) on the worker: walking from the side and from behind, with
// the trimmer in the trailer and in his hands.
// Usage: node scripts/look-backpack.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 500, height: 560 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=medium`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(async () => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  if (!g.save.equipment.owned.includes('sirt')) g.save.equipment.owned.push('sirt');
  g.save.equipment.machine = 'sirt';
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS[0]);
  g.view.mode = 'follow';
});
await page.waitForFunction('window.__game.mode === "playing"');
const shots = async (tag) => {
  for (const [name, back, side, up] of [['side', 0, 2.2, 1.3], ['back', 2.4, 0.5, 1.3], ['close', 1.2, 0.9, 1.5], ['front', -1.6, 0.6, 1.5]]) {
    await page.evaluate((d) => (window.__game.view.debugCam = d), { back, side, up, lookY: 1.2 });
    await sleep(1000);
    await page.screenshot({ path: `test-output/bp-${tag}-${name}.png` });
  }
};
await shots('empty');
// The pat pat's trailer: the trimmer without its engine and the pack beside it.
await page.evaluate(() => {
  const g = window.__game;
  const k = g.view.world.trailerTrimmer;
  const p = k.getWorldPosition(new k.position.constructor());
  g.view.debugCam = null;
  const c = { x: p.x + 2.0, y: p.y + 1.5, z: p.z + 1.4 };
  const dx = p.x - c.x, dy = p.y + 0.3 - c.y, dz = p.z - c.z;
  g.view.freeCam = { ...c, yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
});
await sleep(1000);
await page.screenshot({ path: 'test-output/bp-trailer.png' });
await page.evaluate(() => (window.__game.view.freeCam = null));
await page.evaluate(() => {
  const s = window.__game.session;
  s.intro = null;
  s.hasTrimmer = true;
  s.broken = false;
  s.line = s.gear.lineMax;
});
await shots('carry');
await browser.close();
