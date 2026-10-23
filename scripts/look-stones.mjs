// Dev: stones in the grass (their tops, the thin grass round them) and the red "!" over one already hit.
// Usage: node scripts/look-stones.mjs [baseUrl] (default http://localhost:5173/)
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
const n = await page.evaluate(async () => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS.find((l) => l.stones >= 4) ?? LEVELS[1]);
  return g.session.field.stones.length;
});
console.log('stones', n);
await page.waitForFunction('window.__game.mode === "playing"');
for (const [tag, hit] of [['plain', false], ['hit', true]]) {
  await page.evaluate((hit) => {
    const g = window.__game;
    const f = g.session.field;
    // The stone furthest from any bush, seen from the side away from the nearest one.
    const clear = (s) => Math.min(...f.bushes.map((b) => Math.hypot(b.x - s.x, b.z - s.z)), 99);
    const st = [...f.stones].sort((a, b) => clear(b) - clear(a))[0];
    const nb = f.bushes.reduce((m, b) => (Math.hypot(b.x - st.x, b.z - st.z) < Math.hypot(m.x - st.x, m.z - st.z) ? b : m), f.bushes[0] ?? { x: st.x, z: st.z - 1 });
    const away = Math.atan2(st.x - nb.x, st.z - nb.z);
    if (hit) g.view.markStone(st.x, st.z);
    const y = f.height(st.x, st.z);
    const c = { x: st.x + Math.sin(away) * 2.2, y: y + 1.4, z: st.z + Math.cos(away) * 2.2 };
    const dx = st.x - c.x, dy = y - c.y, dz = st.z - c.z;
    g.view.freeCam = { ...c, yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }, hit);
  await sleep(1200);
  await page.screenshot({ path: `test-output/stones-${tag}.png` });
}
await browser.close();
