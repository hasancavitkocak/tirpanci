// Dev: the red X on the list screens (job list, shop, tasks, store), at the top and scrolled down.
// Usage: node scripts/look-close.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 842 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=low`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
for (const [name, open] of [['levels', 'openLevels'], ['shop', 'openShop'], ['tasks', 'openTasks'], ['store', 'openStore']]) {
  await page.evaluate((open) => {
    window.__game.showMenu();
    window.__game[open]();
  }, open);
  await sleep(600);
  await page.screenshot({ path: `test-output/close-${name}.png` });
  // Scrolled to the bottom: the X still there; then it closes back to the menu.
  await page.evaluate((name) => {
    const c = document.querySelector(`#${name} .card`);
    c.scrollTop = c.scrollHeight;
  }, name);
  await sleep(300);
  await page.screenshot({ path: `test-output/close-${name}-scrolled.png` });
  await page.click(`#${name} .close-x`);
  await sleep(400);
  console.log(name, 'closed to menu:', await page.evaluate(() => document.getElementById('menu').classList.contains('show')));
}
await browser.close();
