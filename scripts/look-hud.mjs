// Dev: the in-game HUD in seven situations, as on an iPhone sideways, each checked and shot
// (test-output/hud): a job taken on the map, driving to it, mowing, the engine running low and hot,
// Serbest gez and a job taken from it, the Fındık Harmanı, a job finished. Prints OK / FAIL per check.
// Usage (dev server running): node scripts/look-hud.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/hud';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-hud-${Date.now()}` });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
await p.goto(`${base}?quality=medium`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// (The jobs' random extras off: the messages looked at here are the plain job's.)
await p.evaluate(async () => {
  const mod = (path) => import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes(path)) ?? path);
  (await mod('/src/game/burn.ts')).BURN.chance = 0;
  (await mod('/src/game/tiller.ts')).TILL.chance = 0;
  (await mod('/src/game/config.ts')).COW.chance = 0;
});
// Every message shown, when it came and went; and the most on screen at once.
await p.evaluate(() => {
  window.__toasts = [];
  window.__most = 0;
  const box = document.getElementById('toasts');
  new MutationObserver((ms) => {
    for (const m of ms) {
      for (const n of m.addedNodes) window.__toasts.push({ text: n.textContent, at: performance.now(), gone: null, node: n });
      for (const n of m.removedNodes) for (const t of window.__toasts) if (t.node === n && t.gone === null) t.gone = performance.now();
    }
    window.__most = Math.max(window.__most, box.children.length);
  }).observe(box, { childList: true });
});
const ui = () =>
  p.evaluate(() => {
    const vis = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return false;
      const r = e.getBoundingClientRect();
      return getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    return {
      panel: vis('.hud-mid'),
      gauges: vis('.hud-mid .gauges'),
      progress: vis('.hud-mid .progress'),
      percent: document.getElementById('progress-text').textContent,
      minimap: vis('#minimap'),
      objective: vis('#objective') ? document.getElementById('objective').innerText.replace(/\s+/g, ' ').trim() : '',
      toasts: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent),
      acts: [...document.querySelectorAll('#actions [data-id]')].map((x) => x.dataset.id),
    };
  });
const fresh = (extra = {}) =>
  p.evaluate((extra) => {
    const g = window.__game;
    if (g.mode === 'playing' || g.mode === 'paused') g.quitToMenu();
    Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20, weather: 'sunny', harvestOffered: 99, driveTips: 0, best: { 1: { stars: 3 }, 2: { stars: 2 }, 3: { stars: 3 } } }, extra);
    delete g.save.harvest;
    g.levelTab = 1;
    g.showMenu();
    document.querySelectorAll('.screen.dim').forEach((x) => x.classList.remove('show'));
    window.__toasts.length = 0;
    window.__most = 0;
  }, extra);

// ---- 1. A job taken on the map: BAHÇEYE GİT, a job's card, KABUL ET.
console.log('\n1. Haritadan iş alma');
await fresh();
await p.click('#btn-play');
await sleep(1200);
await p.evaluate(() => [...document.querySelectorAll('.saga-node')].find((n) => n.querySelector('.sn-disc b')?.textContent.trim() === '10')?.click());
await sleep(800);
const card = await p.evaluate(() => ({ title: document.getElementById('call-name').textContent, facts: document.getElementById('call-facts').innerText.replace(/\s+/g, ' ') }));
ok(card.title.includes('Değirmen Önü') && /TL/.test(card.facts), `the job's card: ${card.title} | ${card.facts}`);
await shot('1a-card');
await p.click('#btn-call-ok');
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(900);
let u = await ui();
ok(u.toasts.some((t) => t === 'Bugünkü iş: Değirmen Önü'), `the short job message: ${JSON.stringify(u.toasts)}`);
ok(!u.gauges && !u.progress && !u.minimap, `on foot without the trimmer: no gauges, no progress, no minimap (${JSON.stringify({ g: u.gauges, p: u.progress, m: u.minimap })})`);
ok(!!u.objective, `the objective: ${u.objective}`);
await shot('1b-start');
await sleep(3000);
const job = await p.evaluate(() => window.__toasts.find((t) => t.text.startsWith('Bugünkü iş')));
ok(job && job.gone !== null && job.gone - job.at < 3600, `the job message gone in ${job?.gone ? Math.round(job.gone - job.at) : '—'} ms`);

// ---- 2. Driving to the job: the panel gone, the way in the pill, its metres falling.
console.log('\n2. Patpatla tarlaya gitme');
await p.evaluate(() => {
  const s = window.__game.session;
  s.x = s.field.vehicle.x;
  s.z = s.field.vehicle.z;
  s.board();
});
await sleep(1200);
u = await ui();
ok(!u.panel, `driving: no panel (${u.panel})`);
ok(/Değirmen Önü: \d+ m/.test(u.objective), `the way: ${u.objective}`);
const m0 = Number(/(\d+) m/.exec(u.objective)?.[1]);
await shot('2a-driving');
// On along the lane, as if driven.
await p.evaluate(() => {
  const f = window.__game.session.field;
  const l = f.lane;
  const q = l[Math.floor(l.length * 0.6)];
  const n = l[Math.floor(l.length * 0.6) + 3];
  Object.assign(f.vehicle, { x: q.x, z: q.z, yaw: Math.atan2(n.x - q.x, n.z - q.z), speed: 0, art: 0 });
  if (f.trailer) f.trailer.yaw = NaN;
});
await sleep(1200);
u = await ui();
const m1 = Number(/(\d+) m/.exec(u.objective)?.[1]);
ok(m1 < m0, `the metres fall as it goes: ${m0} → ${m1}`);
const tips = await p.evaluate(() => window.__toasts.filter((t) => t.text.startsWith('Direksiyonu')).length);
ok(tips === 1, `the driving tip once: ${tips}`);
await shot('2b-driving-on');

// ---- 3. Mowing: the trimmer in hand, the gauges and the progress.
console.log('\n3. Tırpanla biçme');
await p.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  if (s.driving) {
    s.field.vehicle.speed = 0;
    s.alight();
  }
  s.intro = null;
  s.hasTrimmer = true;
  s.broken = false;
  s.line = s.gear.lineMax;
  s.x = 0;
  s.z = s.field.depth / 2 - 4;
  s.yaw = Math.PI;
  g.lookYaw = Math.PI;
  s.field.mownCount = Math.round(s.field.total * 0.42);
});
await sleep(1200);
u = await ui();
ok(u.panel && u.gauges && u.progress, `trimmer in hand: the panel, gauges and progress (${JSON.stringify({ p: u.panel, g: u.gauges, pr: u.progress })})`);
ok(u.percent === '%42', `the progress reads ${u.percent}`);
await shot('3-mowing');

// ---- 4. Running low and hot: the warnings, one at a time; the gauges flagged.
console.log('\n4. Benzin azaldı / motor ısındı');
await p.evaluate(() => {
  const s = window.__game.session;
  s.fuel = s.gear.tank * 0.08;
  s.temp = 0.95;
  window.__most = 0;
  window.__game.toast('Benzin azaldı', 'warn');
  window.__game.toast('Motor ısınıyor! Biraz dinlendir', 'warn');
  window.__game.toast("Misina kısaldı: MİSİNA'ya bas", '');
});
await sleep(1200);
u = await ui();
const most = await p.evaluate(() => window.__most);
ok(most === 1 && u.toasts.length === 1, `one message at a time: at most ${most}, now ${JSON.stringify(u.toasts)}`);
const flags = await p.evaluate(() => ({ fuel: document.getElementById('fuel-fill').classList.contains('low'), hot: document.querySelector('.gauge.temp').classList.contains('hot') }));
ok(flags.fuel && flags.hot, `the fuel and the heat flagged: ${JSON.stringify(flags)}`);
await shot('4-low-hot');

// ---- 5. Serbest gez, and a job taken from it at a field's gate.
console.log('\n5. Serbest gez ve oradan iş alma');
await fresh();
await p.evaluate(() => {
  const g = window.__game;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.levelTab = 1;
  g.startRoam('');
});
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(1200);
u = await ui();
ok(!u.panel && !u.objective, `roaming: no panel, no objective (${u.panel}, "${u.objective}")`);
ok(u.toasts.some((t) => t.startsWith('Serbest gez')), `the roam message: ${JSON.stringify(u.toasts)}`);
await shot('5a-roam');
// To Ocaklı Bahçe's gate (job 3), on foot.
await p.evaluate(() => {
  const s = window.__game.session;
  const q = s.field.others.find((o) => o.level.id === 3);
  s.x = q.entryX;
  s.z = q.maxZ + 2.5;
});
await sleep(900);
u = await ui();
ok(u.acts.includes('switch'), `BU İŞE GEÇ at the gate: ${u.acts.join(',')}`);
await shot('5b-gate');
await p.evaluate(() => window.__game.switchJob(window.__game.levelById(3)));
await p.waitForFunction('window.__game.mode === "playing" && window.__game.session.level.id === 3', { timeout: 60000 });
await sleep(1000);
const j = await p.evaluate(() => ({ has: window.__game.session.hasTrimmer, intro: window.__game.session.intro, roam: document.body.classList.contains('roam') }));
u = await ui();
ok(!j.has && j.intro === 'take' && !j.roam, `the job from Serbest gez: trimmer in the vehicle, not roaming ${JSON.stringify(j)}`);
ok(!!u.objective, `its objective: ${u.objective}`);
await shot('5c-job-from-roam');

// ---- 6. Fındık Harmanı from the menu's card.
console.log('\n6. Fındık Harmanı');
await fresh({ vehicles: ['patpat', 'traktor', 'romork', 'patos'], vehicle: 'patpat' });
await p.click('#btn-harvest');
await sleep(600);
const go = await p.evaluate(() => document.querySelector('#harvest-body .hv-go')?.textContent.trim());
ok(go === 'HASADI BAŞLAT', `the card: ${go}`);
await p.evaluate(() => document.querySelector('#harvest-body .hv-go').click());
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(1500);
u = await ui();
ok(!u.panel, `harvest: no empty panel (${u.panel})`);
ok(/Patpat|çuval|Çuval/.test(u.objective), `the harvest's step: ${u.objective}`);
await shot('6-harvest');

// ---- 7. A job finished: the result, back to the menu.
console.log('\n7. İşi bitirme');
await fresh();
await p.evaluate(() => {
  const g = window.__game;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(2));
});
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(800);
await p.evaluate(() => {
  const s = window.__game.session;
  s.intro = null;
  s.hasTrimmer = true;
  s.field.mownCount = s.field.total;
});
await p.waitForFunction('document.getElementById("result").classList.contains("show")', { timeout: 20000 }).catch(() => {});
await sleep(800);
const res = await p.evaluate(() => ({ shown: document.getElementById('result').classList.contains('show'), total: document.querySelector('#result-table .total td:last-child')?.textContent }));
ok(res.shown, `the result: ${JSON.stringify(res)}`);
await shot('7a-result');
await p.click('#btn-menu').catch(() => {});
await sleep(1500);
const back = await p.evaluate(() => ({ mode: window.__game.mode, menu: document.getElementById('menu').classList.contains('show') }));
ok(back.mode === 'menu', `back on the menu: ${JSON.stringify(back)}`);
await shot('7b-menu');

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await b.close();
process.exit(bad ? 1 : 0);
