// Dev: the menu (tasks, events), the daily tasks, the shop's village tab, and a painted pat pat with
// the yard decorated.
// Usage: node scripts/look-meta.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=medium`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  g.save.money = 20000;
  const t = g.dayState();
  t.st.progress[t.defs[0].id] = t.defs[0].goal;
  g.updateTasksBadge();
  g.updateMoney();
});
await sleep(600);
await page.screenshot({ path: 'test-output/meta-menu.png' });
await page.click('#btn-tasks');
await sleep(500);
await page.screenshot({ path: 'test-output/meta-tasks.png' });
await page.evaluate(() => {
  const g = window.__game;
  g.shopTab = 'koy';
  g.openShop();
});
await sleep(600);
await page.screenshot({ path: 'test-output/meta-shop.png' });
await page.evaluate(async () => {
  const g = window.__game;
  g.save.paint = 'kirmizi';
  g.save.decor = ['boya_kirmizi', 'saksi', 'cardak', 'kulube', 'camasir'];
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS[0]);
});
await page.waitForFunction('window.__game.mode === "playing"');
await sleep(800);
await page.evaluate(() => {
  const f = window.__game.session.field;
  const p = f.plateau;
  window.__game.view.debugLook = { x: p.x + 9, z: p.z + 12, up: 7, atX: p.x, atZ: p.z, atUp: 0.5 };
});
await sleep(1500);
await page.screenshot({ path: 'test-output/meta-yard.png' });
await browser.close();
