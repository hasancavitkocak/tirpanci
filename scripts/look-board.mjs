// Dev: how near the worker must be to get on the pat pat or the tractor: 1.8 m and 2.3 m off its front,
// back and side (the gap from the nearest edge of its boxes); the board button should show at 1.8, not 2.3.
// Usage: node scripts/look-board.mjs [baseUrl] (default http://localhost:5173/)
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
mkdirSync('test-output/land', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 915, height: 412, isMobile: true, hasTouch: true });
await page.goto(`${base}?quality=low`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
let bad = 0;
for (const vehicle of ['patpat', 'traktor']) {
  await page.evaluate((v) => {
    const g = window.__game;
    g.save.introDone = true;
    g.save.vehicles = ['patpat', 'traktor'];
    g.save.vehicle = v;
    if (g.mode === 'playing') g.quitToMenu();
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.start(g.levelById(1));
  }, vehicle);
  await page.waitForFunction('window.__game.mode === "playing"');
  await sleep(1000);
  for (const side of ['front', 'back', 'side']) {
    for (const gap of [1.8, 2.3]) {
      // Out from the nose of the head, the back of the trailer, or the middle of its left side.
      const r = await page.evaluate((side, gap) => {
        const g = window.__game;
        const s = g.session;
        const f = s.field;
        const v = f.vehicle;
        s.running = false;
        s.intro = null;
        const [trailer, head] = f.vehicleBodies(v.x, v.z, v.yaw, v.art);
        const fx = Math.sin(v.yaw);
        const fz = Math.cos(v.yaw);
        let x, z;
        if (side === 'front') {
          const hx = Math.sin(head.yaw), hz = Math.cos(head.yaw);
          x = head.x + hx * (head.length / 2 + gap);
          z = head.z + hz * (head.length / 2 + gap);
        } else if (side === 'back') {
          x = trailer.x - fx * (trailer.length / 2 + gap);
          z = trailer.z - fz * (trailer.length / 2 + gap);
        } else {
          x = trailer.x - fz * (trailer.width / 2 + gap);
          z = trailer.z + fx * (trailer.width / 2 + gap);
        }
        s.x = x;
        s.z = z;
        return { gap: f.vehicleGap(x, z), canBoard: s.canBoard, fromMiddle: Math.hypot(x - v.x, z - v.z) };
      }, side, gap);
      await sleep(1000);
      const button = await page.evaluate(() => !!document.querySelector('[data-id="board"]'));
      const ok = gap < 2 ? r.canBoard && button : !r.canBoard && !button;
      if (!ok) bad++;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${vehicle} ${side} ${gap} m: gap ${r.gap.toFixed(2)}, ${r.fromMiddle.toFixed(2)} m from the trailer's middle, board ${r.canBoard}, button ${button}`);
      if (gap === 1.8) await page.screenshot({ path: `test-output/land/board-${vehicle}-${side}.png` });
    }
  }
}
await browser.close();
process.exit(bad ? 1 : 0);
