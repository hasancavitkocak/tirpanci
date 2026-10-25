// Dev check: drive the pat pat up to a locked field's gate (one further on than the next, so several
// open together): BÖLÜMÜ AÇ shows with the summed price, and buying opens them all.
// Usage: node scripts/check-lockdrive.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?quality=low`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
let ok = true;
const check = (name, cond, info = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name} ${info}`);
  if (!cond) ok = false;
};
await page.evaluate(async () => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  g.save.introDone = true;
  g.save.unlocked = 2;
  g.save.money = 100000;
  const { LEVELS } = await import('/src/game/config.ts');
  g.start(LEVELS[0]);
});
await page.waitForFunction('window.__game.mode === "playing"');
// The pat pat 9 m out from job 5's gate, facing it; on board, then drive at it with GAZ.
await page.evaluate(() => {
  const s = window.__game.session;
  const f = s.field;
  const o = f.others.find((x) => x.level.id === 5);
  const gx = o.entryX;
  const gz = o.maxZ + 1.5;
  const v = f.vehicle;
  v.x = gx;
  v.z = gz + 9;
  v.yaw = Math.PI;
  v.art = 0;
  s.intro = null;
  s.x = v.x + 1.2;
  s.z = v.z;
  return s.board();
}).then((b) => console.log('boarded', b));
await page.waitForFunction(() => document.body.classList.contains('driving'), { timeout: 10000 }).catch(() => {});
const gas = await (await page.$('#pedal-gas')).boundingBox();
await page.mouse.move(gas.x + gas.width / 2, gas.y + gas.height / 2);
await page.mouse.down();
await page.waitForFunction(() => document.querySelector('[data-id="unlock"]'), { timeout: 30000 }).catch(() => {});
await page.mouse.up();
const btn = await page.evaluate(() => document.querySelector('[data-id="unlock"]')?.textContent.trim() ?? null);
check('BÖLÜMÜ AÇ shows when driving up to a locked gate', !!btn, btn ?? '');
check('it opens the jobs between too (3 jobs: 3, 4, 5)', !!btn && btn.includes('3 bölüm'), btn ?? '');
await page.screenshot({ path: 'test-output/lockdrive-gate.png' });
await page.evaluate(() => document.querySelector('[data-id="unlock"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
await page.waitForFunction(() => document.getElementById('confirm').classList.contains('show'), { timeout: 5000 }).catch(() => {});
await page.screenshot({ path: 'test-output/lockdrive-ask.png' });
const before = await page.evaluate(() => window.__game.save.money);
await page.evaluate(() => document.getElementById('btn-confirm-yes').click());
await page.waitForFunction(() => window.__game.save.unlocked === 5, { timeout: 5000 }).catch(() => {});
const after = await page.evaluate(() => ({ unlocked: window.__game.save.unlocked, money: window.__game.save.money }));
check('bought: jobs up to 5 open', after.unlocked === 5, JSON.stringify(after));
check('paid the summed price (5.500 + 9.000 + 9.500)', before - after.money === 24000, `${before - after.money} TL`);
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(ok ? 0 : 1);
