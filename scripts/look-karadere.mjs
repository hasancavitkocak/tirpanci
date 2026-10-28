// Dev: Karadere's look, a picture of each of its own things (at the worker's eyes): the stone
// house and the wider yard, the serender, the barn with its bales, the arch at the way in, the paved
// trunk between its walls, the bridge and the mill, the sky; and Yeşilyamaç's yard to set it against.
// Each spot also checked: standing there is allowed (not inside a building).
// Usage (dev server running): node scripts/look-karadere.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
mkdirSync('test-output/karadere', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-karadere-${Date.now()}` });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('requestfailed', (r) => /\.(glb|jpg|webp|png)$/.test(r.url()) && errors.push(`failed ${r.url()}`));
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
await p.goto(`${base}?quality=high`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await p.evaluate(() => Object.assign(window.__game.save, { introDone: true, tutorialSeen: true, unlocked: 20, harvestOffered: 99, weather: 'sunny', vehicle: 'patpat' }));

const roam = async (region) => {
  await p.evaluate((region) => {
    const g = window.__game;
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.levelTab = region;
    void g.startRoam();
  }, region);
  await p.waitForFunction(`window.__game.mode === "playing" && window.__game.roaming && window.__game.session.field.region.id === ${region} && !document.getElementById("loading").classList.contains("show")`, { timeout: 90000 });
  await sleep(1500);
  // At the worker's eyes, looking level.
  await p.evaluate(() => {
    const g = window.__game;
    if (g.cameraMode !== 'fpv') g.toggleCamera();
  });
};
// Stand `back` metres from a thing (field coordinates), on the side `from` (unit direction), facing it.
const look = async (name, fn, back = 14) => {
  const r = await p.evaluate(
    (src, back) => {
      const g = window.__game;
      const s = g.session;
      const f = s.field;
      const t = new Function('f', `return (${src})(f)`)(f);
      const x = t.x + t.from.x * back;
      const z = t.z + t.from.z * back;
      s.x = x;
      s.z = z;
      s.yaw = Math.atan2(t.x - x, t.z - z);
      g.lookYaw = s.yaw;
      g.view.pitch = t.pitch ?? 0.04;
      g.view.snapCamera();
      return { free: f.pointFree(x, z), x: Math.round(x + f.origin.x), z: Math.round(z + f.origin.z) };
    },
    fn.toString(),
    back,
  );
  await sleep(1400);
  await p.evaluate(() => window.__game.view.snapCamera());
  await sleep(500);
  await p.screenshot({ path: `test-output/karadere/${name}.png` });
  return r;
};

await roam(2);
const info = await p.evaluate(() => {
  const f = window.__game.session.field;
  return { arch: !!f.archAt, barn: f.yardProps.some((y) => y.kind === 'barn'), bales: f.yardProps.some((y) => y.kind === 'bales'), serender: f.yardProps.some((y) => y.kind === 'serender'), walls: f.roadWallRuns.length, bridge: !!f.bridge, mill: !!f.mill, houseR: f.houseR, yard: f.plateau.r };
});
ok(info.arch && info.barn && info.bales && info.serender && info.walls > 3 && info.bridge && info.mill, `Karadere has its arch, barn, bales, serender, walls (${info.walls}), bridge, mill`);
ok(info.houseR > 4 && info.yard > 15, `its bigger house (${info.houseR} m) in a wider yard (${info.yard} m)`);
const loaded = await p.evaluate(() => ['houseKaradere', 'serender', 'arch', 'barn'].filter((k) => !window.__game.models?.[k]?.length));
ok(!loaded.length, `its models loaded${loaded.length ? ': missing ' + loaded.join(',') : ''}`);
let r = await look('1-ev-avlu', (f) => ({ x: f.house.x, z: f.house.z, from: { x: 1, z: 0.25 }, pitch: 0.12 }), 21);
ok(r.free, `the house from the harman side (${r.x}, ${r.z})`);
r = await look('2-serender', (f) => {
  const y = f.yardProps.find((q) => q.kind === 'serender');
  const dx = f.plateau.x - y.x;
  const dz = f.plateau.z - y.z;
  const l = Math.hypot(dx, dz);
  return { x: y.x, z: y.z, from: { x: dx / l, z: dz / l } };
}, 12);
ok(r.free, `the serender from the yard (${r.x}, ${r.z})`);
r = await look('3-ahir-balya', (f) => {
  const y = f.yardProps.find((q) => q.kind === 'barn');
  const dx = f.plateau.x - y.x;
  const dz = f.plateau.z - y.z;
  const l = Math.hypot(dx, dz);
  return { x: y.x, z: y.z, from: { x: dx / l, z: dz / l } };
}, 22);
ok(r.free, `the barn and its bales (${r.x}, ${r.z})`);
r = await look('4-kemer-disaridan', (f) => {
  const a = f.archAt;
  return { x: a.x, z: a.z, from: { x: Math.sin(a.yaw), z: Math.cos(a.yaw) }, pitch: 0.1 };
}, 13);
ok(r.free, `the arch from outside, coming in (${r.x}, ${r.z})`);
r = await look('5-kemer-iceriden', (f) => {
  const a = f.archAt;
  return { x: a.x, z: a.z, from: { x: -Math.sin(a.yaw), z: -Math.cos(a.yaw) }, pitch: 0.1 };
}, 13);
ok(r.free, `the arch from inside, leaving (${r.x}, ${r.z})`);
r = await look('6-tas-yol-duvar', (f) => {
  const p = f.alongTrunk(f.trunkLength * 0.45);
  return { x: p.x, z: p.z, from: { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) } };
}, 12);
ok(r.free, `the paved trunk between its walls (${r.x}, ${r.z})`);
r = await look('7-kopru-degirmen', (f) => ({ x: f.bridge.x, z: f.bridge.z, from: { x: -1, z: 0 }, pitch: 0.02 }), 22);
ok(r.free, `the bridge and the mill (${r.x}, ${r.z})`);
r = await look('8-gokyuzu', (f) => ({ x: f.house.x + 60, z: f.house.z + 40, from: { x: -1, z: -0.3 }, pitch: 0.18 }), 3);
r = await look('8b-gokyuzu', (f) => ({ x: f.house.x - 60, z: f.house.z - 10, from: { x: 1, z: 0.2 }, pitch: 0.18 }), 3);
await roam(1);
r = await look('9-yesilyamac-ev', (f) => ({ x: f.house.x, z: f.house.z, from: { x: 1, z: 0.25 }, pitch: 0.12 }), 21);
ok(r.free, `Yeşilyamaç's house as it was (${r.x}, ${r.z})`);
const y1 = await p.evaluate(() => {
  const f = window.__game.session.field;
  return { arch: !!f.archAt, barn: f.yardProps.some((y) => y.kind === 'barn'), walls: f.roadWallRuns.length, houseR: f.houseR, yard: f.plateau.r };
});
ok(!y1.arch && !y1.barn && !y1.walls && y1.houseR === 3.4 && y1.yard === 15, `Yeşilyamaç untouched: no arch, barn or walls, its house and yard as they were`);
ok(!errors.length, `no page errors or missing files${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await b.close();
process.exit(bad ? 1 : 0);
