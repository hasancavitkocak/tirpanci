// Dev: a new player's journey with the rules on (?rules: job order, shop gates, side-job chances, real
// money), from a fresh save through Yeşilyamaç and Karadere's twenty jobs, each taken the way a player
// does it (BAHÇEYE GİT, the map's next job, its card, mown, İŞİ BİTİR, the result, Ana Menü). After every
// job: the next one open and the one after locked, Karadere shut until Yeşilyamaç is done, the shop's
// "N. İŞ" locks lifting at their job, the coffee house, the harvest and the evening opening at theirs, no
// side job before its job, the money only what was earned. The money against the shop's prices is printed
// as it goes (can a player afford the next thing?). Usage (dev server running): node scripts/look-journey.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/journey';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-journey-${Date.now()}` });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('dialog', (d) => void d.accept());
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
let bad = 0;
let total = 0;
const ok = (c, t) => {
  total++;
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const ev = (f, ...a) => p.evaluate(f, ...a);
const shown = (id) => ev((id) => document.getElementById(id)?.classList.contains('show'), id);
const click = async (sel) => {
  const e = await p.$(sel);
  if (!e) return false;
  await e.evaluate((x) => x.click());
  await sleep(400);
  return true;
};

/** The shop's things that wait for a job, and that job (config.ts needs, BURN/TILL/WOOD.needs). */
const GATES = { 'Usta 43cc': 3, 'Sırt Motoru 52cc': 7, Traktör: 6, Römork: 11, Patos: 11, 'Büyük Traktör': 16, 'Üfleme Makinesi': 8, 'Motor Çapa': 12, 'Motorlu Testere': 14 };
/** Side jobs: none before these jobs (the cow, ot yakma, çapa, the fallen tree). */
const SIDE_FROM = { cow: 4, burn: 8, till: 12, tree: 15 };

await p.goto(`${base}?rules&quality=low`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await sleep(800);

// ---- A fresh save: real money, only the first job open.
const s0 = await ev(() => ({ money: window.__game.save.money, unlocked: window.__game.save.unlocked }));
ok(s0.unlocked === 1 && s0.money < 1000, `a fresh save: job 1 open, ${s0.money} TL (not the developer's purse)`);
if (await shown('daily')) {
  await click('#btn-daily-take');
  await sleep(400);
  if (await shown('daily')) await ev(() => document.getElementById('daily').classList.remove('show'));
}
await p.screenshot({ path: `${OUT}/00-menu.png` });

/** What the shop shows locked ("🔒 N. İŞ"): name → N. */
const shopLocks = async () => {
  await click('#btn-shop');
  await sleep(400);
  const locks = {};
  for (const tab of ['tirpan', 'donanim', 'arac']) {
    const found = await ev((tab) => {
      const g = window.__game;
      g.shopTab = tab;
      g.openShop();
      const out = {};
      document.querySelectorAll('#shop .shop-card').forEach((c) => {
        const m = c.innerText.match(/🔒\s*(\d+)\.\s*İŞ/);
        if (m) out[c.querySelector('b')?.textContent.trim() ?? ''] = Number(m[1]);
      });
      return out;
    }, tab);
    Object.assign(locks, found);
  }
  await click('#btn-shop-close');
  await sleep(300);
  return locks;
};

const money = () => ev(() => window.__game.save.money);
const prices = { Traktör: 20000, Römork: 8000, Patos: 30000, 'Büyük Traktör': 55000, 'Usta 43cc': 1500, 'Sırt Motoru 52cc': 3800 };
const sideSeen = { cow: [], burn: [], till: [], tree: [], hint: [] };

for (let job = 1; job <= 20; job++) {
  const st = await ev(() => ({ unlocked: window.__game.save.unlocked, money: window.__game.save.money }));
  // ---- The menu's extras at their job.
  const menu = await ev(() => ({
    evening: getComputedStyle(document.getElementById('btn-evening')).display !== 'none',
    harvest: getComputedStyle(document.getElementById('btn-harvest') ?? document.body).display !== 'none' && !!document.getElementById('btn-harvest'),
    ilan: window.__game.ilanOpen,
  }));
  ok(menu.evening === st.unlocked >= 11, `job ${job}: Akşam: İnekler ${menu.evening ? 'on the menu' : 'not yet'} (unlocked ${st.unlocked})`);
  ok(menu.ilan === st.unlocked >= 3, `job ${job}: the coffee house's notices ${menu.ilan ? 'open' : 'shut'}`);
  // ---- The shop's locks: each thing locked until its job.
  const locks = await shopLocks();
  if (job === 1) console.log(`     locked at the start: ${JSON.stringify(locks)}`);
  const wrong = Object.entries(GATES).filter(([name, n]) => {
    const key = Object.keys(locks).find((k) => k.trim() === name);
    const locked = !!key;
    return locked !== st.unlocked < n || (key && locks[key] !== n);
  });
  ok(!wrong.length, `job ${job}: the shop's locks right (${Object.values(locks).length} locked${wrong.length ? `; wrong: ${wrong.map(([n, k]) => `${n} ${k}`).join(', ')}` : ''})`);
  // ---- The map: this job next, the one after locked; Karadere's tab shut until Yeşilyamaç is done.
  await click('#btn-play');
  await sleep(500);
  const tab = job <= 10 ? 1 : 2;
  const map = await ev((tab) => {
    const g = window.__game;
    g.levelTab = tab;
    g.openLevels();
    const nodes = [...document.querySelectorAll('#level-list .saga-node')];
    return { classes: nodes.map((n) => n.className), sign: document.querySelector('#level-list .saga-sign small')?.innerText ?? '' };
  }, tab);
  await sleep(300);
  const i = (job - 1) % 10;
  ok(/\bnext\b/.test(map.classes[i] ?? '') && !/locked/.test(map.classes[i] ?? ''), `job ${job}: on the map, next and open (${map.classes[i]})`);
  if (i < 9) ok(/locked/.test(map.classes[i + 1] ?? ''), `job ${job}: job ${job + 1} still locked`);
  if (job <= 10) {
    const k = await ev(() => {
      const g = window.__game;
      g.levelTab = 2;
      g.openLevels();
      return [...document.querySelectorAll('#level-list .saga-node')].every((n) => n.classList.contains('locked'));
    });
    ok(k, `job ${job}: Karadere's jobs all locked`);
    await ev(() => {
      const g = window.__game;
      g.levelTab = 1;
      g.openLevels();
    });
    await sleep(300);
  }
  if (job === 1 || job === 11) await p.screenshot({ path: `${OUT}/${String(job).padStart(2, '0')}-map.png` });
  // ---- Taken from the map: its card, BAŞLA.
  await ev((i) => document.querySelectorAll('#level-list .saga-node')[i]?.click(), i);
  await sleep(600);
  ok(await shown('call'), `job ${job}: its card`);
  await click('#btn-call-ok');
  await p.waitForFunction('window.__game.mode === "playing" && !!window.__game.session', { timeout: 90000 }).catch(() => {});
  await sleep(1500);
  const inJob = await ev(() => {
    const g = window.__game;
    return { id: g.session?.level?.id, cow: !!g.view.cowIntruder, burn: !!g.burnTask, till: !!g.tillTask, tree: !!g.woodTree, hint: g.toolHint, region: g.session?.field?.region?.id };
  });
  ok(inJob.id === job, `job ${job}: playing it (${inJob.id})`);
  for (const k of ['cow', 'burn', 'till', 'tree']) if (inJob[k]) sideSeen[k].push(job);
  if (inJob.hint) sideSeen.hint.push(`${job}:${inJob.hint}`);
  const early = ['cow', 'burn', 'till', 'tree'].filter((k) => inJob[k] && job < SIDE_FROM[k]);
  ok(!early.length, `job ${job}: no side job before its job${early.length ? ` (${early.join(', ')})` : ''}`);
  // ---- Mown (as a player would have by now) and finished.
  await ev(() => {
    const s = window.__game.session;
    s.intro = null;
    s.hasTrimmer = true;
    s.broken = false;
    s.line = s.gear.lineMax;
    s.x = 0;
    s.z = s.field.depth / 2 - 3;
    s.field.mownCount = Math.round(s.field.total * 0.97);
  });
  await sleep(1500);
  const fin = await ev(() => document.getElementById('btn-finish').classList.contains('show'));
  ok(fin, `job ${job}: İŞİ BİTİR offered`);
  await click('#btn-finish');
  await sleep(1500);
  ok(await shown('result'), `job ${job}: the result`);
  if (job % 5 === 0) await p.screenshot({ path: `${OUT}/${String(job).padStart(2, '0')}-result.png` });
  const after = await ev(() => ({ unlocked: window.__game.save.unlocked, money: window.__game.save.money, star: window.__game.save.best[window.__game.session?.level?.id ?? 0]?.stars }));
  ok(after.unlocked === job + 1, `job ${job}: job ${job + 1} opened (unlocked ${after.unlocked})`);
  ok(after.money > st.money && after.money < 1_000_000, `job ${job}: paid ${after.money - st.money} TL, now ${after.money} TL`);
  // (Where the money stands against the next thing in the shop.)
  const next = Object.entries(GATES)
    .filter(([, n]) => n === job + 1)
    .map(([name]) => `${name}${prices[name] ? ` ${prices[name]} TL` : ''}`);
  if (next.length) console.log(`     → ${next.join(', ')} now on sale; the purse: ${after.money} TL`);
  await click('#btn-menu');
  await sleep(1200);
  // (An interstitial ad between jobs in the browser: none; the daily reward on a new day: none.)
  if (await shown('daily')) await ev(() => document.getElementById('daily').classList.remove('show'));
  ok(await ev(() => window.__game.mode === 'menu'), `job ${job}: back on the menu`);
}

// ---- After the twentieth: the side jobs seen, and the purse.
console.log(`     side jobs seen: cow ${sideSeen.cow.join(',') || '-'} · burn ${sideSeen.burn.join(',') || '-'} · till ${sideSeen.till.join(',') || '-'} · tree ${sideSeen.tree.join(',') || '-'} · tool hints ${sideSeen.hint.join(' ') || '-'}`);
ok(sideSeen.tree.length && sideSeen.tree[0] === 15, `the fallen tree: first at job 15, as it always is the first time (${sideSeen.tree.join(',')})`);
const end = await money();
console.log(`     the purse after twenty jobs: ${end} TL`);
await p.screenshot({ path: `${OUT}/99-menu.png` });
ok(!errors.length, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
console.log(`\n${bad ? `${bad} FAIL` : 'all OK'} (${total})`);
await b.close();
process.exit(bad ? 1 : 0);
