// Dev: how many wheel parts and steering-wheel triangles were cut out of patpat.glb.
// Usage: node scripts/check-patpat-rig.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.goto(`${base}?quality=low`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const rig = window.__game.view.world.patRig;
      const tris = (o) => {
        let n = 0;
        o.traverse((c) => c.isMesh && (n += c.geometry.index.count / 3));
        return n;
      };
      return { wheels: rig.wheels.map((w) => tris(w.spin)), steering: tris(rig.steering), grips: rig.grips.map((g) => g.getWorldPosition(new g.position.constructor()).toArray().map((v) => +v.toFixed(2))) };
    }),
  ),
);
await browser.close();
