// Dev check: an extra bought can be taken off (ÇIKAR) and put back (TAK); a yard decoration can be taken
// away (KALDIR) and put back (EKLE); neither asks to pay again. Usage: node scripts/check-takeoff.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 842 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?quality=low`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
let ok = true;
const check = (name, cond, info = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${info ? ` — ${info}` : ''}`);
  if (!cond) ok = false;
};
const label = (name) => page.evaluate((name) => [...document.querySelectorAll('#shop-list .shop-card')].find((c) => c.querySelector('b')?.textContent === name)?.querySelector('button.buy')?.textContent, name);
const press = async (name) => {
  await page.evaluate((name) => [...document.querySelectorAll('#shop-list .shop-card')].find((c) => c.querySelector('b')?.textContent === name).querySelector('button.buy').click(), name);
  await sleep(300);
};
await page.evaluate(() => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  g.save.equipment.owned = [...new Set([...g.save.equipment.owned, 'kulaklik'])];
  g.save.equipment.off = [];
  g.save.decor = ['saksi'];
  g.save.decorOff = [];
  g.shopTab = 'donanim';
  g.openShop();
});
await sleep(400);
const money0 = await page.evaluate(() => window.__game.save.money);
check('bought extra says ÇIKAR', (await label('Kulaklık')) === 'ÇIKAR');
await press('Kulaklık');
check('taken off: says TAK, no question, no money', (await label('Kulaklık')) === 'TAK' && !(await page.evaluate(() => document.getElementById('confirm').classList.contains('show'))) && (await page.evaluate(() => window.__game.save.money)) === money0);
const { gearStats } = await page.evaluate(() => ({}));
check('the game sees it off', await page.evaluate(async () => {
  const { gearStats } = await import('/src/game/config.ts');
  return !gearStats(window.__game.save.upgrades, window.__game.save.equipment).earmuffs;
}));
await press('Kulaklık');
check('put back on: ÇIKAR again, worn', (await label('Kulaklık')) === 'ÇIKAR' && (await page.evaluate(async () => {
  const { gearStats } = await import('/src/game/config.ts');
  return gearStats(window.__game.save.upgrades, window.__game.save.equipment).earmuffs;
})));
await page.screenshot({ path: 'test-output/takeoff-extras.png' });
await page.evaluate(() => {
  const g = window.__game;
  g.shopTab = 'koy';
  g.koyPart = 'avlu';
  g.openShop();
});
await sleep(400);
check('placed decoration says KALDIR', (await label('Saksı Çiçekleri')) === 'KALDIR');
await press('Saksı Çiçekleri');
check('taken away: says EKLE, not in the yard', (await label('Saksı Çiçekleri')) === 'EKLE' && (await page.evaluate(async () => {
  window.__game.applyLook();
  return !window.__game.view.world.constructor.decor.includes('saksi');
})));
await page.screenshot({ path: 'test-output/takeoff-yard.png' });
await press('Saksı Çiçekleri');
console.log('after put back:', await label('Saksı Çiçekleri'), await page.evaluate(() => JSON.stringify({ off: window.__game.save.decorOff, decor: window.__game.save.decor })));
check('put back: KALDIR again, in the yard', (await label('Saksı Çiçekleri')) === 'KALDIR' && (await page.evaluate(async () => {
  window.__game.applyLook();
  return window.__game.view.world.constructor.decor.includes('saksi');
})));
check('no money taken', (await page.evaluate(() => window.__game.save.money)) === money0);
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(ok ? 0 : 1);
