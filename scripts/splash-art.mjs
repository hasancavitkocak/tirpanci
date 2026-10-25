// Dev: the Android launch picture (android/app/src/main/res/drawable-nodpi/splash_art.jpg) made from the
// game's own loading screen held sideways (public/acilis.webp with the logo over it, the loading bar left
// out), at a phone's pixels, so the page drawing over it does not jump. Run after changing acilis.webp.
// Usage: node scripts/splash-art.mjs [baseUrl] (default http://localhost:5173/, the dev server running).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const W = 2400;
const H = 1080;
const OUT = 'test-output/land';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 915, height: Math.round((915 * H) / W), deviceScaleFactor: W / 915, isMobile: true, hasTouch: true });
// The models held back: the loading screen stays up to be shot.
await page.setRequestInterception(true);
page.on('request', (r) => (/\.glb(\?|$)/.test(r.url()) ? null : r.continue()));
await page.goto(`${base}?quality=low`);
await page.waitForFunction(() => document.getElementById('loading').classList.contains('has-art') && document.querySelector('.logo')?.classList.contains('has-img'), { timeout: 30000 });
await sleep(700);
await page.screenshot({ path: `${OUT}/loading.png` });
await page.addStyleTag({ content: '.load-bottom { visibility: hidden !important; }' });
await sleep(200);
await page.screenshot({ path: `${OUT}/splash.png` });
await browser.close();
// To the exact size, as a JPEG (the drawable is stretched to fill the screen).
execFileSync('python', ['-c', `from PIL import Image; Image.open('${OUT}/splash.png').convert('RGB').resize((${W}, ${H}), Image.LANCZOS).save('android/app/src/main/res/drawable-nodpi/splash_art.jpg', quality=88)`]);
console.log('splash_art.jpg written');
