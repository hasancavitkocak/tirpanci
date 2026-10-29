// Dev: driving, as the player meets it: Karabaş up in the pat pat's box (and in the trailer behind the
// tractor) while the worker drives, down beside it when he gets off; Karadere's paved tracks hard and
// even (the pat pat on its setts, not sunk in them; the view steady); at Yeşilyamaç's way out in the
// middle of a job, KÖYE GİT asks first and takes the worker to Karadere. Shots in test-output/ride.
// Usage (dev server running): node scripts/look-ride.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/ride';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-ride-${Date.now()}` });
const p = await browser.newPage();
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1 });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const SAVE = { introDone: true, tutorialSeen: true, lookSeen: true, harvestOffered: 99, unlocked: 20, weather: 'sunny', dog: true, decor: ['kulube'], driveTips: 99 };
const roam = async (region, extra = {}) => {
  await p.evaluate(
    (region, save) => {
      const g = window.__game;
      if (g.mode === 'playing') g.quitToMenu();
      Object.assign(g.save, save);
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
      g.levelTab = region;
      void g.startRoam();
    },
    region,
    { ...SAVE, ...extra },
  );
  await p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 90000 });
  await sleep(1500);
};
const look = async (n, c) => {
  await p.evaluate((c) => {
    const g = window.__game;
    const f = g.session.field;
    const fy = f.height(c.x, c.z) + c.y;
    const ty = f.height(c.tx, c.tz) + c.ty;
    const d = { x: c.tx - c.x, y: ty - fy, z: c.tz - c.z };
    g.view.freeCam = { x: c.x, y: fy, z: c.z, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y / Math.hypot(d.x, d.y, d.z)) };
  }, c);
  await sleep(1200);
  await p.screenshot({ path: `${OUT}/${n}.png` });
  await p.evaluate(() => (window.__game.view.freeCam = null));
};
const board = () =>
  p.evaluate(() => {
    const s = window.__game.session;
    const v = s.field.vehicle;
    s.x = v.x + Math.cos(v.yaw) * 1.6;
    s.z = v.z - Math.sin(v.yaw) * 1.6;
    s.board();
  });
const dogState = () =>
  p.evaluate(() => {
    const g = window.__game;
    const d = g.view.dog;
    const w = g.view.world;
    if (!d) return null;
    return { inBox: !!w.patRig && d.root.parent === w.patRig.kasa, inTrailer: !!w.trailerRig && d.root.parent === w.trailerRig.group, onGround: d.root.parent === g.view.scene, x: d.x, z: d.z };
  });
/**
 * Put on a straight stretch of a track (`road`: its index; none: where it is), in first person, and driven
 * with the keys (W) for `ms`, sampling each frame the view's and the chassis' roll and pitch, the view's
 * sway against the vehicle's heading, and whether it is on the track.
 */
const drive = async (ms, road = -1) => {
  await p.evaluate((road) => {
    const g = window.__game;
    const f = g.session.field;
    g.view.mode = 'fpv';
    if (road >= 0) {
      // The straightest 25 m of it.
      const pts = f.roads[road].pts;
      let best = { i: 0, bend: Infinity };
      for (let i = 2; i + 30 < pts.length; i++) {
        const a = Math.atan2(pts[i + 1].x - pts[i - 1].x, pts[i + 1].z - pts[i - 1].z);
        const b = Math.atan2(pts[i + 30].x - pts[i + 28].x, pts[i + 30].z - pts[i + 28].z);
        const bend = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
        if (bend < best.bend) best = { i, bend };
      }
      const q = pts[best.i];
      const n = pts[best.i + 3];
      const v = f.vehicle;
      v.x = q.x;
      v.z = q.z;
      v.yaw = Math.atan2(n.x - q.x, n.z - q.z);
      v.art = 0;
      v.steer = 0;
      v.speed = 0;
    }
  }, road);
  await sleep(600);
  await p.evaluate(() => {
    const g = window.__game;
    window.__cam = [];
    const f0 = g.view.frame;
    g.view.__f0 = f0;
    g.view.frame = function (...a) {
      const r = f0.apply(this, a);
      const e = new window.__game.view.camera.rotation.constructor().setFromQuaternion(this.camera.quaternion, 'YXZ');
      const k = g.view.world.patRig.kasa.rotation;
      const fv = g.session.field.vehicle;
      window.__cam.push({ roll: e.z, pitch: e.x, yaw: e.y - fv.yaw, kr: k.z, kp: k.x, on: g.session.field.laneDistance(fv.x, fv.z) < 1.2, v: fv.speed });
      return r;
    };
  });
  await p.keyboard.down('KeyW');
  await sleep(ms);
  await p.keyboard.up('KeyW');
  return p.evaluate(() => {
    const g = window.__game;
    g.view.frame = g.view.__f0;
    const c = window.__cam.filter((q) => Math.abs(q.v) > 1.5);
    // Frame to frame: how much the view rolls and nods (the shaking), degrees.
    // (Yaw: the view's turn against the vehicle's own, the head swaying left and right.)
    let roll = 0;
    let pitch = 0;
    let yaw = 0;
    let kr = 0;
    let kp = 0;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    for (let i = 1; i < c.length; i++) {
      roll += Math.abs(c[i].roll - c[i - 1].roll);
      pitch += Math.abs(c[i].pitch - c[i - 1].pitch);
      yaw += Math.abs(wrap(c[i].yaw - c[i - 1].yaw));
      kr += Math.abs(c[i].kr - c[i - 1].kr);
      kp += Math.abs(c[i].kp - c[i - 1].kp);
    }
    const n = Math.max(1, c.length - 1);
    const deg = (a) => ((a / n) * 180) / Math.PI;
    return { frames: c.length, onRoad: c.filter((q) => q.on).length / Math.max(1, c.length), roll: deg(roll), pitch: deg(pitch), yaw: deg(yaw), kr: deg(kr), kp: deg(kp) };
  });
};

await p.goto(`${base}?quality=low`, { timeout: 120000 });
await p.waitForFunction('window.__ready === true', { timeout: 120000 });

// ---- Karadere, the pat pat: Karabaş jumps in.
await roam(2, { vehicle: 'patpat', vehicles: ['patpat'] });
let d = await dogState();
ok(d?.onGround, `Karabaş on his feet by the worker (${JSON.stringify(d)})`);
await board();
await sleep(800);
d = await dogState();
ok(d?.inBox, `the worker drives: Karabaş up in the pat pat's box (${JSON.stringify(d)})`);
const v0 = await p.evaluate(() => { const v = window.__game.session.field.vehicle; return { x: v.x, z: v.z, yaw: v.yaw }; });
await look('1-kopek-kasada', { x: v0.x + Math.cos(v0.yaw) * 4.5 - Math.sin(v0.yaw) * 2, y: 2.2, z: v0.z - Math.sin(v0.yaw) * 4.5 - Math.cos(v0.yaw) * 2, tx: v0.x - Math.sin(v0.yaw) * 0.8, ty: 0.9, tz: v0.z - Math.cos(v0.yaw) * 0.8 });

// Down the paved trunk: on its setts, the view steady.
const kd = await drive(4000, 1);
console.log('     Karadere, up its paved track:', JSON.stringify(kd));
ok(kd.onRoad > 0.8, `on the track the whole way (${(kd.onRoad * 100).toFixed(0)}%)`);
await sleep(300);
const sink = await p.evaluate(() => {
  const g = window.__game;
  const f = g.session.field;
  const v = f.vehicle;
  return { onRoad: f.laneDistance(v.x, v.z) < 1.9, paved: f.paved, sinkAt: f.sinkAt(v.x, v.z) };
});
ok(kd.frames > 40, `driven (${kd.frames} frames on the move)`);
ok(sink.paved && sink.sinkAt === 0, `Karadere's track hard: no wheel prints (${JSON.stringify(sink)})`);
d = await dogState();
ok(d?.inBox, 'Karabaş still in the box, driven');
const v1 = await p.evaluate(() => { const v = window.__game.session.field.vehicle; return { x: v.x, z: v.z, yaw: v.yaw }; });
await look('2-tas-yolda-teker', { x: v1.x + Math.cos(v1.yaw) * 3.2, y: 0.5, z: v1.z - Math.sin(v1.yaw) * 3.2, tx: v1.x, ty: 0.3, tz: v1.z });
await look('2b-tas-yolda-yandan', { x: v1.x + Math.cos(v1.yaw) * 6, y: 1.4, z: v1.z - Math.sin(v1.yaw) * 6, tx: v1.x, ty: 0.6, tz: v1.z });
// Off: down beside it.
await p.evaluate(() => { const s = window.__game.session; s.field.vehicle.speed = 0; s.alight(); });
await sleep(1000);
d = await dogState();
const off = await p.evaluate(() => ({ driving: window.__game.session.driving }));
ok(!off.driving && d?.onGround, `got off: Karabaş down beside it (${JSON.stringify(d)})`);

// ---- Yeşilyamaç's dirt tracks, for the steadiness.
await roam(1, { vehicle: 'patpat', vehicles: ['patpat'] });
await board();
await sleep(500);
const yd = await drive(4000, 0);
console.log('     Yeşilyamaç, its dirt trunk:', JSON.stringify(yd));
console.log(`     the view's shake, frame to frame: Karadere roll ${kd.roll.toFixed(3)}° pitch ${kd.pitch.toFixed(3)}° sway ${kd.yaw.toFixed(3)}°; Yeşilyamaç's dirt roll ${yd.roll.toFixed(3)}° pitch ${yd.pitch.toFixed(3)}° sway ${yd.yaw.toFixed(3)}°`);
ok(kd.kr <= yd.kr && kd.roll <= yd.roll + 0.005, `the paved track rocks the pat pat and the view no more than the dirt one (chassis roll ${kd.kr.toFixed(3)}° vs ${yd.kr.toFixed(3)}°)`);

// ---- The tractor and its trailer: Karabaş in the trailer.
await roam(2, { vehicle: 'traktor', vehicles: ['patpat', 'traktor', 'romork'], trailerOff: false });
await board();
await sleep(800);
d = await dogState();
ok(d?.inTrailer, `behind the tractor: Karabaş in the trailer (${JSON.stringify(d)})`);
const t0 = await p.evaluate(() => { const t = window.__game.session.field.trailer; const v = window.__game.session.field.vehicle; return { x: v.x, z: v.z, yaw: v.yaw }; });
await look('3-kopek-romorkta', { x: t0.x + Math.cos(t0.yaw) * 6 - Math.sin(t0.yaw) * 5, y: 2.8, z: t0.z - Math.sin(t0.yaw) * 6 - Math.cos(t0.yaw) * 5, tx: t0.x - Math.sin(t0.yaw) * 4, ty: 1, tz: t0.z - Math.cos(t0.yaw) * 4 });

// ---- In the middle of a job at Yeşilyamaç's way out: KÖYE GİT, asked first, to Karadere.
await p.evaluate((save) => {
  const g = window.__game;
  if (g.mode === 'playing') g.quitToMenu();
  Object.assign(g.save, save, { vehicle: 'patpat', vehicles: ['patpat'] });
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(3));
}, SAVE);
await p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 90000 });
await sleep(1500);
await p.evaluate(() => {
  const s = window.__game.session;
  s.intro = null;
  const e = s.field.exit;
  const v = s.field.vehicle;
  v.x = e.x - Math.sin(e.yaw) * 5;
  v.z = e.z - Math.cos(e.yaw) * 5;
  v.yaw = e.yaw;
  v.speed = 0;
});
await board();
await sleep(1200);
const acts = await p.evaluate(() => [...document.querySelectorAll('#actions [data-id]')].map((x) => x.dataset.id));
ok(acts.includes('exit'), `at the way out in a job: KÖYE GİT (${acts.join(',')})`);
await p.screenshot({ path: `${OUT}/4-koye-git.png` });
// (The action buttons act on the touch going down.)
await p.evaluate(() => document.querySelector('#actions [data-id="exit"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
await sleep(800);
const asked = await p.evaluate(() => ({ shown: document.getElementById('confirm').classList.contains('show'), text: document.getElementById('confirm').innerText.replace(/\s+/g, ' ') }));
ok(asked.shown && /yarım/.test(asked.text), `asked first: ${asked.text}`);
await p.screenshot({ path: `${OUT}/5-soru.png` });
await p.evaluate(() => document.getElementById('btn-confirm-yes').click());
await p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show") && window.__game.session?.field.region.id === 2', { timeout: 90000 });
await sleep(1500);
const there = await p.evaluate(() => ({ region: window.__game.session.field.region.name, roaming: window.__game.roaming }));
ok(there.region === 'Karadere' && there.roaming, `in Karadere, roaming (${JSON.stringify(there)})`);
await p.screenshot({ path: `${OUT}/6-karadere-varis.png` });

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await browser.close();
process.exit(bad ? 1 : 0);
