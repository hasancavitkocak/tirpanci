// Dev: menu background screenshot.
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 412, height: 860 });
await p.goto('http://localhost:5190/?quality=medium');
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// First visit of the day: the daily reward pops up over the menu.
await p.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await new Promise((r) => setTimeout(r, 2500));
await p.screenshot({ path: 'test-output/menu.png' });
await b.close();
