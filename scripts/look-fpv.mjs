// Dev: the first-person trimmer in play (the game running, its own loop: no frames drawn by hand), as on
// an iPhone sideways. On the steepest bank of a field and on the level, the worker turned eight ways
// round and the head swung left to right through the trimmer's own input: the engine never drawn, the
// machine never in the eyes, both gloves in view. Then the yard's DÜKKAN button only by the house, and
// the grass stirred by the line at a little throttle. Shots in test-output/fpv; OK / FAIL per check.
// Usage (dev server running): node scripts/look-fpv.mjs [baseUrl] [level=4]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const level = Number(process.argv[3] ?? 4);
const OUT = 'test-output/fpv';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-fpv-${Date.now()}` });
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
await p.goto(`${base}?quality=low`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// The job, in first person, the trimmer taken; the head swung and the throttle set through the input.
await p.evaluate((level) => {
  const g = window.__game;
  Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20, weather: 'sunny', camera: 'fpv' });
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  window.__sweep = 0;
  window.__gas = 0;
  Object.defineProperty(g.input, 'sweep', { get: () => window.__sweep, configurable: true });
  Object.defineProperty(g.input, 'throttleLevel', { get: () => window.__gas, configurable: true });
  g.start(g.levelById(level));
}, level);
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(1200);
// Near the house: DÜKKAN is there.
const atHouse = await p.evaluate(() => [...document.querySelectorAll('#actions [data-id]')].map((x) => x.dataset.id));
ok(atHouse.includes('shop'), `by the house: DÜKKAN (${atHouse.join(',')})`);
await p.evaluate(() => {
  const s = window.__game.session;
  s.intro = null;
  s.hasTrimmer = true;
  s.broken = false;
  s.line = s.gear.lineMax;
  window.__game.view.worker.carrying = true;
});
const spots = await p.evaluate(() => {
  const f = window.__game.session.field;
  let steep = { g: 0 };
  let flat = { g: 9 };
  for (let x = -f.width / 2 + 2; x < f.width / 2 - 2; x += 0.5)
    for (let z = -f.depth / 2 + 2; z < f.depth / 2 - 2; z += 0.5) {
      const gx = f.height(x + 0.5, z) - f.height(x - 0.5, z);
      const gz = f.height(x, z + 0.5) - f.height(x, z - 0.5);
      const gr = Math.hypot(gx, gz);
      if (gr > steep.g) steep = { g: gr, x, z, down: Math.atan2(-gx, -gz) };
      if (gr < flat.g) flat = { g: gr, x, z, down: 0 };
    }
  return { steep: { ...steep, deg: +((Math.atan(steep.g) * 180) / Math.PI).toFixed(1) }, flat };
});
console.log(`steepest bank ${spots.steep.deg}°`);
/** The worker at (x, z) facing yaw, the head swung to sw: the game runs a moment, then what is seen. */
const look = async (x, z, yaw, sw) => {
  await p.evaluate(
    (x, z, yaw, sw) => {
      const g = window.__game;
      const s = g.session;
      s.x = x;
      s.z = z;
      g.lookYaw = yaw;
      s.yaw = yaw;
      g.view.pitch = -0.75;
      window.__sweep = sw;
    },
    x,
    z,
    yaw,
    sw,
  );
  await sleep(450);
  return p.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const g = window.__game;
    const v = g.view;
    const cam = v.camera;
    const t = v.worker.trimmer;
    // Every triangle corner of what is drawn of the trimmer: its nearest to the eyes, and how much of
    // the screen's middle it fills (a grid of the screen, the cells it covers).
    let near = Infinity;
    let engineDrawn = false;
    const cells = new Set();
    const q = new THREE.Vector3();
    t.body.traverse((m) => {
      if (!m.isMesh) return;
      let vis = true;
      for (let o = m; o; o = o.parent) if (!o.visible) vis = false;
      if (!vis) return;
      if (t.engineModel && (m === t.engineModel || t.engineModel.getObjectById(m.id))) engineDrawn = true;
      const pos = m.geometry.getAttribute('position');
      const idx = m.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        q.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
        near = Math.min(near, q.distanceTo(cam.position));
        q.project(cam);
        if (q.z < 1 && Math.abs(q.x) < 1 && Math.abs(q.y) < 1) cells.add(`${Math.floor((q.x + 1) * 8)},${Math.floor((q.y + 1) * 4)}`);
      }
    });
    // The gloves: their grips on screen.
    const grips = [v.fpvRig.gripL ?? null, v.fpvRig.gripR ?? null];
    const gl = [];
    v.fpvRig.root.traverse((o) => {
      if (o.isMesh && o.visible) {
        const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).project(cam);
        gl.push(Math.abs(c.x) < 1 && c.y > -1.05 && c.y < 1);
      }
    });
    void grips;
    // Straight: the shaft, from the bar's clamp towards the head, square to the line between the two
    // grips (as on the machine); and on screen it leaves from between the gloves.
    const rig = v.fpvRig;
    const toW = (a) => a.clone().applyMatrix4(rig.sway.matrixWorld);
    const L = toW(rig.hl), R = toW(rig.hr);
    const clamp = rig.clamp.getWorldPosition(new THREE.Vector3());
    const head = new THREE.Vector3(window.__game.session.headX, 0, window.__game.session.headZ);
    const shaftDir = t.body.getWorldDirection(new THREE.Vector3());
    void head;
    const across = R.clone().sub(L).normalize();
    const skew = Math.abs(90 - (Math.acos(Math.max(-1, Math.min(1, across.dot(shaftDir)))) * 180) / Math.PI);
    const sl = L.clone().project(cam), sr = R.clone().project(cam), sc = clamp.clone().project(cam);
    const between = sc.x > Math.min(sl.x, sr.x) && sc.x < Math.max(sl.x, sr.x);
    // The middle of the screen (the 8 x 4 cells round its centre and above): the machine's share there.
    const mid = [...cells].filter((k) => {
      const [cx, cy] = k.split(',').map(Number);
      return cx >= 4 && cx <= 11 && cy >= 3;
    }).length;
    return { near: +near.toFixed(2), mid, engineDrawn, gloves: gl.length && gl.every(Boolean), skew: +skew.toFixed(1), between };
  });
};
const names = ['downhill', 'down-right', 'across-right', 'up-right', 'uphill', 'up-left', 'across-left', 'down-left'];
for (const [where, sp] of [['bank', spots.steep], ['level', spots.flat]]) {
  const rows = [];
  for (let k = 0; k < 8; k++)
    for (const sw of [-1, -0.5, 0, 0.5, 1]) rows.push({ dir: names[k], sw, ...(await look(sp.x, sp.z, sp.down - (k * Math.PI) / 4, sw)) });
  const engine = rows.filter((r) => r.engineDrawn).length;
  const nearest = Math.min(...rows.map((r) => r.near));
  const most = rows.reduce((a, r) => (r.mid > a.mid ? r : a));
  const noGloves = rows.filter((r) => !r.gloves);
  const worstSkew = rows.reduce((a, r) => (r.skew > a.skew ? r : a));
  const outside = rows.filter((r) => !r.between);
  // (At rest the head is a little to the right, so the shaft is a little off square already: measured from there.)
  const restSkew = rows.find((r) => r.dir === 'downhill' && r.sw === 0).skew;
  ok(worstSkew.skew - restSkew < 5, `${where}: the shaft keeps its angle to the bar (at rest ${restSkew}°, worst ${worstSkew.skew}°: ${worstSkew.dir}, swung ${worstSkew.sw})`);
  ok(!outside.length, `${where}: the shaft leaves from between the gloves${outside.length ? ` (not in ${outside.map((r) => `${r.dir}/${r.sw}`).join(' ')})` : ''}`);
  ok(engine === 0, `${where}: the engine never drawn (${engine} of ${rows.length} views)`);
  ok(nearest > 0.2, `${where}: the machine never in the eyes (nearest ${nearest} m)`);
  ok(most.mid <= 6, `${where}: the machine never fills the middle of the view (most ${most.mid} of 32 cells: ${most.dir}, swung ${most.sw})`);
  ok(!noGloves.length, `${where}: both gloves always in view${noGloves.length ? ` (not in ${noGloves.map((r) => `${r.dir}/${r.sw}`).join(' ')})` : ''}`);
  for (const [n, k, sw] of [['down-left', 7, -1], ['down', 0, 0], ['across-left', 6, -1], ['across-right', 2, 1], ['up', 4, 0], ['up-left-swung', 5, -1]]) {
    await look(sp.x, sp.z, sp.down - (k * Math.PI) / 4, sw);
    await p.screenshot({ path: `${OUT}/${where}-${n}.png` });
  }
}
// In the field: no DÜKKAN.
await sleep(300);
const inField = await p.evaluate(() => [...document.querySelectorAll('#actions [data-id]')].map((x) => x.dataset.id));
ok(!inField.includes('shop'), `in the field: no DÜKKAN (${inField.join(',') || 'none'})`);
// The line at a little throttle stirs the grass round the head.
await p.evaluate(() => {
  const s = window.__game.session;
  s.running = true;
  window.__gas = 0;
  window.__sweep = 0;
});
await sleep(600);
const idle = await p.evaluate(() => window.__game.view.grass.material.uniforms.uHead.value.z);
await p.evaluate(() => {
  const g = window.__game;
  g.input.easy = true;
  window.__gas = 0.25;
});
await sleep(800);
const little = await p.evaluate(() => ({ spin: window.__game.view.grass.material.uniforms.uHead.value.z, cutting: window.__game.session.cutting, rpm: window.__game.session.rpm }));
ok(little.spin > 0.1, `a little throttle: the line stirs the grass (spin ${little.spin.toFixed(2)}, cutting ${little.cutting}, idle ${idle.toFixed(2)})`);
ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await b.close();
process.exit(bad ? 1 : 0);
