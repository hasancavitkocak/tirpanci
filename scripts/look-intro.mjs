// Dev: play the first-job intro (start at home, walk to the pat pat, take the trimmer, fit line).
// Usage: node scripts/look-intro.mjs [baseUrl] (default http://localhost:5173/)
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(m.type(), m.text()));
await page.goto(`${base}?quality=${process.env.QUALITY ?? 'medium'}`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('daily')?.classList.remove('show');
  window.__game.save.introDone = false;
});
await page.click('#btn-play');
await sleep(300);
await page.click('.level');
await sleep(300);
await page.screenshot({ path: `${OUT}/intro-0-call.png` });
await page.click('#btn-call-ok');
await page.waitForFunction('window.__game.mode === "playing"');
await sleep(1200);
await page.screenshot({ path: `${OUT}/intro-1-home.png` });
// Walk to the pat pat (W forward: first person facing it).
await page.keyboard.down('KeyW');
for (let i = 0; i < 40 && !(await page.evaluate(() => window.__game.session.nearVehicle)); i++) await sleep(250);
await page.keyboard.up('KeyW');
await sleep(400);
await page.screenshot({ path: `${OUT}/intro-2-trailer.png` });
const near = await page.evaluate(() => window.__game.session.nearVehicle);
if (!near) console.log('did not reach the pat pat');
await page.click('.action-btn[data-id="take"]');
await sleep(800);
await page.screenshot({ path: `${OUT}/intro-3-taken.png` });
// Fit line: hold the action button.
await sleep(500);
await page.screenshot({ path: `${OUT}/intro-3b-line.png` });
const btn = await page.$eval('.action-btn[data-id="line"]', (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(btn.x, btn.y);
await page.mouse.down();
await page.waitForFunction('window.__game.session.rethread > 0.4', { timeout: 90000 }).catch(() => console.log('no progress'));
await page.screenshot({ path: `${OUT}/intro-3c-progress.png` });
await page.waitForFunction('window.__game.session.intro === null', { timeout: 90000 }).catch(() => console.log('line not fitted'));
await page.mouse.up();
await sleep(800);
await page.screenshot({ path: `${OUT}/intro-4-ready.png` });
console.log(JSON.stringify(await page.evaluate(() => ({ intro: window.__game.session.intro, done: window.__game.save.introDone, carrying: true }))));
await browser.close();
console.log('done');
