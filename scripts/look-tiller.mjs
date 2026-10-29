// Dev: the motor çapa end to end: locked in the shop before its job, bought; a job whose owner wants some
// tilling (the bostan or the ocaks' feet: told at the start); ÇAPAYI AL at the vehicle (the trimmer put
// away), started on its own starter (choke and cord, no primer), the trigger: ticking over it does not
// till, on the throttle the soil turns over and rises; most of it done, the owner pays at the end;
// ÇAPAYI KOY. Shots in test-output/tiller. Usage (dev server running): node scripts/look-tiller.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/tiller';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-tiller-${Date.now()}` });
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
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const acts = () => page.evaluate(() => [...document.querySelectorAll('#actions [data-id]')].map((b) => b.dataset.id));
const press = async (id) => {
  const b = await page.$(`#actions [data-id="${id}"]`);
  if (!b) return false;
  await b.click();
  await sleep(300);
  return true;
};
const pull = async () => {
  await page.keyboard.press('KeyR');
  await sleep(250);
};
const task = () => page.evaluate(() => {
  const t = window.__game.tillTask;
  return t ? { kind: t.kind, n: t.cells.length, done: t.cells.filter((c) => c.t >= 1).length, some: t.cells.filter((c) => c.t > 0).length } : null;
});
const vis = (id) => page.evaluate((id) => {
  const e = document.getElementById(id);
  return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
}, id);
/** A look from (x, y over the ground, z) at (tx, ty over the ground, tz). */
const look = async (n, c) => {
  await page.evaluate((c) => {
    const f = window.__game.session.field;
    const fy = f.height(c.x, c.z) + c.y;
    const ty = f.height(c.tx, c.tz) + c.ty;
    const d = { x: c.tx - c.x, y: ty - fy, z: c.tz - c.z };
    window.__game.view.freeCam = { x: c.x, y: fy, z: c.z, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y / Math.hypot(d.x, d.y, d.z)) };
  }, c);
  await sleep(1000);
  await shot(n);
  await page.evaluate(() => (window.__game.view.freeCam = null));
};

await page.goto(`${base}?locked&quality=high`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  Object.assign(g.save, { introDone: true, tutorialSeen: true, harvestOffered: 99, unlocked: 11, weather: 'sunny', vehicle: 'patpat' });
  g.save.equipment.owned = g.save.equipment.owned.filter((x) => x !== 'capa');
});

// ---- The shop: locked before job 12, then bought.
const card = () =>
  page.evaluate(async () => {
    const g = window.__game;
    g.shopTab = 'donanim';
    g.shopNote = null;
    g.openShop();
    await new Promise((r) => setTimeout(r, 300));
    const c = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === 'Motor Çapa');
    return { locked: c?.classList.contains('locked'), label: c?.querySelector('.btn.buy')?.textContent };
  });
let c = await card();
ok(c.locked && /12\. İŞ/.test(c.label), `job 11: the tiller locked till job 12 (${c.label})`);
await page.evaluate(() => (window.__game.save.unlocked = 20));
c = await card();
ok(!c.locked && /9\.000 TL/.test(c.label), `on sale (${c.label})`);
await page.evaluate(async () => {
  const el = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === 'Motor Çapa');
  el.querySelector('.btn.buy').click();
  await new Promise((r) => setTimeout(r, 400));
  if (document.getElementById('confirm')?.classList.contains('show')) document.getElementById('btn-confirm-yes').click();
  await new Promise((r) => setTimeout(r, 400));
});
ok(await page.evaluate(() => window.__game.save.equipment.owned.includes('capa')), 'bought');
await shot('1-dukkan');

// ---- A job with tilling asked for.
await page.evaluate(async () => {
  const g = window.__game;
  const t = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/game/tiller.ts')) ?? '/src/game/tiller.ts');
  t.TILL.chance = 1;
  const cow = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/game/config.ts')) ?? '/src/game/config.ts');
  cow.COW.chance = 0;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(16));
});
await page.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(1500);
let t = await task();
ok(!!t && t.n > 20, `job 16: tilling asked for (${t && `${t.kind}, ${t.n} cells`})`);
const told = await page.evaluate(() => document.getElementById('toasts').innerText);
ok(/çapalamanı istiyor/.test(told), `told at the start: ${told}`);
// The trimmer put away, by the vehicle: ÇAPAYI AL.
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  s.intro = null;
  s.hasTrimmer = false;
  const v = s.field.vehicle;
  s.x = v.x + 1.6;
  s.z = v.z;
});
await sleep(500);
let a = await acts();
ok(a.includes('tiller'), `by the vehicle: ÇAPAYI AL (${a.join(',')})`);
await press('tiller');
await sleep(400);
let u = { starter: await vis('starter'), prime: await vis('btn-prime'), gas: await vis('gas-btn'), bump: await vis('btn-bump') };
ok(u.starter && !u.prime && !u.gas && !u.bump, `in hand: its starter (no primer), no trigger yet, no MİSİNA (${JSON.stringify(u)})`);
await page.click('#btn-choke');
await sleep(200);
await pull();
await pull();
await page.click('#btn-choke');
await sleep(200);
await pull();
await sleep(300);
u = { running: await page.evaluate(() => window.__game.tillRunning), gas: await vis('gas-btn'), stop: await vis('btn-stop') };
ok(u.running && u.gas && u.stop, `started on choke and cord: the trigger and STOP (${JSON.stringify(u)})`);

// The tiller ahead of the worker, seen from the side, its tines turning.
await page.keyboard.down('Space');
const me = await page.evaluate(() => { const s = window.__game.session; s.yaw = 0; window.__game.lookYaw = 0; return { x: s.x, z: s.z }; });
await look('1b-capa-elde', { x: me.x + 3.4, y: 1.3, z: me.z + 1.4, tx: me.x, ty: 0.6, tz: me.z + 1.2 });
await page.keyboard.up('Space');

// ---- To the plot: ticking over nothing; on the throttle the soil turns over.
const go = (i) =>
  page.evaluate(async (i) => {
    const g = window.__game;
    const s = g.session;
    const t = g.tillTask;
    const { TILLER_AHEAD } = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/render/tiller.ts')) ?? '/src/render/tiller.ts');
    const ahead = TILLER_AHEAD + (g.view.tiller?.tinesAhead ?? 0.18);
    const c = t.cells[i % t.cells.length];
    // Facing along z, the tines over the cell.
    s.yaw = 0;
    g.lookYaw = 0;
    s.x = c.x;
    s.z = c.z - ahead;
  }, i);
await go(0);
await sleep(1500);
t = await task();
ok(t.some === 0, `ticking over: nothing tilled (${t.some})`);
await page.keyboard.down('Space');
// (A moment on the throttle where it stands first.)
await go(0);
await sleep(400);
for (let i = 0; i < 40; i++) {
  await go(i * 3);
  await sleep(400);
}
t = await task();
ok(t.done > 5, `on the throttle: cells tilled (${t.done}/${t.n})`);
await shot('2-capalarken');
await page.keyboard.up('Space');
const at = await page.evaluate(() => {
  const g = window.__game;
  const c = g.tillTask.cells[0];
  return { x: c.x, z: c.z };
});
await look('3-kabaran-toprak', { x: at.x + 4, y: 2.4, z: at.z + 4, tx: at.x, ty: 0, tz: at.z - 1 });
// ---- Most of it done (the rest done at once), the job finished: paid.
await page.evaluate(() => window.__game.tillTask.cells.forEach((c) => (c.t = 1)));
await sleep(600);
await look('4-bitmis', { x: at.x + 5, y: 3, z: at.z + 5, tx: at.x, ty: 0, tz: at.z - 1 });
const m0 = await page.evaluate(() => window.__game.save.money);
await page.evaluate(() => {
  const f = window.__game.session.field;
  f.mownCount = f.total;
  window.__game.finish();
});
await sleep(800);
const res = await page.evaluate(() => document.getElementById('result-table').innerText.replace(/\s+/g, ' '));
ok(/çapası \+\d+ TL/.test(res), `the result: ${res.slice(res.indexOf('çapası') - 10, res.indexOf('çapası') + 20)}`);
await shot('5-sonuc');
ok(!errors.length, `no page errors or missing files${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await browser.close();
process.exit(bad ? 1 : 0);
