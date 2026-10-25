// Dev: the game held sideways (a phone in landscape): the menus, the trimmer job, the pat pat and the tractor.
// Usage: node scripts/look-landscape.mjs [baseUrl] (default http://localhost:5173/). W=915 H=412 for the size.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? 'test-output/land';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.W ?? 915), height: Number(process.env.H ?? 412), isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('error', m.text()));
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const only = (id) => page.evaluate((i) => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  document.getElementById(i)?.classList.add('show');
}, id);

await page.goto(`${base}?quality=medium`);
await sleep(600);
await shot('00-loading');
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await sleep(800);
await shot('01-daily');
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await sleep(1500);
await shot('02-menu');
await page.evaluate(() => (window.__game.save.money = 50000));
await page.click('#btn-shop');
await sleep(500);
await shot('03-shop');
await page.click('#btn-shop-close');
for (const id of ['store', 'settings', 'tasks', 'noads-offer']) {
  await only(id);
  await sleep(300);
  await shot(`04-${id}`);
}
await only('menu');
await page.click('#btn-play');
await sleep(500);
await shot('05-levels');
await page.evaluate(() => document.querySelector('.saga-node.next, .saga-node').click());
await sleep(500);
await shot('06-call');
await page.click('#btn-call-ok');
await page.waitForFunction('window.__game.mode === "playing"');
await sleep(2500);
await shot('07-start');
// The trimmer in the hands (as look-drive.mjs: the start of the job skipped), the engine to start.
await page.evaluate(() => {
  const g = window.__game;
  g.save.introDone = true;
  g.quitToMenu();
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(1));
  const s = g.session;
  s.hasTrimmer = true;
  s.line = s.gear.lineMax;
  s.broken = false;
  s.intro = null;
  g.updateStarterUi();
});
await sleep(1500);
await shot('08-starter');
await page.evaluate(() => {
  const g = window.__game;
  g.session.running = true;
  g.updateStarterUi();
});
await sleep(1500);
await shot('09-trimming');
// Holding the trigger and walking with the stick (a touch bottom left).
const box = async (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const hold = async (sel, ms, then) => {
  const b = await box(sel);
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await sleep(ms);
  await then?.();
  await page.mouse.up();
};
await hold('#gas-btn', 1500, () => shot('09b-gas-held'));
// The pat pat: on it, then the gas pedal held, the wheel turned.
await page.evaluate(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.running = false;
  s.x = v.x - 1.3;
  s.z = v.z;
  s.board();
});
await sleep(2500);
await shot('10-patpat');
const at0 = await page.evaluate(() => { const v = window.__game.session.field.vehicle; return { x: v.x, z: v.z }; });
await hold('#pedal-gas', 2500, () => shot('10b-patpat-gas'));
const at1 = await page.evaluate(() => { const v = window.__game.session.field.vehicle; return { x: v.x, z: v.z, speed: v.speed }; });
console.log('gas pedal moved the pat pat', Math.hypot(at1.x - at0.x, at1.z - at0.z).toFixed(2), 'm, speed', at1.speed.toFixed(2));
// The wheel: grabbed at its top and dragged round to the right.
const w = await box('#drive-wheel');
await page.mouse.move(w.x, w.y - 60);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(w.x + 60 * Math.sin(i * 0.2), w.y - 60 * Math.cos(i * 0.2));
const steer = await page.evaluate(() => window.__game.input.drive.steer);
await sleep(200);
await shot('10c-wheel');
await page.mouse.up();
console.log('wheel steer', steer.toFixed(2));
const y0 = await page.evaluate(() => window.__game.session.field.vehicle.speed);
await hold('#pedal-brake', 2500);
const y1 = await page.evaluate(() => window.__game.session.field.vehicle.speed);
console.log('brake pedal: speed', y0.toFixed(2), '->', y1.toFixed(2));
await page.click('#btn-map');
await sleep(600);
await shot('11-map');
await page.click('#btn-map-close');
await sleep(300);
await only('pause');
await sleep(300);
await shot('12-pause');
await page.evaluate(() => window.__game.quitToMenu());
// The tractor (roam, from the garage).
await page.evaluate(() => {
  const g = window.__game;
  g.save.vehicles = ['patpat', 'traktor'];
  g.save.vehicle = 'traktor';
});
await only('menu');
await page.click('#btn-roam');
await page.waitForFunction('window.__game.mode === "playing"', { timeout: 30000 });
await sleep(2500);
await shot('13-roam');
await page.evaluate(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x - 1.3;
  s.z = v.z;
  s.board();
});
await sleep(2500);
await shot('14-tractor');
// A job finished: the result's bill (a field at 95 %).
await page.evaluate(() => window.__game.quitToMenu());
await page.evaluate(() => {
  const g = window.__game;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(2));
  const f = g.session.field;
  Object.defineProperty(f, 'coverage', { get: () => 0.95 });
  g.session.accidents = 1;
  g.finish();
});
await sleep(800);
await shot('15-result');
await browser.close();
console.log('done');
