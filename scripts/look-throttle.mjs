// Dev: part throttle by where the finger is: the trimmer's trigger and the gas pedal pressed low, in the
// middle and at the top (and slid up from low to the top while held). Prints the throttle reached.
// Usage: node scripts/look-throttle.mjs [baseUrl] (default http://localhost:5173/)
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 820, height: 360, isMobile: true, hasTouch: true });
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
  s.running = true;
  window.__game.updateStarterUi();
});
await page.waitForFunction(() => document.getElementById('gas-btn').getBoundingClientRect().height > 0);
let bad = 0;
const press = async (sel, at, read, slideTo, wait = 4000) => {
  const r = await page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, top: b.top, h: b.height }; });
  await page.mouse.move(r.x, r.top + r.h * at);
  await page.mouse.down();
  await sleep(wait);
  let v = await page.evaluate(read);
  if (slideTo !== undefined) {
    for (let k = 1; k <= 5; k++) await page.mouse.move(r.x, r.top + r.h * (at + ((slideTo - at) * k) / 5));
    await sleep(wait);
    v = [v, await page.evaluate(read)];
  }
  await page.mouse.up();
  await sleep(3000);
  return v;
};
const trig = () => +window.__game.input.throttleLevel.toFixed(2);
const low = await press('#gas-btn', 0.95, trig);
const mid = await press('#gas-btn', 0.5, trig);
const top = await press('#gas-btn', 0.1, trig);
const slid = await press('#gas-btn', 0.95, trig, 0.1);
const ok1 = low < 0.3 && mid > 0.4 && mid < 0.75 && top > 0.95 && slid[0] < 0.3 && slid[1] > 0.95;
if (!ok1) bad++;
console.log(`${ok1 ? 'OK  ' : 'FAIL'} trigger: low ${low}, middle ${mid}, top ${top}, slid up ${slid[0]} -> ${slid[1]}`);
// The pedal (it moves in the game's own time, slow in this browser: longer held).
await page.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const f = s.field;
  s.running = false;
  Object.assign(f.vehicle, f.harmanSpot, { speed: 0, art: 0 });
  s.x = f.vehicle.x + 1.4;
  s.z = f.vehicle.z;
  s.board();
});
await page.waitForFunction(() => document.getElementById('pedal-gas').getBoundingClientRect().height > 0);
const ped = () => +window.__game.input.drive.throttle.toFixed(2);
const pLow = await press('#pedal-gas', 0.95, ped, undefined, 15000);
const pMid = await press('#pedal-gas', 0.5, ped, undefined, 15000);
const pTop = await press('#pedal-gas', 0.1, ped, undefined, 15000);
const ok2 = pLow < 0.3 && pMid > 0.4 && pMid < 0.75 && pTop > 0.95;
if (!ok2) bad++;
console.log(`${ok2 ? 'OK  ' : 'FAIL'} pedal: low ${pLow}, middle ${pMid}, top ${pTop}`);
await browser.close();
process.exit(bad ? 1 : 0);
