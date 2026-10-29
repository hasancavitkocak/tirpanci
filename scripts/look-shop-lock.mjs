// Dev: the shop's things for later on are not on sale to a beginner: the tractor (job 6), the trailer and
// the patos (job 11, with the harvest), the Usta and Sırt machines (jobs 3 and 7). A locked card shows
// its padlock and job; tapped it says so and takes no money; once the job is open it is on sale; one
// already bought is never locked.
// Usage (dev server running): node scripts/look-shop-lock.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
mkdirSync('test-output/shop-lock', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-shop-lock-${Date.now()}` });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('dialog', (d) => d.accept());
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
await p.goto(`${base}?locked&quality=low`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });

// Open a shop tab with the save as given; the cards as { name, label, locked }.
const shop = (tab, save) =>
  p.evaluate(
    async (tab, save) => {
      const g = window.__game;
      Object.assign(g.save, { introDone: true, tutorialSeen: true, harvestOffered: 99 }, save);
      g.shopNote = null;
      g.shopTab = tab;
      g.openShop();
      await new Promise((r) => setTimeout(r, 300));
      return [...document.querySelectorAll('.shop-card')].map((c) => ({ name: c.querySelector('b')?.textContent ?? '', label: c.querySelector('.btn.buy')?.textContent ?? '', locked: c.classList.contains('locked') }));
    },
    tab,
    save,
  );
const card = (cards, name) => cards.find((c) => c.name === name) ?? { label: '?', locked: false };
const tapCard = (name) =>
  p.evaluate(async (name) => {
    const c = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === name);
    c.querySelector('.btn.buy').click();
    await new Promise((r) => setTimeout(r, 400));
    // A price asks first (the game's own card): yes.
    if (document.getElementById('confirm')?.classList.contains('show')) {
      document.getElementById('btn-confirm-yes').click();
      await new Promise((r) => setTimeout(r, 400));
    }
    const n = document.querySelector('.shop-note');
    return { note: n && n.style.display !== 'none' ? n.textContent : '', money: window.__game.save.money, vehicles: [...(window.__game.save.vehicles ?? [])], owned: [...window.__game.save.equipment.owned] };
  }, name);

// ---- A beginner (job 1 open).
let cards = await shop('arac', { unlocked: 1, vehicles: ['patpat'], vehicle: 'patpat', money: 50000 });
await p.screenshot({ path: 'test-output/shop-lock/1-arac-yeni.png' });
ok(card(cards, 'Traktör').locked && /6\. İŞ/.test(card(cards, 'Traktör').label), `job 1: Traktör locked till job 6 (${card(cards, 'Traktör').label})`);
ok(card(cards, 'Römork').locked && /11\. İŞ/.test(card(cards, 'Römork').label), `job 1: Römork locked till job 11 (${card(cards, 'Römork').label})`);
ok(card(cards, 'Patos').locked && /11\. İŞ/.test(card(cards, 'Patos').label), `job 1: Patos locked till job 11 (${card(cards, 'Patos').label})`);
ok(!card(cards, 'Patpat').locked, 'the pat pat is never locked');
const before = await p.evaluate(() => window.__game.save.money);
let r = await tapCard('Traktör');
ok(/6\. işe gelince/.test(r.note), `tapped: it says when (${r.note})`);
ok(r.money === before && !r.vehicles.includes('traktor'), `no money taken, nothing bought (${before} → ${r.money}, ${r.vehicles})`);
await p.screenshot({ path: 'test-output/shop-lock/2-arac-kilit-notu.png' });
cards = await shop('tirpan', { unlocked: 1 });
ok(card(cards, 'Usta 43cc').locked && /3\. İŞ/.test(card(cards, 'Usta 43cc').label), `job 1: Usta 43cc locked till job 3 (${card(cards, 'Usta 43cc').label})`);
ok(card(cards, 'Sırt Motoru 52cc').locked && /7\. İŞ/.test(card(cards, 'Sırt Motoru 52cc').label), `job 1: Sırt Motoru locked till job 7 (${card(cards, 'Sırt Motoru 52cc').label})`);
ok(!card(cards, 'Emektar 33cc').locked, 'the old machine is never locked');
r = await tapCard('Usta 43cc');
ok(!r.owned.includes('usta') && /3\. işe gelince/.test(r.note), `tapped Usta: not bought, says when (${r.note})`);
cards = await shop('misina', { unlocked: 1 });
ok(!cards.some((c) => c.locked), 'the line types are all on sale from the start');

// ---- Job 3 and 6 open: on sale; bought for real.
cards = await shop('tirpan', { unlocked: 3, money: 50000 });
ok(!card(cards, 'Usta 43cc').locked && /TL/.test(card(cards, 'Usta 43cc').label), `job 3: Usta on sale (${card(cards, 'Usta 43cc').label})`);
ok(card(cards, 'Sırt Motoru 52cc').locked, 'job 3: Sırt still locked');
cards = await shop('arac', { unlocked: 6, money: 50000 });
ok(!card(cards, 'Traktör').locked && /30\.000 TL/.test(card(cards, 'Traktör').label), `job 6: Traktör on sale (${card(cards, 'Traktör').label})`);
ok(card(cards, 'Patos').locked, 'job 6: Patos still locked (harvest at 11)');
r = await tapCard('Traktör');
ok(r.vehicles.includes('traktor'), `job 6: Traktör bought (${r.vehicles})`);
cards = await shop('arac', { unlocked: 11 });
ok(!card(cards, 'Römork').locked && !card(cards, 'Patos').locked, `job 11: Römork and Patos on sale (${card(cards, 'Römork').label}, ${card(cards, 'Patos').label})`);
await p.screenshot({ path: 'test-output/shop-lock/3-arac-11.png' });

// ---- Bought before the locks came in (an old save): still there, never locked.
cards = await shop('arac', { unlocked: 2, vehicles: ['patpat', 'traktor', 'romork'], vehicle: 'traktor' });
ok(!card(cards, 'Traktör').locked && !card(cards, 'Römork').locked, `an old save's tractor and trailer stay usable at job 2 (${card(cards, 'Traktör').label}, ${card(cards, 'Römork').label})`);
ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await b.close();
process.exit(bad ? 1 : 0);
