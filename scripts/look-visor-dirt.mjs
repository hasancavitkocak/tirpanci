// Dev: the face shield splattered (first person, mowing): how the specks look drawn at the shield's scale.
// Usage: node scripts/look-visor-dirt.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 820, height: 360, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`${base}?quality=low`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  g.save.introDone = true;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(1));
});
await page.waitForFunction('window.__game.mode === "playing"');
await page.evaluate(() => {
  const s = window.__game.session;
  s.hasTrimmer = true;
  s.intro = null;
  const v = window.__game.visor;
  v.visible = true;
  for (let i = 0; i < 120; i++) v.feed(1, 140, Math.random());
});
await sleep(6000);
await page.screenshot({ path: 'test-output/land/visor-dirt.png' });
await browser.close();
