// Dev: first person, mow for a while, screenshot the dirty face shield, wipe it, screenshot again.
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
await p.evaluate(() => {
  window.__game.save.camera = 'fpv';
  window.__game.save.controls = 'easy';
  window.__game.applyControls();
});
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
  s.x = -6;
  s.z = 8;
});
await sleep(500);
await p.keyboard.down('Space');
await p.keyboard.down('KeyD');
await sleep(800);
await p.keyboard.up('KeyD');
await p.keyboard.down('KeyW');
for (let i = 0; i < 6; i++) {
  await sleep(1000);
  await p.evaluate(() => (window.__game.session.strain = 0));
}
await p.screenshot({ path: 'test-output/visor-dirty.png' });
console.log('dirt', await p.evaluate(() => JSON.stringify({ d: window.__game.visor.dirt, vis: window.__game.visor.visible, cut: window.__game.session.cutting, rate: window.__game.cutRate, run: window.__game.session.running, cov: window.__game.session.field.coverage, n: window.__game.visor.splats.length })));
await p.keyboard.up('KeyW');
await p.keyboard.up('Space');
await p.keyboard.press('KeyV');
await sleep(250);
await p.screenshot({ path: 'test-output/visor-wipe.png' });
await sleep(900);
await p.screenshot({ path: 'test-output/visor-clean.png' });
console.log('dirt after', await p.evaluate(() => window.__game.visor.dirt.toFixed(2)));
await b.close();
