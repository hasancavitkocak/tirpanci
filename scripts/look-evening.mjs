// Dev: the evening's cows: the menu's Akşam button (once Karadere is open, ready once a day); into Karadere
// of a late afternoon, four cows out round the village; the dark falling, the lamps and the head torch
// coming on; a cow driven from behind goes to the barn's door and in; all home, the pay, the button says
// REKLAMLA, one more evening for an ad; all home, twice the pay for an ad. Shots in test-output/evening. Usage (dev server running): node scripts/look-evening.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/evening';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-evening-${Date.now()}` });
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
const herd = () => page.evaluate(() => window.__game.view.cows?.herdCount() ?? null);
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

await page.goto(`${base}?quality=high`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  Object.assign(g.save, { introDone: true, tutorialSeen: true, harvestOffered: 99, unlocked: 20, weather: 'sunny', vehicle: 'patpat', decor: ['kulube'], dog: true });
  delete g.save.eveningDay;
  g.showMenu();
  document.querySelectorAll('.screen.dim').forEach((x) => x.classList.remove('show'));
});
await sleep(500);
let btn = await page.evaluate(() => ({ shown: getComputedStyle(document.getElementById('btn-evening')).display !== 'none', chip: document.getElementById('evening-badge').textContent }));
ok(btn.shown && btn.chip === 'HAZIR', `the menu's Akşam button: HAZIR (${JSON.stringify(btn)})`);
await page.click('#btn-evening');
await page.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 90000 });
await sleep(2000);
let h = await herd();
ok(!!h && h.all === 4 && h.home === 0, `Karadere of an evening: four cows out (${JSON.stringify(h)})`);
const told = await page.evaluate(() => document.getElementById('toasts').innerText);
ok(/Akşam oluyor/.test(told), `told: ${told}`);
await shot('1-aksamustu');
// The dark fallen: lamps on, the exposure down.
const exp0 = await page.evaluate(() => window.__game.view.renderer.toneMappingExposure);
await page.evaluate(() => (window.__game.session.time = 220));
await sleep(1200);
const exp1 = await page.evaluate(() => window.__game.view.renderer.toneMappingExposure);
ok(exp1 < exp0, `night falling: darker (${exp0.toFixed(2)} → ${exp1.toFixed(2)})`);
const door = await page.evaluate(() => window.__game.view.cows.door);
await look('2-gece-ahir', { x: door.x + 8, y: 2.2, z: door.z + 8, tx: door.x, ty: 1.5, tz: door.z });
const p = await page.evaluate(() => window.__game.session.field.plateau);
await look('3-gece-avlu', { x: p.x + p.r * 0.6, y: 1.7, z: p.z + p.r * 0.6, tx: p.x, ty: 1.5, tz: p.z });
await shot('4-gece-fpv');
// ---- Driven home: each cow brought near the door, the worker behind it.
for (let i = 0; i < 4; i++) {
  await page.evaluate((i) => {
    const g = window.__game;
    const c = g.view.cows;
    const cow = c.cows.filter((q) => q.role.kind === 'herd')[i].cow;
    const d = c.door;
    const a = Math.atan2(cow.x - d.x, cow.z - d.z);
    // Six metres out from the door, the worker three further out behind it.
    cow.x = d.x + Math.sin(a) * 6;
    cow.z = d.z + Math.cos(a) * 6;
    g.session.x = d.x + Math.sin(a) * 9;
    g.session.z = d.z + Math.cos(a) * 9;
  }, i);
  for (let k = 0; k < 10; k++) {
    // Walking on behind it.
    await page.evaluate((i) => {
      const g = window.__game;
      const c = g.view.cows;
      const q = c.cows.filter((q) => q.role.kind === 'herd')[i];
      if (q.role.phase !== 'out') return;
      const d = c.door;
      const a = Math.atan2(q.cow.x - d.x, q.cow.z - d.z);
      g.session.x = q.cow.x + Math.sin(a) * 3;
      g.session.z = q.cow.z + Math.cos(a) * 3;
    }, i);
    await sleep(500);
  }
}
const money0 = await page.evaluate(() => window.__game.save.money);
await sleep(3000);
h = await herd();
ok(h.home === 4, `driven from behind, in at the barn's door: ${h.home}/${h.all} home`);
// All home: asked to double it for an ad (the game waits under the question).
await page.waitForFunction(() => document.getElementById('confirm').classList.contains('show'), { timeout: 8000 }).catch(() => {});
const q = await page.evaluate(() => ({ open: document.getElementById('confirm').classList.contains('show'), title: document.getElementById('confirm-title').textContent, yes: document.getElementById('btn-confirm-yes').textContent, no: document.getElementById('btn-confirm-no').textContent, mode: window.__game.mode }));
ok(q.open && /inekler ahırda/.test(q.title) && /2 katı/.test(q.yes) && /500 TL al/.test(q.no) && q.mode === 'paused', `all home: the 2x-for-an-ad question (${JSON.stringify(q)})`);
await page.screenshot({ path: `${OUT}/7-iki-kati.png` });
await page.evaluate(() => document.getElementById('btn-confirm-yes').click());
await sleep(800);
ok(await page.evaluate(() => document.getElementById('ad').classList.contains('show')), 'the ad plays');
await page.waitForFunction(() => !document.getElementById('ad').classList.contains('show'), { timeout: 30000 }).catch(() => {});
await sleep(500);
const st = await page.evaluate(() => ({ day: window.__game.save.eveningDay, money: window.__game.save.money, mode: window.__game.mode, no: document.getElementById('btn-confirm-no').textContent }));
ok(!!st.day && st.money - money0 === 1000 && st.mode === 'playing' && st.no === 'Vazgeç', `after the ad: twice the pay, the game on (${st.money - money0} TL, ${st.mode}, no button back to "${st.no}")`);
// Without the ad: the pay as it is.
const m1 = await page.evaluate(() => {
  const g = window.__game;
  void g.payEvening();
  return g.save.money;
});
await sleep(400);
await page.evaluate(() => document.getElementById('btn-confirm-no').click());
await sleep(500);
ok((await page.evaluate(() => window.__game.save.money)) - m1 === 500, 'no ad: 500 TL');
await page.evaluate(() => {
  const g = window.__game;
  g.quitToMenu();
  g.showMenu();
});
await sleep(500);
btn = await page.evaluate(() => document.getElementById('evening-badge').textContent);
ok(btn === 'REKLAMLA', `played today: the button says REKLAMLA (${btn})`);
// One more evening for an ad.
await page.evaluate(() => document.getElementById('btn-evening').click());
await sleep(500);
const q2 = await page.evaluate(() => ({ open: document.getElementById('confirm').classList.contains('show'), text: document.getElementById('confirm-text').textContent, yes: document.getElementById('btn-confirm-yes').textContent }));
ok(q2.open && /bir akşam daha/.test(q2.text), `asked: an ad for one more evening (${q2.yes})`);
await page.screenshot({ path: `${OUT}/8-bir-aksam-daha.png` });
await page.evaluate(() => document.getElementById('btn-confirm-yes').click());
await page.waitForFunction(() => window.__game.mode === 'playing' && window.__game.eveningRun && !document.getElementById('loading').classList.contains('show'), { timeout: 90000 }).catch(() => {});
ok(await page.evaluate(() => window.__game.eveningRun && window.__game.view.herd === 4), 'after the ad: the evening again, four cows out');
ok(!errors.length, `no page errors or missing files${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await browser.close();
process.exit(bad ? 1 : 0);
