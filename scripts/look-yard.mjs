// Dev: the yard at the top of the lane (the house, the harman, the wall, haystacks, woodpile).
// Usage: node scripts/look-yard.mjs [baseUrl] (default http://localhost:5173/)
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
await page.click('#btn-play');
await sleep(300);
await page.click('.level');
await sleep(300);
await page.click('#btn-call-ok');
await page.waitForFunction('window.__game.mode === "playing"');
await sleep(500);
// [name, camera offset from the yard's centre (x, z, up), look at offset (x, z, up)]
for (const [name, cx, cz, up, ax, az, aup] of [
  ['above', 14, 12, 10, 0, 0, 0],
  ['gate', 12, 9, 2.2, -2, -1, 1],
  ['house', 4, -6, 2, -4.5, 0, 1.5],
  ['harman-lane', 9, 2, 2.4, 4, 9, 0],
]) {
  await page.evaluate((d) => {
    const p = window.__game.session.field.plateau;
    window.__game.view.debugLook = { x: p.x + d.cx, z: p.z + d.cz, up: d.up, atX: p.x + d.ax, atZ: p.z + d.az, atUp: d.aup };
  }, { cx, cz, up, ax, az, aup });
  await sleep(1000);
  await page.screenshot({ path: `test-output/yard-${name}.png` });
}
// The gate, shut and then open with the worker beside it.
const gateShot = async (name) => {
  await page.evaluate(() => {
    const f = window.__game.session.field;
    const g = f.yardGate;
    const mx = (g.ax + g.bx) / 2;
    const mz = (g.az + g.bz) / 2;
    const p = f.plateau;
    const ox = mx + (mx - p.x) * 0.6;
    const oz = mz + (mz - p.z) * 0.6;
    window.__game.view.debugLook = { x: ox, z: oz, up: 2, atX: mx, atZ: mz, atUp: 0.8 };
  });
  await sleep(1000);
  await page.screenshot({ path: `test-output/yard-${name}.png` });
};
await gateShot('gate-shut');
await page.evaluate(() => {
  const s = window.__game.session;
  const g = s.field.yardGate;
  s.x = (g.ax + g.bx) / 2;
  s.z = (g.az + g.bz) / 2;
  s.field.gateOpen = 1;
});
await gateShot('gate-open');
await browser.close();
