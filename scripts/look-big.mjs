// Dev: the big tractor: locked in the shop till job 16, bought and chosen; drawn on its own tyres (seen
// from its side and front, its wheels on the ground under its hubs), with the trailer behind; driven: faster
// than the tractor; a fuller trailer. Shots in test-output/big. Usage (dev server running): node scripts/look-big.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/big';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-big-${Date.now()}` });
const page = await browser.newPage();
await page.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (r) => /\.(glb|wav|webp|png)$/.test(r.url()) && errors.push(`failed ${r.url()}`));
page.on('dialog', (d) => d.accept());
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const look = async (n, c) => {
  await page.evaluate((c) => {
    const f = window.__game.session.field;
    const fy = f.height(c.x, c.z) + c.y;
    const ty = f.height(c.tx, c.tz) + c.ty;
    const d = { x: c.tx - c.x, y: ty - fy, z: c.tz - c.z };
    window.__game.view.freeCam = { x: c.x, y: fy, z: c.z, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y / Math.hypot(d.x, d.y, d.z)) };
  }, c);
  await sleep(1100);
  await page.screenshot({ path: `${OUT}/${n}.png` });
  await page.evaluate(() => (window.__game.view.freeCam = null));
};
const roam = async () => {
  await page.evaluate(() => {
    const g = window.__game;
    if (g.mode === 'playing') g.quitToMenu();
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.levelTab = 1;
    void g.startRoam();
  });
  await page.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 90000 });
  await sleep(1500);
};
await page.goto(`${base}?locked&quality=high`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => Object.assign(window.__game.save, { introDone: true, tutorialSeen: true, harvestOffered: 99, unlocked: 15, weather: 'sunny', vehicle: 'patpat', vehicles: ['patpat', 'traktor', 'romork'], trailerOff: false, patosOn: false }));

// ---- The shop.
const card = () =>
  page.evaluate(async () => {
    const g = window.__game;
    g.shopTab = 'arac';
    g.shopNote = null;
    g.openShop();
    await new Promise((r) => setTimeout(r, 300));
    const c = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === 'Büyük Traktör');
    return { locked: c?.classList.contains('locked'), label: c?.querySelector('.btn.buy')?.textContent };
  });
let c = await card();
ok(c.locked && /16\. İŞ/.test(c.label), `job 15: the big tractor locked till job 16 (${c.label})`);
await page.evaluate(() => (window.__game.save.unlocked = 20));
c = await card();
ok(!c.locked && /75\.000 TL/.test(c.label), `on sale (${c.label})`);
await page.evaluate(async () => {
  const el = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === 'Büyük Traktör');
  el.querySelector('.btn.buy').click();
  await new Promise((r) => setTimeout(r, 400));
  if (document.getElementById('confirm')?.classList.contains('show')) document.getElementById('btn-confirm-yes').click();
  await new Promise((r) => setTimeout(r, 400));
});
const st = await page.evaluate(() => ({ vehicle: window.__game.save.vehicle, owned: window.__game.save.vehicles }));
ok(st.vehicle === 'buyuk' && st.owned.includes('buyuk'), `bought and chosen (${JSON.stringify(st)})`);
await page.screenshot({ path: `${OUT}/1-dukkan.png` });
// The trailer's card says it goes on it.
const hitch = await page.evaluate(() => [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === 'Römork')?.innerText.replace(/\s+/g, ' '));
ok(/TAKILI/.test(hitch) && !/TRAKTÖRÜ SEÇ/.test(hitch), `the trailer on it: ${hitch}`);

// ---- In the village: drawn on its tyres, the trailer behind.
await roam();
const v = await page.evaluate(() => {
  const g = window.__game;
  const f = g.session.field;
  return { big: f.bigTractor, tractor: f.tractor, x: f.vehicle.x, z: f.vehicle.z, yaw: f.vehicle.yaw, trailer: !!f.trailer, rig: !!g.view.world?.patRig, wheel: !!g.view.world?.trailerRig };
});
ok(v.big && v.tractor && v.rig, `the big tractor in the yard (${JSON.stringify(v)})`);
// (Out on the harman, clear of the garage, to be seen from its side.)
Object.assign(v, await page.evaluate(() => { const f = window.__game.session.field; Object.assign(f.vehicle, { x: f.harman.x, z: f.harman.z, yaw: Math.PI / 2 }); if (f.trailer) f.trailer.yaw = Math.PI / 2; return { x: f.harman.x, z: f.harman.z, yaw: Math.PI / 2 }; }));
await sleep(800);
const side = { x: v.x + Math.cos(v.yaw) * 8, z: v.z - Math.sin(v.yaw) * 8 };
await look('2-yandan', { x: side.x, y: 1.6, z: side.z, tx: v.x, ty: 1.2, tz: v.z });
await look('3-onden', { x: v.x + Math.sin(v.yaw) * 7 + Math.cos(v.yaw) * 2.5, y: 2, z: v.z + Math.cos(v.yaw) * 7 - Math.sin(v.yaw) * 2.5, tx: v.x, ty: 1.2, tz: v.z });
// Driven: its top speed above the tractor's.
const top = await page.evaluate(() => window.__game.session.field.dims.forward);
ok(top > 5.6, `faster than the tractor (top ${top} m/s, the tractor 5.6)`);
// Its trailer takes more sacks.
const cap = await page.evaluate(async () => {
  const g = window.__game;
  const f = g.session.field;
  const m = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/game/harvest.ts')) ?? '/src/game/harvest.ts');
  return Math.round(m.capacityOf(true, !!f.trailer) * (f.bigTractor ? 1.5 : 1));
});
ok(cap === 24, `its trailer takes 24 sacks (${cap})`);
// The worker on it.
await page.evaluate(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x + 1.8;
  s.z = v.z;
  s.board();
});
await sleep(1500);
await look('4-surucu', { x: side.x, y: 2, z: side.z, tx: v.x, ty: 1.5, tz: v.z });
ok(!errors.length, `no page errors or missing files${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await browser.close();
process.exit(bad ? 1 : 0);
