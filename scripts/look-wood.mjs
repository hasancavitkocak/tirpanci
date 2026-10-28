// Dev: the storm's wood end to end, by its own buttons where it can: the chainsaw locked before its job
// and bought; a Karadere job with a tree down across a row of ocaks (the first time it can, always), the
// grass under it not mown till cut, refused with the trimmer in hand, the chainsaw in hand once it is
// put away, started on the trimmer's starter without its primer (choke, cord; cold: it coughs first),
// on the trimmer's own trigger (a little throttle cuts slowly, full fast), piece by piece (the
// tree shorter, the logs on the ground); the job done: the
// logs piled by the gate (the result says so); Serbest gez: told to fetch them, KÜTÜK YÜKLE on the pat pat
// at the yellow mark, İSTİFLE by the yard's woodpile rack, ODUN SAT. Shots in test-output/wood.
// Usage (dev server running): node scripts/look-wood.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/wood';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-wood-${Date.now()}` });
const page = await browser.newPage();
await page.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (r) => /\.(glb|jpg|webp|png)$/.test(r.url()) && errors.push(`failed ${r.url()}`));
page.on('dialog', (d) => d.accept());
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const wood = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.save.wood ?? null)));
const objective = () => page.evaluate(() => document.getElementById('objective').innerText.replace(/\s+/g, ' '));
const toast = () => page.evaluate(() => document.getElementById('toasts').innerText.replace(/\s+/g, ' '));
const acts = () => page.evaluate(() => [...document.querySelectorAll('#actions [data-id]')].map((b) => b.dataset.id));
/** A button pressed (held for ms when given; a shot `mid` 1.2 s in). */
const press = async (id, ms = 0, mid = '') => {
  const b = await page.$(`#actions [data-id="${id}"]`);
  if (!b) return false;
  const r = await b.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  if (mid) {
    await sleep(1200);
    await shot(mid);
    await sleep(Math.max(60, ms - 1200));
  } else await sleep(ms || 60);
  await page.mouse.up();
  await sleep(250);
  return true;
};
/** The trigger held `up` of the way up it (0 its foot, 1 its top); returns the thumb's release. */
const trigger = async (up) => {
  const b = await page.$('#gas-btn');
  const r = await b.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height - r.height * 0.8 * up);
  await page.mouse.down();
  return async () => {
    await page.mouse.up();
    await sleep(250);
  };
};
/**
 * Full throttle till the next piece is off, let go at once (held on, it goes on to the next). Named: a shot
 * first with a little throttle (a shot takes a while; flat out the saw would be through more than one).
 */
const cutOne = async (i, name) => {
  if (name) {
    const r = await trigger(0.15);
    await sleep(900);
    await shot(name);
    await r();
  }
  const release = await trigger(1);
  await page.waitForFunction((n) => window.__game.woodCut > n, { timeout: 15000, polling: 50 }, i).catch(() => {});
  await release();
};
/** A look from (x, y over the ground, z) at (tx, ty over the ground, tz), the game held. */
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
/** The tree's places (game/wood.ts) worked out in the page. */
const treeAt = () =>
  page.evaluate(() =>
    import('/src/game/wood.ts').then((m) => {
      const g = window.__game;
      const t = g.woodTree;
      const c = g.woodCut;
      if (!t) return null;
      return { cut: c < m.WOOD.pieces ? m.treePoint(t, m.cutAt(c), m.cutStand(c)) : null, mid: m.treePoint(t, 0), side: m.treePoint(t, 0, 10) };
    }),
  );
const yard = () =>
  page.evaluate(() =>
    import('/src/game/wood.ts').then((m) => {
      const f = window.__game.session.field;
      const w = window.__game.save.wood;
      return { ...m.woodSpots(f), piles: w.piles.map((p) => m.pileSpots(f, p)) };
    }),
  );
/** Mown cells across the crown, 3 m along the tree. */
const mowCrown = () =>
  page.evaluate(() =>
    import('/src/game/wood.ts').then((m) => {
      const g = window.__game;
      const f = g.session.field;
      const a = m.treePoint(g.woodTree, 3, -1.2);
      const b = m.treePoint(g.woodTree, 3, 1.2);
      const before = f.mown;
      f.cutSegment(a.x, a.z, b.x, b.z, 0.2);
      return f.mown - before;
    }),
  );
/** The worker on foot at (x, z) facing (tx, tz). */
const put = (at, to) =>
  page.evaluate(
    (at, to) => {
      const g = window.__game;
      const s = g.session;
      if (s.driving) s.alight();
      s.x = at.x;
      s.z = at.z;
      s.yaw = Math.atan2(to.x - at.x, to.z - at.z);
      g.lookYaw = s.yaw;
    },
    at,
    to,
  );
/** The vehicle parked so its load bed stands at (x, z), facing yaw; the worker beside it. */
const park = (at, yaw) =>
  page.evaluate(
    (at, yaw) => {
      const g = window.__game;
      const s = g.session;
      const f = s.field;
      if (s.driving) s.alight();
      const v = f.vehicle;
      Object.assign(v, { x: at.x, z: at.z, yaw, speed: 0, art: 0 });
      for (let k = 0; k < 3; k++) {
        if (f.trailer) f.trailer.yaw = yaw;
        const b = g.loadBed(s);
        v.x += at.x - b.x;
        v.z += at.z - b.z;
      }
      const b = g.loadBed(s);
      s.x = b.x + Math.cos(yaw) * 1.6;
      s.z = b.z - Math.sin(yaw) * 1.6;
      s.yaw = yaw - Math.PI / 2;
      g.lookYaw = s.yaw;
    },
    at,
    yaw,
  );
const job = async (id) => {
  await page.evaluate((id) => {
    const g = window.__game;
    if (g.mode === 'playing') g.quitToMenu();
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.start(g.levelById(id));
  }, id);
  await page.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
  await sleep(1500);
};

await page.goto(`${base}?quality=high`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  Object.assign(g.save, { introDone: true, tutorialSeen: true, harvestOffered: 99, unlocked: 13, weather: 'sunny', vehicle: 'patpat', vehicles: ['patpat'] });
  delete g.save.wood;
  g.save.equipment.owned = g.save.equipment.owned.filter((x) => x !== 'testere');
});

// ---- 1. The chainsaw: locked before its job, then bought.
const sawCard = () =>
  page.evaluate(async () => {
    const g = window.__game;
    g.shopTab = 'donanim';
    g.shopNote = null;
    g.openShop();
    await new Promise((r) => setTimeout(r, 300));
    const c = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === 'Motorlu Testere');
    return { locked: c?.classList.contains('locked'), label: c?.querySelector('.btn.buy')?.textContent };
  });
let sc = await sawCard();
ok(sc.locked && /14\. İŞ/.test(sc.label), `job 13: the chainsaw locked till job 14 (${sc.label})`);
await page.evaluate(() => (window.__game.save.unlocked = 20));
sc = await sawCard();
ok(!sc.locked && /15\.000 TL/.test(sc.label), `job 14 on: on sale (${sc.label})`);
const money0 = await page.evaluate(() => window.__game.save.money);
await page.evaluate(async () => {
  const c = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === 'Motorlu Testere');
  c.querySelector('.btn.buy').click();
  await new Promise((r) => setTimeout(r, 400));
  if (document.getElementById('confirm')?.classList.contains('show')) document.getElementById('btn-confirm-yes').click();
  await new Promise((r) => setTimeout(r, 400));
});
const bought = await page.evaluate(() => ({ owned: window.__game.save.equipment.owned.includes('testere'), money: window.__game.save.money }));
ok(bought.owned && money0 - bought.money === 15000, `the chainsaw bought (-${money0 - bought.money} TL)`);
await shot('1-dukkan-testere');
ok(await page.evaluate(() => !document.getElementById('btn-wood')), 'no Odun İşi button on the menu any more');

// ---- 2. A Karadere job: the first one a tree can be in has one.
await job(15);
let T = await treeAt();
ok(!!T, `job 15: a storm's tree down in the garden`);
const tt = await toast();
ok(/Fırtına bahçeye ağaç devirmiş/.test(tt), `the job's message says so: ${tt}`);
ok(await page.evaluate(() => !!window.__game.session.field.shade && window.__game.session.field.blocks.length > 3), 'its grass shaded, the tree in the way');
await look('2-bahcede-agac', { x: T.side.x, y: 2.6, z: T.side.z, tx: T.mid.x, ty: 0.6, tz: T.mid.z });
// With the trimmer in hand: KES refused.
await page.evaluate(() => Object.assign(window.__game.session, { intro: null, hasTrimmer: true }));
await put(T.cut, T.mid);
await sleep(500);
let a = await acts();
ok(a.includes('cut-trimmer'), `the trimmer in hand: TIRPANLA OLMAZ (${a.join(',')})`);
const mownUnder = await mowCrown();
ok(mownUnder < 4, `the grass under the crown not mown while it lies there (${mownUnder} cells at its edge)`);
// Trimmer put away: the chainsaw in hand.
await page.evaluate(() => (window.__game.session.hasTrimmer = false));
await sleep(400);
a = await acts();
/** What shows of the starter and the controls. */
const shown = () =>
  page.evaluate(() => {
    const vis = (id) => {
      const e = document.getElementById(id);
      return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    };
    return { saw: window.__game.view.sawInHand, running: window.__game.sawRunning, starter: vis('starter'), prime: vis('btn-prime'), choke: vis('btn-choke'), cord: vis('cord'), gas: vis('gas-btn'), bump: vis('btn-bump'), stop: vis('btn-stop'), hint: document.getElementById('starter-hint').textContent };
  });
const pull = async () => {
  await page.keyboard.press('KeyR');
  await sleep(250);
};
let u = await shown();
ok(u.saw && !u.running && u.starter && u.choke && u.cord && !u.prime && !u.gas && !u.bump, `the chainsaw in hand, not running: its starter, choke and cord, no primer, no trigger, no MİSİNA (${JSON.stringify(u)})`);
await shot('2b-testere-calistir');
// Cold: the choke, the cord till it coughs; the choke off, the cord: running.
await page.click('#btn-choke');
await sleep(200);
await pull();
await pull();
const coughed = await page.evaluate(() => window.__game.sawStarter.popped);
ok(coughed && !(await page.evaluate(() => window.__game.sawRunning)), 'cold, on the choke: it coughs');
await page.click('#btn-choke');
await sleep(200);
await pull();
await sleep(300);
u = await shown();
ok(u.running && u.gas && u.stop && !u.bump && !u.starter, `the choke off, pulled: running, the trigger and STOP, no MİSİNA (${JSON.stringify(u)})`);
// STOP: it stops; warm now, a pull starts it again.
await page.click('#btn-stop');
await sleep(400);
u = await shown();
ok(!u.running && u.starter && !u.gas, `STOP: stopped, its starter back (${u.hint})`);
await pull();
await sleep(300);
ok(await page.evaluate(() => window.__game.sawRunning), 'warm: started again with one pull');
// A little throttle: slow (a quarter of the way through in a second and a half at the most); full: quicker.
let release = await trigger(0.15);
await sleep(1500);
const low = await page.evaluate(() => ({ t: window.__game.sawT, gas: window.__game.input.throttleLevel, cut: window.__game.woodCut }));
await release();
await page.evaluate(() => (window.__game.sawT = 0));
release = await trigger(1);
await sleep(1500);
const high = await page.evaluate(() => ({ t: window.__game.sawT, gas: window.__game.input.throttleLevel, cut: window.__game.woodCut }));
await release();
ok(low.cut === 0 && low.t > 0 && low.t < 0.25 && (high.t > low.t * 3 || high.cut > 0), `a little throttle cuts slowly (${low.t.toFixed(2)} at gas ${low.gas.toFixed(2)}), full quickly (${high.t.toFixed(2)} at gas ${high.gas.toFixed(2)}, ${high.cut} off)`);
// (Let go, the trigger eases back to idle over a second, still cutting a little on the way.)
await sleep(1300);
const kept = await page.evaluate(() => window.__game.sawT);
await sleep(600);
ok((await page.evaluate(() => window.__game.sawT)) === kept, 'let go: the cut stays as far as it got');
await page.evaluate(() => {
  window.__game.sawT = 0;
  window.__game.woodCut = 0;
});

// ---- 3. Cut it, piece by piece.
for (let i = 0; i < 8; i++) {
  T = await treeAt();
  await put(T.cut, T.mid);
  await sleep(450);
  await cutOne(i, i === 0 ? '3-kesiyor-tepe' : i === 6 ? '4-kesiyor-govde' : '');
  const c = await page.evaluate(() => window.__game.woodCut);
  if (c !== i + 1) {
    ok(false, `cut ${i + 1}: ${c} cut (${(await acts()).join(',')})`);
    break;
  }
  if (i === 3) await look('5-yarisi', { x: T.side.x, y: 2.4, z: T.side.z, tx: T.mid.x, ty: 0.5, tz: T.mid.z });
}
ok((await page.evaluate(() => window.__game.woodCut)) === 8, 'all 8 pieces cut');
await look('6-kutukler', { x: T.side.x, y: 2.6, z: T.side.z, tx: T.mid.x, ty: 0.3, tz: T.mid.z });
const mownAfter = await mowCrown();
ok(mownAfter > 5, `cut away: its grass mown now (${mownAfter} cells)`);

// ---- 4. The job done: the logs piled by the gate.
await page.evaluate(() => window.__game.finish());
await sleep(800);
const res = await page.evaluate(() => document.getElementById('result-table').innerText.replace(/\s+/g, ' '));
ok(/Devrik ağaç 8 kütük kapının önünde/.test(res), `the result: ${res.slice(Math.max(0, res.indexOf('Devrik')), res.indexOf('Devrik') + 40)}`);
await shot('7-sonuc');
let w = await wood();
ok(w.piles.length === 1 && w.piles[0].n === 8, `one pile of 8 by the gate (${JSON.stringify(w.piles)})`);

// ---- 5. Serbest gez: fetched home, stacked, sold.
await page.evaluate(() => {
  const g = window.__game;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.levelTab = 2;
  void g.startRoam();
});
await page.waitForFunction('window.__game.mode === "playing" && window.__game.session.field.region.id === 2 && !document.getElementById("loading").classList.contains("show")', { timeout: 90000 });
await sleep(1500);
let o = await objective();
ok(/kütü/i.test(o), `Serbest gez: told to fetch the logs: ${o}`);
const Y = await yard();
const P = Y.piles[0];
await look('8-kapi-yigin', { x: P.load.x + (P.load.x - P.pile.x) * 1.4, y: 2.2, z: P.load.z + (P.load.z - P.pile.z) * 1.4, tx: P.pile.x, ty: 0.4, tz: P.pile.z });
const money1 = await page.evaluate(() => window.__game.save.money);
for (let trip = 0; trip < 2; trip++) {
  if (trip === 0) {
    await put(P.pile, P.load);
    await sleep(400);
    a = await acts();
    ok(a.includes('log-far'), `by the pile, the vehicle away: ARACI YANAŞTIR (${a.join(',')})`);
  }
  await park(P.load, P.load.yaw);
  await sleep(500);
  a = await acts();
  ok(a.includes('log'), `trip ${trip + 1}: KÜTÜK YÜKLE (${a.join(',')})`);
  await press('log', 4 * 700 + 500);
  w = await wood();
  ok(w.load === 4, `trip ${trip + 1}: four logs on the pat pat (${w.load}, left ${w.piles[0].n})`);
  if (trip === 0) {
    o = await objective();
    ok(/Eve götür|Patpata bin/.test(o), `full: home with them: ${o}`);
    await look('9-patpat-yuklu', { x: P.load.x + Math.cos(P.load.yaw) * 4, y: 2.6, z: P.load.z - Math.sin(P.load.yaw) * 4, tx: P.load.x, ty: 0.8, tz: P.load.z });
  }
  await park(Y.unload, Y.unload.yaw);
  await sleep(500);
  a = await acts();
  ok(a.includes('stack'), `trip ${trip + 1}: at the rack: İSTİFLE (${a.join(',')})`);
  await press('stack', 4 * 700 + 500);
  w = await wood();
  ok(w.load === 0 && w.stock === 4 * (trip + 1), `trip ${trip + 1}: in the woodpile ${w.stock}`);
}
ok((await page.evaluate(() => window.__game.save.money)) === money1, 'stacking pays nothing: the logs are the player’s');
await page.evaluate(() => Object.assign(window.__game.session.field.vehicle, { x: window.__game.session.field.harman.x - 3, z: window.__game.session.field.harman.z + 3 }));
await put({ x: Y.rack.x - 2.5, z: Y.rack.z }, Y.rack);
await sleep(500);
await look('10-odunluk', { x: Y.unload.x - 4, y: 1.8, z: Y.unload.z + 2.5, tx: Y.rack.x, ty: 0.5, tz: Y.rack.z - 1.2 });
a = await acts();
ok(a.includes('sell-wood'), `at the rack: ODUN SAT (${a.join(',')})`);
await press('sell-wood');
const paid = (await page.evaluate(() => window.__game.save.money)) - money1;
w = await wood();
ok(paid === 8 * 350 && w.stock === 0, `sold: +${paid} TL, the woodpile empty`);

// ---- 6. Not every job has one; none in Yeşilyamaç.
let trees = 0;
for (let k = 0; k < 10; k++) {
  await job(16);
  if (await page.evaluate(() => !!window.__game.woodTree)) trees++;
}
ok(trees > 0 && trees < 10, `job 16 ten times: a tree in ${trees} (now and then)`);
await job(5);
const y1 = await page.evaluate(() => ({ tree: !!window.__game.woodTree, view: !!window.__game.view.world?.wood, rack: window.__game.session.field.yardProps.some((y) => y.kind === 'rack') }));
ok(!y1.tree && !y1.view && !y1.rack, `Yeşilyamaç: none of it (${JSON.stringify(y1)})`);
ok(!errors.length, `no page errors or missing files${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await browser.close();
process.exit(bad ? 1 : 0);
