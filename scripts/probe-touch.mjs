// Dev: at the start of a job, hold MİSİNA TAK with a real touch, and walk with W; print what happens.
// Usage: node scripts/probe-touch.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 405, height: 566, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=low`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  g.save.introDone = true;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(1));
});
await sleep(1000);
const state = () => page.evaluate(() => { const s = window.__game.session; return { intro: s.intro, x: +s.x.toFixed(2), z: +s.z.toFixed(2), r: +s.rethread.toFixed(2), held: window.__game.actionHeld, acts: [...document.querySelectorAll('.action-btn')].map((b) => b.dataset.id) }; });
console.log('start', JSON.stringify(await state()));
const rect = async (sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
let b = await rect('.action-btn[data-id="take"]');
await page.touchscreen.tap(b.x, b.y);
await sleep(600);
console.log('after take', JSON.stringify(await state()));
b = await rect('.action-btn[data-id="line"]');
await page.touchscreen.touchStart(b.x, b.y);
for (let i = 0; i < 6; i++) {
  await sleep(700);
  console.log('holding', JSON.stringify(await state()));
}
await page.touchscreen.touchEnd();
console.log('direct', JSON.stringify(await page.evaluate(() => {
  const s = window.__game.session;
  const before = s.rethread;
  for (let i = 0; i < 30; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, rethread: true });
  return { before, after: s.rethread, broken: s.broken, line: s.line, running: s.running, spool: s.spool, has: s.hasTrimmer, tangle: s.tangle, state: s.state, mode: window.__game.mode, driving: s.driving };
})));
for (const key of ['KeyW', 'KeyS']) {
  const a = await state();
  await page.keyboard.down(key);
  await sleep(1500);
  await page.keyboard.up(key);
  console.log(key, JSON.stringify(a), '->', JSON.stringify(await state()));
}
await browser.close();
