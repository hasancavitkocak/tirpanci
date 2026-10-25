// Dev: screenshot dev/viewer.html for a model. Usage: node scripts/model-shot.mjs <viewer url> <out.png>
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const [, , url, out] = process.argv;
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 1500 });
p.on('pageerror', (e) => console.log('ERR', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await p.goto(url);
await p.waitForFunction('window.__done === true', { timeout: 60000 });
await p.screenshot({ path: out });
await b.close();
