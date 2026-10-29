// Dev: what heats the phone, job by job: every job (1..20) at each quality (low, medium, high), in its own
// weather and in rain, seen five ways (the trimmer in hand looking north, east, south and west from the
// middle of the garden, and from the vehicle at its gate) — 600 scenes. For each: the draw calls, the
// triangles, the pixels drawn a frame, and the game's own work a frame (its loop: the game and the
// drawing commands, ms). As a phone held sideways (an iPhone's 3x screen). The worst scenes, and the jobs
// that stand out against the rest, listed; everything in test-output/heat/scan.json.
// Usage (dev server running): node scripts/heat-scan.mjs [baseUrl] [jobs, e.g. 16 or 11-20]
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const range = (process.argv[3] ?? '1-20').split('-').map(Number);
const JOBS = Array.from({ length: (range[1] ?? range[0]) - range[0] + 1 }, (_, i) => range[0] + i);
const QUALITIES = ['low', 'medium', 'high'];
const WEATHERS = ['own', 'rain'];
const VIEWS = ['north', 'east', 'south', 'west', 'vehicle'];
mkdirSync('test-output/heat', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-heat-${Date.now()}` });
const p = await browser.newPage();
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`${base}?tirpan&quality=low`, { timeout: 120000 });
await p.waitForFunction('window.__ready === true', { timeout: 120000 });

/** The game's work per frame and the draw's size, over `ms`. */
const measure = (ms) =>
  p.evaluate(async (ms) => {
    const g = window.__game;
    const r = g.view.renderer;
    const loop = g.loop;
    let work = 0;
    let frames = 0;
    let calls = 0;
    let tris = 0;
    g.loop = function (t) {
      const a = performance.now();
      const before = r.info.render.frame;
      loop.call(this, t);
      if (r.info.render.frame !== before) {
        work += performance.now() - a;
        frames++;
        calls += r.info.render.calls;
        tris += r.info.render.triangles;
      }
    };
    await new Promise((res) => setTimeout(res, ms));
    g.loop = loop;
    // (The canvas is the drawing buffer: its pixels drawn each frame.)
    return { frames, ms: frames ? work / frames : 0, calls: frames ? calls / frames : 0, tris: frames ? tris / frames : 0, px: r.domElement.width * r.domElement.height };
  }, ms);

const rows = [];
let n = 0;
const total = JOBS.length * QUALITIES.length * WEATHERS.length * VIEWS.length;
for (const id of JOBS) {
  for (const q of QUALITIES) {
    for (const w of WEATHERS) {
      await p.evaluate(
        (id, q, w) => {
          const g = window.__game;
          if (g.mode === 'playing') g.quitToMenu();
          Object.assign(g.save, { introDone: true, tutorialSeen: true, lookSeen: true, harvestOffered: 99, unlocked: 20, quality: q, weather: w === 'own' ? 'auto' : w, camera: 'fpv' });
          g.view.setQuality(q);
          document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
          g.start(g.levelById(id));
        },
        id,
        q,
        w,
      );
      await p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 120000 });
      await sleep(1200);
      for (const view of VIEWS) {
        await p.evaluate((view) => {
          const g = window.__game;
          const s = g.session;
          const f = s.field;
          s.intro = null;
          if (s.driving) s.alight?.();
          const yaw = { north: Math.PI, east: -Math.PI / 2, south: 0, west: Math.PI / 2 }[view];
          if (view === 'vehicle') {
            const v = f.vehicle;
            v.x = f.entryX;
            v.z = f.depth / 2 + 6;
            v.yaw = Math.PI;
            v.speed = 0;
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
        await sleep(500);
        const m = await measure(1400);
        rows.push({ id, q, w, view, ...m });
        n++;
        if (n % 25 === 0) console.log(`${n}/${total}`);
      }
    }
  }
}
writeFileSync('test-output/heat/scan.json', JSON.stringify(rows, null, 1));
const fmt = (r) => `${String(r.id).padStart(2)} ${r.q.padEnd(6)} ${r.w.padEnd(4)} ${r.view.padEnd(7)} ${r.calls.toFixed(0).padStart(4)} calls ${(r.tris / 1000).toFixed(0).padStart(5)}k tris ${r.ms.toFixed(1).padStart(5)} ms ${(r.px / 1e6).toFixed(2)} Mpx`;
console.log('\nmost draw calls:');
for (const r of [...rows].sort((a, b) => b.calls - a.calls).slice(0, 12)) console.log(fmt(r));
console.log('\nmost triangles:');
for (const r of [...rows].sort((a, b) => b.tris - a.tris).slice(0, 12)) console.log(fmt(r));
console.log('\nmost work a frame:');
for (const r of [...rows].sort((a, b) => b.ms - a.ms).slice(0, 12)) console.log(fmt(r));
// Each job against the rest, at high: its mean calls, triangles and work.
console.log('\njobs at high quality (mean of its 10 scenes):');
for (const id of JOBS) {
  const h = rows.filter((r) => r.id === id && r.q === 'high');
  const mean = (k) => h.reduce((a, r) => a + r[k], 0) / Math.max(1, h.length);
  console.log(`${String(id).padStart(2)} ${mean('calls').toFixed(0).padStart(4)} calls ${(mean('tris') / 1000).toFixed(0).padStart(5)}k tris ${mean('ms').toFixed(1).padStart(5)} ms`);
}
console.log(errors.length ? `\npage errors: ${errors.slice(0, 3).join(' | ')}` : '\nno page errors');
await browser.close();
