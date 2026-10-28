// Dev: the cows: two by Karadere's barn, a couple along the tracks (in Yeşilyamaç too), every other one
// black and white; one wandering into a garden during a job (its owner tips): told, in the worker's way;
// sent off by walking at it; left in at the end, no tip. Shots in test-output/cows.
// Usage (dev server running): node scripts/look-cows.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/cows';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-cows-${Date.now()}` });
const page = await browser.newPage();
await page.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (r) => /\.(glb|wav|webp|png)$/.test(r.url()) && errors.push(`failed ${r.url()}`));
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const job = async (id, cow) => {
  await page.evaluate(
    async (id, cow) => {
      const g = window.__game;
      // (Whether a cow comes into the garden: made sure of, or ruled out.)
      const cfg = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/game/config.ts')) ?? '/src/game/config.ts');
      cfg.COW.chance = cow ? 1 : 0;
      if (g.mode === 'playing') g.quitToMenu();
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
      g.start(g.levelById(id));
    },
    id,
    cow,
  );
  await page.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
  await sleep(1500);
};
const cows = () =>
  page.evaluate(() => {
    const c = window.__game.view.cows;
    if (!c) return null;
    return c.cows.map((q) => ({ kind: q.role.kind, phase: q.role.phase, x: q.cow.x, z: q.cow.z, shown: q.cow.root.visible, black: (() => {
      let b = false;
      q.cow.root.traverse((o) => o.isMesh && o.material.customProgramCacheKey?.() === 'cow-black' && (b = true));
      return b;
    })() }));
  });
/** A look from (x, y over the ground, z) at (tx, ty over the ground, tz). */
const look = async (n, c) => {
  await page.evaluate((c) => {
    const f = window.__game.session.field;
    const fy = f.height(c.x, c.z) + c.y;
    const ty = f.height(c.tx, c.tz) + c.ty;
    const d = { x: c.tx - c.x, y: ty - fy, z: c.tz - c.z };
    window.__game.view.freeCam = { x: c.x, y: fy, z: c.z, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y / Math.hypot(d.x, d.y, d.z)) };
  }, c);
  await sleep(1200);
  await shot(n);
  await page.evaluate(() => (window.__game.view.freeCam = null));
};

await page.goto(`${base}?quality=high`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => Object.assign(window.__game.save, { introDone: true, tutorialSeen: true, harvestOffered: 99, unlocked: 20, weather: 'sunny', vehicle: 'patpat' }));
// A Karadere garden whose owner tips.
const id = await page.evaluate(() => window.__game.levelById && [15, 16, 17, 18, 19, 20, 12].find((i) => window.__game.levelById(i).client.request !== 'none' && ['findik', 'yayla'].includes(window.__game.levelById(i).theme)));
ok(!!id, `a Karadere garden whose owner tips: job ${id}`);

// ---- Karadere, no cow in the garden: by the barn and along the tracks.
await job(id, false);
let c = await cows();
ok(!!c && c.filter((q) => q.kind === 'barn').length === 2, `two cows by the barn (${c && c.map((q) => q.kind).join(',')})`);
ok(c.some((q) => q.kind === 'road'), 'cows along the tracks');
ok(!c.some((q) => q.kind === 'garden'), 'none in the garden this time');
ok(c.some((q) => q.black) && c.some((q) => !q.black), 'black and white ones and brown ones');
const barn = c.find((q) => q.kind === 'barn');
await look('1-ahir-inekler', { x: barn.x + 7, y: 2.2, z: barn.z + 7, tx: barn.x, ty: 0.9, tz: barn.z });
const road = c.find((q) => q.kind === 'road');
const z0 = await page.evaluate(() => window.__game.view.cows.cows.find((q) => q.role.kind === 'road').cow.z);
await sleep(6000);
c = await cows();
const r2 = c.find((q) => q.kind === 'road');
await look('2-yol-inek', { x: r2.x + 6, y: 2, z: r2.z + 5, tx: r2.x, ty: 0.9, tz: r2.z });
// A black and white one up close.
const bw = c.find((q) => q.black);
await look('2b-siyah-beyaz', { x: bw.x + 3.2, y: 1.6, z: bw.z + 2.4, tx: bw.x, ty: 0.9, tz: bw.z });
void road;
void z0;

// ---- Yeşilyamaç: along its tracks too (no barn).
await job(5, false);
c = await cows();
ok(!!c && c.some((q) => q.kind === 'road') && !c.some((q) => q.kind === 'barn'), `Yeşilyamaç: cows along the tracks, no barn (${c && c.map((q) => q.kind).join(',')})`);

// ---- A cow into the garden.
await job(id, true);
c = await cows();
ok(c.some((q) => q.kind === 'garden' && q.phase === 'wait' && !q.shown), 'a cow waiting to come in (not yet seen)');
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  s.intro = null;
  s.hasTrimmer = true;
  s.x = 0;
  s.z = -s.field.depth / 2 + 4;
  g.view.cows.cows.find((q) => q.role.kind === 'garden').role.t = 0;
});
await page.waitForFunction(() => /Bahçeye inek girdi/.test(document.getElementById('toasts').innerText), { timeout: 6000 }).catch(() => {});
const told = await page.evaluate(() => document.getElementById('toasts').innerText);
ok(/Bahçeye inek girdi/.test(told), `told: ${told}`);
await sleep(9000);
c = await cows();
const gc = c.find((q) => q.kind === 'garden');
ok(gc.shown && (gc.phase === 'graze' || gc.phase === 'enter'), `it comes in and grazes (${gc.phase})`);
ok(await page.evaluate(() => window.__game.session.field.movers.length > 0), 'the cows stand in the worker’s way');
await look('3-bahcede-inek', { x: gc.x + 5, y: 2.2, z: gc.z + 6, tx: gc.x, ty: 0.9, tz: gc.z });
// Finished with it still there: no tip.
await page.evaluate(() => window.__game.finish());
await sleep(800);
const res = await page.evaluate(() => document.getElementById('result-table').innerText.replace(/\s+/g, ' '));
ok(/inek bahçede kaldı/.test(res), `the result: no tip, the cow left in (${res.slice(res.indexOf('Bahşiş'), res.indexOf('Bahşiş') + 50)})`);
await shot('4-sonuc');

// ---- Again, sent off by walking at it.
await job(id, true);
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  s.intro = null;
  s.x = 0;
  s.z = -s.field.depth / 2 + 4;
  g.view.cows.cows.find((q) => q.role.kind === 'garden').role.t = 0;
});
await sleep(9000);
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const q = g.view.cows.cows.find((q) => q.role.kind === 'garden').cow;
  s.x = q.x + 2.5;
  s.z = q.z;
});
await sleep(700);
const out = await page.evaluate(() => ({ toast: document.getElementById('toasts').innerText, in: window.__game.view.cows.intruding }));
ok(!out.in && /İnek kaçtı/.test(out.toast), `walked at: it runs off (${out.toast})`);
await page.waitForFunction(() => window.__game.view.cows.cows.find((q) => q.role.kind === 'garden').role.phase === 'gone', { timeout: 30000 }).catch(() => {});
c = await cows();
ok(c.find((q) => q.kind === 'garden').phase === 'gone', 'out of the garden and away');
ok(!errors.length, `no page errors or missing files${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await browser.close();
process.exit(bad ? 1 : 0);
