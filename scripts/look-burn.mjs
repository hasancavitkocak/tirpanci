// Dev: the cut grass blown together and burned: the blower locked in the shop before its job, bought; a
// job whose owner wants it (told at the start); the tufts showing as the grass is mown; ÜFLEYİCİYİ AL at the
// vehicle (the trimmer put away), started on its cord, worn on the back; on the throttle the tufts blow
// along into the heap's place; enough in: YAK, flames and smoke; paid at the end. Shots in test-output/burn.
// Usage (dev server running): node scripts/look-burn.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/burn';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-burn-${Date.now()}` });
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
const vis = (id) => page.evaluate((id) => {
  const e = document.getElementById(id);
  return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
}, id);
const state = () => page.evaluate(() => {
  const t = window.__game.burnTask;
  return t ? { n: t.tufts.length, shown: t.tufts.filter((q) => q.shown).length, heaped: t.tufts.filter((q) => q.heaped).length, lit: t.lit } : null;
});
/** The game's own module (after a change the server hands it out with a ?t= on its address). */
const mod = (path) => `import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('${path}')) ?? '${path}')`;
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
  Object.assign(g.save, { introDone: true, tutorialSeen: true, harvestOffered: 99, unlocked: 7, weather: 'sunny', vehicle: 'patpat' });
  g.save.equipment.owned = g.save.equipment.owned.filter((x) => x !== 'ufleyici');
});

// ---- The shop: locked before job 8, then bought.
const card = () =>
  page.evaluate(async () => {
    const g = window.__game;
    g.shopTab = 'donanim';
    g.shopNote = null;
    g.openShop();
    await new Promise((r) => setTimeout(r, 300));
    const c = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === 'Üfleme Makinesi');
    return { locked: c?.classList.contains('locked'), label: c?.querySelector('.btn.buy')?.textContent };
  });
let c = await card();
ok(c.locked && /8\. İŞ/.test(c.label), `job 7: the blower locked till job 8 (${c.label})`);
await page.evaluate(() => (window.__game.save.unlocked = 20));
c = await card();
ok(!c.locked && /6\.000 TL/.test(c.label), `on sale (${c.label})`);
await page.evaluate(async () => {
  const el = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === 'Üfleme Makinesi');
  el.querySelector('.btn.buy').click();
  await new Promise((r) => setTimeout(r, 400));
  if (document.getElementById('confirm')?.classList.contains('show')) document.getElementById('btn-confirm-yes').click();
  await new Promise((r) => setTimeout(r, 400));
});
ok(await page.evaluate(() => window.__game.save.equipment.owned.includes('ufleyici')), 'bought');

// ---- A job with the burning asked for.
await page.evaluate(new Function(`return (async () => {
  const g = window.__game;
  (await ${mod('/src/game/burn.ts')}).BURN.chance = 1;
  (await ${mod('/src/game/tiller.ts')}).TILL.chance = 0;
  (await ${mod('/src/game/config.ts')}).COW.chance = 0;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(9));
})()`));
await page.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(1500);
let st = await state();
ok(!!st && st.n > 50 && st.shown === 0, `job 9: the burning asked for, the tufts hidden till mown (${JSON.stringify(st)})`);
const told = await page.evaluate(() => document.getElementById('toasts').innerText);
ok(/ek iş: .*otu üfleyip yak \(\+/.test(told), `told at the start: ${told}`);
// Mown: the tufts show.
await page.evaluate(async () => {
  const f = window.__game.session.field;
  for (let k = 0; k < f.grass.length; k++) if (f.grass[k] > 0) f.grass[k] = 0.12;
});
await sleep(3000);
st = await state();
ok(st.shown > st.n * 0.8, `mown: the tufts show (${st.shown}/${st.n})`);
// The trimmer put away, by the vehicle: ÜFLEYİCİYİ AL, started.
await page.evaluate(() => {
  const s = window.__game.session;
  s.intro = null;
  s.hasTrimmer = false;
  const v = s.field.vehicle;
  s.x = v.x + 1.6;
  s.z = v.z;
});
await sleep(500);
let a = await acts();
ok(a.includes('bag'), `by the vehicle: BAGAJ (${a.join(',')})`);
await press('bag');
await sleep(300);
await page.evaluate(() => document.querySelector('#confirm .bag-tool[data-tool="blower"]').click());
await sleep(400);
ok((await vis('starter')) && !(await vis('btn-prime')) && !(await vis('btn-bump')), 'worn: its starter (no primer), no MİSİNA');
await page.click('#btn-choke');
await sleep(200);
await pull();
await pull();
await page.click('#btn-choke');
await sleep(200);
await pull();
await sleep(300);
ok((await page.evaluate(() => window.__game.blowerRunning)) && (await vis('gas-btn')), 'started on choke and cord: the trigger');

// ---- Blowing: behind a tuft, facing the heap, on the throttle.
const behind = (i) =>
  page.evaluate((i) => {
    const g = window.__game;
    const s = g.session;
    const t = g.burnTask;
    const q = t.tufts.filter((u) => u.shown && !u.heaped)[i];
    if (!q) return null;
    const yaw = Math.atan2(t.heap.x - q.x, t.heap.z - q.z);
    s.yaw = yaw;
    g.lookYaw = yaw;
    s.x = q.x - Math.sin(yaw) * 2.6 + Math.cos(yaw) * 0.25;
    s.z = q.z - Math.cos(yaw) * 2.6 - Math.sin(yaw) * 0.25;
    return { x: q.x, z: q.z, d: Math.hypot(t.heap.x - q.x, t.heap.z - q.z) };
  }, i);
const h0 = (await state()).heaped;
await page.keyboard.down('Space');
await behind(0);
await sleep(600);
await shot('1-uflerken');
for (let i = 0; i < 6; i++) {
  await behind(0);
  await sleep(900);
}
await page.keyboard.up('Space');
st = await state();
ok(st.heaped > h0, `blown along: tufts into the heap (${h0} → ${st.heaped})`);
const me = await page.evaluate(() => ({ x: window.__game.session.x, z: window.__game.session.z }));
await look('2-sirtta', { x: me.x + 2.8, y: 1.5, z: me.z - 1.2, tx: me.x, ty: 1.0, tz: me.z });
// ---- All in (the rest at once): YAK.
await page.evaluate(() => window.__game.burnTask.tufts.forEach((q) => (q.heaped = true)));
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const h = g.burnTask.heap;
  s.x = h.x + 3.6;
  s.z = h.z;
});
await sleep(600);
a = await acts();
ok(a.includes('burn'), `by the heap, enough in: YAK (${a.join(',')})`);
await press('burn');
await sleep(2500);
st = await state();
ok(st.lit > 0, `lit (${st.lit?.toFixed(1)} s)`);
const h = await page.evaluate(() => window.__game.burnTask.heap);
await look('3-ates', { x: h.x + 6, y: 2.2, z: h.z + 4, tx: h.x, ty: 0.8, tz: h.z });
await page.evaluate(() => {
  const f = window.__game.session.field;
  f.mownCount = f.total;
  window.__game.finish();
});
await sleep(800);
const res = await page.evaluate(() => document.getElementById('result-table').innerText.replace(/\s+/g, ' '));
ok(/Ot yakma \+450 TL/.test(res), `the result: ${res.slice(res.indexOf('Ot yakma'), res.indexOf('Ot yakma') + 20)}`);
ok(!errors.length, `no page errors or missing files${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await browser.close();
process.exit(bad ? 1 : 0);
