// Dev: the trimmer in first person on a steep bank: the steepest spot of a field, the worker facing
// eight ways round (downhill first) and swinging the head left to right; for each, how near the
// trimmer's body comes to the eye and how much of the screen it covers, against level ground. Shots of
// the worst in test-output/slope. Usage (dev server running): node scripts/look-slope.mjs [baseUrl] [level=4]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const level = Number(process.argv[3] ?? 4);
const OUT = 'test-output/slope';
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/slope-${Date.now()}` });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.setViewport({ width: 874, height: 402 });
await p.goto(`${base}?quality=low`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await p.evaluate((level) => {
  const g = window.__game;
  Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20, weather: 'sunny', camera: 'fpv' });
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(level));
}, level);
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
/** Puts the worker at (x, z) facing yaw with the head swung to `sweep`, the look at its usual angle, and draws one frame (the game held). */
const pose = (x, z, yaw, sweep) =>
  p.evaluate(
    async (x, z, yaw, sweep) => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const g = window.__game;
      const s = g.session;
      const v = g.view;
      g.mode = 'paused';
      s.intro = null;
      s.hasTrimmer = true;
      v.worker.carrying = true;
      s.x = x;
      s.z = z;
      s.yaw = yaw;
      g.lookYaw = yaw;
      s.sweep = sweep;
      s.updateHead();
      v.pitch = -0.75;
      for (let i = 0; i < 4; i++) v.frame(1 / 60);
      // The trimmer's body (engine, shaft, guard): its nearest point to the eye, and the share of the screen its box covers.
      const body = v.worker.trimmer.body;
      body.updateMatrixWorld(true);
      const cam = v.camera;
      let near = Infinity;
      const box = new THREE.Box2(new THREE.Vector2(1, 1), new THREE.Vector2(-1, -1));
      const q = new THREE.Vector3();
      body.traverse((m) => {
        if (!m.isMesh || !m.visible) return;
        const pos = m.geometry.getAttribute('position');
        const step = Math.max(1, Math.floor(pos.count / 400));
        for (let i = 0; i < pos.count; i += step) {
          q.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          near = Math.min(near, q.distanceTo(cam.position));
          q.project(cam);
          if (q.z < 1) box.expandByPoint(new THREE.Vector2(Math.max(-1, Math.min(1, q.x)), Math.max(-1, Math.min(1, q.y))));
        }
      });
      const sz = box.getSize(new THREE.Vector2());
      const f = s.field;
      const h = (dx, dz) => f.height(x + dx, z + dz);
      const dir = body.getWorldDirection(new THREE.Vector3());
      const eng = cam.worldToLocal(v.worker.trimmer.exhaust.getWorldPosition(new THREE.Vector3()));
      return { engine: +v.engineClear().toFixed(2), shaft: +((Math.asin(-dir.y) * 180) / Math.PI).toFixed(0), near: +near.toFixed(2), cover: box.isEmpty() ? 0 : +((sz.x * sz.y) / 4).toFixed(2), top: +box.max.y.toFixed(2), rise: +(h(Math.sin(yaw), Math.cos(yaw)) - h(0, 0)).toFixed(2) };
    },
    x,
    z,
    yaw,
    sweep,
  );
// The steepest spot inside the field (a metre in from its edges), and which way is downhill there.
const spot = await p.evaluate(() => {
  const f = window.__game.session.field;
  let best = { g: 0 };
  for (let x = -f.width / 2 + 2; x < f.width / 2 - 2; x += 0.5)
    for (let z = -f.depth / 2 + 2; z < f.depth / 2 - 2; z += 0.5) {
      const gx = (f.height(x + 0.5, z) - f.height(x - 0.5, z)) / 1;
      const gz = (f.height(x, z + 0.5) - f.height(x, z - 0.5)) / 1;
      const gr = Math.hypot(gx, gz);
      if (gr > best.g) best = { g: gr, x, z, down: Math.atan2(-gx, -gz) };
    }
  return { ...best, g: +best.g.toFixed(2), deg: +((Math.atan(best.g) * 180) / Math.PI).toFixed(1) };
});
console.log(`steepest: ${spot.deg}° at (${spot.x}, ${spot.z}), downhill yaw ${spot.down.toFixed(2)}`);
// Level ground for the reference: the flattest spot.
const flat = await p.evaluate(() => {
  const f = window.__game.session.field;
  let best = { g: 9 };
  for (let x = -f.width / 2 + 3; x < f.width / 2 - 3; x += 1)
    for (let z = -f.depth / 2 + 3; z < f.depth / 2 - 3; z += 1) {
      const gr = Math.hypot(f.height(x + 0.5, z) - f.height(x - 0.5, z), f.height(x, z + 0.5) - f.height(x, z - 0.5));
      if (gr < best.g) best = { g: gr, x, z };
    }
  return best;
});
const ref = [];
for (const sw of [-1, 0, 1]) ref.push(await pose(flat.x, flat.z, 0, sw));
const refNear = Math.min(...ref.map((r) => r.near));
const refCover = Math.max(...ref.map((r) => r.cover));
const refTop = Math.max(...ref.map((r) => r.top));
console.log(`level ground: engine ${Math.min(...ref.map((r) => r.engine))} m ahead, nearest ${refNear} m, covers up to ${refCover} of the screen, top at ${refTop}, shaft ${ref.map((r) => r.shaft).join('/')}°`);
const rows = [];
const names = ['downhill', 'down-right', 'across-right', 'up-right', 'uphill', 'up-left', 'across-left', 'down-left'];
for (let k = 0; k < 8; k++) {
  const yaw = spot.down - (k * Math.PI) / 4;
  for (const sw of [-1, -0.6, -0.3, 0, 0.3, 0.6, 1]) {
    const r = await pose(spot.x, spot.z, yaw, sw);
    rows.push({ dir: names[k], sw, ...r });
  }
}
for (const k of names) {
  const rs = rows.filter((r) => r.dir === k);
  const n = Math.min(...rs.map((r) => r.near));
  const c = Math.max(...rs.map((r) => r.cover));
  const t = Math.max(...rs.map((r) => r.top));
  const flag = n < refNear - 0.12 || c > refCover * 1.4 || t > refTop + 0.25 ? '  <<' : '';
  console.log(`${k.padEnd(13)} engine ${Math.min(...rs.map((r) => r.engine)).toFixed(2)} m ahead  shaft ${Math.max(...rs.map((r) => r.shaft))}° rise ${String(rs[0].rise).padStart(5)}  nearest ${n.toFixed(2)} m  cover ${c.toFixed(2)}  top ${t.toFixed(2)}${flag}`);
}
// Shots: downhill and across, head left, middle and right; and the worst of all.
const worst = rows.slice().sort((a, b) => b.top - a.top)[0];
for (const [n, dir, sw] of [['down-left', 'downhill', -1], ['down-mid', 'downhill', 0], ['down-right', 'downhill', 1], ['across-left', 'across-right', -1], ['across-right', 'across-right', 1], ['uphill-mid', 'uphill', 0], ['uphill-left', 'uphill', -1], ['upright-right', 'up-right', 1], ['worst', worst.dir, worst.sw]]) {
  const k = names.indexOf(dir);
  await pose(spot.x, spot.z, spot.down - (k * Math.PI) / 4, sw);
  await p.screenshot({ path: `${OUT}/${n}.png` });
}
console.log('worst:', JSON.stringify(worst));
await b.close();
