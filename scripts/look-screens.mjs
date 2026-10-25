// Dev: every screen of the game held sideways, at a phone's size (default the S19 Max Pro: 820 x 360 CSS px,
// a 28 px notch on the left): menu, daily reward, tasks, no-ads offer, store, every shop tab and its
// sub-tabs, settings (and its how-to open), the job map's tabs, the call, the regrow offer, a question,
// pause, the village map, the result, the ad and the loading screen.
// Usage: node scripts/look-screens.mjs [baseUrl] (default http://localhost:5173/). W, H, NOTCH, OUT to change.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? 'test-output/screens';
const W = Number(process.env.W ?? 820);
const H = Number(process.env.H ?? 360);
const NOTCH = Number(process.env.NOTCH ?? 28);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
// The notch as the app's WebView reports it (Capacitor's --safe-area-inset-*).
await page.evaluateOnNewDocument((n) => {
  document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--safe-area-inset-left', `${n}px`));
}, NOTCH);
// Elements cut off by the screen's edges or overflowing their card (a quick check besides the pictures).
const overflow = () =>
  page.evaluate(() => {
    const out = [];
    const scr = [...document.querySelectorAll('.screen.show, .confirm.show')].at(-1);
    if (!scr) return out;
    for (const el of scr.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      // Inside a scrolling list it may be below the fold: that is fine.
      let p = el.parentElement;
      let scrolls = false;
      while (p && p !== scr) {
        const o = getComputedStyle(p).overflowY;
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) scrolls = true;
        p = p.parentElement;
      }
      if (scrolls) continue;
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(`off screen: ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 24)}"`);
      if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') out.push(`text cut: ${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${el.textContent.trim().slice(0, 30)}"`);
    }
    return [...new Set(out)].slice(0, 8);
  });
const shot = async (name) => {
  await sleep(350);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const o = await overflow();
  console.log(`${name}${o.length ? '\n   ' + o.join('\n   ') : ''}`);
};
const only = (id) =>
  page.evaluate((i) => {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    document.getElementById(i)?.classList.add('show');
  }, id);
const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);

await page.goto(`${base}?quality=low`);
await sleep(500);
await shot('00-loading');
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => (window.__game.save.money = 50000));
await sleep(600);
await shot('01-daily');
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await sleep(1000);
await shot('02-menu');
await click('#btn-tasks');
await shot('03-tasks');
await only('menu');
await click('#btn-noads');
await shot('04-noads');
await page.evaluate(() => document.getElementById('noads-offer').classList.remove('show'));
await only('menu');
await click('#btn-store');
await shot('05-store');
await page.evaluate(() => (document.getElementById('store-list').scrollTop = 9999));
await shot('05b-store-bottom');
await only('menu');
await click('#btn-starter');
await shot('06-starter');
await only('menu');
await click('#btn-shop');
const tabs = await page.$$eval('#shop-tabs button', (b) => b.length);
for (let i = 0; i < tabs; i++) {
  await page.evaluate((k) => document.querySelectorAll('#shop-tabs button')[k].click(), i);
  await sleep(300);
  const name = await page.$eval('#shop-tabs button.on', (b) => b.textContent.trim().toLowerCase().replace(/[^a-zçğıöşü]/g, ''));
  await shot(`07-shop-${i + 1}-${name}`);
  const subs = await page.$$eval('#shop-list .sub-tabs button, .shop-card-board .sub-tabs button', (b) => b.length);
  for (let k = 1; k < subs; k++) {
    await page.evaluate((j) => document.querySelectorAll('.shop-card-board .sub-tabs button')[j].click(), k);
    await sleep(800);
    await shot(`07-shop-${i + 1}-${name}-${k + 1}`);
  }
}
// A question (buying asked first).
await page.evaluate(() => document.querySelectorAll('#shop-tabs button')[0].click());
await sleep(300);
await page.evaluate(() => [...document.querySelectorAll('#shop-list .buy')].find((b) => !b.disabled)?.click());
await shot('08-confirm');
await page.evaluate(() => document.getElementById('btn-confirm-no').click());
await only('menu');
await click('#btn-settings');
await shot('09-settings');
await page.evaluate(() => (document.querySelector('#settings details.howto').open = true));
await shot('09b-settings-howto');
await page.evaluate(() => (document.querySelector('#settings .card').scrollTop = 9999));
await shot('09c-settings-bottom');
await page.evaluate(() => (document.querySelector('#settings details.howto').open = false));
await only('menu');
await click('#btn-play');
await sleep(400);
await shot('10-levels');
const ltabs = await page.$$eval('#level-tabs button', (b) => b.length);
for (let i = 1; i < ltabs; i++) {
  await page.evaluate((k) => document.querySelectorAll('#level-tabs button')[k].click(), i);
  await sleep(400);
  await shot(`10-levels-${i + 1}`);
}
await page.evaluate(() => document.querySelectorAll('#level-tabs button')[0]?.click());
await sleep(300);
await page.evaluate(() => document.querySelector('.saga-node.next, .saga-node').click());
await shot('11-call');
// The regrow offer (a field mown just now).
await page.evaluate(() => {
  const g = window.__game;
  (g.save.mownAt ??= {})[1] = Date.now();
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.offerRegrow(g.levelById(1));
});
await shot('12-regrow');
await page.evaluate(() => {
  delete window.__game.save.mownAt[1];
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  window.__game.save.introDone = true;
  window.__game.start(window.__game.levelById(1));
});
await page.waitForFunction('window.__game.mode === "playing"');
await sleep(1500);
await shot('13-hud');
await click('#btn-pause');
await shot('14-pause');
await click('#btn-resume');
await click('#btn-map');
await sleep(600);
await shot('15-map');
await click('#btn-map-close');
await page.evaluate(() => {
  const g = window.__game;
  Object.defineProperty(g.session.field, 'coverage', { get: () => 0.95 });
  g.finish();
});
await sleep(600);
await shot('16-result');
await page.evaluate(() => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  document.getElementById('ad-text').textContent = 'Reklam bitince ödülün verilir';
  document.getElementById('ad').classList.add('show');
});
await shot('17-ad');
await browser.close();
console.log('done');
