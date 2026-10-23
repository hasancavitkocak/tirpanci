// Dev: get on the pat pat, drive it along the path and take screenshots (chase camera, tyre marks).
// Usage: node scripts/look-drive.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(m.type(), m.text()));
await page.goto(`${base}?quality=medium`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  g.save.introDone = true;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(Number(new URLSearchParams(location.search).get('lv') ?? 1)));
  const s = g.session;
  // Skip the start of the job (take the trimmer, fit line): look-intro.mjs plays that.
  s.takeTrimmer();
  s.line = s.gear.lineMax;
  s.broken = false;
  s.intro = null;
});
await sleep(800);
await page.screenshot({ path: 'test-output/drive-0-board.png' });
await page.click('.action-btn[data-id="board"]');
await sleep(2500);
await page.screenshot({ path: 'test-output/drive-1-seated.png' });
// From the side and close: the driver's hands on the steering wheel.
await page.evaluate(() => (window.__game.view.driveOrbit = Math.PI / 2));
await sleep(1500);
await page.screenshot({ path: 'test-output/drive-1b-side.png' });
await page.evaluate(() => (window.__game.view.driveOrbit = 0));
await page.keyboard.down('KeyW');
await sleep(4000);
await page.keyboard.down('KeyA');
await sleep(2500);
await page.keyboard.up('KeyA');
await page.screenshot({ path: 'test-output/drive-2-moving.png' });
await sleep(2500);
await page.keyboard.up('KeyW');
await sleep(1500);
await page.screenshot({ path: 'test-output/drive-3-stopped.png' });
// Behind and above: the flattened grass and the tyre marks.
await page.evaluate(() => (window.__game.view.driveOrbit = Math.PI * 0.85));
await sleep(1500);
await page.screenshot({ path: 'test-output/drive-3b-tracks.png' });
await page.evaluate(() => (window.__game.view.driveOrbit = 0));
console.log(JSON.stringify(await page.evaluate(() => {
  const s = window.__game.session;
  return { driving: s.driving, v: s.field.vehicle, depot: s.field.depot };
})));
await page.click('.action-btn[data-id="off"]');
await sleep(1000);
await page.screenshot({ path: 'test-output/drive-4-off.png' });
await browser.close();
console.log('done');
