// Dev: the top bar's frames up close, part filled: the progress at 60 %, the fuel low (blinking red), the
// engine hot. Usage: node scripts/look-topbar.mjs [baseUrl] (default http://localhost:5173/)
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
mkdirSync('test-output/land', { recursive: true });
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.W ?? 915), height: Number(process.env.H ?? 412), deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`${base}?quality=low`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__game;
  g.save.introDone = true;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(1));
});
await page.waitForFunction('window.__game.mode === "playing"');
await new Promise((r) => setTimeout(r, 1500));
// Held at these values (a stylesheet over what the game writes each frame).
await page.addStyleTag({ content: '#hud * { transition: none !important; } #progress-fill { width: var(--p, 60%) !important; } #fuel-fill { width: 15% !important; } #line-fill { width: 70% !important; } #temp-fill { width: var(--t, 85%) !important; }' });
await page.evaluate(() => {
  document.getElementById('fuel-fill').classList.add('low');
  document.querySelector('.gauge.temp').classList.add('hot');
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'test-output/land/topbar.png', clip: { x: 0, y: 0, width: Number(process.env.W ?? 915), height: 120 } });
// Full (both ends of the slot) and cold.
await page.evaluate(() => {
  document.documentElement.style.setProperty('--p', '100%');
  document.documentElement.style.setProperty('--t', '20%');
  document.querySelector('.gauge.temp').classList.remove('hot');
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'test-output/land/topbar-full.png', clip: { x: 0, y: 0, width: Number(process.env.W ?? 915), height: 120 } });
await browser.close();
