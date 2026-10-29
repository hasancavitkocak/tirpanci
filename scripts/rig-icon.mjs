// Dev: a vehicle's shop picture from the game's own rig (body and its separate tyres together, as it
// is drawn driving), seen from the front-right and a little above on a clear background, as webp
// (512x283, as the other shop-<id>.webp). Usage (dev server running): node scripts/rig-icon.mjs <vehicle id> <out.webp> [baseUrl]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const [id = 'buyuk', out = `public/textures/shop-${id}.webp`, base = 'http://localhost:5173/'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-icon-${Date.now()}` });
const p = await b.newPage();
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`${base}?quality=high`, { timeout: 120000 });
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await p.evaluate((id) => {
  const g = window.__game;
  Object.assign(g.save, { introDone: true, tutorialSeen: true, harvestOffered: 99, vehicle: id, vehicles: ['patpat', 'traktor', 'romork', id], trailerOff: true });
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  void g.startRoam();
}, id);
await p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show") && window.__game.view.world?.patRig', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));
const url = await p.evaluate(async () => {
  const src = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\.vite\/deps\/three\.js/.test(n));
  const THREE = await import(src);
  const rig = window.__game.view.world.patRig;
  rig.kasa.updateWorldMatrix(true, true);
  const inv = rig.kasa.matrixWorld.clone().invert();
  const grp = new THREE.Group();
  for (const o of [rig.kasa, rig.head]) {
    const c = o.clone(true);
    new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(c.position, c.quaternion, c.scale);
    grp.add(c);
  }
  const W = 1024, H = 566;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(W, H);
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight('#ffffff', '#776655', 2.0));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(3, 4, 4);
  sc.add(sun, grp);
  const box = new THREE.Box3().setFromObject(grp);
  const c = box.getCenter(new THREE.Vector3());
  const R = box.getSize(new THREE.Vector3()).length();
  // (The rig faces +Z: from its front-right, a little above.)
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 200);
  cam.position.set(c.x - R * 1.1, c.y + R * 0.55, c.z + R * 1.25);
  cam.lookAt(c);
  cam.updateMatrixWorld();
  const pts = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
  let mx = 0, my = 0;
  for (const q of pts) { const v = q.clone().project(cam); mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y)); }
  cam.zoom = 0.9 / Math.max(mx, my);
  cam.updateProjectionMatrix();
  r.render(sc, cam);
  // Cropped to what was drawn and fitted to 512x283 with a small margin (as the artist's pictures fill theirs).
  const full = document.createElement('canvas');
  full.width = W; full.height = H;
  const fg = full.getContext('2d');
  fg.drawImage(r.domElement, 0, 0);
  const px = fg.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 283;
  const k = Math.min((512 * 0.94) / (x1 - x0 + 1), (283 * 0.94) / (y1 - y0 + 1));
  const w = (x1 - x0 + 1) * k, h = (y1 - y0 + 1) * k;
  const cg = cv.getContext('2d');
  cg.imageSmoothingQuality = 'high';
  cg.drawImage(full, x0, y0, x1 - x0 + 1, y1 - y0 + 1, (512 - w) / 2, (283 - h) / 2, w, h);
  return cv.toDataURL('image/webp', 0.9);
});
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(out, fs.statSync(out).size, 'bytes');
await b.close();
