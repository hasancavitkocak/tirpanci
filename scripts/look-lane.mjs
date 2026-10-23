// Dev: the start of a job by the house, the lane down to the field (board, drive, get off).
// Usage: node scripts/look-lane.mjs [baseUrl] (default http://localhost:5173/)
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=${process.env.QUALITY ?? 'medium'}`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await page.click('#btn-play');
await sleep(300);
await page.click('.level');
await sleep(300);
await page.click('#btn-call-ok');
await page.waitForFunction('window.__game.mode === "playing"');
await sleep(1500);
await page.screenshot({ path: `${OUT}/lane-0-home.png` });
// Next to the pat pat, get on.
await page.evaluate(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x - 1.3;
  s.z = v.z;
  s.board();
});
await sleep(1200);
await page.screenshot({ path: `${OUT}/lane-1-board.png` });
// Looking back at the house and the harman.
await page.evaluate(() => (window.__game.view.driveOrbit = -Math.PI * 0.5));
await sleep(1500);
await page.screenshot({ path: `${OUT}/lane-1b-house.png` });
await page.evaluate(() => (window.__game.view.driveOrbit = 0));
// Drive down the lane (steering for a point ahead on it) with screenshots on the way.
for (let shot = 2; shot < 8; shot++) {
  await page.evaluate(() => {
    const s = window.__game.session;
    const v = s.field.vehicle;
    const lane = s.field.lane;
    for (let i = 0; i < 60 * 4.5; i++) {
      let k = 0;
      for (let j = 1; j < lane.length; j++) if (Math.hypot(lane[j].x - v.x, lane[j].z - v.z) < Math.hypot(lane[k].x - v.x, lane[k].z - v.z)) k = j;
      const t = lane[Math.min(lane.length - 1, k + 4)];
      let err = Math.atan2(t.x - v.x, t.z - v.z) - v.yaw;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: Math.abs(err) > 0.5 ? 0.5 : 1, steer: Math.max(-1, Math.min(1, -err * 3)) } });
    }
  });
  await sleep(700);
  await page.screenshot({ path: `${OUT}/lane-${shot}-drive.png` });
}
console.log(await page.evaluate(() => JSON.stringify({ at: window.__game.session.vehicleAtField, obj: document.getElementById('objective').textContent })));
await browser.close();
