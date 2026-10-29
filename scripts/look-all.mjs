// Dev: the whole game, case by case, as a player goes (from the code's buttons, actions and events):
// a job from its start to its pay, the engine and what it uses, the field's hazards, driving, the
// menus and screens, the job map, pause, in-game camera and map, Serbest gez, the save kept over a
// reload. Each section runs on its own (one failing does not stop the rest). OK / FAIL per check,
// shots of each section in test-output/all. Usage (dev server running): node scripts/look-all.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/all';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-all-${Date.now()}` });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('dialog', (d) => void d.accept());
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
let bad = 0;
let total = 0;
const ok = (c, t) => {
  total++;
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const ev = (f, ...a) => p.evaluate(f, ...a);
const shown = (id) => ev((id) => document.getElementById(id)?.classList.contains('show'), id);
const visible = (sel) => ev((sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0; }, sel);
const click = (sel) => ev((sel) => document.querySelector(sel)?.click(), sel);
/** An action button tapped (they act on the finger going down, not on a click). */
const tap = (id) => ev((id) => { const e = document.querySelector(`#actions [data-id="${id}"]`); if (!e) return false; e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7 })); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 })); return true; }, id);
const acts = () => ev(() => [...document.querySelectorAll('#actions [data-id]')].map((x) => x.dataset.id));
const toasts = () => ev(() => (window.__seen ?? []).join(' | '));
const clearToasts = () => ev(() => (window.__seen = []));
const objective = () => ev(() => document.getElementById('objective').innerText.replace(/\s+/g, ' ').trim());
/** A held action button (MİSİNA TAK...): pressed ms long. */
const hold = async (sel, ms) => {
  const ok = await ev((sel) => { const e = document.querySelector(sel); if (!e) return false; e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8 })); return true; }, sel);
  await sleep(ms);
  await ev((sel) => document.querySelector(sel)?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 8 })), sel);
  return ok;
};
const section = async (name, fn) => {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (e) {
    ok(false, `${name}: stopped — ${e.message.split('\n')[0]}`);
  }
};
await p.goto(`${base}?quality=low`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// Every message shown, kept for the checks.
await ev(() => {
  window.__seen = [];
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => window.__seen.push(n.textContent)))).observe(document.getElementById('toasts'), { childList: true });
});
const fresh = (extra = {}, keep = false) =>
  ev((extra, keep) => {
    const g = window.__game;
    if (g.mode !== 'menu') g.quitToMenu();
    Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20, harvestOffered: 99, weather: 'sunny', money: 100000, mownAt: {}, daily: { last: new Date().toISOString().slice(0, 10), streak: 1 }, driveTips: 9 }, extra);
    g.levelTab = 1;
    g.showMenu();
    if (!keep) document.querySelectorAll('.screen.dim').forEach((x) => x.classList.remove('show'));
  }, extra, keep);
const startJob = async (id, extra = {}) => {
  await fresh(extra);
  await ev((id) => {
    const g = window.__game;
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.start(g.levelById(id));
  }, id);
  await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
  await sleep(700);
  await clearToasts();
};
/** The worker put at (x, z) in the field's coordinates. */
const putAt = (x, z, yaw) => ev((x, z, yaw) => { const s = window.__game.session; if (s.driving) { s.field.vehicle.speed = 0; s.alight(); } s.x = x; s.z = z; if (yaw !== undefined) { s.yaw = yaw; window.__game.lookYaw = yaw; } }, x, z, yaw);
/** In the field, the trimmer in hand, its line on (the intro skipped). */
const ready = async (id, extra) => {
  await startJob(id, extra);
  await ev(() => {
    const s = window.__game.session;
    s.intro = null;
    s.hasTrimmer = true;
    s.broken = false;
    s.line = s.gear.lineMax;
    window.__game.view.worker.carrying = true;
  });
  await putAt(0, await ev(() => window.__game.session.field.depth / 2 - 3), Math.PI);
};
/** The engine started through its own controls (prime, choke, pulls). */
const startEngine = async () => {
  for (let i = 0; i < 3; i++) await ev(() => document.getElementById('btn-prime').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  const warm = await ev(() => window.__game.session.starter.warm);
  if (!warm) await ev(() => document.getElementById('btn-choke').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  for (let i = 0; i < 6 && !(await ev(() => window.__game.session.running)); i++) {
    const st = await ev(() => ({ popped: window.__game.session.starter.popped, choke: window.__game.session.starter.choke }));
    if (st.popped && st.choke) await ev(() => document.getElementById('btn-choke').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await ev(() => window.__game.pullCord(0.9));
    await sleep(250);
  }
  return ev(() => window.__game.session.running);
};
/** The player's input: the throttle held, the stick pushed (forward, 0..1). */
const input = (gas, fwd = 0, sweep = 0) =>
  ev((gas, fwd, sweep) => {
    const g = window.__game;
    window.__gas = gas;
    window.__fwd = fwd;
    window.__sw = sweep;
    if (!window.__wired) {
      window.__wired = true;
      Object.defineProperty(g.input, 'throttleLevel', { get: () => window.__gas, configurable: true });
      Object.defineProperty(g.input, 'sweep', { get: () => window.__sw, configurable: true });
      const m2 = g.input.move2.bind(g.input);
      g.input.move2 = () => (window.__fwd ? { x: 0, y: -window.__fwd } : m2());
    }
  }, gas, fwd, sweep);

// ================================================================ A. a job from start to pay
await section('A. İş başı → biçme → ödeme', async () => {
  await startJob(2, { unlocked: 2, best: {} });
  let o = await objective();
  ok(/Patpat|bin|git/i.test(o), `the job starts at the house: "${o}"`);
  // The pat pat driven down to the field, off, the trimmer taken out.
  await ev(() => {
    const s = window.__game.session;
    const f = s.field;
    const l = f.lane;
    const q = l[l.length - 3];
    const n = l[l.length - 1];
    Object.assign(f.vehicle, { x: q.x, z: q.z, yaw: Math.atan2(n.x - q.x, n.z - q.z), speed: 0, art: 0 });
    s.x = q.x + 1;
    s.z = q.z;
  });
  await sleep(400);
  let a = await acts();
  ok(a.includes('take'), `by the pat pat at the field: TIRPANI AL (${a.join(',')})`);
  await tap('take');
  await sleep(400);
  const intro = await ev(() => window.__game.session.intro);
  ok(intro === 'line', `taken: now fit the line (${intro})`);
  a = await acts();
  ok(a.includes('line'), `MİSİNA TAK shown (${a.join(',')})`);
  await hold('#actions [data-id="line"]', 4500);
  await sleep(300);
  const after = await ev(() => ({ intro: window.__game.session.intro, line: window.__game.session.line, broken: window.__game.session.broken }));
  ok(after.intro === null && !after.broken && after.line > 0, `MİSİNA TAK held: line on (${JSON.stringify(after)})`);
  await sleep(300);
  ok(await ev(() => document.body.classList.contains('engine-off')), 'the engine off: its starter plate shown');
  const started = await startEngine();
  ok(started, 'prime, choke and pulls: the engine running');
  await shot('A1-running');
  // Mow: forward with the throttle, sweeping.
  await putAt(0, await ev(() => window.__game.session.field.depth / 2 - 2), Math.PI);
  const c0 = await ev(() => window.__game.session.field.coverage);
  await input(1, 0.5, 0);
  for (let i = 0; i < 6; i++) {
    await input(1, 0.5, i % 2 ? 1 : -1);
    await sleep(500);
  }
  await input(0, 0, 0);
  const c1 = await ev(() => window.__game.session.field.coverage);
  ok(c1 > c0 + 0.005, `mowing: the coverage rises (${(c0 * 100).toFixed(1)}% → ${(c1 * 100).toFixed(1)}%)`);
  await shot('A2-mowing');
  // 90 %: İŞİ BİTİR; finished.
  await ev(() => { const f = window.__game.session.field; f.mownCount = Math.round(f.total * 0.92); });
  await sleep(800);
  ok(await visible('#btn-finish'), 'at 90%: İŞİ BİTİR shown');
  const m0 = await ev(() => window.__game.save.money);
  await click('#btn-finish');
  await sleep(800);
  ok(await shown('result'), 'İŞİ BİTİR: the result');
  const r = await ev(() => ({ total: window.__game.lastResult.total, stars: window.__game.lastResult.stars, money: window.__game.save.money, mown: window.__game.save.mownAt?.[2], unlocked: window.__game.save.unlocked, best: window.__game.save.best[2] }));
  ok(r.money - m0 === r.total && r.total > 0, `paid: +${r.money - m0} TL (${r.total})`);
  ok(!!r.mown && r.unlocked >= 3 && !!r.best, `mown time kept, job 3 open, best kept (${JSON.stringify({ mown: !!r.mown, unlocked: r.unlocked, stars: r.best?.stars })})`);
  await shot('A3-result');
  // TEKRAR on a just mown field: the regrow offer.
  await click('#btn-again');
  await sleep(800);
  ok(await shown('regrow'), 'TEKRAR on a mown field: "Ot daha bağlamadı"');
  await click('#btn-regrow-other');
  await sleep(800);
  ok(await shown('levels'), 'BAŞKA BAHÇE: the job map');
});

// ================================================================ B. fuel, line, spool, the depot
await section('B. Benzin, misina, makara, bidon', async () => {
  await ready(2);
  await startEngine();
  await ev(() => { const s = window.__game.session; s.fuel = s.gear.tank * 0.1; });
  await input(1, 0, 0);
  await sleep(1500);
  ok(/Benzin azald/.test(await toasts()), `fuel low: told (${await toasts()})`);
  await ev(() => { window.__game.session.fuel = 0.001; });
  await sleep(1500);
  await input(0);
  const out = await ev(() => ({ running: window.__game.session.running, fuelBox: getComputedStyle(document.getElementById('fuel-out')).display !== 'none' }));
  ok(!out.running && out.fuelBox, `fuel out: the engine stops, "Benzin bitti" (${JSON.stringify(out)})`);
  const pill = await objective();
  ok(/bidon/.test(pill), `the way to the can in the pill: "${pill}"`);
  // To the can: filled, paid for.
  const e0 = await ev(() => window.__game.session.expenses);
  await ev(() => { const s = window.__game.session; s.x = s.field.depot.x; s.z = s.field.depot.z; });
  await sleep(4500);
  const dep = await ev(() => ({ fuel: window.__game.session.fuel / window.__game.session.gear.tank, exp: window.__game.session.expenses }));
  ok(dep.fuel > 0.99 && dep.exp > e0, `at the can: the tank filled and paid for (${Math.round(dep.fuel * 100)}%, +${(dep.exp - e0).toFixed(0)} TL)`);
  await ev(() => { const s = window.__game.session; s.x = 0; s.z = 0; });
  await sleep(1500);
  ok(/Depo doldu|Benzin ve misina/.test(await toasts()), `told on leaving: ${await toasts()}`);
  // A broken line: MİSİNA (rethread) from the spool.
  await clearToasts();
  await ev(() => { const s = window.__game.session; s.broken = true; s.line = 0; s.running = false; });
  await sleep(500);
  ok(await visible('#btn-rethread'), 'the line broken: MİSİNA button');
  const sp0 = await ev(() => window.__game.session.spool);
  await hold('#btn-rethread', 4500);
  const rt = await ev(() => ({ broken: window.__game.session.broken, line: window.__game.session.line, spool: window.__game.session.spool }));
  ok(!rt.broken && rt.line > 0 && rt.spool < sp0, `rethreaded from the spool (${JSON.stringify(rt)})`);
  // The spool empty: rethreading refused, told.
  await clearToasts();
  await ev(() => { const s = window.__game.session; s.broken = true; s.line = 0; s.spool = 0; });
  await hold('#btn-rethread', 1500);
  ok(/makara|bidon|Makara/i.test(await toasts()) || /bidon/.test(await objective()), `the spool empty: told to go to the can (${await toasts()} | ${await objective()})`);
});

// ================================================================ C. overheating
await section('C. Hararet', async () => {
  await ready(4);
  await startEngine();
  await ev(() => { window.__game.session.temp = 1.15; });
  await input(1, 0.4, 1);
  await sleep(2500);
  await input(0);
  const oh = await ev(() => ({ over: window.__game.session.overheated, running: window.__game.session.running, card: getComputedStyle(document.getElementById('overheat')).display !== 'none' }));
  ok(oh.over && !oh.running && oh.card, `worked hot: overheats, stops, its card (${JSON.stringify(oh)})`);
  await shot('C-overheat');
  // Cooling by waiting (time hurried).
  await ev(() => { window.__game.session.temp = 0.3; });
  await sleep(1500);
  const cooled = await ev(() => ({ over: window.__game.session.overheated, card: getComputedStyle(document.getElementById('overheat')).display !== 'none' }));
  ok(!cooled.over && !cooled.card, `cooled down: can start again (${JSON.stringify(cooled)})`);
});

// ================================================================ D. the field's hazards
await section('D. Engeller: ocak, taş, kovan, hortum', async () => {
  await ready(4);
  await startEngine();
  // A hazelnut bush knocked: counted, its penalty.
  const bush = await ev(() => { const b = window.__game.session.field.bushes.find((x) => x.kind === 'ocak'); return b && { x: b.x, z: b.z }; });
  if (bush) {
    await putAt(bush.x, bush.z + 1.6, Math.PI);
    await input(1, 0, 0);
    for (let i = 0; i < 8; i++) {
      await input(1, 0, i % 2 ? 1 : -1);
      await sleep(250);
    }
    await input(0);
    const k = await ev(() => ({ knocks: window.__game.session.knocks, pen: window.__game.session.knockPenalty }));
    ok(k.knocks > 0 && k.pen > 0, `a bush hit: knocks counted, a penalty (${JSON.stringify(k)})`);
  } else ok(true, 'no bush in this field');
  // A stone: the line shortened or warned.
  await clearToasts();
  const st = await ev(() => { const s = window.__game.session.field.stones?.find((x) => !x.hit) ?? window.__game.session.field.stones?.[0]; return s && { x: s.x, z: s.z }; });
  if (st) {
    const l0 = await ev(() => window.__game.session.line);
    await putAt(st.x, st.z + 1.3, Math.PI);
    for (let i = 0; i < 8; i++) {
      await input(1, 0, i % 2 ? 1 : -1);
      await sleep(250);
    }
    await input(0);
    const l1 = await ev(() => window.__game.session.line);
    ok(l1 < l0 || /taş|Taş/.test(await toasts()), `a stone: line ${l0.toFixed(2)} → ${l1.toFixed(2)} (${await toasts()})`);
  }
  // A hive: the bees get angry, a sting.
  await clearToasts();
  const hive = await ev(() => { const h = window.__game.session.field.hives?.[0]; return h && { x: h.x, z: h.z }; });
  if (hive) {
    await putAt(hive.x, hive.z + 1.5, Math.PI);
    // (The engine running whatever the stone did to it.)
    await ev(() => { const s = window.__game.session; s.starter.primes = 5; s.starter.warm = true; s.flood = 0; s.running = true; s.temp = 0.5; s.broken = false; s.line = s.gear.lineMax; });
    await input(1, 0, 0);
    await sleep(6000);
    await input(0);
    const t = await toasts();
    const stings = await ev(() => window.__game.session.stings ?? 0);
    ok(stings > 0, `by a hive revving: stung ${stings} times (${t.slice(0, 120)})`);
  }
  await shot('D-hazards');
});

await section('D2. Hortumu kesme isteği', async () => {
  await ready(3);
  await startEngine();
  const hose = await ev(() => { const h = window.__game.session.field.hose; return h.length ? h[Math.floor(h.length / 2)] : null; });
  ok(!!hose, 'Ocaklı Bahçe has a hose across it');
  if (hose) {
    await putAt(hose.x, hose.z + 1.2, Math.PI);
    for (let i = 0; i < 10; i++) {
      await input(1, 0, i % 2 ? 1 : -1);
      await sleep(250);
    }
    await input(0);
    const cut = await ev(() => ({ cut: window.__game.session.field.hoseCut, chip: document.getElementById('request-chip').classList.contains('broken') }));
    ok(cut.cut && cut.chip, `the hose cut: the wish broken (${JSON.stringify(cut)})`);
  }
});

// ================================================================ E. driving, the yard gate
await section('E. Sürüş, avlu kapısı', async () => {
  await startJob(2);
  await ev(() => { const s = window.__game.session; s.x = s.field.vehicle.x + 1; s.z = s.field.vehicle.z; });
  await sleep(300);
  ok((await acts()).includes('board'), 'by the pat pat: PATPATA BİN');
  await tap('board');
  await sleep(300);
  ok(await ev(() => window.__game.session.driving), 'on board');
  ok(await visible('#drive-ui'), 'the wheel and pedals shown');
  const v0 = await ev(() => ({ x: window.__game.session.field.vehicle.x, z: window.__game.session.field.vehicle.z }));
  await ev(() => { const d = window.__game.input.drive; d.active = true; d.throttle = 1; d.steer = 0; Object.defineProperty(d, 'active', { get: () => true, configurable: true }); Object.defineProperty(d, 'throttle', { get: () => 1, configurable: true }); });
  await sleep(2000);
  await ev(() => { const d = window.__game.input.drive; Object.defineProperty(d, 'throttle', { get: () => 0, configurable: true }); });
  await sleep(1500);
  const v1 = await ev(() => ({ x: window.__game.session.field.vehicle.x, z: window.__game.session.field.vehicle.z }));
  ok(Math.hypot(v1.x - v0.x, v1.z - v0.z) > 1, `GAZ: it drives (${Math.hypot(v1.x - v0.x, v1.z - v0.z).toFixed(1)} m)`);
  await ev(() => { const d = window.__game.input.drive; delete d.active; delete d.throttle; window.__game.session.field.vehicle.speed = 0; });
  await sleep(300);
  await tap('off');
  await sleep(300);
  ok(!(await ev(() => window.__game.session.driving)), 'İN: off');
  // The yard gate.
  const gate = await ev(() => { const g = window.__game.session.field.yardGate; return g && { x: (g.ax + g.bx) / 2, z: (g.az + g.bz) / 2, open: window.__game.session.field.gateOpen }; });
  if (gate) {
    await putAt(gate.x, gate.z + 1.2);
    await sleep(400);
    const a = await acts();
    const id = a.includes('gate') ? 'gate' : a.includes('gate-shut') ? 'gate-shut' : null;
    ok(!!id, `by the yard gate: ${a.join(',')}`);
    if (id) {
      const o0 = await ev(() => window.__game.session.field.gateOpen);
      await tap(id);
      await sleep(2500);
      const o1 = await ev(() => window.__game.session.field.gateOpen);
      ok(Math.abs(o1 - o0) > 0.5, `${id === 'gate' ? 'KAPIYI AÇ' : 'KAPIYI KAPAT'}: the gate moves (${o0.toFixed(1)} → ${o1.toFixed(1)})`);
    }
  }
});

// ================================================================ F. the menu and its screens
await section('F. Menü: günlük ödül, görevler, mağaza, reklamsız, paket, ayarlar', async () => {
  await fresh({ daily: { last: '2000-01-01', streak: 0 } }, true);
  await sleep(300);
  ok(await shown('daily'), 'a new day: the daily reward');
  const m0 = await ev(() => window.__game.save.money);
  const amt = await ev(() => window.__game.dailyAmount);
  await click('#btn-daily-take');
  await sleep(500);
  ok((await ev(() => window.__game.save.money)) - m0 === amt && !(await shown('daily')), `AL: +${amt} TL, closed`);
  // Tasks: one done, its reward taken.
  await ev(() => { const g = window.__game; const { defs, st } = g.dayState(); st.progress[defs[0].id] = defs[0].goal; g.updateTasksBadge(); });
  await click('#btn-tasks');
  await sleep(500);
  ok(await shown('tasks'), 'Görevler opens');
  const tb = await ev(() => [...document.querySelectorAll('#tasks .btn.buy')].filter((x) => !x.disabled).length);
  const m1 = await ev(() => window.__game.save.money);
  await click('#tasks .btn.buy:not([disabled])');
  await sleep(500);
  const m2 = await ev(() => window.__game.save.money);
  ok(tb > 0 && m2 > m1, `a task done: its reward taken (+${m2 - m1} TL)`);
  await shot('F1-tasks');
  await click('#btn-tasks-close');
  await sleep(300);
  // The store: its packs, closed.
  await click('#btn-store');
  await sleep(600);
  ok(await shown('store'), 'Mağaza opens');
  const packs = await ev(() => document.querySelectorAll('#store .shop-card.pack').length);
  ok(packs >= 3, `its packs (${packs})`);
  const m3 = await ev(() => window.__game.save.money);
  await click('#store .shop-card.pack .btn.buy');
  await sleep(800);
  ok((await ev(() => window.__game.save.money)) > m3, `a pack bought (stand-in): money added (+${(await ev(() => window.__game.save.money)) - m3})`);
  await shot('F2-store');
  await click('#btn-store-close');
  await sleep(300);
  ok(!(await shown('store')), 'Mağaza closes');
  // No ads.
  await ev(() => { window.__game.save.noAds = false; window.__game.updateNoAds(); });
  await click('#btn-noads');
  await sleep(500);
  ok(await shown('noads-offer'), 'Reklamsız opens');
  await click('#btn-offer-later');
  await sleep(300);
  ok(!(await shown('noads-offer')), 'Belki sonra: closed');
  // Settings: kept.
  await click('#btn-settings');
  await sleep(400);
  ok(await shown('settings'), 'Ayarlar opens');
  await ev(() => { const r = document.getElementById('set-sfx'); r.value = '40'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
  await click('#set-quality button[data-q="medium"]');
  await click('#set-weather button[data-w="rain"]');
  await sleep(300);
  const set = await ev(() => ({ sfx: window.__game.save.sfxVolume, q: window.__game.save.quality, w: window.__game.save.weather }));
  ok(set.q === 'medium' && set.w === 'rain', `quality and weather chosen: ${JSON.stringify(set)}`);
  await click('#set-quality button[data-q="auto"]');
  await click('#set-weather button[data-w="auto"]');
  await click('#btn-settings-close');
  await sleep(300);
  ok(!(await shown('settings')), 'TAMAM: closed');
});

// ================================================================ G. the job map
await section('G. İş haritası: köyler, ilanlar', async () => {
  await fresh();
  await click('#btn-play');
  await sleep(900);
  ok(await shown('levels'), 'BAHÇEYE GİT: the map');
  const tabs = await ev(() => [...document.querySelectorAll('#levels .tabs button, .level-tabs button')].map((x) => x.textContent.trim()));
  ok(tabs.length >= 2, `its tabs: ${tabs.join(' / ')}`);
  // Karadere.
  await ev(() => { const g = window.__game; g.levelTab = 2; g.openLevels(); });
  await sleep(600);
  const nodes2 = await ev(() => [...document.querySelectorAll('.saga-node .sn-disc b')].map((x) => x.textContent.trim()));
  ok(nodes2.includes('11'), `Karadere's jobs: ${nodes2.join(',')}`);
  // The coffee house's notices.
  await ev(() => { const g = window.__game; g.levelTab = 0; g.openLevels(); });
  await sleep(600);
  const ilan = await ev(() => document.querySelectorAll('#level-list .level.ilan:not(.growing)').length);
  ok(ilan > 0, `İlanlar: ${ilan} notices`);
  if (ilan) {
    await click('#level-list .level.ilan:not(.growing)');
    await sleep(600);
    ok(await shown('call'), 'a notice: its card');
    await click('#btn-call-ok');
    await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
    ok((await ev(() => window.__game.session.level.id)) >= 100, `its job started (${await ev(() => window.__game.session.level.id)})`);
  }
  await shot('G-ilan');
  await fresh();
  await click('#btn-play');
  await sleep(700);
  await click('#btn-levels-close');
  await sleep(300);
  ok(!(await shown('levels')), 'the map closes');
});

// ================================================================ H. pause, camera, in-game map
await section('H. Mola, kamera, oyun içi harita', async () => {
  await ready(2);
  await click('#btn-pause');
  await sleep(400);
  ok(await shown('pause') && (await ev(() => window.__game.mode)) === 'paused', 'MOLA: paused');
  const t0 = await ev(() => window.__game.session.time);
  await sleep(1000);
  ok((await ev(() => window.__game.session.time)) === t0, 'the clock stops while paused');
  await click('#btn-resume');
  await sleep(400);
  ok((await ev(() => window.__game.mode)) === 'playing', 'DEVAM: playing');
  const cam0 = await ev(() => window.__game.view.mode);
  await click('#btn-cam');
  await sleep(400);
  const cam1 = await ev(() => window.__game.view.mode);
  ok(cam0 !== cam1, `the camera button: ${cam0} → ${cam1}`);
  await click('#btn-cam');
  await click('#btn-map');
  await sleep(500);
  ok(await ev(() => window.__game.mapOpen), 'HARİTA opens');
  await shot('H-map');
  await click('#btn-map-close');
  await sleep(300);
  ok(!(await ev(() => window.__game.mapOpen)), 'and closes');
  await click('#btn-pause');
  await sleep(300);
  await click('#btn-restart');
  await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
  ok((await ev(() => window.__game.session.time)) < 2, 'YENİDEN BAŞLA: the job from its start');
  await click('#btn-pause');
  await sleep(300);
  await click('#btn-quit');
  await sleep(800);
  ok((await ev(() => window.__game.mode)) === 'menu', 'ANA MENÜ: back on the menu');
});

// ================================================================ J. Serbest gez
await section('J. Serbest gez: dükkân, kapıda iş', async () => {
  await fresh();
  await click('#btn-roam');
  // (Which village: the first.)
  await sleep(400);
  await ev(() => document.getElementById('confirm').classList.contains('show') && document.getElementById('btn-confirm-yes').click());
  await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
  await sleep(800);
  ok(await ev(() => window.__game.roaming), 'SERBEST GEZ: roaming');
  await ev(() => { const s = window.__game.session; s.x = s.field.house.x + 3; s.z = s.field.house.z + 3; });
  await sleep(400);
  ok((await acts()).includes('shop'), 'by the house: DÜKKAN');
  await tap('shop');
  await sleep(500);
  ok(await shown('shop'), 'the shop over the game');
  await click('#btn-shop-close');
  await sleep(400);
  ok((await ev(() => window.__game.mode)) === 'playing', 'closed: back to roaming');
  await ev(() => { const s = window.__game.session; const q = s.field.others.find((o) => o.level.id === 5); s.x = q.entryX; s.z = q.maxZ + 2.5; });
  await sleep(500);
  ok((await acts()).includes('switch'), 'at a field gate: BU İŞE GEÇ');
});

// ================================================================ K. the save kept
await section('K. Kayıt: sayfa yeniden açılınca', async () => {
  await fresh({ unlocked: 7, best: { 1: { stars: 2 }, 3: { stars: 3 } } });
  await ev(() => window.__game.writeSaveNow?.() ?? import('/src/platform/native.ts').then((m) => m.writeSave(window.__game.save)));
  await sleep(800);
  await p.reload();
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  const s = await ev(() => ({ unlocked: window.__game.save.unlocked, best: window.__game.save.best }));
  ok(s.unlocked === 7 && s.best[3]?.stars === 3 && s.best[1]?.stars === 2, `after a reload: ${JSON.stringify(s)}`);
});

ok(!errors.length, `no page errors${errors.length ? ': ' + [...new Set(errors)].slice(0, 4).join(' | ') : ''}`);
console.log(`\n${total - bad}/${total} OK${bad ? `, ${bad} FAIL` : ''}`);
await b.close();
process.exit(bad ? 1 : 0);
