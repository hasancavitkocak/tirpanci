// Dev: driving in first person through a bend (wheel turned left, then right): the view turns into
// the bend with the pat pat's head. Usage: node scripts/look-drivehead.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 760 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=low`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(async () => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  g.save.camera = 'fpv';
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS[1]);
});
await page.waitForFunction('window.__game.mode === "playing"');
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const v = s.field.vehicle;
  s.x = v.x + 1.2;
  s.z = v.z;
  s.board();
  g.view.mode = 'fpv';
});
for (const [tag, steer] of [['straight', 0], ['left', -1], ['right', 1]]) {
  await page.evaluate((steer) => {
    const v = window.__game.session.field.vehicle;
    v.art = -steer * 0.6;
    v.steer = steer;
    v.speed = 0;
  }, steer);
  await sleep(1500);
  const info = await page.evaluate(() => ({ art: window.__game.session.field.vehicle.art.toFixed(2), turn: window.__game.view.headTurn.toFixed(2) }));
  console.log(tag, info);
  await page.screenshot({ path: `test-output/drivehead-${tag}.png` });
}
await browser.close();
