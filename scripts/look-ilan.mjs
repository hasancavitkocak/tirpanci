// Dev: the coffee-house board over a day change: yesterday's jobs come down, new ones go up; a garden
// whose job was done today waits for tomorrow. Usage: node scripts/look-ilan.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?quality=low`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const r = await page.evaluate(() => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  g.save.unlocked = Math.max(g.save.unlocked, 5);
  // Yesterday's board, and one garden (101) done today.
  g.save.ilanlar = [{ slot: 102, seed: 1, day: '2000-01-01' }, { slot: 103, seed: 2, day: '2000-01-01' }];
  g.save.ilanDone = { 101: Date.now() };
  const before = JSON.stringify(g.save.ilanlar.map((i) => i.seed));
  g.levelTab = 0;
  g.openLevels();
  return { before, after: JSON.stringify(g.save.ilanlar.map((i) => [i.slot, i.seed, i.day])) };
});
console.log(r);
await sleep(600);
await page.screenshot({ path: 'test-output/ilan-board.png' });
await browser.close();
