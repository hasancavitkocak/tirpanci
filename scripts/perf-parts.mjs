// Dev: what each part of the scene costs to draw, in a job as played (first person, the trimmer in
// hand, looking over the field): draw calls, triangles and GPU milliseconds a frame (a timer query
// round the render), the whole scene and with each part hidden in turn. As a phone (iPhone, landscape,
// 3x screen) at a quality: node scripts/perf-parts.mjs [baseUrl] [quality=high] [level=5]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const quality = process.argv[3] ?? 'high';
const level = Number(process.argv[4] ?? 5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/perf-parts-${Date.now()}` });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
// An iPhone 17 Pro sideways: 874 x 402 points, 3 pixels a point.
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto(`${base}?quality=${quality}`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await p.evaluate((level) => {
  const g = window.__game;
  Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20 });
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(level));
}, level);
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
// In the field, trimmer in hand, looking up the field.
await p.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  s.intro = null;
  s.hasTrimmer = true;
  s.x = 0;
  s.z = s.field.depth / 2 - 3;
  s.yaw = Math.PI;
  g.lookYaw = Math.PI;
});
await sleep(2500);
const out = await p.evaluate(async () => {
  const g = window.__game;
  const v = g.view;
  const r = v.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const render = r.render.bind(r);
  let gpu = [];
  let q = null;
  // The timer round each render (one query a frame; read back a few frames later).
  const pending = [];
  r.render = (scene, cam) => {
    if (ext) {
      q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    }
    render(scene, cam);
    if (ext) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(q);
    }
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      gpu.push(gl.getQueryParameter(pending[0], gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(pending.shift());
    }
  };
  const measure = async () => {
    await new Promise((res) => setTimeout(res, 400));
    gpu = [];
    const f0 = r.info.render.frame;
    await new Promise((res) => setTimeout(res, 2000));
    const info = r.info.render;
    const sorted = gpu.slice().sort((a, b) => a - b);
    return { gpu: sorted.length ? +sorted[Math.floor(sorted.length / 2)].toFixed(2) : null, calls: info.calls, tris: info.triangles, frames: info.frame - f0 };
  };
  const res = { quality: v.quality, px: `${r.domElement.width}x${r.domElement.height}`, timer: !!ext, programs: r.info.programs?.length };
  res.all = await measure();
  // Each part hidden in turn: the scene's own children, and the world's.
  const parts = [];
  for (const o of v.scene.children) parts.push([`scene:${o.name || o.type}${o === v.grass?.group ? ' (grass)' : o === v.world?.group ? ' (world)' : ''}`, o]);
  for (const o of v.world.group.children) parts.push([`world:${o.name || o.type}:${o.children.length}`, o]);
  const tris = (o) => {
    let t = 0;
    o.traverse((m) => {
      if (!m.isMesh || !m.visible) return;
      const geo = m.geometry;
      const n = (geo.index ? geo.index.count : geo.attributes.position?.count ?? 0) / 3;
      t += n * (m.isInstancedMesh ? m.count : 1);
    });
    return Math.round(t);
  };
  res.parts = [];
  for (const [name, o] of parts) {
    if (!o.visible) continue;
    const t = tris(o);
    if (t < 2000 && parts.length > 30) continue;
    o.visible = false;
    const m = await measure();
    o.visible = true;
    res.parts.push({ name, tris: t, saves: res.all.gpu && m.gpu ? +(res.all.gpu - m.gpu).toFixed(2) : null, calls: res.all.calls - m.calls });
  }
  res.parts.sort((a, b) => (b.saves ?? 0) - (a.saves ?? 0));
  return res;
});
console.log(`${out.quality} ${out.px} timer:${out.timer} programs:${out.programs}`);
console.log(`whole frame: GPU ${out.all.gpu} ms, ${out.all.calls} draw calls, ${out.all.tris} triangles, ${out.all.frames / 2} fps`);
for (const x of out.parts) console.log(`  ${x.name.padEnd(40)} GPU -${x.saves} ms  calls -${x.calls}  tris ${x.tris}`);
await b.close();
