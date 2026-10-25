// Dev check: the flows of the last round, end to end in the browser.
// 1. On job 2, at job 1's gate: BU İŞE GEÇ -> the loading screen -> job 1, the day going on from there.
// 2. Driving with the on-screen wheel and pedals: GAZ moves it, the wheel turns it, FREN backs up.
// Usage: node scripts/check-flows.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860, hasTouch: false });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?quality=low`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
let ok = true;
const check = (name, cond, info = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name} ${info}`);
  if (!cond) ok = false;
};

// 1. Switch job at a gate.
await page.evaluate(async () => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  g.save.introDone = true;
  g.save.unlocked = Math.max(g.save.unlocked, 3);
  g.save.mownAt = {};
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS[1]);
});
await page.waitForFunction('window.__game.mode === "playing"');
await page.evaluate(() => {
  const s = window.__game.session;
  const o = s.field.others.find((x) => x.level.id === 1);
  s.intro = null;
  s.x = o.entryX;
  s.z = o.maxZ + 4;
});
// (Frames come slowly in the headless browser: wait for the button rather than a fixed time.)
await page.waitForFunction(() => document.querySelector('[data-id="switch"]'), { timeout: 15000 }).catch(() => {});
const acts = await page.evaluate(() => [...document.querySelectorAll('[data-id]')].map((b) => b.dataset.id));
check('BU İŞE GEÇ shows at job 1 gate', acts.includes('switch'), JSON.stringify(acts));
const where = await page.evaluate(() => {
  const s = window.__game.session;
  return { x: s.x + s.field.origin.x, z: s.z + s.field.origin.z };
});
await page.evaluate(() => document.querySelector('[data-id="switch"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
await sleep(30);
const loading = await page.evaluate(() => document.getElementById('loading').classList.contains('show'));
check('loading screen shows', loading, await page.evaluate(() => document.getElementById('loading-text').textContent));
await page.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
const after = await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  return { id: g.level.id, x: s.x + s.field.origin.x, z: s.z + s.field.origin.z, hud: document.getElementById('hud').classList.contains('show') };
});
check('now on job 1', after.id === 1, JSON.stringify(after));
check('the day goes on from the gate', Math.hypot(after.x - where.x, after.z - where.z) < 1.5, `moved ${Math.hypot(after.x - where.x, after.z - where.z).toFixed(2)} m`);
check('game screen back', after.hud);

// 2. Drive with the wheel and pedals.
await page.evaluate(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x + 1.2;
  s.z = v.z;
  s.board();
});
await sleep(500);
const wheelShown = await page.evaluate(() => getComputedStyle(document.getElementById('drive-wheel')).display !== 'none' && document.body.classList.contains('driving'));
check('wheel and pedals shown while driving', wheelShown);
const pos = () => page.evaluate(() => {
  const v = window.__game.session.field.vehicle;
  return { x: v.x, z: v.z, yaw: v.yaw, speed: v.speed };
});
const p0 = await pos();
const gas = await page.$('#pedal-gas');
const gb = await gas.boundingBox();
await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
await page.mouse.down();
// Until it has gone half a metre (the headless browser's frame rate varies: wait on the result).
await page.waitForFunction((x, z) => {
  const v = window.__game.session.field.vehicle;
  return Math.hypot(v.x - x, v.z - z) > 0.5;
}, { timeout: 15000 }, p0.x, p0.z).catch(() => {});
const p1 = await pos();
check('GAZ moves it forward', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.5, `${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2)} m, speed ${p1.speed.toFixed(2)}`);
// Keep the gas held (mouse is one pointer; use a touch-like second pointer for the wheel via events).
await page.evaluate(() => {
  const w = document.getElementById('drive-wheel');
  const r = w.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const ev = (type, x, y) => w.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, clientX: x, clientY: y }));
  ev('pointerdown', cx, cy - 60);
  // Round to the right a quarter turn, in steps.
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    ev('pointermove', cx + Math.sin(a) * 60, cy - Math.cos(a) * 60);
  }
  window.__wheel = w;
});
await page.waitForFunction((yaw) => {
  const v = window.__game.session.field.vehicle;
  return Math.abs(Math.atan2(Math.sin(v.yaw - yaw), Math.cos(v.yaw - yaw))) > 0.15;
}, { timeout: 15000 }, p1.yaw).catch(() => {});
const p2 = await pos();
const steer = await page.evaluate(() => window.__game.driveUi.steer);
check('wheel turned right steers', steer > 0.5, `steer ${steer.toFixed(2)}`);
let dyaw = p2.yaw - p1.yaw;
dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
check('it turns', Math.abs(dyaw) > 0.15, `yaw change ${dyaw.toFixed(2)}`);
await page.evaluate(() => window.__wheel.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 })));
await page.mouse.up();
await page.waitForFunction(() => Math.abs(window.__game.driveUi.steer) < 0.1, { timeout: 10000 }).catch(() => {});
const back = await page.evaluate(() => window.__game.driveUi.steer);
check('wheel springs back when let go', Math.abs(back) < 0.1, `steer ${back.toFixed(2)}`);
// FREN: stops, then backs up.
const br = await (await page.$('#pedal-brake')).boundingBox();
await page.mouse.move(br.x + br.width / 2, br.y + br.height / 2);
await page.mouse.down();
await sleep(2500);
const p3 = await pos();
await page.mouse.up();
check('FREN stops it and backs up', p3.speed < 0, `speed ${p3.speed.toFixed(2)}`);
await page.screenshot({ path: 'test-output/flows-drive.png' });
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(ok ? 0 : 1);
