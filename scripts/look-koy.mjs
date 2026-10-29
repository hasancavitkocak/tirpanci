// Dev: between the two villages. Karadere's ten jobs (16-20 new) fit in its village; Serbest gez driven to
// the way out's board, KÖYE GİT, arrives in the other village at the wheel by its way out (and back); a
// job in the other village taken on from SONRAKİ BAHÇE is driven to by the way out, and opens over there
// with the trimmer in the vehicle.
// Usage (dev server running): node scripts/look-koy.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
mkdirSync('test-output/koy', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-koy-${Date.now()}` });
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
const shot = (n) => p.screenshot({ path: `test-output/koy/${n}.png` });
const tap = (id) =>
  p.evaluate((id) => {
    const el = document.querySelector(`#actions [data-id="${id}"]`);
    if (!el) return false;
    for (const t of ['pointerdown', 'pointerup']) el.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 1 }));
    return true;
  }, id);
const st = () =>
  p.evaluate(() => {
    const g = window.__game;
    const s = g.session;
    const v = s.field.vehicle;
    const e = s.field.exit;
    return {
      mode: g.mode,
      level: s.level.id,
      region: s.field.region.id,
      roaming: g.roaming,
      travel: g.travelTo?.id ?? null,
      hasTrimmer: s.hasTrimmer,
      driving: s.driving,
      intro: s.intro,
      toExit: e ? Math.round(Math.hypot(v.x - e.x, v.z - e.z)) : -1,
      objective: document.getElementById('objective').innerText.replace(/\s+/g, ' ').trim(),
      acts: [...document.querySelectorAll('#actions [data-id]')].map((x) => x.dataset.id),
    };
  });
// The vehicle some way in from the way out, facing it (the board in view), then at it.
const toExit = (back) =>
  p.evaluate((back) => {
    const s = window.__game.session;
    const e = s.field.exit;
    const v = s.field.vehicle;
    Object.assign(v, { x: e.x - Math.sin(e.yaw) * back, z: e.z - Math.cos(e.yaw) * back, yaw: e.yaw, speed: 0 });
  }, back);
const loaded = (cond) => p.waitForFunction(`window.__game.mode === "playing" && document.getElementById("loading").classList.contains("show") !== true && (${cond})`, { timeout: 90000 });

await p.goto(`${base}?quality=low`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await p.evaluate(() => {
  const g = window.__game;
  Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20, harvestOffered: 99, weather: 'sunny', vehicle: 'patpat' });
});

// ---- A. Karadere's ten jobs: each one builds, its field clear of the others, the house and the roads' way.
const LV = await p.evaluate(() => {
  const g = window.__game;
  return [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((id) => g.levelById(id)).filter((l) => l && l.region === 2).length;
});
ok(LV === 10, `Karadere has 10 jobs (${LV})`);
for (const id of [16, 17, 18, 19, 20]) {
  await p.evaluate((id) => {
    const g = window.__game;
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.start(g.levelById(id));
  }, id);
  await loaded(`window.__game.session.level.id === ${id}`);
  await sleep(500);
  const r = await p.evaluate(() => {
    const s = window.__game.session;
    const f = s.field;
    const me = { minX: -f.width / 2, maxX: f.width / 2, minZ: -f.depth / 2, maxZ: f.depth / 2 };
    const boxes = [me, ...f.others];
    let overlap = '';
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const c = boxes[j];
        if (a.minX < c.maxX - 0.5 && c.minX < a.maxX - 0.5 && a.minZ < c.maxZ - 0.5 && c.minZ < a.maxZ - 0.5) overlap += `${i ? a.level.id : 'me'}x${c.level.id} `;
      }
    return { name: s.level.name, region: f.region.id, others: f.others.filter((o) => o.level.id < 100).length, overlap, lane: f.lane?.length ?? 0, house: f.house ? Math.round(Math.max(Math.abs(f.house.x) - f.width / 2, Math.abs(f.house.z) - f.depth / 2)) : null };
  });
  ok(r.region === 2 && !r.overlap && r.lane > 1, `job ${id} ${r.name}: in Karadere, no field over another (${r.overlap || 'none'}), a way in (${r.lane} pts), house ${r.house} m off`);
  await shot(`a-${id}`);
}

// ---- B. Serbest gez in Yeşilyamaç to its way out, KÖYE GİT: Karadere, at the wheel by its way out.
await p.evaluate(() => {
  const g = window.__game;
  g.levelTab = 1;
  void g.startRoam();
});
await loaded('window.__game.roaming && window.__game.session.field.region.id === 1');
await sleep(1000);
await p.evaluate(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x + 1.6;
  s.z = v.z;
  s.board();
});
let s = await st();
ok(s.driving && s.toExit > 10 && !s.acts.includes('exit'), `roaming at the wheel, far from the way out: no KÖYE GİT (${s.toExit} m, ${s.acts})`);
await toExit(22);
await sleep(1500);
await shot('b1-board-ahead');
await toExit(4);
await sleep(700);
s = await st();
ok(s.acts.includes('exit'), `at the way out: KÖYE GİT (${s.acts})`);
const exitSub = await p.evaluate(() => document.querySelector('#actions [data-id="exit"]')?.innerText.replace(/\s+/g, ' '));
ok(/Karadere/.test(exitSub ?? ''), `its button says where: ${exitSub}`);
await shot('b2-at-exit');
// On foot by the board: nothing (only at the wheel).
await p.evaluate(() => window.__game.session.alight());
await sleep(500);
s = await st();
ok(!s.acts.includes('exit'), `on foot by it: no KÖYE GİT (${s.acts})`);
await p.evaluate(() => window.__game.session.board());
await sleep(500);
ok(await tap('exit'), 'KÖYE GİT pressed');
await loaded('window.__game.session.field.region.id === 2');
await sleep(1200);
s = await st();
ok(s.roaming && s.region === 2, `Serbest gez in Karadere (${s.roaming}, ${s.region})`);
ok(s.driving && !s.hasTrimmer && s.toExit < 14, `at the wheel by Karadere's way out (${s.driving}, ${s.toExit} m)`);
ok(!s.acts.includes('take'), `no trimmer to take roaming (${s.acts})`);
await shot('b3-karadere-arrived');
// And back to Yeşilyamaç by Karadere's way out.
await toExit(4);
await sleep(700);
s = await st();
ok(s.acts.includes('exit'), `Karadere's way out: KÖYE GİT (${s.acts})`);
await tap('exit');
await loaded('window.__game.session.field.region.id === 1');
await sleep(1200);
s = await st();
ok(s.roaming && s.region === 1 && s.driving && s.toExit < 14, `back in Yeşilyamaç at the wheel by its way out (${s.region}, ${s.driving}, ${s.toExit} m)`);
await shot('b4-back');

// ---- C. Job 10 done, SONRAKİ BAHÇE: job 11 is in Karadere, driven to by the way out.
await p.evaluate(() => {
  const g = window.__game;
  g.roaming = false;
  document.body.classList.remove('roam');
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(10));
});
await loaded('window.__game.session.level.id === 10 && !window.__game.roaming');
await sleep(800);
await p.evaluate(() => {
  const s = window.__game.session;
  s.intro = null;
  s.hasTrimmer = true;
  s.x = 2;
  s.z = 2;
  s.field.mownCount = s.field.total;
});
await p.waitForFunction('document.getElementById("result").classList.contains("show")', { timeout: 20000 });
await sleep(600);
await p.evaluate(() => document.getElementById('btn-next').click());
await sleep(1200);
const called = await p.evaluate(() => document.getElementById('call').classList.contains('show') && document.getElementById('call-text').innerText);
ok(!!called, `the next job's call: ${String(called).slice(0, 50)}`);
await p.evaluate(() => document.getElementById('btn-call-ok').click());
await sleep(1500);
s = await st();
ok(s.mode === 'playing' && s.level === 10 && s.travel === 11, `KABUL ET: in the finished field, on the way to job 11 (${s.level}, ${s.travel})`);
await p.evaluate(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x + 1.6;
  s.z = v.z;
});
await sleep(600);
s = await st();
ok(s.acts.includes('drop'), `by the pat pat: TIRPANI BIRAK (${s.acts})`);
await tap('drop');
await sleep(400);
await tap('board');
await sleep(800);
s = await st();
ok(s.driving && /Karadere yolu: \d+ m/.test(s.objective), `driving: the way to Karadere (${s.objective})`);
await shot('c1-driving');
await toExit(4);
await sleep(700);
s = await st();
ok(s.acts.includes('exit') && s.level === 10, `at the way out: KÖYE GİT (${s.acts})`);
await tap('exit');
await loaded('window.__game.session.level.id === 11');
await sleep(1500);
s = await st();
ok(s.region === 2 && !s.roaming && s.travel === null, `job 11 opened in Karadere (${s.region}, roaming ${s.roaming})`);
ok(s.driving && s.intro === 'take' && !s.hasTrimmer && s.toExit < 14, `at the wheel by the way out, the trimmer in the vehicle (${s.driving}, ${s.intro}, ${s.toExit} m)`);
ok(!!s.objective, `its objective: ${s.objective}`);
await shot('c2-job11');
// Got off this far from the field: back on and to the field first (the trimmer is taken out there).
await p.evaluate(() => window.__game.session.alight());
await sleep(600);
s = await st();
ok(!s.hasTrimmer && !s.acts.includes('take') && s.acts.includes('board') && /bin/.test(s.objective), `off: to the field first (${s.acts} | ${s.objective})`);
const m11 = await p.evaluate(() => window.__game.routeAhead(window.__game.session).left);
ok(m11 > 100, `the metres to job 11 count from the way out: ${m11}`);
// Mid-job: the way out offered too (asked first whether to leave the job half done).
await p.evaluate(() => {
  const s = window.__game.session;
  s.board();
});
await toExit(4);
await sleep(600);
s = await st();
ok(s.acts.includes('exit'), `during a job: KÖYE GİT, asked first (${s.acts})`);
// ---- D. The village's map in play (all ten fields), and the job map's Karadere tab.
await p.evaluate(() => window.__game.session.alight());
await sleep(300);
await p.evaluate(() => document.getElementById('btn-map').click());
await sleep(1200);
ok(await p.evaluate(() => document.getElementById('map').classList.contains('show')), 'HARİTA in Karadere');
await shot('d1-harita');
await p.evaluate(() => {
  const g = window.__game;
  g.quitToMenu?.();
  document.querySelectorAll('.screen').forEach((x) => x.classList.remove('show'));
  g.levelTab = 2;
  g.openLevels();
});
await sleep(1200);
const nodes = await p.evaluate(() => [...document.querySelectorAll('.saga-node .sn-disc b')].map((x) => x.textContent.trim()));
ok(['11', '12', '13', '14', '15', '16', '17', '18', '19', '20'].every((n) => nodes.includes(n)), `Karadere's job map: ${nodes.join(',')}`);
await shot('d2-saga');
ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await b.close();
process.exit(bad ? 1 : 0);
