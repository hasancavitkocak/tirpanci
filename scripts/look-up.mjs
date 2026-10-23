// Dev: first person looking ahead and up (the trimmer lifts), and the follow camera orbited.
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5190/?quality=low');
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// First visit of the day: the daily reward pops up over the menu.
await p.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await p.evaluate(() => (window.__game.save.camera = 'fpv'));
await p.click('#btn-play');
await sleep(300);
await p.click('.level');
await p.click('#btn-call-ok');
await p.waitForFunction('window.__game.mode === "playing"');
await p.evaluate(() => {
  const s = window.__game.session;
  for (let i = 0; i < 3; i++) s.starter.prime();
  s.temp = 0.3;
  s.pull(1);
  s.x = 0;
  s.z = 2;
});
// One finger on the RIGHT side: must throttle and walk.
const s0 = await p.evaluate(() => ({ z: window.__game.session.z }));
await p.touchscreen.touchStart(320, 600);
await p.touchscreen.touchMove(320, 560);
await sleep(4000);
console.log('right-thumb', await p.evaluate((z0) => JSON.stringify({ moved: (z0 - window.__game.session.z).toFixed(2), thr: window.__game.session.throttle.toFixed(2), cutting: window.__game.session.cutting }), s0.z));
await p.touchscreen.touchEnd();
// Right mouse button drag: look up.
for (const [name, dy] of [['look-ahead', -60], ['look-up', -180]]) {
  await p.mouse.move(200, 400);
  await p.mouse.down({ button: 'right' });
  await p.mouse.move(200, 400 + dy / 2);
  await p.mouse.move(200, 400 + dy);
  await p.mouse.up({ button: 'right' });
  await sleep(1200);
  console.log(name, await p.evaluate(() => JSON.stringify({ pitch: window.__game.view.pitch.toFixed(2), lift: window.__game.session.lift.toFixed(2) })));
  await p.screenshot({ path: `test-output/${name}.png` });
}
await b.close();
