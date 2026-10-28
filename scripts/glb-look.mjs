// Dev: look at a GLB on its own (no dev server): four views round it (front from +Z, right from +X,
// back, left) on one picture, with its size. node scripts/glb-look.mjs <file.glb> <out.png>
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const [glb, out] = process.argv.slice(2);
const nm = (p) => pathToFileURL(path.resolve('node_modules', p)).href;
const html = `<!doctype html><html><body style="margin:0;background:#cfd8dc">
<script type="importmap">{"imports":{"three":"${nm('three/build/three.module.js')}","three/addons/":"${nm('three/examples/jsm')}/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const data = Uint8Array.from(atob(window.GLB), (c) => c.charCodeAt(0)).buffer;
const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
const g = await l.parseAsync(data, '');
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(1200, 340); r.setClearColor('#cfd8dc'); r.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(r.domElement);
const sc = new THREE.Scene();
sc.add(new THREE.HemisphereLight('#ffffff', '#666666', 2.2));
const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(3, 5, 4); sc.add(sun);
sc.add(g.scene);
const box = new THREE.Box3().setFromObject(g.scene);
const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
const R = Math.max(size.x, size.y, size.z);
const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
r.setScissorTest(true);
[[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(([x, z], i) => {
  r.setViewport(i * 300, 20, 300, 300); r.setScissor(i * 300, 0, 300, 340);
  cam.position.set(c.x + x * R * 2.6, c.y + R * 0.6, c.z + z * R * 2.6); cam.lookAt(c);
  r.render(sc, cam);
});
window.SIZE = [size.x, size.y, size.z].map((v) => v.toFixed(3)).join(' x ');
window.DONE = true;
</script></body></html>`;
const tmp = path.resolve('test-output', '_glb-look.html');
fs.mkdirSync('test-output', { recursive: true });
fs.writeFileSync(tmp, html);
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: [...CHROME_ARGS, '--allow-file-access-from-files'] });
const p = await b.newPage();
p.on('pageerror', async (e) => {
  console.log('pageerror', e.message);
  await b.close();
  process.exit(1);
});
await p.setViewport({ width: 1200, height: 340 });
await p.evaluateOnNewDocument((d) => (window.GLB = d), fs.readFileSync(glb).toString('base64'));
await p.goto(pathToFileURL(tmp).href);
await p.waitForFunction('window.DONE === true', { timeout: 60000 });
await p.evaluate(() => {
  const l = document.createElement('div');
  l.style.cssText = 'position:fixed;top:2px;left:0;width:1200px;display:flex;font:13px sans-serif';
  l.innerHTML = ['ön (+Z)', 'sağ (+X)', 'arka (-Z)', 'sol (-X)'].map((t) => `<b style="width:300px;text-align:center">${t}</b>`).join('');
  document.body.appendChild(l);
});
await p.screenshot({ path: out });
console.log(glb, 'size', await p.evaluate(() => window.SIZE));
await b.close();
