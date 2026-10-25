// Dev: Yeşilyamaç's stream, west of the house: the stone bridge from the bank and from above, the mill on
// its bank, the new gardens beyond (Dere Yanı, Değirmen Önü), and the pat pat driven over the bridge
// (its height kept on the walkway the whole way, not dipping into the creek).
// Usage: node scripts/look-creek.mjs [baseUrl] (default http://localhost:5173/). Shots in test-output/creek.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/creek';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 820, height: 360, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('error', m.text()));
await page.goto(`${base}?quality=medium`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  g.save.introDone = true;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(9));
});
await page.waitForFunction('window.__game.mode === "playing"');
await sleep(2000);
// The bridge in this field's coordinates.
const b = await page.evaluate(() => { const f = window.__game.session.field; return { ...f.bridge, mill: f.mill }; });
const look = async (name, x, y, z, tx, ty, tz) => {
  await page.evaluate((c) => {
    const v = window.__game.view;
    const d = { x: c.tx - c.x, y: c.ty - c.y, z: c.tz - c.z };
    const l = Math.hypot(d.x, d.y, d.z);
    v.freeCam = { x: c.x, y: c.y, z: c.z, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y / l) };
    document.body.classList.add('freecam');
  }, { x, y, z, tx, ty, tz });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
const gy = (x, z) => page.evaluate((x, z) => window.__game.session.field.height(x, z), x, z);
const y0 = await gy(b.x, b.z);
await look('1-bridge-side', b.x - 2, y0 + 3, b.z + 16, b.x, y0, b.z);
await look('1b-bridge-end', b.x + b.len / 2 + 7, y0 + 1.6, b.z + 3, b.x + b.len / 2, y0, b.z);
await look('2-bridge-above', b.x + 8, y0 + 16, b.z + 10, b.x, y0, b.z);
await look('3-mill', b.mill.x + 16, y0 + 8, b.mill.z + 12, b.mill.x, y0 - 2, b.mill.z);
await look('3b-mill-east', b.mill.x + 14, y0 + 3, b.mill.z, b.mill.x, y0, b.mill.z);
await look('3c-mill-south', b.mill.x + 2, y0 + 3, b.mill.z + 14, b.mill.x + 2, y0, b.mill.z);
await look('4-gardens', b.x + 30, y0 + 40, b.z + 30, b.x - 30, y0 - 4, b.z);
// The east edge, where the stream used to run past the first gardens (from field 1's corner).
const e = await page.evaluate(() => { const f = window.__game.session.field; const o = f.others.find((q) => q.level.id === 1); return { x: o.maxX, z: (o.minZ + o.maxZ) / 2, y: f.height(o.maxX, (o.minZ + o.maxZ) / 2) }; });
await look('6-east-edge', e.x - 25, e.y + 14, e.z + 20, e.x + 10, e.y, e.z);
await page.evaluate(() => {
  window.__game.view.freeCam = null;
  document.body.classList.remove('freecam');
});
// The pat pat over the bridge, east to west: its height against the walkway's, all along.
const run = await page.evaluate(async (b) => {
  const g = window.__game;
  const s = g.session;
  const f = s.field;
  const v = f.vehicle;
  Object.assign(v, { x: b.x + b.len / 2 + 6, z: b.z, yaw: -Math.PI / 2, speed: 0, art: 0 });
  s.running = false;
  s.x = v.x;
  s.z = v.z + 1.6;
  s.board();
  const out = [];
  for (let i = 0; i < 400; i++) {
    s.advance(1 / 30, { drive: { throttle: 0.5, steer: 0 }, moveX: 0, moveZ: 0, throttle: 0, bump: false });
    if (i % 25 === 0) out.push({ x: +v.x.toFixed(1), speed: +v.speed.toFixed(2), deck: f.bridgeDeck(v.x, v.z)?.toFixed(2) ?? '-', ground: +f.height(v.x, v.z).toFixed(2), water: f.inWater(v.x, v.z) });
    if (v.x < b.x - b.len / 2 - 6) break;
  }
  return out;
}, b);
for (const r of run) console.log(JSON.stringify(r));
await page.evaluate((b) => {
  const v = window.__game.session.field.vehicle;
  Object.assign(v, { x: b.x + 2, z: b.z, speed: 0 });
  window.__game.view.driveOrbit = Math.PI / 2;
}, b);
await sleep(2500);
await page.screenshot({ path: `${OUT}/5-patpat-on-bridge.png` });
await browser.close();
