// Dev: third-person close-ups of the worker (standing, walking, from the side).
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const p = await b.newPage();
await p.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(m.type(), m.text()));
await p.goto('http://localhost:5190/?quality=medium');
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// First visit of the day: the daily reward pops up over the menu.
await p.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await p.click('#btn-play');
await sleep(300);
await p.click('.level');
await p.click('#btn-call-ok');
await p.waitForFunction('window.__game.mode === "playing"');
await p.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  for (let i = 0; i < 3; i++) s.starter.prime();
  s.temp = 0.3;
  s.pull(1);
  // The open spot farthest from any bush.
  let best = { x: 0, z: 0, d: -1 };
  for (let x = -s.field.width / 2 + 2; x < s.field.width / 2 - 2; x += 0.5)
    for (let z = -s.field.depth / 2 + 2; z < s.field.depth / 2 - 2; z += 0.5) {
      const d = Math.min(...s.field.bushes.map((b) => Math.hypot(b.x - x, b.z - z)), ...s.field.brambles.map((b) => Math.hypot(b.x - x, b.z - z) + 1));
      if (d > best.d) best = { x, z, d };
    }
  s.x = best.x;
  s.z = best.z;
  g.save.camera = 'fpv';
});
await p.keyboard.press('KeyC');
await p.evaluate(() => (window.__game.view.zoom = 0.45));
await sleep(1500);
await p.screenshot({ path: 'test-output/worker-stand.png' });
await p.keyboard.down('KeyW');
await p.keyboard.down('Space');
await sleep(1500);
await p.screenshot({ path: 'test-output/worker-walk.png' });
await p.keyboard.up('KeyW');
// Close-ups from his right side and from the front-left.
for (const [name, cam] of [
  ['worker-right', { side: -2.2, up: 1.2, back: -0.3, lookY: 0.9 }],
  ['worker-front', { side: 1.4, up: 1.4, back: -2.2, lookY: 0.9 }],
  ['worker-back', { side: -0.8, up: 1.6, back: 2.2, lookY: 0.9 }],
]) {
  await p.evaluate((c) => (window.__game.view.debugCam = c), cam);
  await sleep(700);
  await p.screenshot({ path: `test-output/${name}.png` });
}
await p.keyboard.up('Space');
// A bramble patch and the field overview.
await p.evaluate(() => {
  const s = window.__game.session;
  const br = s.field.brambles[0];
  s.x = br.x;
  s.z = br.z + 2.2;
  window.__game.view.debugCam = { side: 1.2, up: 2.2, back: 3.2, lookY: 0.2 };
});
await sleep(800);
await p.screenshot({ path: 'test-output/bramble.png' });
await p.evaluate(() => {
  const s = window.__game.session;
  s.x = s.field.width / 2 + 2;
  s.z = 0;
  s.yaw = Math.PI / 2;
  s.x = s.field.width / 2 + 5;
  window.__game.view.debugCam = { side: 1.5, up: 2.5, back: 3.5, lookY: -0.6 };
});
await sleep(800);
await p.screenshot({ path: 'test-output/stream.png' });
await p.evaluate(() => (window.__game.view.debugCam = { side: 0, up: 6, back: 14, lookY: 2 }));
await sleep(800);
await p.screenshot({ path: 'test-output/field-rows.png' });
await b.close();
console.log('done');
