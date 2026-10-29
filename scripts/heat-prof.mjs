// Dev: a CPU profile of 3 s of play in a job, from the middle of its garden facing a way: the functions
// taking the most time (self and total), and the scene's object count.
// Usage (dev server running): node scripts/heat-prof.mjs [quality] [job] [north|east|south|west]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/prof-${Date.now()}` });
const p = await b.newPage();
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto(`http://localhost:5173/?tirpan&quality=${process.argv[2] ?? 'high'}`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await p.evaluate((id) => { const g = window.__game; Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20 }); document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show')); g.start(g.levelById(id)); }, Number(process.argv[3] ?? 5));
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await p.evaluate((YAW) => { const g = window.__game; const s = g.session; s.intro = null; s.hasTrimmer = true; s.x = 0; s.z = 0; s.yaw = YAW; g.lookYaw = YAW; }, { north: Math.PI, east: -Math.PI / 2, south: 0, west: Math.PI / 2 }[process.argv[4] ?? 'south']);
await sleep(2500);
console.log('objects in the scene:', await p.evaluate(() => { let n = 0, auto = 0; window.__game.view.scene.traverse((o) => { n++; if (o.matrixAutoUpdate) auto++; }); return `${n} (${auto} with matrixAutoUpdate)`; }));
const c = await p.target().createCDPSession();
await c.send('Profiler.enable');
await c.send('Profiler.setSamplingInterval', { interval: 200 });
await c.send('Profiler.start');
await sleep(3000);
const { profile } = await c.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
const counts = new Map();
profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) ?? 0) + (dt[i] ?? 0)));
// Total time per function: a node's own time added to it and every caller up its chain (once per function).
const parent = new Map();
for (const n of profile.nodes) for (const ch of n.children ?? []) parent.set(ch, n.id);
const total = new Map();
for (const [id, t] of counts) {
  const n = byId.get(id);
  const key = (x) => `${x.callFrame.functionName || '(anon)'} ${x.callFrame.url.split('/').pop().split('?')[0]}:${x.callFrame.lineNumber + 1}`;
  self.set(key(n), (self.get(key(n)) ?? 0) + t);
  const seen = new Set();
  for (let k = id; k !== undefined; k = parent.get(k)) {
    const kk = key(byId.get(k));
    if (seen.has(kk)) continue;
    seen.add(kk);
    total.set(kk, (total.get(kk) ?? 0) + t);
  }
}
const ms = (us) => (us / 1000 / 3).toFixed(1);
console.log('self ms/s:');
for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 22)) console.log(`  ${ms(t).padStart(6)}  ${k}`);
console.log('total ms/s (game code):');
for (const [k, t] of [...total].sort((a, b) => b[1] - a[1]).filter(([k]) => /\.ts:/.test(k)).slice(0, 30)) console.log(`  ${ms(t).padStart(6)}  ${k}`);
await b.close();
