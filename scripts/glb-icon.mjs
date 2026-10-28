// Dev: a picture from a GLB (no dev server), seen from the front-right and a little above, on a clear
// background, as webp: the model three times as a little stack (two below, one on them; a badge), or just
// the model (`single`; a shop card, e.g. 512x283).
// node scripts/glb-icon.mjs <file.glb> <out.webp> [size or WxH] [stack|single]
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const [glb, out, px = '256', mode = 'stack'] = process.argv.slice(2);
const [W, H] = px.includes('x') ? px.split('x').map(Number) : [Number(px), Number(px)];
const nm = (p) => pathToFileURL(path.resolve('node_modules', p)).href;
const html = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"${nm('three/build/three.module.js')}","three/addons/":"${nm('three/examples/jsm')}/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const data = Uint8Array.from(atob(window.GLB), (c) => c.charCodeAt(0)).buffer;
const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
const g = await l.parseAsync(data, '');
const W = ${W}, H = ${H};
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.setClearColor(0x000000, 0); r.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(r.domElement);
const sc = new THREE.Scene();
sc.add(new THREE.HemisphereLight('#ffffff', '#776655', 2.0));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2); sun.position.set(2, 4, 3); sc.add(sun);
const b0 = new THREE.Box3().setFromObject(g.scene);
const s0 = b0.getSize(new THREE.Vector3());
const across = (s0.y + s0.z) / 2;
// Two side by side, one in the hollow on top.
for (const [x, y] of ${mode === 'single' ? '[[0, 0]]' : '[[-0.5, 0], [0.5, 0], [0, 0.82]]'}) {
  const m = g.scene.clone(true);
  m.position.set(0, y * across, x * across * 1.02);
  sc.add(m);
}
const box = new THREE.Box3().setFromObject(sc);
const c = box.getCenter(new THREE.Vector3());
const R = box.getSize(new THREE.Vector3()).length();
const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 100);
cam.position.set(c.x + R * 1.25, c.y + R * 0.75, c.z + R * 1.05); cam.lookAt(c);
// Fitted: the stack's corners all in view, a small margin.
const pts = [];
for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
cam.updateMatrixWorld();
let m = 0;
for (const p of pts) { const q = p.clone().project(cam); m = Math.max(m, Math.abs(q.x), Math.abs(q.y)); }
cam.zoom = 0.92 / m; cam.updateProjectionMatrix();
if (W !== H) {
  // (A wide picture: fitted by its height and its width each.)
  let mx = 0, my = 0;
  for (const p of pts) { const q = p.clone().project(cam); mx = Math.max(mx, Math.abs(q.x)); my = Math.max(my, Math.abs(q.y)); }
  cam.zoom *= 0.92 / Math.max(mx, my); cam.updateProjectionMatrix();
}
r.render(sc, cam);
window.OUT = r.domElement.toDataURL('image/webp', 0.9);
window.DONE = true;
</script></body></html>`;
const tmp = path.resolve('test-output', '_glb-icon.html');
fs.mkdirSync('test-output', { recursive: true });
fs.writeFileSync(tmp, html);
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: [...CHROME_ARGS, '--allow-file-access-from-files'] });
const p = await b.newPage();
p.on('pageerror', async (e) => {
  console.log('pageerror', e.message);
  await b.close();
  process.exit(1);
});
await p.evaluateOnNewDocument((d) => (window.GLB = d), fs.readFileSync(glb).toString('base64'));
await p.goto(pathToFileURL(tmp).href);
await p.waitForFunction('window.DONE === true', { timeout: 60000 });
const url = await p.evaluate(() => window.OUT);
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(out, fs.statSync(out).size, 'bytes');
await b.close();
