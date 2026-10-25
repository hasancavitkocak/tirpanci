// Dev: first person with the trimmer, turning fast (as when dragging to look round), screenshots during
// the turn to see whether the trimmer comes up in front of the eyes. Usage: node scripts/look-fpvturn.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
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
  g.start(LEVELS[1]);
});
await page.waitForFunction('window.__game.mode === "playing"');
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  s.intro = null;
  s.hasTrimmer = true;
  s.broken = false;
  s.line = s.gear.lineMax;
  s.x = 0;
  s.z = 0;
  g.view.mode = 'fpv';
});
await sleep(1000);
const info = [];
// A steady turn (a finger dragging across): the look turns every frame.
await page.evaluate(() => {
  const g = window.__game;
  const spin = () => {
    g.lookYaw += window.__turn ?? 0;
    requestAnimationFrame(spin);
  };
  window.__turn = 0.07;
  requestAnimationFrame(spin);
});
for (let i = 0; i < 6; i++) {
  if (i === 3) await page.evaluate(() => (window.__turn = -0.07));
  await sleep(250);
  await page.screenshot({ path: `test-output/fpvturn-${i}.png` });
  info.push(await page.evaluate(() => {
    const g = window.__game;
    const cam = g.view.camera.position;
    const t = g.view.worker.trimmer.head.position;
    return `cam-head ${Math.hypot(cam.x - t.x, cam.z - t.z).toFixed(2)}`;
  }));
}
console.log(info.join('\n'));
// Looking far down while turning (a diagonal drag).
await page.evaluate(() => {
  window.__turn = 0.03;
  window.__game.view.pitch = -1.2;
});
await sleep(400);
await page.screenshot({ path: 'test-output/fpvturn-down.png' });
await browser.close();
