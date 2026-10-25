// Dev: performance check. For each quality: how long a job takes to load, and at home, on the road
// and in the field: draw calls, triangles, and the average time of a frame (game update + render).
// The browser renders in software here (no GPU), so the times are for comparing, not phone fps.
// Usage: node scripts/perf.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 1 });
for (const q of ['low', 'medium', 'high']) {
  await page.goto(`${base}?quality=${q}`, { timeout: 180000 });
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  const r = await page.evaluate(async () => {
    const { LEVELS } = await import('/src/game/config.ts');
    const g = window.__game;
    document.getElementById('daily')?.classList.remove('show');
    const out = {};
    for (const id of [1, 4, 8]) {
      const t0 = performance.now();
      g.start(LEVELS.find((l) => l.id === id));
      const load = performance.now() - t0;
      const s = g.session;
      const f = s.field;
      const spots = {
        home: () => {},
        road: () => {
          const p = f.lane[Math.floor(f.lane.length * 0.6)];
          s.x = p.x;
          s.z = p.z;
        },
        field: () => {
          s.x = 0;
          s.z = f.depth / 2 - 1;
          s.yaw = Math.PI;
          g.lookYaw = Math.PI;
        },
      };
      const row = { load: Math.round(load) };
      for (const [name, put] of Object.entries(spots)) {
        put();
        for (let i = 0; i < 5; i++) {
          g.view.frame(1 / 60);
        }
        const t = performance.now();
        const n = 20;
        for (let i = 0; i < n; i++) g.view.frame(1 / 60);
        const ms = (performance.now() - t) / n;
        const info = g.view.renderer.info.render;
        row[name] = `${info.calls} calls, ${Math.round(info.triangles / 1000)}k tris, ${ms.toFixed(1)} ms`;
      }
      out[id] = row;
    }
    return out;
  });
  console.log(`== ${q}`);
  for (const [id, row] of Object.entries(r)) console.log(`  job ${id}: load ${row.load} ms | home ${row.home} | road ${row.road} | field ${row.field}`);
}
await browser.close();
