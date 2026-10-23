// Dev: first person standing low with a bank right in front (job 1's stream edge): the trimmer head
// must stay down, not come up into the eyes. Usage: node scripts/look-bank.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 400, height: 760 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=low`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(async () => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  g.save.camera = 'fpv';
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS[0]);
});
await page.waitForFunction('window.__game.mode === "playing"');
const d = await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const f = s.field;
  s.intro = null;
  s.hasTrimmer = true;
  s.broken = false;
  s.line = s.gear.lineMax;
  g.view.mode = 'fpv';
  // Where the ground 1.3 m ahead stands highest above the feet.
  let best = { d: 0, x: 0, z: 0, yaw: 0 };
  for (let x = -f.width / 2 - 6; x < f.width / 2 + 6; x += 0.5)
    for (let z = -f.depth / 2 - 6; z < f.depth / 2 + 12; z += 0.5)
      for (let a = 0; a < 16; a++) {
        const yaw = (a * Math.PI) / 8;
        const dd = f.height(x + Math.sin(yaw) * 1.3, z + Math.cos(yaw) * 1.3) - f.height(x, z);
        if (dd > best.d) best = { d: dd, x, z, yaw };
      }
  s.x = best.x;
  s.z = best.z;
  g.lookYaw = best.yaw;
  g.view.pitch = -0.4;
  return best;
});
console.log(d);
await sleep(1200);
await page.screenshot({ path: 'test-output/bank-fpv.png' });
await browser.close();
