// Dev: close-up screenshots of things in the levels (follow camera, low). Usage: node scripts/look-spots.mjs [baseUrl]
// Each spot: level id, where the worker stands (field-relative helpers), facing, file name.
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
await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));

// `at`: JS evaluated in the page with f = field, returning [x, z, orbitYaw, orbitHeight].
const ONLY = process.env.SPOTS?.split(',');
const SPOTS = [
  { lv: 2, name: 'spot-yard', at: 'const y = f.yard; [y.x + 3.5, y.z, Math.PI / 2, 0.15]' },
  { lv: 4, name: 'spot-hive', at: 'const h = f.hives[0]; [h.x, h.z + 3, 0, 0.2]' },
  { lv: 7, name: 'spot-giant', at: '[0, 6, 0, 0.35]' },
  { lv: 5, name: 'spot-yayla', at: '[0, f.depth / 2 + 1, 0, 0.2]' },
  { lv: 5, name: 'spot-hut', at: '[f.house.x + 6, f.house.z, Math.PI / 2, 0.3]' },
  { lv: 6, name: 'spot-graves', at: 'const b = f.bushes[4]; [b.x, b.z + 3, 0, 0.15]' },
  { lv: 6, name: 'spot-mosque', at: '[f.house.x, f.house.z + 14, 0, 0.35]' },
  { lv: 7, name: 'spot-road', at: '[f.width / 2 + 1, 0, -Math.PI / 2, 0.25]' },
  { lv: 1, name: 'spot-house', at: '[f.house.x + 9, f.house.z - 3, Math.PI / 2, 0.3]' },
];
for (const sp of SPOTS.filter((s) => !ONLY || ONLY.includes(s.name))) {
  await page.evaluate(() => window.__game.mode === 'playing' && window.__game.quitToMenu());
  await page.evaluate((id) => {
    const g = window.__game;
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.start(g.levelById(id));
  }, sp.lv);
  await page.waitForFunction('window.__game.mode === "playing"');
  await page.evaluate((at) => {
    const g = window.__game;
    const s = g.session;
    const f = s.field;
    const [x, z, yaw, h] = eval(at);
    s.x = x;
    s.z = z;
    if (g.view.mode !== 'follow') g.toggleCamera();
    g.view.orbitYaw = yaw;
    g.view.orbitHeight = h;
    g.view.snapCamera();
  }, sp.at);
  await sleep(1800);
  await page.screenshot({ path: `${OUT}/${sp.name}.png` });
}
await browser.close();
console.log('done');
