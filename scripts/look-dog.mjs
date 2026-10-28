// Dev: Karabaş, the yard's dog: adopted free in the shop (Köy › Avlu) once the kennel is bought (before
// it, the card locked); then in both villages, by the worker at the start of a job, at
// heel as he walks off, round about while the trimmer runs, behind the pat pat as it drives; a hidden
// snake it comes upon found and sent off (barking, a message) before the worker gets there. Shots in
// test-output/dog. Usage (dev server running): node scripts/look-dog.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/dog';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-dog-${Date.now()}` });
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
const job = async (id) => {
  await page.evaluate((id) => {
    const g = window.__game;
    if (g.mode === 'playing') g.quitToMenu();
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.start(g.levelById(id));
  }, id);
  await page.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
  await sleep(1200);
};
const dog = () =>
  page.evaluate(() => {
    const g = window.__game;
    const d = g.view.dog;
    const s = g.session;
    return d ? { x: d.x, z: d.z, gap: Math.hypot(d.x - s.x, d.z - s.z), toVehicle: Math.hypot(d.x - s.field.vehicle.x, d.z - s.field.vehicle.z), chase: !!d.chase } : null;
  });
/** Seen from behind and above the worker, the dog in view. */
const look = async (n) => {
  await page.evaluate(() => {
    const g = window.__game;
    const s = g.session;
    const d = g.view.dog;
    const f = s.field;
    // Above and behind the dog (clear of walls and roofs), looking down at it and on to the worker.
    const mx = d.x * 0.7 + s.x * 0.3;
    const mz = d.z * 0.7 + s.z * 0.3;
    const cx = d.x - Math.sin(d.yaw) * 4.5;
    const cz = d.z - Math.cos(d.yaw) * 4.5;
    const cy = f.height(cx, cz) + 3.6;
    const ty = f.height(mx, mz) + 0.5;
    const dd = { x: mx - cx, y: ty - cy, z: mz - cz };
    g.view.freeCam = { x: cx, y: cy, z: cz, yaw: Math.atan2(dd.x, dd.z), pitch: Math.asin(dd.y / Math.hypot(dd.x, dd.y, dd.z)) };
  });
  await sleep(900);
  await shot(n);
  await page.evaluate(() => (window.__game.view.freeCam = null));
};

await page.goto(`${base}?quality=high`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  Object.assign(g.save, { introDone: true, tutorialSeen: true, harvestOffered: 99, unlocked: 20, weather: 'sunny', vehicle: 'patpat', decor: [], decorOff: [] });
  delete g.save.dog;
});
/** The shop's Avlu part: Karabaş's card (its button, locked or not). */
const dogCard = () =>
  page.evaluate(async () => {
    const g = window.__game;
    g.shopTab = 'koy';
    g.koyPart = 'avlu';
    g.shopNote = null;
    g.openShop();
    await new Promise((r) => setTimeout(r, 300));
    const c = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === 'Karabaş');
    return { label: c?.querySelector('.btn.buy')?.textContent, locked: c?.classList.contains('locked'), pic: !!c?.querySelector('img') };
  });
const tapDog = () =>
  page.evaluate(async () => {
    const c = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === 'Karabaş');
    c.querySelector('.btn.buy').click();
    await new Promise((r) => setTimeout(r, 400));
    return { dog: !!window.__game.save.dog, note: document.getElementById('shop-note').textContent };
  });

// ---- No kennel: its card locked, no dog.
let card = await dogCard();
ok(card.locked && card.label === 'ÖNCE KULÜBE' && card.pic, `no kennel: Karabaş's card locked, ÖNCE KULÜBE (${JSON.stringify(card)})`);
let tap = await tapDog();
ok(!tap.dog && /Köpek Kulübesi/.test(tap.note), `tapped: not his yet, the kennel first (${tap.note})`);
await page.screenshot({ path: `${OUT}/0-dukkan-kilitli.png` });
await job(2);
ok((await dog()) === null, 'no dog in a job');

// ---- The kennel bought: SAHİPLEN, free.
const money0 = await page.evaluate(() => {
  window.__game.save.decor = ['kulube'];
  return window.__game.save.money;
});
card = await dogCard();
ok(!card.locked && card.label === 'SAHİPLEN', `the kennel bought: SAHİPLEN (${card.label})`);
tap = await tapDog();
ok(tap.dog && (await page.evaluate(() => window.__game.save.money)) === money0, `adopted, nothing paid (${tap.note})`);
card = await dogCard();
ok(card.label === 'SENİN', `his card says SENİN (${card.label})`);
await page.screenshot({ path: `${OUT}/0-dukkan-sahiplen.png` });
await page.evaluate(() => window.__game.applyLook());
// In Yeşilyamaç too.
await job(2);
ok(!!(await dog()), 'Yeşilyamaç: Karabaş comes along');
await look('0-yesilyamac');
await job(15);
let d = await dog();
ok(!!d && d.gap < 8, `with the kennel: the dog by the worker at the start (${d && d.gap.toFixed(1)} m)`);
ok(await page.evaluate(() => !!window.__game.models.dog?.[0]?.animations?.length), 'its walk loaded');
await look('1-baslangic');
// At heel: the worker walks off; the dog follows.
await page.evaluate(() => {
  const s = window.__game.session;
  s.intro = null;
  s.hasTrimmer = false;
});
for (let k = 0; k < 6; k++) {
  await page.evaluate(() => {
    const s = window.__game.session;
    const nx = s.x + Math.sin(s.yaw) * 1.5;
    const nz = s.z + Math.cos(s.yaw) * 1.5;
    if (s.field.pointFree(nx, nz)) {
      s.x = nx;
      s.z = nz;
    } else s.yaw += 1;
  });
  await sleep(500);
}
await sleep(2500);
d = await dog();
ok(d.gap < 6, `at heel after a walk (${d.gap.toFixed(1)} m behind)`);
await look('2-pesinde');
// The pat pat driven off: it runs behind.
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const v = s.field.vehicle;
  s.x = v.x + 1.5;
  s.z = v.z;
  s.board();
});
await sleep(400);
for (let k = 0; k < 20; k++) {
  await page.evaluate(() => {
    const s = window.__game.session;
    const v = s.field.vehicle;
    const nx = v.x + Math.sin(v.yaw) * 0.6;
    const nz = v.z + Math.cos(v.yaw) * 0.6;
    if (s.field.vehicleFits(nx, nz, v.yaw)) Object.assign(v, { x: nx, z: nz });
    else v.yaw += 0.3;
  });
  await sleep(150);
}
await sleep(2000);
d = await dog();
ok(d.toVehicle < 10, `driving: the dog behind the pat pat (${d.toVehicle.toFixed(1)} m)`);
await page.evaluate(() => window.__game.session.alight());
await sleep(500);

// ---- A hidden snake: the dog finds it first.
const snake = await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const sn = s.field.snakes.find((q) => q.state === 'hidden');
  if (!sn) return null;
  // The worker well off; the dog let loose a few metres from it.
  const d = g.view.dog;
  d.x = sn.x + 6;
  d.z = sn.z;
  s.x = sn.x + 14;
  s.z = sn.z;
  s.yaw = -Math.PI / 2;
  g.lookYaw = s.yaw;
  return { x: sn.x, z: sn.z };
});
ok(!!snake, 'job 15 has a hidden snake');
if (snake) {
  // Called over to it (walking at heel, it comes this way).
  await page.evaluate((sn) => {
    const g = window.__game;
    g.view.dog.x = sn.x + 3.2;
    g.view.dog.z = sn.z;
  }, snake);
  await sleep(600);
  const st = await page.evaluate(() => ({ fled: window.__game.session.field.snakes.some((q) => q.state === 'flee'), toast: document.getElementById('toasts').innerText, scared: window.__game.session.scared }));
  d = await dog();
  ok(st.fled && d.chase && /Karabaş yılanı buldu/.test(st.toast), `the dog finds the snake: it flees, the dog after it (${st.toast})`);
  ok(!st.scared, 'the worker not frightened');
  await look('3-yilan');
}
ok(!errors.length, `no page errors or missing files${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await browser.close();
process.exit(bad ? 1 : 0);
