// Dev: the hazelnut harvest end to end, by its own buttons where it can (held ÇUVAL YÜKLE, BOŞALT VE SER,
// PATOSU ÇALIŞTIR, HORTUMU AL), the vehicle and the worker put where a player would drive and walk them;
// the drying hurried by setting its time. Shots of each step in test-output/harvest; prints what happened.
// Usage: node scripts/look-harvest.mjs [baseUrl] (default http://localhost:5173/)
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/harvest';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 820, height: 360, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('error', m.text()));
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
/** A look from (x, y over the ground, z) at (tx, ty over the ground, tz), the game held. */
const look = async (n, x, y, z, tx, ty, tz) => {
  await page.evaluate((c) => {
    const f = window.__game.session.field;
    const fy = f.height(c.x, c.z) + c.y;
    const ty = f.height(c.tx, c.tz) + c.ty;
    const d = { x: c.tx - c.x, y: ty - fy, z: c.tz - c.z };
    window.__game.view.freeCam = { x: c.x, y: fy, z: c.z, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y / Math.hypot(d.x, d.y, d.z)) };
  }, { x, y, z, tx, ty, tz });
  await sleep(900);
  await shot(n);
  await page.evaluate(() => (window.__game.view.freeCam = null));
};
const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.save.harvest ?? null)));
const objective = () => page.evaluate(() => document.getElementById('objective').innerText.replace(/\s+/g, ' '));
const objShown = () => page.evaluate(() => getComputedStyle(document.getElementById('objective')).display !== 'none');
const acts = () => page.evaluate(() => [...document.querySelectorAll('#actions [data-id]')].map((b) => b.dataset.id));
/** A button pressed (held for ms when given). */
const press = async (id, ms = 0) => {
  const b = await page.$(`#actions [data-id="${id}"]`);
  if (!b) return false;
  const r = await b.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await sleep(ms || 60);
  await page.mouse.up();
  await sleep(200);
  return true;
};
/** Into the village (the harvest played, or Serbest gez with harvest false) with this vehicle and hitch. */
const start = async (setup, harvest = true) => {
  await page.evaluate((setup, harvest) => {
    const g = window.__game;
    if (g.mode === 'playing') g.quitToMenu();
    Object.assign(g.save, setup);
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.levelTab = 1;
    g.startRoam(harvest);
  }, setup, harvest);
  await page.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
  await sleep(1500);
};
/** The worker on foot at (x, z) facing (fx, fz); the vehicle (its trailer's middle) at (vx, vz) facing vyaw. */
const put = (w, v) =>
  page.evaluate(
    (w, v) => {
      const s = window.__game.session;
      const f = s.field;
      if (s.driving) s.alight();
      if (v) Object.assign(f.vehicle, { x: v.x, z: v.z, yaw: v.yaw, speed: 0, art: 0 });
      if (f.trailer) f.trailer.yaw = NaN;
      s.x = w.x;
      s.z = w.z;
      s.yaw = Math.atan2(w.fx - w.x, w.fz - w.z);
      window.__game.lookYaw = s.yaw;
    },
    w,
    v,
  );

/** The vehicle parked so its load bed (or, with patos set, its towed patos) stands at (x, z), facing yaw; the worker beside it. */
const park = (at, yaw, patos = false) =>
  page.evaluate(
    (at, yaw, patos) => {
      const g = window.__game;
      const s = g.session;
      const f = s.field;
      if (s.driving) s.alight();
      const v = f.vehicle;
      Object.assign(v, { x: at.x, z: at.z, yaw, speed: 0, art: 0 });
      for (let k = 0; k < 3; k++) {
        if (f.trailer) f.trailer.yaw = yaw;
        const b = patos ? f.trailerAxle() : g.loadBed(s);
        v.x += at.x - b.x;
        v.z += at.z - b.z;
      }
      if (f.trailer) f.trailer.yaw = yaw;
      const b = patos ? f.trailerAxle() : g.loadBed(s);
      s.x = b.x - 1.5;
      s.z = b.z;
      s.yaw = Math.PI / 2;
      g.lookYaw = s.yaw;
    },
    at,
    yaw,
    patos,
  );
await page.goto(`${base}?quality=low`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  g.save.introDone = true;
  delete g.save.harvest;
  g.save.vehicles = ['patpat', 'traktor', 'romork'];
  g.save.money = 100000;
});

// ---- 0. Serbest gez is the player's own: no harvest put out, nothing asked.
await start({ vehicle: 'patpat', patosOn: false, trailerOff: false }, false);
let h = await state();
ok(h === null, `Serbest gez starts no harvest: ${JSON.stringify(h)}`);
ok(!(await objShown()), 'Serbest gez: no objective');
// The menu's Fındık Harmanı button and card: without the patos it cannot be started.
const tabBtn = () => page.evaluate(() => {
  const g = window.__game;
  if (g.mode === 'playing') g.quitToMenu();
  g.showMenu();
  document.querySelectorAll('.screen.dim').forEach((x) => x.id !== 'harvest-offer' && x.classList.remove('show'));
  if (getComputedStyle(document.getElementById('btn-harvest')).display === 'none') return 'no button';
  document.getElementById('btn-harvest').click();
  return document.querySelector('#harvest-body .hv-go')?.innerText.trim();
});
ok((await tabBtn()) === 'ÖNCE PATOS AL', `no patos: the tab says ÖNCE PATOS AL`);
await page.evaluate(() => (window.__game.save.vehicles = ['patpat', 'traktor', 'romork', 'patos']));
ok((await tabBtn()) === 'HASADI BAŞLAT', `with the tractor and the patos: HASADI BAŞLAT`);
await page.evaluate(() => document.querySelector('#harvest-body .hv-go').click());
await page.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(1500);

// ---- 1. With the pat pat: to Dere Yanı's sacks, load, back to the harman, spread.
await start({ vehicle: 'patpat', patosOn: false, trailerOff: false });
h = await state();
ok(h?.stage === 'collect' && h.waiting[9] === 8 && h.waiting[10] === 8, `a harvest waiting: ${JSON.stringify(h?.waiting)}`);
const spots = await page.evaluate(() => {
  const s = window.__game.session;
  const f = s.field;
  const pile = (g) => {
    const lv = window.__game.levelById(g);
    return lv;
  };
  void pile;
  return { harman: f.harman, house: f.house };
});
const pile = await page.evaluate(() => import('/src/render/harvest.ts').then((m) => { const f = window.__game.session.field; return { 9: m.loadSpot(f, 9), 10: m.loadSpot(f, 10), s9: m.sackPile(f, 9), tarp: m.tarpSpot(f), ...m.harvestSpots(f) }; }));
console.log('sack places', JSON.stringify({ 9: pile[9], 10: pile[10] }));
// By the sacks on foot, the vehicle left at home.
await put({ x: (pile.s9.x + pile[9].x) / 2, z: (pile.s9.z + pile[9].z) / 2, fx: pile.s9.x, fz: pile.s9.z }, null);
await sleep(500);
ok((await acts()).includes('sack-far'), 'away from the mark: ARACI YANAŞTIR');
await park(pile[9], pile[9].yaw);
await page.evaluate(() => window.__game.session.board());
await sleep(800);
let o = await objective();
ok(o.includes('araçtan in'), `driving into the mark: ${o}`);
await park(pile[9], pile[9].yaw);
await sleep(800);
o = await objective();
ok(o.includes('ÇUVAL YÜKLE'), `on foot by the sacks: ${o}`);
await shot('1-pile-and-patpat');
let a = await acts();
ok(a.includes('sack'), `ÇUVAL YÜKLE shows by the sacks: ${a.join(',')}`);
await press('sack', 8 * 600 + 400);
h = await state();
ok(h.load === 8 && h.waiting[9] === 0, `held: all of Dere Yanı's sacks on the pat pat: load ${h.load}, left at the gate ${h.waiting[9]}`);
ok(await page.evaluate(() => !window.__game.view.world.trailerTrimmer?.visible), 'roaming: no trimmer in the pat pat');
await shot('2-patpat-loaded');
await look('2b-patpat-load', pile[9].x + 3.5, 3.2, pile[9].z + 7.5, pile[9].x + 3, 0.8, pile[9].z + 3.5);
// The load slows it: full gas for 2 s, loaded.
const speedLoaded = await page.evaluate(async () => {
  const s = window.__game.session;
  s.board();
  return s.field.cargo + '/' + s.field.cargoCap;
});
ok(speedLoaded === '8/16', `the vehicle carries the load: ${speedLoaded}`);
await sleep(600);
o = await objective();
ok(o.includes('Çuvallara git') || o.includes('Harmana'), `loaded, driving: ${o}`);
// Serbest gez with a harvest of the player's under way: told as from its tab, its buttons there; no field gate by the sacks.
await start({}, false);
// (By the pile with sacks left: Dere Yanı's are all on the pat pat.)
await park(pile[10], pile[10].yaw);
await sleep(600);
ok((await acts()).some((x) => x.startsWith('sack')) && (await objShown()), 'Serbest gez, a harvest under way: its buttons and its objective');
ok(!(await acts()).some((x) => x === 'switch' || x === 'unlock'), `by the sacks: no BU İŞE GEÇ or BÖLÜMÜ AÇ: ${(await acts()).join(',')}`);
const toasts = () => page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent).join(' | '));
ok((await toasts()).includes('yarım kalan hasadın'), `Serbest gez: a half-done harvest says so: ${await toasts()}`);
await start({});
// At the harman: spread.
await park(pile.unload, 0);
await sleep(800);
a = await acts();
ok(a.includes('spread'), `BOŞALT VE SER at the harman: ${a.join(',')}`);
await press('spread', 8 * 600 + 400);
h = await state();
ok(h.load === 0 && h.spread === 8, `spread: load ${h.load}, on the harman ${h.spread}`);
await shot('3-spread-6');

// ---- 2. The rest with the tractor and its trailer (16).
await start({ vehicle: 'traktor', patosOn: false, trailerOff: false });
await park(pile[10], pile[10].yaw);
await sleep(800);
await press('sack', 8 * 600 + 400);
h = await state();
ok(h.load === 8, `the trailer loaded: ${h.load}`);
await shot('4-trailer-loaded');
const ax = await page.evaluate(() => window.__game.session.field.trailerAxle());
await look('4b-trailer-load', ax.x + 1, 4.5, ax.z + 5, ax.x, 0.9, ax.z);
await park(pile.unload, 0);
await sleep(800);
await press('spread', 8 * 600 + 400);
h = await state();
ok(h.stage === 'drying', `all spread: ${h.stage} (spread ${h.spread})`);
ok(Math.abs(h.until - Date.now() - 24 * 3600e3) < 120e3, 'drying: a day');
o = await objective();
ok(o.includes('patosa verilmez'), `drying: ${o}`);
await shot('5-drying');
await look('5b-harman-nuts', spots.harman.x + 7, 5, spots.harman.z + 7, spots.harman.x, 0, spots.harman.z);

// ---- 3. Dried (its time set past). Serbest gez without the patos: told to buy it.
await page.evaluate(() => {
  const g = window.__game;
  g.save.harvest.until = Date.now() - 1000;
  g.save.vehicles = ['patpat', 'traktor', 'romork'];
});
await start({ vehicle: 'traktor', patosOn: false, trailerOff: false }, false);
await sleep(500);
o = await objective();
ok(o.includes('patos lazım'), `dry nuts, no patos: ${o}`);
// The patos bought and hitched, to the harman.
await page.evaluate(() => {
  const g = window.__game;
  g.save.harvest.until = Date.now() - 1000;
  g.save.vehicles = ['patpat', 'traktor', 'romork', 'patos'];
});
await start({ vehicle: 'traktor', patosOn: false, trailerOff: false });
h = await state();
ok(h.stage === 'thresh', `dried: ${h.stage}`);
o = await objective();
ok(o.includes('Patosu traktöre tak'), `the trailer on: ${o}`);
await start({ vehicle: 'traktor', patosOn: true, trailerOff: true });
// The tractor beside the harman, the patos behind it at its edge; the worker by the patos.
await park({ x: pile.patos.x + 4, z: pile.patos.z }, 0, true);
await sleep(500);
ok((await acts()).includes('patos-far'), 'out of its mark: PATOSU YERİNE ÇEK');
await park(pile.patos, 0, true);
const pp = await page.evaluate(() => window.__game.session.field.trailerAxle());
await sleep(800);
await shot('6-patos-by-harman');
a = await acts();
ok(a.includes('patos'), `PATOSU ÇALIŞTIR by it: ${a.join(',')}`);
await press('patos');
a = await acts();
ok(a.includes('hose'), `then HORTUMU AL: ${a.join(',')}`);
await press('hose');
// Walking over the harman with the hose: across it in rows.
const t0 = (await state()).sucked?.length ?? 0;
await page.evaluate(async (hm) => {
  const s = window.__game.session;
  const g = window.__game;
  for (let row = -hm.r; row <= hm.r && g.save.harvest.stage === 'thresh'; row += 0.9) {
    for (let k = 0; k < 24 && g.save.harvest.stage === 'thresh'; k++) {
      s.x = hm.x - hm.r + (k / 23) * hm.r * 2 - Math.sin(s.yaw) * 0.9;
      s.z = hm.z + row - Math.cos(s.yaw) * 0.9;
      await new Promise((r) => setTimeout(r, 90));
    }
  }
}, spots.harman);
h = await state();
ok((h.sucked?.length ?? 0) > t0 + 12 || h.stage === 'beans', `the hose took the nuts: ${h.sucked?.length ?? 'all'} cells, stage ${h.stage}`);
await shot('7-threshing');
await look('7b-patos-tarp', pp.x - 8, 5, pp.z + 7, pp.x - 2, 0.5, pp.z);
// ---- 4. The clean nuts dried, sold.
await page.evaluate(() => {
  const g = window.__game;
  const hv = g.save.harvest;
  if (hv.stage === 'thresh') {
    hv.sucked = Array.from({ length: 48 }, (_, i) => i);
    hv.stage = 'beans';
  }
  hv.until = Date.now() - 1000;
});
await sleep(1500);
const tarp = pile.tarp;
await put({ x: tarp.x + 2, z: tarp.z + 2, fx: tarp.x, fz: tarp.z }, null);
await sleep(800);
await shot('8-tarp');
a = await acts();
ok(a.includes('sell'), `TÜCCARA SAT: ${a.join(',')}`);
const m0 = await page.evaluate(() => window.__game.save.money);
await press('sell');
const m1 = await page.evaluate(() => window.__game.save.money);
h = await state();
ok(m1 - m0 === 400 * 22 && h.stage === 'rest', `sold: +${m1 - m0} TL, ${h.stage}`);
// ---- 5. From Serbest gez into a job: it starts as any job, the trimmer in the vehicle.
await page.evaluate(() => window.__game.switchJob(window.__game.levelById(3)));
await page.waitForFunction('window.__game.mode === "playing" && window.__game.session.level.id === 3', { timeout: 60000 });
await sleep(1200);
const j = await page.evaluate(() => { const s = window.__game.session; return { has: s.hasTrimmer, intro: s.intro }; });
ok(!j.has && j.intro === 'take', `a job from Serbest gez starts with the trimmer in the vehicle: ${JSON.stringify(j)}`);
await browser.close();
process.exit(bad ? 1 : 0);
