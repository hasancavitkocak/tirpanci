// Dev: a bridge model's walkway: its height along its length (x) down the middle, and across it (z) at the
// middle; to fit the game's walkway (Field.bridgeDeck) to it. Usage: node scripts/glb-deck.mjs path.glb
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
  g.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g.scene);
  const rc = new THREE.Raycaster();
  const top = (x, z) => {
    rc.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
    const h = rc.intersectObject(g.scene, true)[0];
    return h ? +h.point.y.toFixed(3) : null;
  };
  const along = [];
  for (let i = 0; i <= 20; i++) { const x = box.min.x + ((box.max.x - box.min.x) * i) / 20; along.push([+x.toFixed(3), top(x, 0)]); }
  const across = [];
  for (let i = 0; i <= 24; i++) { const z = box.min.z + ((box.max.z - box.min.z) * i) / 24; across.push([+z.toFixed(3), top(0, z)]); }
  return { along, across };
}, file)));
await browser.close();
