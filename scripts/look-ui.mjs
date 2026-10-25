// Dev: screenshots of the menus (daily reward, levels, customer call, shop) and a look at each level.
// Usage: node scripts/look-ui.mjs [baseUrl] (default http://localhost:5173/). LEVELS=2,5 limits the level shots.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(m.type(), m.text()));
await page.goto(`${base}?quality=${process.env.QUALITY ?? 'medium'}`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await sleep(800);
await page.screenshot({ path: `${OUT}/ui-daily.png` });
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await page.screenshot({ path: `${OUT}/ui-menu.png` });
await page.evaluate(() => (window.__game.save.money = 5000));
await page.click('#btn-shop');
await sleep(300);
await page.screenshot({ path: `${OUT}/ui-shop.png` });
await page.click('#btn-shop-close');
await page.click('#btn-play');
await sleep(300);
await page.screenshot({ path: `${OUT}/ui-levels.png` });
const only = process.env.LEVELS ? process.env.LEVELS.split(',').map(Number) : null;
const count = await page.$$eval('.level', (l) => l.length);
for (let i = 0; i < count; i++) {
  if (only && !only.includes(i + 1)) continue;
  await page.evaluate(() => window.__game.mode === 'playing' && window.__game.quitToMenu());
  await page.evaluate(() => document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show')));
  await page.evaluate(() => document.getElementById('btn-play').click());
  await sleep(200);
  await page.evaluate((k) => document.querySelectorAll('.level')[k].click(), i);
  await sleep(300);
  if (i === 1) await page.screenshot({ path: `${OUT}/ui-call.png` });
  await page.click('#btn-call-ok');
  await page.waitForFunction('window.__game.mode === "playing"');
  await page.keyboard.press('KeyC');
  await page.evaluate(() => {
    const s = window.__game.session;
    s.x = 0;
    s.z = s.field.depth / 2 + 1;
    s.yaw = Math.PI;
    window.__game.view.orbitYaw = 0;
    window.__game.view.orbitHeight = 1;
  });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/lv${i + 1}.png` });
  await page.keyboard.press('KeyC');

}
await browser.close();
console.log('done');
