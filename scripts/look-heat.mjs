// Dev: the game easing off for a warm phone (Game.easeForPhone), the phone's state faked by the address
// (?thermal=0..3, ?lowpower, ?lowbattery): cool, nothing touched; serious, a quality down, fewer pixels
// and 30 frames even with Akıcı; critical, low; Low Power Mode, no more than medium and 30 frames. And the
// screens over the game drawn at 5 frames a second (the pause), the game itself at 30 on a phone.
// Usage (dev server running): node scripts/look-heat.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-heat2-${Date.now()}` });
const errors = [];

/** A job begun at `quality` with Akıcı chosen, the phone as the address says; after the first look at it, how the game stands. */
const run = async (query) => {
  const p = await browser.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
  await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.goto(`${base}?tirpan&${query}`, { timeout: 120000 });
  await p.waitForFunction('window.__ready === true', { timeout: 120000 });
  await p.evaluate(() => {
    const g = window.__game;
    Object.assign(g.save, { introDone: true, tutorialSeen: true, lookSeen: true, unlocked: 20, smooth: true });
    // (Yüksek chosen in the settings, as a player would.)
    document.querySelector('#set-quality button[data-q="high"]').click();
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.start(g.levelById(3));
  });
  await p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 90000 });
  // (Asked again within a few seconds of the start: easeForPhone every 8.)
  await p.evaluate(() => window.__game.easeForPhone());
  await sleep(1200);
  const st = await p.evaluate(async () => {
    const g = window.__game;
    const v = g.view;
    const f0 = v.frame;
    let n = 0;
    v.frame = function (...a) {
      n++;
      return f0.apply(this, a);
    };
    await new Promise((r) => setTimeout(r, 2000));
    v.frame = f0;
    return { quality: v.quality, ratio: v.renderer.getPixelRatio(), fps: n / 2, ease: g.ease };
  });
  return { p, st };
};

const cool = await run('thermal=0');
ok(cool.st.quality === 'high' && cool.st.ease.step === 0 && cool.st.fps > 45, `cool: as chosen, high and Akıcı (${JSON.stringify(cool.st)})`);
const ratio0 = cool.st.ratio;
// The pause: 5 frames a second under its screen.
const pauseFps = await cool.p.evaluate(async () => {
  const g = window.__game;
  g.pause();
  const v = g.view;
  const f0 = v.frame;
  let n = 0;
  v.frame = function (...a) {
    n++;
    return f0.apply(this, a);
  };
  await new Promise((r) => setTimeout(r, 2000));
  v.frame = f0;
  return n / 2;
});
ok(pauseFps <= 7, `paused: ${pauseFps} frames a second under the pause`);
await cool.p.close();

const fair = await run('thermal=1');
ok(fair.st.quality === 'high' && fair.st.ratio < ratio0 && fair.st.ratio > ratio0 * 0.8, `fair (warming): the same quality, its pixels a little fewer (${ratio0} → ${fair.st.ratio})`);
await fair.p.close();

const serious = await run('thermal=2');
ok(serious.st.quality === 'medium' && serious.st.fps < 35 && serious.st.ratio < fair.st.ratio, `serious (hot): a quality down, 30 frames though Akıcı, fewer pixels (${JSON.stringify(serious.st)})`);
await serious.p.close();

const critical = await run('thermal=3');
ok(critical.st.quality === 'low' && critical.st.fps < 35, `critical: low, 30 frames (${JSON.stringify(critical.st)})`);
await critical.p.close();

const low = await run('thermal=0&lowpower');
ok(low.st.quality === 'medium' && low.st.fps < 35, `Low Power Mode: medium at most, 30 frames (${JSON.stringify(low.st)})`);
await low.p.close();

const battery = await run('thermal=0&lowbattery');
ok(battery.st.quality === 'medium' && battery.st.fps < 35, `the battery low: medium at most, 30 frames (${JSON.stringify(battery.st)})`);
await battery.p.close();

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await browser.close();
process.exit(bad ? 1 : 0);
