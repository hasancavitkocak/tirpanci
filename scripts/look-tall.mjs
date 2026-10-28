// Dev: boy boyu ot: the man-high clumps in a garden with giant weeds (none in one without); mown through,
// a clump goes. Shots in test-output/tall. Usage (dev server running): node scripts/look-tall.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/tall';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-tall-${Date.now()}` });
const page = await browser.newPage();
await page.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (r) => /\.(glb|wav|webp|png)$/.test(r.url()) && errors.push(`failed ${r.url()}`));
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const job = async (id) => {
  await page.evaluate((id) => {
    const g = window.__game;
    if (g.mode === 'playing') g.quitToMenu();
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.start(g.levelById(id));
  }, id);
  await page.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
  await sleep(1500);
};
await page.goto(`${base}?quality=high`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => Object.assign(window.__game.save, { introDone: true, tutorialSeen: true, harvestOffered: 99, unlocked: 20, weather: 'sunny', vehicle: 'patpat' }));
// A garden without giant weeds: none.
await job(2);
ok(await page.evaluate(() => !window.__game.view.tallGrass), 'no giant weeds (job 2): no man-high clumps');
// One with them (job 11).
await job(11);
const n0 = await page.evaluate(() => window.__game.view.tallGrass?.standing ?? 0);
ok(n0 > 10, `giant weeds (job 11): ${n0} man-high clumps`);
// Seen from inside the garden at a worker's eyes.
const spot = await page.evaluate(() => {
  const g = window.__game;
  const t = g.view.tallGrass;
  const c = t.clumps[0];
  const s = g.session;
  s.intro = null;
  s.x = c.x;
  s.z = c.z + 5;
  s.yaw = Math.PI;
  g.lookYaw = Math.PI;
  g.view.pitch = 0.05;
  return { x: c.x, z: c.z };
});
await sleep(1200);
await page.screenshot({ path: `${OUT}/1-boy-ot.png` });
// Mown through: it goes.
await page.evaluate((c) => {
  const f = window.__game.session.field;
  f.cutSegment(c.x - 0.6, c.z, c.x + 0.6, c.z, 0.6);
}, spot);
await sleep(1500);
const n1 = await page.evaluate(() => window.__game.view.tallGrass.standing);
ok(n1 === n0 - 1 || n1 < n0, `mown through one: it goes (${n0} → ${n1})`);
await page.screenshot({ path: `${OUT}/2-bicilince.png` });
ok(!errors.length, `no page errors or missing files${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await browser.close();
process.exit(bad ? 1 : 0);
