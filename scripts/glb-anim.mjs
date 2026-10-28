// Dev: a GLB's first animation seen from the side (no dev server): `n` frames across one cycle in a row,
// to judge a walk. node scripts/glb-anim.mjs <file.glb> <out.png> [n=8]
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const [glb, out, nArg = '8'] = process.argv.slice(2);
const n = Number(nArg);
const nm = (p) => pathToFileURL(path.resolve('node_modules', p)).href;
const W = 220;
const html = `<!doctype html><html><body style="margin:0;background:#cfd8dc">
<script type="importmap">{"imports":{"three":"${nm('three/build/three.module.js')}","three/addons/":"${nm('three/examples/jsm')}/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const data = Uint8Array.from(atob(window.GLB), (c) => c.charCodeAt(0)).buffer;
const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
const g = await l.parseAsync(data, '');
const N = ${n};
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(${W} * N, 260); r.setClearColor('#cfd8dc'); r.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(r.domElement);
const sc = new THREE.Scene();
sc.add(new THREE.HemisphereLight('#ffffff', '#666666', 2.2));
const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(3, 5, 4); sc.add(sun);
sc.add(g.scene);
const clip = g.animations[0];
const mixer = new THREE.AnimationMixer(g.scene);
const act = mixer.clipAction(clip); act.play();
mixer.setTime(0);
const box = new THREE.Box3().setFromObject(g.scene);
const c = box.getCenter(new THREE.Vector3());
const R = box.getSize(new THREE.Vector3()).length();
const cam = new THREE.PerspectiveCamera(30, ${W} / 260, 0.01, 100);
// From the side (+X), level with its middle; a ground line at its feet.
cam.position.set(c.x + R * 1.6, c.y, c.z); cam.lookAt(c);
const line = new THREE.Mesh(new THREE.PlaneGeometry(R * 3, R * 3), new THREE.MeshBasicMaterial({ color: '#9fb08f' }));
line.rotation.x = -Math.PI / 2; line.position.y = box.min.y; sc.add(line);
r.setScissorTest(true);
for (let i = 0; i < N; i++) {
  mixer.setTime((clip.duration * i) / N);
  r.setViewport(i * ${W}, 0, ${W}, 260); r.setScissor(i * ${W}, 0, ${W}, 260);
  r.render(sc, cam);
}
window.INFO = clip.name + ' ' + clip.duration.toFixed(2) + ' s';
window.DONE = true;
</script></body></html>`;
const tmp = path.resolve('test-output', '_glb-anim.html');
fs.mkdirSync('test-output', { recursive: true });
fs.writeFileSync(tmp, html);
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: [...CHROME_ARGS, '--allow-file-access-from-files'] });
const p = await b.newPage();
p.on('pageerror', async (e) => {
  console.log('pageerror', e.message);
  await b.close();
  process.exit(1);
});
await p.setViewport({ width: W * n, height: 260 });
await p.evaluateOnNewDocument((d) => (window.GLB = d), fs.readFileSync(glb).toString('base64'));
await p.goto(pathToFileURL(tmp).href);
await p.waitForFunction('window.DONE === true', { timeout: 60000 });
await p.screenshot({ path: out });
console.log(glb, await p.evaluate(() => window.INFO));
await b.close();
