// Dev: the shop's pictures of the vehicles and yard things, rendered from the game's own models (the
// pat pat, the tractor and the trailer on their tyres, the gazebo, the kennel, the flower pots, the
// clothes line), transparent, three
// quarters from the front. Writes public/textures/shop-<id>.webp (512 x 283, as the other shop pictures).
// Usage (dev server running): node scripts/shop-renders.mjs [baseUrl]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=low`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const shots = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const { loadModels, fitted } = await import('/src/render/models.ts');
  const { PatpatRig } = await import('/src/render/patpat.ts');
  const { TractorRig } = await import('/src/render/tractor.ts');
  const { TrailerRig } = await import('/src/render/trailer.ts');
  const { PATPAT, TRACTOR, TRAILER } = await import('/src/game/config.ts');
  const { flowerPots, clothesline } = await import('/src/render/props.ts');
  const m = await loadModels();
  const W = 1200;
  const H = 664;
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(W, H, false);
  r.setClearColor(0x000000, 0);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.12;
  const shot = (obj, yaw) => {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff6e0', '#5a6a40', 1.7));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    sun.position.set(4, 7, 5);
    scene.add(sun);
    const holder = new THREE.Group();
    holder.add(obj);
    holder.rotation.y = yaw;
    scene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const cam = new THREE.PerspectiveCamera(26, W / H, 0.05, 200);
    const dist = size / (2 * Math.tan((26 * Math.PI) / 360)) * 0.95;
    cam.position.set(c.x, c.y + dist * 0.32, c.z + dist);
    cam.lookAt(c);
    r.render(scene, cam);
    return canvas.toDataURL('image/png');
  };
  const out = {};
  // The pat pat standing straight (its own blue), the head ahead on the hitch.
  const pat = new PatpatRig({ body: m.patpat[0], teker: m.patpatTeker[0], direksiyon: m.patpatDireksiyon?.[0] }, null);
  pat.head.position.set(0, 0, PATPAT.joint);
  const pg = new THREE.Group();
  pg.add(pat.kasa, pat.head);
  out.patpat = shot(pg, -0.75);
  // The tractor on its four tyres.
  const tr = new TractorRig({ body: m.tractor[0], rear: m.tractorRear[0], front: m.tractorFront[0] });
  tr.head.position.set(0, 0, TRACTOR.joint);
  const tg = new THREE.Group();
  tg.add(tr.kasa, tr.head);
  out.traktor = shot(tg, -0.75);
  // The trailer on its two tyres (the tractor's front ones).
  const tl = new TrailerRig({ body: m.trailer[0], tyre: m.tractorFront[0] });
  out.romork = shot(tl.group, -0.75);
  out['koy-cardak'] = shot(fitted(m.gazebo[0].scene, 3), -0.6);
  out['koy-kulube'] = shot(fitted(m.kennel[0].scene, 1.1), -0.6);
  out['koy-saksi'] = shot(flowerPots(3), -0.5);
  out['koy-camasir'] = shot(clothesline(9), -0.35);
  void TRAILER;
  return out;
});
await browser.close();
mkdirSync('test-output/shop-renders', { recursive: true });
for (const [id, url] of Object.entries(shots)) writeFileSync(`test-output/shop-renders/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
// Trimmed to what was drawn and fitted into 512 x 283, as webp.
execFileSync('python', ['-I', '-X', 'utf8', '-c', `
import glob, os
from PIL import Image
for p in glob.glob('test-output/shop-renders/*.png'):
    im = Image.open(p).convert('RGBA'); im = im.crop(im.getbbox())
    W, H = 512, 283; k = min((W - 16) / im.width, (H - 12) / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0)); out.paste(im, ((W - im.width) // 2, (H - im.height) // 2), im)
    out.save('public/textures/shop-' + os.path.basename(p)[:-4] + '.webp', quality=90)
    print('shop-' + os.path.basename(p)[:-4] + '.webp', im.size)
`], { stdio: 'inherit' });
