// Dev: drive the pat pat a little way down the lane, then look back along the prints it pressed into
// the mud, and at a puddle close up.
// Usage: node scripts/look-mud.mjs [baseUrl] (default http://localhost:5173/)
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
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const v = s.field.vehicle;
  s.x = v.x - 1.3;
  s.z = v.z;
  s.board();
  g.view.mode = 'follow';
});
// The first bend, from the harman, before setting off.
await page.evaluate(() => {
  const s = window.__game.session;
  const h = s.field.harman;
  const l = s.field.lane;
  window.__game.view.debugLook = { x: h.x + 1, z: h.z + 1, up: 2.2, atX: l[30].x, atZ: l[30].z, atUp: 0 };
});
await sleep(1000);
await page.screenshot({ path: 'test-output/mud-bend.png' });
await page.evaluate(() => (window.__game.view.debugLook = null));
// Drive down the lane to the straight beside the field, steering for a point ahead on it, in short
// bursts so the view (and the prints) keep up.
for (let k = 0; k < 80; k++) {
  const done = await page.evaluate(() => {
    const s = window.__game.session;
    const v = s.field.vehicle;
    const lane = s.field.lane;
    for (let i = 0; i < 30; i++) {
      let n = 0;
      for (let j = 1; j < lane.length; j++) if (Math.hypot(lane[j].x - v.x, lane[j].z - v.z) < Math.hypot(lane[n].x - v.x, lane[n].z - v.z)) n = j;
      const t = lane[Math.min(lane.length - 1, n + 5)];
      let err = Math.atan2(t.x - v.x, t.z - v.z) - v.yaw;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: 0.8, steer: Math.max(-1, Math.min(1, -err * 3)) } });
    }
    return v.z > s.field.depth / 2 - 4;
  });
  await sleep(60);
  if (done) break;
}
for (let i = 0; i < 20; i++) {
  await page.evaluate(() => window.__game.session.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: 0, steer: 0 } }));
}
await sleep(600);
// Look back up the lane along the prints: from a lane point some way behind the pat pat towards it.
const along = (ahead) => page.evaluate((ahead) => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  const lane = s.field.lane;
  let n = 0;
  for (let j = 1; j < lane.length; j++) if (Math.hypot(lane[j].x - v.x, lane[j].z - v.z) < Math.hypot(lane[n].x - v.x, lane[n].z - v.z)) n = j;
  return lane[Math.max(0, n - ahead)];
}, ahead);
for (const [name, from, to, up] of [['ruts', 9, 3, 1.5], ['ruts-low', 6, 2, 0.6]]) {
  const a = await along(from);
  const b = await along(to);
  await page.evaluate((d) => (window.__game.view.debugLook = d), { x: a.x, z: a.z, up, atX: b.x, atZ: b.z, atUp: 0 });
  await sleep(1000);
  await page.screenshot({ path: `test-output/mud-${name}.png` });
}
// The nearest big puddle (or any), from beside it.
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const v = s.field.vehicle;
  const big = s.field.puddles.filter((q) => q.r > 0.8 && Math.hypot(q.x - v.x, q.z - v.z) > 4);
  const p = (big.length ? big : s.field.puddles).reduce((a, b) => (Math.hypot(b.x - s.x, b.z - s.z) < Math.hypot(a.x - s.x, a.z - s.z) ? b : a));
  g.view.debugLook = { x: p.x - Math.sin(p.dir) * 3.2 + Math.cos(p.dir) * 1.2, z: p.z - Math.cos(p.dir) * 3.2 - Math.sin(p.dir) * 1.2, up: 1.6, atX: p.x, atZ: p.z, atUp: 0 };
});
await sleep(1200);
await page.screenshot({ path: 'test-output/mud-puddle.png' });
await browser.close();
