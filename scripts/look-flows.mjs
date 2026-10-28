// Dev: the game's flows end to end, as a player taps through them (the real buttons; the browser's own
// stand-in for a rewarded ad watched to the end): every reward checked as given.
//   1. A mown field grown back by an ad, from the map: its card, KABUL ET, the job with its grass.
//   2. A job finished: the result, double the pay by an ad.
//   3. Out of fuel in the field: the tank filled by an ad.
//   4. The engine overheated: cooled by an ad.
//   5. The daily reward, doubled by an ad.
//   6. The shop: the patos bought and hitched (the trailer off), then the trailer back.
//   7. Fındık Harmanı: started from its card; the drying hurried by two ads; between harvests started
//      at once, bought (the browser's stand-in purchase).
//   8. A job from the map's card, and the next one from its result (driven to, opened at its gate).
// Shots in test-output/flows; OK / FAIL per check. Usage (dev server running): node scripts/look-flows.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/flows';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-flows-${Date.now()}` });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
// The browser's stand-in purchase asks "Deneme satın alımı": yes.
let buyAnswer = true;
p.on('dialog', (d) => void (buyAnswer ? d.accept() : d.dismiss()));
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const shown = (id) => p.evaluate((id) => document.getElementById(id)?.classList.contains('show'), id);
const click = (sel) => p.evaluate((sel) => document.querySelector(sel)?.click(), sel);
const money = () => p.evaluate(() => window.__game.save.money);
/** A rewarded ad watched to the end (the stand-in counts down 3 s). */
const watchAd = async () => {
  await p.waitForFunction('document.getElementById("ad").classList.contains("show")', { timeout: 5000 });
  await p.waitForFunction('!document.getElementById("ad").classList.contains("show")', { timeout: 15000 });
  await sleep(500);
};
await p.goto(`${base}?quality=low`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
/** The menu, fresh: progress as given. */
const menu = (extra = {}, keep = false) =>
  p.evaluate((extra, keep) => {
    const g = window.__game;
    if (g.mode !== 'menu') g.quitToMenu();
    Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20, harvestOffered: 99, weather: 'sunny', money: 100000, daily: { last: new Date().toISOString().slice(0, 10), streak: 1 } }, extra);
    g.levelTab = 1;
    g.showMenu();
    if (!keep) document.querySelectorAll('.screen.dim').forEach((x) => x.classList.remove('show'));
  }, extra, keep);
/** A job, started and the trimmer in hand in its field. */
const inField = async (id) => {
  await menu();
  await p.evaluate((id) => {
    const g = window.__game;
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.start(g.levelById(id));
  }, id);
  await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
  await sleep(700);
  await p.evaluate(() => {
    const s = window.__game.session;
    s.intro = null;
    s.hasTrimmer = true;
    s.broken = false;
    s.line = s.gear.lineMax;
    s.x = 0;
    s.z = s.field.depth / 2 - 3;
  });
  await sleep(300);
};

// ---- 1. Grown back by an ad.
console.log('\n1. Biçilmiş bahçeyi reklamla büyütme');
await menu({ mownAt: { 1: Date.now() } });
await click('#btn-play');
await sleep(1000);
await p.evaluate(() => [...document.querySelectorAll('.saga-node')].find((n) => n.querySelector('.sn-disc b')?.textContent.trim() === '1')?.click());
await sleep(600);
ok(await shown('regrow'), 'a mown field: "Ot daha bağlamadı" with its ad');
await shot('1a-regrow');
await click('#btn-regrow-ad');
await watchAd();
const mown = await p.evaluate(() => window.__game.save.mownAt?.[1]);
ok(mown === undefined, `the ad watched: the field grown back (mownAt ${mown})`);
ok(await shown('call'), 'then its card');
await click('#btn-call-ok');
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(1200);
const grass = await p.evaluate(() => {
  const f = window.__game.session.field;
  let tall = 0;
  let cells = 0;
  for (let k = 0; k < f.grass.length; k++) if (f.mask[k]) {
    cells++;
    if (f.grass[k] > 0.3) tall++;
  }
  return { level: window.__game.session.level.id, coverage: f.coverage, tall: tall / cells };
});
ok(grass.level === 1 && grass.coverage < 0.01 && grass.tall > 0.95, `the job with its grass grown: ${JSON.stringify(grass)}`);
await shot('1b-grown');

// ---- 2. Double the pay.
console.log('\n2. Kazancı reklamla ikiye katlama');
await inField(2);
await p.evaluate(() => (window.__game.session.field.mownCount = window.__game.session.field.total));
await p.waitForFunction('document.getElementById("result").classList.contains("show")', { timeout: 20000 });
await sleep(500);
const r2 = await p.evaluate(() => window.__game.lastResult.total);
const m2 = await money();
await click('#btn-ad-double');
await watchAd();
const m2b = await money();
ok(m2b - m2 === r2, `the pay doubled: +${m2b - m2} TL (the job paid ${r2})`);
await shot('2-doubled');

// ---- 3. Fuel by an ad.
console.log('\n3. Benzin bitti: reklamla doldurma');
await inField(2);
await p.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  s.fuel = 0;
  s.running = false;
  g.updateStarterUi();
});
await sleep(600);
const fuelBox = await p.evaluate(() => getComputedStyle(document.getElementById('fuel-out')).display !== 'none');
ok(fuelBox, 'out of fuel: "Benzin bitti" with its ad');
await click('#btn-ad-fuel');
await watchAd();
const fuel = await p.evaluate(() => window.__game.session.fuel / window.__game.session.gear.tank);
ok(fuel > 0.99, `the tank filled (${Math.round(fuel * 100)}%)`);

// ---- 4. Cooled by an ad.
console.log('\n4. Motor hararet yaptı: reklamla soğutma');
await p.evaluate(() => {
  const s = window.__game.session;
  s.overheated = true;
  s.temp = 1;
  s.running = false;
});
await sleep(600);
ok(await p.evaluate(() => getComputedStyle(document.getElementById('overheat')).display !== 'none'), 'overheated: its card with the ad');
await click('#btn-ad-cool');
await watchAd();
const cool = await p.evaluate(() => ({ over: window.__game.session.overheated, temp: window.__game.session.temp }));
ok(!cool.over, `cooled: ${JSON.stringify(cool)}`);

// ---- 5. Daily reward doubled.
console.log('\n5. Günlük ödül: reklamla iki katı');
await menu({ daily: { last: '2000-01-01', streak: 0 } }, true);
await sleep(400);
ok(await shown('daily'), 'the daily reward shown');
const amount = await p.evaluate(() => window.__game.dailyAmount);
const m5 = await money();
await click('#btn-daily-ad');
await watchAd();
const m5b = await money();
ok(m5b - m5 === amount * 2, `doubled: +${m5b - m5} TL (the day's ${amount})`);

// ---- 6. The shop's patos and trailer.
console.log('\n6. Dükkân: patos al, tak; römorku geri tak');
await menu({ vehicles: ['patpat', 'traktor', 'romork'], vehicle: 'traktor', patosOn: false, trailerOff: false });
await p.evaluate(() => {
  const g = window.__game;
  g.shopTab = 'arac';
  g.openShop();
});
await sleep(600);
const buyCard = (name) =>
  p.evaluate((name) => {
    const c = [...document.querySelectorAll('#shop-list .shop-card')].find((x) => x.querySelector('b')?.textContent === name);
    c?.querySelector('.buy')?.click();
    return c?.querySelector('.buy')?.textContent;
  }, name);
const m6 = await money();
await buyCard('Patos');
await sleep(500);
await click('#btn-confirm-yes');
await sleep(800);
let v6 = await p.evaluate(() => ({ owned: window.__game.save.vehicles, patosOn: window.__game.save.patosOn, trailerOff: window.__game.save.trailerOff }));
ok(v6.owned.includes('patos') && v6.patosOn && v6.trailerOff, `the patos bought and hitched, the trailer off: ${JSON.stringify(v6)}`);
ok(m6 - (await money()) === 45000, `paid 45.000 TL (${m6 - (await money())})`);
await buyCard('Römork');
await sleep(800);
v6 = await p.evaluate(() => ({ patosOn: window.__game.save.patosOn, trailerOff: window.__game.save.trailerOff }));
ok(!v6.patosOn && !v6.trailerOff, `the trailer back on, the patos off: ${JSON.stringify(v6)}`);
await shot('6-shop');

// ---- 7. The harvest.
console.log('\n7. Fındık Harmanı');
await menu({ vehicles: ['patpat', 'traktor', 'romork', 'patos'], harvest: undefined });
await click('#btn-harvest');
await sleep(500);
await click('#harvest-body .hv-go');
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
ok((await p.evaluate(() => window.__game.save.harvest?.stage)) === 'collect', 'HASADI BAŞLAT: the sacks out');
await p.evaluate(() => {
  const h = window.__game.save.harvest;
  h.stage = 'drying';
  h.until = Date.now() + 24 * 3600e3;
  h.ads = 0;
  h.spread = 16;
  h.waiting = {};
});
await menu();
await click('#btn-harvest');
await sleep(500);
for (let i = 0; i < 2; i++) {
  await click('#harvest-body .btn.ad');
  await watchAd();
  await sleep(300);
}
ok((await p.evaluate(() => window.__game.save.harvest.stage)) === 'thresh', `two ads: dried (${await p.evaluate(() => window.__game.save.harvest.stage)})`);
await p.evaluate(() => {
  const h = window.__game.save.harvest;
  Object.assign(h, { stage: 'rest', next: Date.now() + 40 * 3600e3, waiting: {}, spread: 0, load: 0, until: undefined });
});
await menu();
await click('#btn-harvest');
await sleep(500);
await click('#harvest-body .btn.gold');
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 }).catch(() => {});
ok((await p.evaluate(() => window.__game.save.harvest?.stage)) === 'collect', `HEMEN BAŞLAT bought: a new harvest (${await p.evaluate(() => window.__game.save.harvest?.stage)})`);

// ---- 8. A job from the map, and the next one from its result.
console.log('\n8. Haritadan iş, sonucundan sonraki bahçe');
await menu({ mownAt: {} });
await click('#btn-play');
await sleep(1000);
await p.evaluate(() => [...document.querySelectorAll('.saga-node')].find((n) => n.querySelector('.sn-disc b')?.textContent.trim() === '4')?.click());
await sleep(600);
ok(await shown('call'), 'the job 4 card');
await click('#btn-call-ok');
await p.waitForFunction('window.__game.mode === "playing" && window.__game.session.level.id === 4', { timeout: 60000 });
ok(true, 'KABUL ET: job 4 started');
await p.evaluate(() => {
  const s = window.__game.session;
  s.intro = null;
  s.hasTrimmer = true;
  s.field.mownCount = s.field.total;
});
await p.waitForFunction('document.getElementById("result").classList.contains("show")', { timeout: 20000 });
await click('#btn-next');
await sleep(1000);
await click('#btn-call-ok');
await sleep(1200);
const t8 = await p.evaluate(() => ({ level: window.__game.session.level.id, to: window.__game.travelTo?.id }));
ok(t8.level === 4 && t8.to === 5, `SONRAKİ BAHÇE: on the way from 4 to 5 (${JSON.stringify(t8)})`);
await p.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  s.hasTrimmer = false;
  const gp = g.gatePoint(s, g.travelTo);
  Object.assign(s.field.vehicle, { x: gp.x, z: gp.z + 4, speed: 0 });
});
await p.waitForFunction('window.__game.mode === "playing" && window.__game.session.level.id === 5', { timeout: 60000 });
ok(true, 'at its gate: job 5 opened');

// ---- 9. A purchase that does not go through: said so.
console.log('\n9. Satın alma olmazsa');
await p.evaluate(() => Object.assign(window.__game.save.harvest, { stage: 'rest', next: Date.now() + 40 * 3600e3 }));
await menu();
await click('#btn-harvest');
await sleep(500);
buyAnswer = false;
await click('#harvest-body .btn.gold');
await sleep(800);
const n9 = await p.evaluate(() => ({ shown: document.getElementById('confirm').classList.contains('show'), title: document.getElementById('confirm-title').textContent, stage: window.__game.save.harvest.stage }));
ok(n9.shown && /olmadı/.test(n9.title) && n9.stage === 'rest', `cancelled: "${n9.title}", the harvest still waiting (${n9.stage})`);
await shot('9-failed');

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await b.close();
process.exit(bad ? 1 : 0);
