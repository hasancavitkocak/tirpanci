// Dev check: finish a job and go on with "Sonraki Bahçe" several times in a row (as on the phone),
// reporting page errors, the frame time and the JS heap after each. Usage: node scripts/check-next.mjs [baseUrl] [jobs]
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const jobs = Number(process.argv[3] ?? 5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}?quality=medium`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(async () => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  g.save.introDone = true;
  g.save.mownAt = {};
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS[0]);
});
for (let j = 0; j < jobs; j++) {
  await page.waitForFunction('window.__game.mode === "playing"', { timeout: 120000 });
  await sleep(1500);
  const id = await page.evaluate(() => window.__game.level.id);
  // Mow it all and finish.
  await page.evaluate(() => {
    const g = window.__game;
    const f = g.session.field;
    for (let k = 0; k < f.grass.length; k++) if (f.grass[k] > 0) f.cutCell?.(k);
    g.save.mownAt = {};
    g.finish();
  });
  await sleep(500);
  const t0 = Date.now();
  await page.evaluate(() => document.getElementById('btn-next').click());
  // The interstitial (dev: a stand-in) and the call.
  for (let k = 0; k < 40; k++) {
    const st = await page.evaluate(() => ({ call: document.getElementById('call').classList.contains('show'), ad: document.getElementById('ad')?.classList.contains('show') }));
    if (st.ad) await page.evaluate(() => document.querySelector('#ad button')?.click());
    if (st.call) break;
    await sleep(250);
  }
  await page.evaluate(() => document.getElementById('btn-call-ok').click());
  await page.waitForFunction('window.__game.mode === "playing"', { timeout: 120000 });
  await sleep(1500);
  const mem = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1));
  const gpu = await page.evaluate(() => JSON.stringify(window.__game.view.renderer.info.memory));
  console.log(`job ${id} -> ${await page.evaluate(() => window.__game.level.id)}: ${Date.now() - t0} ms, heap ${mem} MB, gpu ${gpu}, errors ${errors.length}`);
}
console.log(errors.slice(0, 10).join('\n'));
await browser.close();
