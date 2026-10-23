// Measure the real frame rate on a USB-connected phone running the debug APK.
// Before: adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
// Usage: node scripts/phone-fps.mjs [quality...]   (default: low medium)
import puppeteer from 'puppeteer-core';

const qualities = process.argv.slice(2).length ? process.argv.slice(2) : ['low', 'medium'];
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const pages = await browser.pages();
console.log(pages.map((p) => p.url()));
const page = pages.find((p) => p.url().includes('localhost')) ?? pages[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fps = (seconds) =>
  page.evaluate(
    (sec) =>
      new Promise((resolve) => {
        const times = [];
        const t0 = performance.now();
        const tick = (t) => {
          times.push(t);
          if (t - t0 < sec * 1000) requestAnimationFrame(tick);
          else {
            const d = times.slice(1).map((x, i) => x - times[i]).sort((a, b) => a - b);
            resolve({ avg: Math.round((1000 * d.length) / (times[times.length - 1] - times[0])), p95ms: Math.round(d[Math.floor(d.length * 0.95)]) });
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds,
  );

for (const q of qualities) {
  await page.evaluate((qq) => {
    const g = window.__game;
    g.save.quality = qq;
    g.view.setQuality(qq);
  }, q);
  // Start the first field with the engine running.
  await page.evaluate(() => {
    const g = window.__game;
    if (g.mode !== 'playing') document.querySelector('#btn-play').click();
  });
  await sleep(300);
  await page.evaluate(() => document.querySelector('.item')?.click());
  await sleep(2500);
  await page.evaluate(() => {
    const s = window.__game.session;
    while (s.starter.dry) s.starter.prime();
    s.temp = 0.3;
    s.pull(1);
    s.x = 0;
    s.z = 4;
  });
  await sleep(1000);
  const idle = await fps(4);
  const stats = await page.evaluate(() => window.__game.view.stats);
  console.log(q, 'standing in the field:', JSON.stringify(idle), 'draw calls', stats.calls, 'triangles', stats.triangles);
  await page.evaluate(() => document.querySelector('#btn-pause').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('#btn-quit').click());
  await sleep(1500);
}
browser.disconnect();
