// Dev: the same frame of a job's ocaks from `dist` metres with and without their simplified distant level (job, dist, out prefix).
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [job, dist, out] = [Number(process.argv[2] ?? 20), Number(process.argv[3] ?? 40), process.argv[4] ?? 'lod'];
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/lod-${Date.now()}` });
const p = await b.newPage();
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(`http://localhost:5173/?quality=low`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await p.evaluate((job) => { const g = window.__game; Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20 }); document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show')); g.start(g.levelById(job)); }, job);
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(1500);
const frame = (useDistant) => p.evaluate((useDistant, dist) => {
  const g = window.__game, v = g.view, f = g.session.field;
  const lods = []; v.scene.traverse((o) => o.isLOD && o.levels.length === 4 && lods.push(o));
  lods.forEach((l) => (l.levels[3].distance = useDistant ? 34 : 1e9));
  // Stand `dist` m from the ocaks' middle, looking at it.
  const bs = f.bushes; const cx = bs.reduce((s, x) => s + x.x, 0) / bs.length, cz = bs.reduce((s, x) => s + x.z, 0) / bs.length;
  const cam = v.camera; cam.position.set(cx, f.height(cx, cz + dist) + 3, cz + dist); cam.lookAt(cx, f.height(cx, cz) + 1.5, cz); cam.updateMatrixWorld();
  v.scene.traverse((o) => o.isLOD && o.update(cam));
  v.renderer.info.reset(); v.renderer.render(v.scene, cam);
  const c = v.renderer.domElement; return { url: c.toDataURL('image/png'), tris: v.renderer.info.render.triangles, n: lods.length };
}, useDistant, dist);
await p.evaluate(() => { window.__game.mode = 'paused'; });
await sleep(300);
const fs = await import('fs');
for (const [k, on] of [['full', false], ['lite', true]]) {
  const r = await frame(on);
  fs.writeFileSync(`${out}-${dist}-${k}.png`, Buffer.from(r.url.split(',')[1], 'base64'));
  console.log(k, 'tris', r.tris, 'lods', r.n);
}
await b.close();
