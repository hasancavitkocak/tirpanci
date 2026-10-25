// Dev: a GLB on its own from +Z, +X, +Y, -Z (axes: X red, Y green, Z blue). Optional x cut keeps x < cut.
// Usage: node scripts/look-glb.mjs models/x.glb out-prefix [cutX]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const [file, out, cut] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 300 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5173/', { timeout: 120000 });
await page.evaluate(async (file, cut) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const g = await new GLTFLoader().loadAsync('/' + file);
  if (cut) g.scene.traverse((m) => {
    if (!m.isMesh) return;
    m.geometry = m.geometry.toNonIndexed();
    const p = m.geometry.getAttribute('position');
    const keep = [];
    for (let i = 0; i < p.count; i += 3) if ((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3 < Number(cut)) keep.push(i, i + 1, i + 2);
    m.geometry.setIndex(keep);
    m.geometry = m.geometry.toNonIndexed();
  });
  document.body.innerHTML = '';
  const r = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
  r.setSize(1200, 300);
  r.setScissorTest(true);
  document.body.appendChild(r.domElement);
  r.domElement.style.cssText = 'position:fixed;left:0;top:0;z-index:99';
  const sc = new THREE.Scene();
  sc.background = new THREE.Color('#ccd');
  const box = new THREE.Box3().setFromObject(g.scene);
  const c = box.getCenter(new THREE.Vector3());
  const d = box.getSize(new THREE.Vector3()).length();
  const ax = new THREE.AxesHelper(d * 0.7);
  ax.position.copy(c);
  sc.add(new THREE.HemisphereLight('#fff', '#666', 2.5), g.scene, ax);
  [[0, 0, 1], [1, 0, 0], [0, 1, 0.001], [0, 0, -1]].forEach((dir, i) => {
    const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
    cam.position.copy(c).add(new THREE.Vector3(...dir).multiplyScalar(d * 2));
    cam.lookAt(c);
    r.setViewport(i * 300, 0, 300, 300);
    r.setScissor(i * 300, 0, 300, 300);
    r.render(sc, cam);
  });
}, file, cut ?? null);
await page.screenshot({ path: `test-output/${out}.png` });
await browser.close();
