// Dev: screenshots of the map, the pause menu, the menu background, a road junction, the start of the
// cobbled road, and the yard gate at the start of a job.
// Usage: node scripts/look-checks.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=medium`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await sleep(1500);
await page.screenshot({ path: 'test-output/check-menu.png' });
await page.evaluate(async () => {
  const { LEVELS } = await import('/src/game/config.ts');
  window.__game.start(LEVELS[0]);
});
await page.waitForFunction('window.__game.mode === "playing"');
await sleep(1500);
await page.screenshot({ path: 'test-output/check-start.png' });
await page.click('#btn-map');
await sleep(600);
await page.screenshot({ path: 'test-output/check-map.png' });
await page.click('#btn-map-close');
await page.click('#btn-pause');
await sleep(400);
await page.screenshot({ path: 'test-output/check-pause.png' });
await page.click('#btn-resume');
// From above: a junction of a branch with the trunk, and the start of the cobbled road.
const look = async (name, pick) => {
  await page.evaluate((pick) => {
    const f = window.__game.session.field;
    const roads = f.roads;
    const r = pick === 'cobble' ? roads.find((q) => q.kind === 'cobble') : roads[2];
    const p = r.pts[0];
    const q = r.pts[Math.min(r.pts.length - 1, 12)];
    window.__game.view.debugLook = { x: p.x - (q.x - p.x) * 0.6 + 4, z: p.z - (q.z - p.z) * 0.6 + 4, up: 5, atX: p.x, atZ: p.z, atUp: 0 };
  }, pick);
  await sleep(1200);
  await page.screenshot({ path: `test-output/check-${name}.png` });
};
await look('junction', 'branch');
await look('cobble', 'cobble');
await browser.close();
