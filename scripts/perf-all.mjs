// Performance and health check of every level: plays each one (mowing, then driving the pat pat) at
// low and medium quality and reports frame rate, draw calls, triangles, JS heap, GPU resources (to
// spot leaks when switching levels) and any console errors. Tries the real GPU (ANGLE D3D11); the
// renderer in use is printed. Usage: node scripts/perf-all.mjs [baseUrl] [quality...]
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const qualities = process.argv.length > 3 ? process.argv.slice(3) : ['low', 'medium'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage();
// A typical phone screen (CSS px) at the device pixel ratio the game caps itself to.
await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`[${m.type()}] ${m.text()}`));
await page.goto(`${base}?quality=${qualities[0]}`);
await page.waitForFunction('window.__ready === true', { timeout: 180000 });
const gpu = await page.evaluate(() => {
  const gl = window.__game.view.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
console.log('GPU:', gpu);
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));

const measure = (seconds) =>
  page.evaluate(
    (sec) =>
      new Promise((resolve) => {
        const times = [];
        const t0 = performance.now();
        const tick = (t) => {
          times.push(t);
          if (t - t0 < sec * 1000) requestAnimationFrame(tick);
          else {
            const d = times.slice(1).map((x, i) => x - times[i]).sort((a, b) => a - b);
            const v = window.__game.view;
            const info = v.renderer.info;
            resolve({
              fps: Math.round((1000 * d.length) / (times[times.length - 1] - times[0])),
              p95: Math.round(d[Math.floor(d.length * 0.95)]),
              calls: info.render.calls,
              tris: Math.round(info.render.triangles / 1000),
              geo: info.memory.geometries,
              tex: info.memory.textures,
              heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds,
  );

const rows = [];
for (const q of qualities) {
  await page.evaluate((qq) => {
    const g = window.__game;
    g.save.quality = qq;
    g.view.setQuality(qq);
  }, q);
  for (let id = 1; id <= 8; id++) {
    await page.evaluate((lv) => {
      const g = window.__game;
      if (g.mode === 'playing') g.quitToMenu();
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
      g.save.introDone = true;
      g.start(g.levelById(lv));
      const s = g.session;
      // Skip the start of the job and stand at the field, engine running.
      s.takeTrimmer();
      s.line = s.gear.lineMax;
      s.broken = false;
      s.intro = null;
      s.x = s.field.depot.x + 1.2;
      s.z = s.field.depot.z - 1.2;
      s.yaw = Math.PI;
      g.lookYaw = Math.PI;
      for (let i = 0; i < 3; i++) s.starter.prime();
      s.temp = 0.3;
      s.pull(1);
      g.updateStarterUi();
    }, id);
    await sleep(1500);
    // Mowing: throttle held, walking up into the grass.
    await page.keyboard.down('Space');
    await page.keyboard.down('KeyW');
    const mow = await measure(4);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
    // Driving the pat pat.
    const drive = await page.evaluate(() => {
      const g = window.__game;
      const s = g.session;
      s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, stop: true });
      const v = s.field.vehicle;
      s.x = v.x;
      s.z = v.z - 1.5;
      return s.board();
    });
    await page.keyboard.down('KeyW');
    const ride = await measure(3);
    await page.keyboard.up('KeyW');
    const cov = await page.evaluate(() => window.__game.session.field.coverage);
    rows.push({ q, id, mow, ride, drove: drive, cov: +cov.toFixed(3) });
    console.log(q, `lv${id}`, 'mow', JSON.stringify(mow), 'drive', drive ? JSON.stringify(ride) : 'could not board');
  }
}
// Leak check: back on the menu, GPU resources should come back down.
await page.evaluate(() => window.__game.quitToMenu());
await sleep(1500);
const menu = await measure(2);
console.log('menu after all levels', JSON.stringify(menu));
// Menus open without errors.
for (const id of ['btn-shop', 'btn-shop-close', 'btn-play', 'btn-levels-close', 'btn-settings', 'btn-settings-close', 'btn-noads', 'btn-offer-later']) {
  await page.evaluate((b) => document.getElementById(b)?.click(), id);
  await sleep(150);
}
console.log('errors:', errors.length ? `\n${[...new Set(errors)].slice(0, 20).join('\n')}` : 'none');
await browser.close();
