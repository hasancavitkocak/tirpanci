// Smoke test: loads the built game in headless Chrome (SwiftShader WebGL), plays a little
// through the real UI and saves screenshots to test-output/. Usage: node scripts/smoke.mjs [baseUrl]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
let server = null;
let base = process.argv[2];
if (!base) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4329', '--strictPort'], { stdio: 'pipe' });
  base = 'http://localhost:4329/';
  // Wait until the preview server answers.
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const fail = async (msg) => {
  console.error('FAIL:', msg, '\n' + errors.join('\n'));
  await browser.close();
  server?.kill();
  process.exit(1);
};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}?quality=${process.env.QUALITY ?? 'low'}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 90000 });
  // First visit of the day: the daily reward pops up over the menu.
  await page.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
  // The first-job intro (start at home) has its own script, look-intro.mjs.
  await page.evaluate(() => (window.__game.save.introDone = true));
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/01-menu.png` });

  await page.click('#btn-play');
  await sleep(300);
  await page.screenshot({ path: `${OUT}/02-levels.png` });
  await page.click('.level');
  await page.click('#btn-call-ok');
  await page.waitForFunction('window.__game.mode === "playing"');
  // Each job starts with the trimmer in the pat pat (take it, fit line): look-intro.mjs plays that part.
  await page.evaluate(() => {
    const s = window.__game.session;
    s.takeTrimmer();
    s.line = s.gear.lineMax;
    s.broken = false;
    s.intro = null;
    // Stand at the bottom edge of the field, facing up into it.
    s.x = s.field.depot.x + 1.2;
    s.z = s.field.depot.z - 1.2;
    s.yaw = Math.PI;
    window.__game.lookYaw = Math.PI;
    window.__game.updateStarterUi();
  });
  await sleep(800);
  await page.screenshot({ path: `${OUT}/03-start.png` });

  // Start the engine through the real controls: prime x3, choke, pull until it coughs, choke off, pull.
  if (!(await page.$eval('body', (b) => b.classList.contains('engine-off')))) await fail('engine should start off');
  const pull = async () => {
    const b = await page.$eval('#cord-handle', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y + 2);
    await page.mouse.move(b.x, b.y + 150);
    await page.mouse.up();
    await sleep(350);
    if (process.env.DEBUG) console.log('pull', await page.evaluate(() => JSON.stringify({ st: window.__game.session.starter, last: window.__game.lastPull })));
  };
  for (let i = 0; i < 3; i++) await page.click('#btn-prime');
  await page.click('#btn-choke');
  await pull();
  await page.screenshot({ path: `${OUT}/03b-starter.png` });
  // The drag above checks the real cord; the rest uses the R key (a full pull), because pull strength
  // is timed and the software-rendered test browser can make a drag look slow.
  const pullKey = async () => {
    await page.keyboard.press('KeyR');
    await sleep(400);
  };
  for (let i = 0; i < 5 && !(await page.evaluate(() => window.__game.session.starter.popped)); i++) await pullKey();
  if (!(await page.evaluate(() => window.__game.session.starter.popped))) await fail('engine never coughed on choke');
  await page.click('#btn-choke');
  // The pull strength is measured from real time between pointer events; the software-rendered test
  // browser is slow enough to turn some pulls "weak", so allow a few tries.
  for (let i = 0; i < 5 && !(await page.evaluate(() => window.__game.session.running)); i++) await pullKey();
  const running = await page.evaluate(() => window.__game.session.running);
  if (!running) await fail('engine did not start');
  console.log('engine started');

  // Walk up into the field with the throttle held (keyboard), then sweep sideways.
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyW');
  await sleep(2500);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD');
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/04-mowing.png` });
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyW');
  await sleep(1500);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyA');
  await sleep(3000);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('Space');
  const st = await page.evaluate(() => {
    const s = window.__game.session;
    return { cov: s.field.coverage, x: s.x, z: s.z, fuel: s.fuel, time: s.time, running: s.running, strain: s.strain, stats: window.__game.view.stats };
  });
  console.log('after keyboard play', JSON.stringify(st));
  if (!(st.cov > 0.0005)) await fail(`no grass was cut (coverage ${st.cov})`);
  await page.screenshot({ path: `${OUT}/05-mowed.png` });

  // Walking flat out into tall grass can bog the engine down (by design). The software-rendered test
  // browser runs few, long frames, so keep the engine running between the steps.
  const ensureRunning = () =>
    page.evaluate(() => {
      const s = window.__game.session;
      s.strain = 0;
      if (s.running) return false;
      s.temp = 0.3;
      s.starter.setChoke(false);
      while (s.starter.dry) s.starter.prime();
      s.pull(1);
      return true;
    });
  await ensureRunning();
  // Touch joystick: drag on the left side.
  const before = await page.evaluate(() => ({ x: window.__game.session.x, z: window.__game.session.z }));
  await page.touchscreen.touchStart(110, 650);
  await page.touchscreen.touchMove(110, 590);
  await sleep(1200);
  // Easy controls (default): the finger on the screen opens the throttle, the head stays straight.
  const easy = await page.evaluate(() => ({ thr: window.__game.input.throttleOn ? 1 : 0, sweep: window.__game.session.sweep }));
  await page.touchscreen.touchEnd();
  console.log('easy', JSON.stringify(easy));
  if (!(easy.thr > 0.3)) await fail(`touch did not open the throttle in easy mode (${easy.thr})`);
  if (Math.abs(easy.sweep) > 1e-3) await fail('head moved in easy mode');
  const after = await page.evaluate(() => ({ x: window.__game.session.x, z: window.__game.session.z }));
  if (!(after.z < before.z - 0.2)) await fail(`joystick did not move the worker up (${before.z} -> ${after.z})`);

  // Advanced controls: throttle pad, press and slide right, the head must follow to the right (no automatic swing).
  await ensureRunning();
  await page.evaluate(() => {
    window.__game.save.controls = 'advanced';
    window.__game.applyControls();
  });
  const pad = await page.$eval('#pad', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  });
  console.log('pad hit', await page.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}#${e.id}.${e.className}` : 'none'; }, pad.x, pad.y), JSON.stringify(pad));
  // Phones press the pad with a finger: use touch, as players do. Stand in mown-down grass so the
  // engine is not bogged down while the test browser crawls.
  await page.evaluate(() => {
    const s = window.__game.session;
    // Only round the worker: mowing everything would finish the job.
    s.field.cutSegment(s.x - 3, s.z, s.x + 3, s.z, 3);
    window.__ev = [];
    const push = s.events.push.bind(s.events);
    s.events.push = (...e) => {
      for (const x of e) if (x.type !== 'cut') window.__ev.push(x.type);
      return push(...e);
    };
  });
  await ensureRunning();
  await page.touchscreen.touchStart(pad.x, pad.y);
  await sleep(600);
  const centred = await page.evaluate(() => window.__game.session.sweep);
  await page.touchscreen.touchMove(pad.x + pad.w * 0.4, pad.y);
  try {
    await page.waitForFunction('window.__game.session.sweep > 0.4 && window.__game.session.throttle > 0.3', { timeout: 8000 });
  } catch {
    /* reported below */
  }
  const swung = await page.evaluate(() => {
    const s = window.__game.session;
    return { ev: window.__ev, fuel: s.fuel, temp: s.temp, tangle: s.tangle, sweep: s.sweep, thr: s.throttle, running: s.running, input: window.__game.input.throttleOn, engineOff: document.body.classList.contains('engine-off'), easy: window.__game.input.easy };
  });
  await page.screenshot({ path: `${OUT}/05b-pad.png` });
  await page.touchscreen.touchEnd();
  console.log('pad', centred, JSON.stringify(swung));
  if (Math.abs(centred) > 0.05) await fail(`head swung by itself (${centred})`);
  if (!(swung.sweep > 0.4 && swung.thr > 0.3)) await fail(`pad did not throttle/swing the head (${JSON.stringify(swung)})`);

  // Stop switch (engine warmed up first: a few seconds of running is not enough to count as warm).
  await ensureRunning();
  await page.evaluate(() => (window.__game.session.temp = 0.3));
  await page.click('#btn-stop');
  try {
    await page.waitForFunction('!window.__game.session.running', { timeout: 8000 });
  } catch {
    await fail('STOP did not stop the engine');
  }
  if (!(await page.$eval('body', (b) => b.classList.contains('engine-off')))) await fail('starter panel not shown after STOP');
  // Warm engine: one good pull restarts it without choke.
  for (let i = 0; i < 5 && !(await page.evaluate(() => window.__game.session.running)); i++) await pullKey();
  if (!(await page.evaluate(() => window.__game.session.running))) await fail('warm engine did not restart');
  if (await page.evaluate(() => window.__game.session.starter.choke)) await fail('choke should stay off for a warm restart');

  // Close-up near a bush for the visuals.
  await page.evaluate(() => {
    const s = window.__game.session;
    const b = s.field.bushes[0];
    s.x = b.x + 1.6;
    s.z = b.z + 1.6;
  });
  await page.keyboard.down('Space');
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/06-bush.png` });
  await page.keyboard.up('Space');

  // Pause, then finish via a forced high coverage to check the result screen.
  await page.click('#btn-pause');
  await sleep(300);
  await page.screenshot({ path: `${OUT}/07-pause.png` });
  await page.click('#btn-resume');
  await page.evaluate(() => {
    const f = window.__game.session.field;
    for (let k = 0; k < f.grass.length; k++) if (f.mask[k] && Math.random() < 0.93) f.grass[k] = 0.12;
    // Recount coverage through the public API by cutting nothing; force the internal counter for the test.
    f['mownCount'] = Math.round(f.total * 0.93);
  });
  await page.waitForSelector('#btn-finish.show', { timeout: 5000 });
  await page.click('#btn-finish');
  await page.waitForFunction('window.__game.mode === "result"');
  await sleep(400);
  await page.screenshot({ path: `${OUT}/08-result.png` });
  const money = await page.evaluate(() => window.__game.save.money);
  if (!(money > 0)) await fail('no money paid');
  console.log('money', money);

  await page.click('#btn-menu');
  await sleep(300);
  await page.click('#btn-shop');
  await sleep(300);
  await page.screenshot({ path: `${OUT}/09-shop.png` });

  const bad = errors.filter((e) => !/GPU stall|swiftshader|WebGL: INVALID|Automatic fallback/i.test(e));
  if (bad.length) await fail('console errors');
  console.log('SMOKE OK');
} catch (e) {
  await fail(e.stack ?? String(e));
}
await browser.close();
server?.kill();
