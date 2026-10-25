// Dev: the two sticks on foot (left walks, right looks: pushed up, the view tips up and keeps turning while
// held), and with the trimmer a drag on the right half tipping the view up and down. Prints what moved.
// Usage: node scripts/look-sticks.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 820, height: 360, isMobile: true, hasTouch: true });
await page.goto(`${base}?quality=low`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  g.save.introDone = true;
  g.save.camera = 'fpv';
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(1));
});
await page.waitForFunction('window.__game.mode === "playing"');
await page.evaluate(() => (window.__game.session.hasTrimmer = false));
await sleep(1500);
const view = () => page.evaluate(() => ({ yaw: +window.__game.lookYaw.toFixed(3), pitch: +window.__game.view.pitch.toFixed(3), x: +window.__game.session.x.toFixed(2), z: +window.__game.session.z.toFixed(2) }));
let bad = 0;
const ok = (c, t) => { if (!c) bad++; console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`); };
// A touch drag held: down at (x, y), moved by (dx, dy) in steps, held, let go.
const touch = async (x, y, dx, dy, ms) => {
  const c = await page.target().createCDPSession();
  const pt = (px, py) => [{ x: px, y: py, id: 1 }];
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) });
  for (let k = 1; k <= 6; k++) await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + (dx * k) / 6, y + (dy * k) / 6) });
  await sleep(ms);
  const mid = await page.evaluate(() => getComputedStyle(document.getElementById('look-stick')).display);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return mid;
};
const a = await view();
const shown = await touch(700, 290, 0, -50, 1500);
const b = await view();
ok(shown !== 'none' && b.pitch > a.pitch + 0.1, `on foot, the look stick pushed up: pitch ${a.pitch} -> ${b.pitch} (stick shown: ${shown})`);
ok(Math.abs(b.x - a.x) + Math.abs(b.z - a.z) < 0.05, 'and the worker did not walk');
await touch(700, 290, 50, 0, 1500);
const c = await view();
ok(Math.abs(c.yaw - b.yaw) > 0.3, `pushed right, the view turns and keeps turning: yaw ${b.yaw} -> ${c.yaw}`);
await touch(110, 290, 0, -50, 1500);
const d = await view();
ok(Math.hypot(d.x - c.x, d.z - c.z) > 0.5, `the left stick walks: moved ${Math.hypot(d.x - c.x, d.z - c.z).toFixed(2)} m`);
// The trimmer in hand: a drag on the right half (clear of the trigger) tips the view.
await page.evaluate(() => (window.__game.session.hasTrimmer = true));
await sleep(800);
const e = await view();
await touch(560, 120, 0, 60, 300);
const f = await view();
ok(f.pitch < e.pitch - 0.1, `trimmer in hand, dragging down on the right looks down: pitch ${e.pitch} -> ${f.pitch}`);
await browser.close();
process.exit(bad ? 1 : 0);
