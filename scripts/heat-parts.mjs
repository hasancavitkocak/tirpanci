// Dev: where a scene's triangles and draw calls go: every mesh drawn (in view of the camera), its
// triangles times its instances, added up by what it is (its name, else its parent's, else its
// material's colour), the biggest first. Usage (dev server running):
// node scripts/heat-parts.mjs <job> [quality] [north|east|south|west|vehicle] [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const [id = '16', q = 'high', view = 'south', base = 'http://localhost:5173/'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-parts-${Date.now()}` });
const p = await browser.newPage();
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`${base}?tirpan&quality=${q}`, { timeout: 120000 });
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await p.evaluate((id) => {
  const g = window.__game;
  Object.assign(g.save, { introDone: true, tutorialSeen: true, lookSeen: true, harvestOffered: 99, unlocked: 20, camera: 'fpv' });
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(Number(id)));
}, id);
await p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 120000 });
await sleep(1200);
await p.evaluate((view) => {
  const g = window.__game;
  const s = g.session;
  const f = s.field;
  s.intro = null;
  const yaw = { north: Math.PI, east: -Math.PI / 2, south: 0, west: Math.PI / 2 }[view];
  if (view === 'vehicle') {
    const v = f.vehicle;
    v.x = f.entryX;
    v.z = f.depth / 2 + 6;
    v.yaw = Math.PI;
    s.x = v.x + 1.6;
    s.z = v.z;
    s.board();
  } else {
    s.hasTrimmer = true;
    s.x = 0;
    s.z = 0;
    s.yaw = yaw;
    g.lookYaw = yaw;
  }
}, view);
await sleep(1500);
const parts = await p.evaluate(() => {
  const g = window.__game;
  const cam = g.view.camera;
  const scene = g.view.scene;
  scene.updateMatrixWorld(true);
  const C = cam.constructor;
  void C;
  // The camera's frustum, from three's own objects found on the scene's things.
  const sample = scene.children.find((c) => c.isMesh) ?? null;
  void sample;
  const out = new Map();
  let calls = 0;
  const visible = (o) => {
    for (let x = o; x; x = x.parent) if (!x.visible) return false;
    return true;
  };
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine) || !visible(o)) return;
    const geo = o.geometry;
    if (!geo) return;
    const idx = geo.index ? geo.index.count : geo.attributes.position?.count ?? 0;
    const per = o.isMesh ? idx / 3 : idx;
    const inst = o.isInstancedMesh ? o.count : geo.isInstancedBufferGeometry ? geo.instanceCount : 1;
    const drawRange = geo.drawRange && Number.isFinite(geo.drawRange.count) ? Math.min(idx, geo.drawRange.count) / (o.isMesh ? 3 : 1) : per;
    const tris = drawRange * (Number.isFinite(inst) ? inst : 1);
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    // (Unnamed: by its kind, its material, and what holds it: an LOD, an instanced mesh.)
    const name = o.name || o.parent?.name || o.parent?.parent?.name || `${o.type}${o.isInstancedMesh ? '[inst]' : ''}${o.parent?.isLOD ? '[lod]' : ''}:${mat?.type ?? ''}:${mat?.color?.getHexString?.() ?? ''}:${mat?.map ? 'tex' : ''} ~${Math.round(per)}/each`;
    const e = out.get(name) ?? { name, tris: 0, meshes: 0, inst: 0 };
    e.tris += tris;
    e.meshes++;
    e.inst += Number.isFinite(inst) ? inst : 1;
    out.set(name, e);
    calls++;
  });
  return { calls, parts: [...out.values()].sort((a, b) => b.tris - a.tris) };
});
console.log(`job ${id} ${q} ${view}: ${parts.calls} meshes in the scene (before culling)`);
for (const e of parts.parts.slice(0, 30)) console.log(`${(e.tris / 1000).toFixed(1).padStart(7)}k tris  ${String(e.meshes).padStart(4)} meshes ${String(e.inst).padStart(6)} inst  ${e.name}`);
const info = await p.evaluate(() => ({ calls: window.__game.view.renderer.info.render.calls, tris: window.__game.view.renderer.info.render.triangles }));
console.log(`drawn last frame: ${info.calls} calls, ${(info.tris / 1000).toFixed(0)}k triangles`);
await browser.close();
