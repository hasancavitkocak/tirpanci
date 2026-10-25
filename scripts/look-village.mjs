// Dev: the whole village from above and a few places in it (load time and frame rate too).
// Usage: node scripts/look-village.mjs [baseUrl] [level id] (default http://localhost:5173/, 1)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const lvId = Number(process.argv[3] ?? 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 700, height: 900 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('error', m.text()));
await page.goto(`${base}?quality=medium`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
const t0 = Date.now();
await page.evaluate(async (id) => {
  const { LEVELS } = await import('/src/game/config.ts');
  window.__game.start(LEVELS.find((l) => l.id === id));
}, lvId);
await page.waitForFunction('window.__game.mode === "playing"');
console.log('start ms', Date.now() - t0);
await sleep(800);
const shot = async (name, d) => {
  await page.evaluate((d) => {
    const v = window.__game.view;
    v.freeCam = d;
    document.body.classList.add('freecam');
  }, d);
  await sleep(1500);
  await page.screenshot({ path: `test-output/village-${name}.png` });
};
// From high above the middle of the village, looking down (field coordinates of the level).
const o = await page.evaluate(() => {
  const f = window.__game.session.field;
  return { ox: f.origin.x, oz: f.origin.z, hx: f.house.x, hz: f.house.z };
});
const vx = (x) => x - o.ox;
const vz = (z) => z - o.oz;
// No haze for the view from high up.
await page.evaluate(() => (window.__game.view.scene.fog.far = 5000));
await shot('top', { x: vx(-30), y: 330, z: vz(-110), yaw: Math.PI, pitch: -1.5 });
await page.evaluate(() => (window.__game.view.scene.fog.far = 260));
await shot('house', { x: o.hx + 22, y: 40, z: o.hz + 22, yaw: Math.atan2(-22, -22), pitch: -0.55 });
await shot('south', { x: vx(-30), y: 60, z: vz(-150), yaw: 0.2, pitch: -0.35 });
await shot('mosque', { x: vx(-30), y: 25, z: vz(-30), yaw: Math.atan2(-30, -50), pitch: -0.3 });
console.log(JSON.stringify(await page.evaluate(() => window.__game.view.renderer.info.render)));
await browser.close();
