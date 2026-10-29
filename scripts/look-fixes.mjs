// Dev: what the TestFlight 0.1.0 try found, checked as the player meets it: the trimmer's trigger let go
// however the thumb leaves it (slid off, the trigger hidden under it, a lift never heard); MİSİNA TAK
// clear of the starter's plate; the shop's later things on sale while developing, with their pictures;
// the settings' frame rate; 30 frames a second on a phone, its quality never climbing; Değirmen Önü's
// fence off its track and the way into Taşlı Yamaç with no ditch. Shots in test-output/fixes.
// Usage (dev server running): node scripts/look-fixes.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? 'test-output/fixes';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-fixes-${Date.now()}` });
const p = await browser.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('dialog', (d) => d.accept());
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const job = async (id, extra = {}) => {
  await p.evaluate(
    (id, extra) => {
      const g = window.__game;
      if (g.mode === 'playing') g.quitToMenu();
      Object.assign(g.save, { introDone: true, tutorialSeen: true, lookSeen: true, harvestOffered: 99, unlocked: 20, weather: 'sunny', camera: 'fpv' }, extra);
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
      g.start(g.levelById(id));
    },
    id,
    extra,
  );
  await p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 90000 });
  await sleep(1500);
};
const look = async (n, c) => {
  await p.evaluate((c) => {
    const f = window.__game.session.field;
    const fy = f.height(c.x, c.z) + c.y;
    const ty = f.height(c.tx, c.tz) + c.ty;
    const d = { x: c.tx - c.x, y: ty - fy, z: c.tz - c.z };
    window.__game.view.freeCam = { x: c.x, y: fy, z: c.z, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y / Math.hypot(d.x, d.y, d.z)) };
    // (The hands and the trimmer out of the picture.)
    window.__game.view.fpvBody.visible = false;
  }, c);
  await sleep(1300);
  await p.screenshot({ path: `${OUT}/${n}.png` });
  await p.evaluate(() => {
    window.__game.view.freeCam = null;
    window.__game.view.fpvBody.visible = true;
  });
};

await p.goto(`${base}?tirpan`, { timeout: 120000 });
await p.waitForFunction('window.__ready === true', { timeout: 120000 });

// ---- On a phone: 30 frames a second while playing; the quality where it started.
await job(3);
const q0 = await p.evaluate(() => window.__game.view.quality);
const fps = async () =>
  p.evaluate(async () => {
    const v = window.__game.view;
    const f0 = v.frame;
    let n = 0;
    v.frame = function (...a) {
      n++;
      return f0.apply(this, a);
    };
    await new Promise((r) => setTimeout(r, 3000));
    v.frame = f0;
    return n / 3;
  });
const f30 = await fps();
ok(f30 > 24 && f30 < 33, `a phone plays at 30 frames a second (${f30.toFixed(1)})`);
await p.evaluate(() => (window.__game.save.smooth = true));
const f60 = await fps();
ok(f60 > 40, `Akıcı: more (${f60.toFixed(1)})`);
await p.evaluate(() => (window.__game.save.smooth = false));
await sleep(13000);
const q1 = await p.evaluate(() => window.__game.view.quality);
ok(q0 === 'medium' && q1 === q0, `an iPhone starts at medium and it does not climb (${q0} → ${q1})`);

// ---- The trigger, the engine running.
await p.evaluate(() => {
  const s = window.__game.session;
  s.intro = null;
  s.hasTrimmer = true;
  s.broken = false;
  s.line = s.gear.lineMax;
  s.starter.primes = 5;
  s.starter.warm = true;
  s.flood = 0;
  s.running = true;
  s.temp = 0.5;
  window.__game.input.setGas(0);
  // (Started by hand: the starter's plate put away, as a pull that starts it does.)
  window.__game.updateStarterUi();
});
await sleep(500);
const g = await p.evaluate(() => {
  const r = document.getElementById('gas-btn').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height * 0.25, w: r.width };
});
const gas = () => p.evaluate(() => window.__game.input.throttleLevel);
ok(g.w > 0, 'the trigger is up');
// Held, then slid off it and lifted somewhere else.
await p.touchscreen.touchStart(g.x, g.y);
await sleep(900);
const held = await gas();
await p.touchscreen.touchMove(200, 200);
await p.touchscreen.touchEnd();
await sleep(1400);
ok(held > 0.5 && (await gas()) === 0, `held (${held.toFixed(2)}), slid off and lifted elsewhere: idle (${(await gas()).toFixed(2)})`);
// Held, the trigger hidden under the thumb (on the pat pat), lifted: idle.
await p.touchscreen.touchStart(g.x, g.y);
await sleep(700);
await p.evaluate(() => document.body.classList.add('travel'));
await sleep(300);
await p.touchscreen.touchEnd();
await p.evaluate(() => document.body.classList.remove('travel'));
await sleep(1400);
ok((await gas()) === 0, `hidden under the thumb: idle after (${(await gas()).toFixed(2)})`);
// A thumb whose lift was never heard (the bug: the trigger stuck open for good), then pressed again.
await p.evaluate(() => {
  const b = document.getElementById('gas-btn');
  const r = b.getBoundingClientRect();
  b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, clientX: r.x + r.width / 2, clientY: r.y + 5, bubbles: true, pointerType: 'touch' }));
});
await sleep(900);
const stuck = await gas();
await p.touchscreen.touchStart(g.x, g.y + 40);
await sleep(300);
await p.touchscreen.touchEnd();
await sleep(1400);
ok(stuck > 0.5 && (await gas()) === 0, `stuck open (${stuck.toFixed(2)}), pressed again and let go: idle (${(await gas()).toFixed(2)})`);
// The app put away while held.
await p.touchscreen.touchStart(g.x, g.y);
await sleep(700);
await p.evaluate(() => {
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  delete document.hidden;
});
await sleep(1400);
ok((await gas()) === 0, `put away while held: idle (${(await gas()).toFixed(2)})`);
await p.touchscreen.touchEnd();
await p.screenshot({ path: `${OUT}/1-tetik.png` });
// (Put away, the game paused itself: back to it.)
await p.evaluate(() => document.getElementById('btn-resume').click());
await sleep(500);

// ---- MİSİNA TAK, the engine off: beside the starter's plate.
await p.evaluate(() => {
  const s = window.__game.session;
  s.broken = true;
  s.line = 0;
  // (Away from the can, where it is filled up again by itself.)
  s.x = 0;
  s.z = 0;
  s.spool = 0;
  s.running = false;
  window.__game.updateStarterUi();
});
await sleep(800);
const rt = await p.evaluate(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; };
  return { re: box(document.getElementById('btn-rethread')), st: box(document.querySelector('#starter .starter-row')) };
});
const over = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
ok(rt.re.w > 0 && rt.st.w > 0 && !over(rt.re, rt.st), `MİSİNA TAK beside the starter (${JSON.stringify(rt)})`);
ok(rt.re.l >= 0, 'and on the screen');
await p.screenshot({ path: `${OUT}/2-misina-motor-kapali.png` });
await p.evaluate(() => {
  window.__game.session.running = true;
  window.__game.updateStarterUi();
});
await sleep(800);
await p.screenshot({ path: `${OUT}/3-misina-motor-acik.png` });

// ---- The settings: the frame rate.
await p.evaluate(() => {
  window.__game.quitToMenu();
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
});
await sleep(800);
await p.evaluate(() => document.getElementById('btn-settings').click());
await sleep(800);
const st = await p.evaluate(() => document.querySelector('#set-fps button.on')?.textContent);
ok(st === 'Serin (30)', `Kare hızı there, Serin chosen (${st})`);
await p.screenshot({ path: `${OUT}/4-ayarlar.png` });
await p.evaluate(() => document.getElementById('set-fps').scrollIntoView());
await sleep(300);
await p.screenshot({ path: `${OUT}/4b-ayarlar-kare.png` });
await p.evaluate(() => document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show')));

// ---- The shop: on sale while developing, with their pictures.
const shopCard = (tab, name) =>
  p.evaluate(
    async (tab, name) => {
      const g = window.__game;
      g.save.unlocked = 3;
      g.shopTab = tab;
      g.shopNote = null;
      g.openShop();
      await new Promise((r) => setTimeout(r, 600));
      const c = [...document.querySelectorAll('.shop-card')].find((x) => x.querySelector('b')?.textContent === name);
      const img = c?.querySelector('img');
      return { found: !!c, locked: c?.classList.contains('locked'), label: c?.querySelector('.btn.buy')?.textContent, img: img?.getAttribute('src'), loaded: !!img && img.complete && img.naturalWidth > 0 };
    },
    tab,
    name,
  );
const big = await shopCard('arac', 'Büyük Traktör');
ok(big.found && !big.locked && /shop-buyuk/.test(big.img) && big.loaded, `Büyük Traktör on sale at job 3, its picture (${JSON.stringify(big)})`);
await p.screenshot({ path: `${OUT}/5-dukkan-arac.png` });
let saw = null;
for (const tab of ['donanim', 'gear', 'ekipman', 'alet', 'makine']) {
  saw = await shopCard(tab, 'Motorlu Testere');
  if (saw.found) break;
}
ok(saw.found && !saw.locked && /shop-testere/.test(saw.img) && saw.loaded, `Motorlu Testere on sale, its picture (${JSON.stringify(saw)})`);
await p.screenshot({ path: `${OUT}/6-dukkan-donanim.png` });
await p.evaluate(() => document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show')));

// ---- Değirmen Önü's fence, seen from the next garden (Dere Yanı): off the track.
await job(9);
const mill = await p.evaluate(() => {
  const f = window.__game.session.field;
  const o = f.others.find((q) => q.level.id === 10);
  const fence = o.maxZ + 1.5;
  // The tracks' nearest point to its front fence, away from the gate.
  let d = Infinity;
  for (const r of f.roads) for (const q of r.pts) if (q.x > o.minX - 2.9 && q.x < o.maxX + 2.9 && Math.abs(q.x - o.entryX) > 6) d = Math.min(d, Math.abs(q.z - fence));
  return { x: (o.minX + o.maxX) / 2, z: fence, d };
});
ok(mill.d > 2.3, `Değirmen Önü: the track ${mill.d.toFixed(1)} m off its fence (was on it)`);
await look('7-degirmen-onu-tel', { x: mill.x + 16, y: 2.2, z: mill.z + 9, tx: mill.x - 2, ty: 0.6, tz: mill.z });
await look('7b-degirmen-onu-ust', { x: mill.x + 2, y: 14, z: mill.z + 10, tx: mill.x, ty: 0, tz: mill.z - 2 });

// ---- The way into Taşlı Yamaç: no ditch.
await job(16);
const way = await p.evaluate(() => {
  const f = window.__game.session.field;
  const end = (r) => Math.hypot(r.pts.at(-1).x - f.entryX, r.pts.at(-1).z - f.depth / 2);
  const r = f.roads.reduce((a, b) => (end(b) < end(a) ? b : a));
  const at = (k) => r.pts[Math.max(0, r.pts.length - k)];
  return { a: at(60), b: at(30), c: at(8) };
});
// Along it, on it at eye height (where the ditch was), and from above.
await look('8-tasli-yamac-yol', { x: way.a.x, y: 1.8, z: way.a.z, tx: way.b.x, ty: 0.5, tz: way.b.z });
await look('8b-tasli-yamac-yol-kapi', { x: way.b.x, y: 1.8, z: way.b.z, tx: way.c.x, ty: 0.5, tz: way.c.z });
await look('8c-tasli-yamac-yol-ust', { x: way.b.x + 6, y: 18, z: way.b.z + 6, tx: way.b.x, ty: 0, tz: way.b.z });

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await browser.close();
process.exit(bad ? 1 : 0);
