// Dev: what the TestFlight found next. BU İŞE GEÇ pressed at a garden's gate while driving (Serbest gez,
// pat pat / tractor / big tractor, Yeşilyamaç and Karadere's job 15): the vehicle stops where it is, he
// gets down beside it, and the job starts there (not tens of metres off). At a job's start with more
// tools than the trimmer, the trimmer is taken out of the BAGAJ (no TIRPANI AL, the way said, the
// trimmer's card shown, the rest only after it). The yard gate spans just its gap (Karadere's was 18 m).
// Usage (dev server running): node scripts/look-switch.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/switch';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-switch-${Date.now()}` });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const ALL = ['standart', 'yuvarlak', 'testere', 'ufleyici', 'capa'];
const acts = () => p.evaluate(() => [...document.querySelectorAll('#actions .action-btn')].map((a) => a.dataset.id));
const tap = (id) =>
  p.evaluate((id) => {
    const el = document.querySelector(`#actions [data-id="${id}"]`);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    return true;
  }, id);
const loaded = () => p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 90000 });

await p.goto(`${base}?quality=high`, { timeout: 120000 });
await p.waitForFunction('window.__ready === true', { timeout: 120000 });

/** Serbest gez in a village with a vehicle; driven up to a garden's gate, BU İŞE GEÇ pressed rolling. */
const drive = async (region, target, vehicle, owned, near = false, trailer = false) => {
  await p.evaluate(
    async (region, vehicle, owned, trailer) => {
      const g = window.__game;
      if (g.mode === 'playing') g.quitToMenu();
      Object.assign(g.save, { introDone: true, tutorialSeen: true, lookSeen: true, harvestOffered: 99, unlocked: 20, weather: 'sunny', dog: false, vehicle, vehicles: ['patpat', 'traktor', 'buyuk', 'romork'], trailerOff: !trailer, patosOn: false, mowedAt: {} });
      g.save.equipment = { ...g.save.equipment, owned };
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
      g.levelTab = region;
      await g.startRoam();
    },
    region,
    vehicle,
    owned,
    trailer,
  );
  await loaded();
  await sleep(1000);
  const put = await p.evaluate((target, near) => {
    const g = window.__game;
    const s = g.session;
    const f = s.field;
    const q = f.others.find((o) => o.level.id === target);
    if (!q) return null;
    const v = f.vehicle;
    // Coming down the road past its gate, rolling.
    for (const dz of near ? [-1.5, -0.5, 0.5, 1.5, 2.5] : [5, 6, 7, 8, 4, 9, 10]) {
      const x = q.entryX;
      const z = q.maxZ + dz;
      for (const yaw of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) {
        if (!f.vehicleFits(x, z, yaw, 0)) continue;
        v.x = x;
        v.z = z;
        v.yaw = yaw;
        v.art = 0;
        s.x = x + Math.cos(yaw) * 1.8;
        s.z = z - Math.sin(yaw) * 1.8;
        if (!s.board()) continue;
        v.speed = 2.5;
        return { x, z, yaw };
      }
    }
    return { fail: true };
  }, target, near);
  return put;
};

for (const [region, target, vehicle, near, trailer] of [
  [1, 3, 'patpat'],
  [1, 3, 'traktor'],
  [2, 15, 'patpat'],
  [2, 15, 'traktor'],
  [2, 15, 'buyuk'],
  // (Right up at the gate, and with the trailer on behind.)
  [2, 15, 'traktor', true],
  [2, 15, 'buyuk', true, true],
  [2, 15, 'traktor', false, true],
  [1, 3, 'traktor', true, true],
  [2, 12, 'buyuk', true],
  [2, 14, 'patpat', true],
]) {
  const name = `${region === 1 ? 'Yeşilyamaç' : 'Karadere'} iş ${target}, ${vehicle}${near ? ', kapının dibinde' : ''}${trailer ? ', römorklu' : ''}`;
  const owned = vehicle === 'patpat' && region === 2 && !near ? ALL : ['standart', 'yuvarlak'];
  const put = await drive(region, target, vehicle, owned, near, trailer);
  if (!put || put.fail) {
    ok(false, `${name}: driven to its gate (${JSON.stringify(put)})`);
    continue;
  }
  await sleep(250);
  const a = await acts();
  ok(a.includes('switch'), `${name}: rolling past its gate, BU İŞE GEÇ (${a})`);
  if (!a.includes('switch')) continue;
  // Pressed while it rolls: where it is then, in the village's coordinates.
  const was = await p.evaluate(() => {
    const g = window.__game;
    const s = g.session;
    const f = s.field;
    const v = f.vehicle;
    const O = f.origin;
    // (Rolling as it is pressed: on a slow machine it may have run down since.)
    v.speed = Math.max(v.speed, 2.5);
    const at = { x: v.x + O.x, z: v.z + O.z, speed: v.speed, driving: s.driving };
    document.querySelector('#actions [data-id="switch"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    return at;
  });
  await p.waitForFunction((id) => window.__game.session?.level?.id === id && !window.__game.roaming, { timeout: 90000 }, target).catch(() => {});
  await loaded();
  await sleep(900);
  const now = await p.evaluate(() => {
    const g = window.__game;
    const s = g.session;
    const f = s.field;
    const v = f.vehicle;
    const O = f.origin;
    return { level: s.level.id, x: v.x + O.x, z: v.z + O.z, speed: v.speed, driving: s.driving, gap: Math.hypot(s.x - v.x, s.z - v.z), intro: s.intro, trimmer: s.hasTrimmer, tractor: f.tractor, big: f.bigTractor };
  });
  const moved = Math.hypot(now.x - was.x, now.z - was.z);
  ok(was.driving && Math.abs(was.speed) > 1, `${name}: it was rolling at the wheel when pressed (${was.speed.toFixed(1)} m/s)`);
  ok(now.level === target, `${name}: the job taken (${now.level})`);
  ok(moved < 2, `${name}: the vehicle stays where it was (${moved.toFixed(1)} m off)`);
  ok(Math.abs(now.speed) < 0.05 && !now.driving, `${name}: stopped, he is down (speed ${now.speed.toFixed(2)}, driving ${now.driving})`);
  ok(now.gap < 4, `${name}: he stands beside it (${now.gap.toFixed(1)} m)`);
  ok(now.intro === 'take' && !now.trimmer, `${name}: the trimmer still in the vehicle, to be taken (${now.intro})`);
  ok(now.tractor === (vehicle !== 'patpat') && now.big === (vehicle === 'buyuk'), `${name}: the same vehicle`);
  await shot(`${region}-${target}-${vehicle}${near ? '-dip' : ''}${trailer ? '-romork' : ''}`);

  if (owned === ALL) {
    // ---- The bagaj at a job's start: the trimmer taken out of it.
    await sleep(300);
    const a2 = await acts();
    const obj = await p.evaluate(() => document.getElementById('objective').innerText.replace(/\s+/g, ' '));
    ok(a2.includes('bag') && !a2.includes('take'), `job's start, every tool owned: BAGAJ, no TIRPANI AL (${a2})`);
    ok(/BAGAJ/.test(obj), `the objective says to open the BAGAJ (${obj})`);
    await shot('bagaj-baslangic');
    await tap('bag');
    await sleep(400);
    const cards = await p.evaluate(() => [...document.querySelectorAll('#confirm .bag-tool')].map((t) => ({ id: t.dataset.tool, want: t.classList.contains('want'), off: t.disabled, text: t.querySelector('small').textContent })));
    const tr = cards.find((c) => c.id === 'trimmer');
    ok(tr && tr.want && !tr.off, `the trimmer's card shown to take (${JSON.stringify(tr)})`);
    ok(cards.filter((c) => c.id !== 'trimmer').every((c) => c.off && /önce tırpan/.test(c.text)), `the others after it (${cards.map((c) => `${c.id}:${c.text}`).join(', ')})`);
    await shot('bagaj-acik');
    await p.evaluate(() => document.querySelector('#confirm .bag-tool[data-tool="trimmer"]').click());
    await sleep(500);
    const st = await p.evaluate(() => ({ intro: window.__game.session.intro, trimmer: window.__game.session.hasTrimmer, open: document.getElementById('confirm').classList.contains('show') }));
    ok(st.trimmer && st.intro === 'line' && !st.open, `taken out: in hand, line to fit next (${JSON.stringify(st)})`);
  }
}

// ---- Walked to the gate, the vehicle left far back (by the house): it is brought up beside him.
for (const [region, target, vehicle] of [
  [2, 15, 'traktor'],
  [2, 15, 'buyuk'],
  [1, 3, 'patpat'],
]) {
  const name = `${region === 1 ? 'Yeşilyamaç' : 'Karadere'} iş ${target}, yürüyerek (${vehicle} geride)`;
  await drive(region, target, vehicle, ['standart', 'yuvarlak']);
  const far = await p.evaluate((target) => {
    const g = window.__game;
    const s = g.session;
    const f = s.field;
    s.alight();
    const v = f.vehicle;
    const q = f.others.find((o) => o.level.id === target);
    // Back up the road 50 m or more, he on foot at the gate.
    v.speed = 0;
    s.driving = false;
    s.x = q.entryX;
    s.z = q.maxZ + 2.5;
    const top = f.laneStart;
    if (top) ({ x: v.x, z: v.z, yaw: v.yaw } = top);
    return Math.hypot(v.x - s.x, v.z - s.z);
  }, target);
  await sleep(400);
  ok((await tap('switch')) && far > 15, `${name}: BU İŞE GEÇ on foot, the vehicle ${far.toFixed(0)} m back`);
  await p.waitForFunction((id) => window.__game.session?.level?.id === id && !window.__game.roaming, { timeout: 90000 }, target).catch(() => {});
  await loaded();
  await sleep(900);
  const now = await p.evaluate(() => {
    const s = window.__game.session;
    const v = s.field.vehicle;
    return { level: s.level.id, gap: Math.hypot(s.x - v.x, s.z - v.z), road: s.field.roadDistance(v.x, v.z) };
  });
  ok(now.level === target && now.gap < 15 && now.road < 2, `${name}: the vehicle brought up by him on the road (${now.gap.toFixed(1)} m, ${now.road.toFixed(1)} m off the road)`);
  await shot(`yuruyerek-${region}-${vehicle}`);
}

// ---- The yard gate: just its gap.
for (const [region, id] of [
  [1, 1],
  [2, 11],
]) {
  await p.evaluate(
    async (region) => {
      const g = window.__game;
      if (g.mode === 'playing') g.quitToMenu();
      g.levelTab = region;
      await g.startRoam();
    },
    region,
  );
  await loaded();
  await sleep(1200);
  const gate = await p.evaluate(() => {
    const g = window.__game;
    const f = g.session.field;
    const y = f.yardGate;
    const p = f.plateau;
    const mx = (y.ax + y.bx) / 2;
    const mz = (y.az + y.bz) / 2;
    // Looking at it from inside the yard.
    const cx = p.x + (mx - p.x) * 0.25;
    const cz = p.z + (mz - p.z) * 0.25;
    g.view.freeCam = { x: cx, y: f.height(cx, cz) + 1.8, z: cz, yaw: Math.atan2(mx - cx, mz - cz), pitch: -0.05 };
    return Math.hypot(y.bx - y.ax, y.bz - y.az);
  });
  ok(gate > 5 && gate < 7, `${region === 1 ? 'Yeşilyamaç' : 'Karadere'}: the yard gate ${gate.toFixed(1)} m`);
  await sleep(1200);
  await shot(`avlu-kapisi-${region}`);
  await p.evaluate(() => (window.__game.view.freeCam = null));
}

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await b.close();
process.exit(bad ? 1 : 0);
