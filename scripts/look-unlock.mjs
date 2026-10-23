// Dev: buying a locked field open at its gate (the BÖLÜMÜ AÇ button, the question, the padlock gone),
// short of money (the way to the store), the level list's buyable card, and the how-to page.
// Usage: node scripts/look-unlock.mjs [baseUrl]
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
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await page.click('#btn-howto');
await sleep(500);
await page.screenshot({ path: 'test-output/unlock-howto.png', fullPage: true });
await page.evaluate(async () => {
  const g = window.__game;
  g.show('menu');
  g.save.unlocked = 1;
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS[0]);
});
await page.waitForFunction('window.__game.mode === "playing"');
// Stand at the next locked field's gate (job 2), looking at it.
const put = async () => page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const o = s.field.others.find((x) => x.level.id === 2);
  s.x = o.entryX;
  s.z = o.maxZ + 4.5;
  s.yaw = Math.PI;
});
await put();
await sleep(1200);
await page.screenshot({ path: 'test-output/unlock-gate.png' });
const label = await page.evaluate(() => [...document.querySelectorAll('[data-id="unlock"]')].map((b) => b.textContent.trim()).join());
console.log('button:', label);
// Short of money.
await page.evaluate(() => {
  window.__game.save.money = 100;
  document.querySelector('[data-id="unlock"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
});
await sleep(500);
await page.screenshot({ path: 'test-output/unlock-short.png' });
await page.evaluate(() => document.getElementById('btn-confirm-no').click());
// Enough money: open it.
await page.evaluate(() => {
  window.__game.save.money = 50000;
  document.querySelector('[data-id="unlock"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
});
await sleep(400);
await page.screenshot({ path: 'test-output/unlock-ask.png' });
await page.evaluate(() => document.getElementById('btn-confirm-yes').click());
await sleep(1200);
console.log('unlocked now', await page.evaluate(() => window.__game.save.unlocked), 'money', await page.evaluate(() => window.__game.save.money));
await page.screenshot({ path: 'test-output/unlock-open.png' });
await browser.close();
