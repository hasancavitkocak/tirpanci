// Dev: the "buy for N TL?" question in the shop (Donanım tab, first item).
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 400, height: 760 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5173/?quality=low', { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const money = await page.evaluate(async () => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  g.save.equipment.owned = g.save.equipment.owned.filter((x) => x !== 'sirt');
  g.shopTab = 'tirpan';
  g.openShop();
  const b = [...document.querySelectorAll('#shop-list .btn.buy, .shop-grid .btn.buy')].find((x) => / TL$/.test(x.textContent) && !x.disabled);
  b.click();
  return g.save.money;
});
await sleep(400);
await page.screenshot({ path: 'test-output/confirm.png' });
const after = await page.evaluate(async () => {
  document.getElementById('btn-confirm-no').click();
  await new Promise((r) => setTimeout(r, 100));
  return window.__game.save.money;
});
console.log('money before', money, 'after Vazgeç', after);
await browser.close();
