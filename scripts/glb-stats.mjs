// Dev: a GLB's size (its box, metres as stored), triangle count, meshes and textures.
// Usage: node scripts/glb-stats.mjs path/in/project.glb (the dev server running on :5173)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const file = process.argv[2];
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { timeout: 120000 });
console.log(JSON.stringify(await page.evaluate(async (file) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const g = await new GLTFLoader().loadAsync('/' + file);
  const box = new THREE.Box3().setFromObject(g.scene);
  let tris = 0, meshes = 0;
  const tex = new Set();
  g.scene.traverse((m) => {
    if (!m.isMesh) return;
    meshes++;
    tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (m.material[k]) tex.add(`${k} ${m.material[k].image?.width}x${m.material[k].image?.height}`);
  });
  const s = box.getSize(new THREE.Vector3());
  return { min: box.min.toArray().map((v) => +v.toFixed(3)), max: box.max.toArray().map((v) => +v.toFixed(3)), size: s.toArray().map((v) => +v.toFixed(3)), tris, meshes, tex: [...tex] };
}, file), null, 1));
await browser.close();
