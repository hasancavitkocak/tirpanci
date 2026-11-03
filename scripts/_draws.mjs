// Dev: where the draw calls and triangles of a job go (job id, quality) at the job start and in the field.
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const job = Number(process.argv[2] ?? 20);
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/draws-${Date.now()}` });
const p = await b.newPage();
await p.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(`http://localhost:5173/?quality=${process.argv[3] ?? 'low'}`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await p.evaluate((job) => { const g = window.__game; Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20 }); document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show')); g.start(g.levelById(job)); }, job);
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(2500);
const report = () => p.evaluate(() => {
  const g = window.__game, v = g.view, r = v.renderer;
  r.info.autoReset = false; r.info.reset();
  const cam = v.camera;
  r.render(v.scene, cam);
  const info = { calls: r.info.render.calls, tris: r.info.render.triangles };
  r.info.autoReset = true;
  cam.updateMatrixWorld();
  // Own count: visible meshes in the frustum, grouped by a label.
  const proj = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
  const groups = new Map();
  const sphereIn = (o) => {
    const g2 = o.geometry; if (!g2.boundingSphere) g2.computeBoundingSphere();
    const s = (o.isInstancedMesh && o.boundingSphere) || g2.boundingSphere;
    const c = s.center.clone().applyMatrix4(o.matrixWorld);
    const e = o.matrixWorld.elements; const sc = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
    const rr = s.radius * sc; const m = proj.elements;
    const planes = [[m[3]+m[0],m[7]+m[4],m[11]+m[8],m[15]+m[12]],[m[3]-m[0],m[7]-m[4],m[11]-m[8],m[15]-m[12]],[m[3]+m[1],m[7]+m[5],m[11]+m[9],m[15]+m[13]],[m[3]-m[1],m[7]-m[5],m[11]-m[9],m[15]-m[13]],[m[3]+m[2],m[7]+m[6],m[11]+m[10],m[15]+m[14]],[m[3]-m[2],m[7]-m[6],m[11]-m[10],m[15]-m[14]]];
    return planes.every(([a,b2,cc,d]) => (a*c.x+b2*c.y+cc*c.z+d)/Math.hypot(a,b2,cc) > -rr);
  };
  const label = (o) => { const chain = []; for (let x = o; x && x !== v.scene; x = x.parent) chain.unshift((x.name || x.type) + (x.children.length > 1 ? `(${x.children.length})` : '')); return chain.slice(0, 3).join('/') + ' · ' + (o.material?.map?.name || o.material?.name || o.material?.type || ''); };
  v.scene.traverseVisible((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    if (o.frustumCulled && !sphereIn(o)) return;
    const geo = o.geometry; const idx = geo.index ? geo.index.count : geo.attributes.position.count;
    const dr = geo.drawRange; const n = Math.min(idx, dr.count === Infinity ? idx : dr.count);
    const inst = o.isInstancedMesh ? o.count : 1;
    const t = o.isMesh ? (n / 3) * inst : 0;
    const mats = Array.isArray(o.material) ? Math.max(1, geo.groups.length) : 1;
    const k = label(o); const gr = groups.get(k) ?? { calls: 0, tris: 0, shadow: 0, geos: new Set(), at: o.getWorldPosition(o.position.clone()).toArray().map(Math.round).join(','), gt: geo.type, v: geo.attributes.position.count };
    gr.geos.add(geo.uuid);
    gr.calls += mats; gr.tris += t; if (o.castShadow) gr.shadow += mats; groups.set(k, gr);
  });
  const rows = [...groups].sort((a, b2) => b2[1].tris - a[1].tris);
  const sum = rows.reduce((s, [, x]) => ({ calls: s.calls + x.calls, tris: s.tris + x.tris, shadow: s.shadow + x.shadow }), { calls: 0, tris: 0, shadow: 0 });
  return { info, sum, top: rows.slice(0, 22).map(([k, x]) => `${String(x.calls).padStart(4)} çizim ${String(Math.round(x.tris/1000)).padStart(5)}k üçgen ${String(x.shadow).padStart(3)} gölge  ${k} [${x.geos.size} geo, ${x.gt} ${x.v}v @${x.at}]`), byCalls: [...groups].sort((a, b2) => b2[1].calls - a[1].calls).slice(0, 12).map(([k, x]) => `${String(x.calls).padStart(4)} çizim  ${k} [${x.geos.size} geo, ${x.gt} ${x.v}v @${x.at}]`), shadows: r.shadowMap.enabled && v.scene.children.some((c) => c.isDirectionalLight && c.castShadow) };
});
const show = (t, x) => { console.log(`\n== ${t}: renderer ${x.info.calls} çizim, ${Math.round(x.info.tris/1000)}k üçgen (gölgeler dahil) · görünen: ${x.sum.calls} çizim, ${Math.round(x.sum.tris/1000)}k üçgen, gölge atan ${x.sum.shadow}`); console.log('üçgene göre:'); x.top.forEach((l) => console.log('  ' + l)); console.log('çizime göre:'); x.byCalls.forEach((l) => console.log('  ' + l)); };
show(`iş ${job}, başlangıç`, await report());
const shot = process.argv[4]; if (shot) await p.screenshot({ path: `${shot}-${job}-a.png` });
await p.evaluate(() => { const g = window.__game; const s = g.session; if (s.driving) { s.field.vehicle.speed = 0; s.alight?.(); } s.intro = null; s.hasTrimmer = true; s.x = s.field.width * 0.5; s.z = s.field.depth * 0.5; s.yaw = Math.PI; g.lookYaw = Math.PI; });
await sleep(1500);
show(`iş ${job}, tarlanın ortası`, await report());
if (shot) await p.screenshot({ path: `${shot}-${job}-b.png` });
await b.close();
