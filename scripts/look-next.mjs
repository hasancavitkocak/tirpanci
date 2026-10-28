// Dev: from one job to the next as a player goes: the job finished, SONRAKİ BAHÇE, KABUL ET; back in the
// finished field (it stays as it is), the trimmer put in the pat pat, on board, driven to the next
// field's gate, where the next job loads and opens (the trimmer in the vehicle, to be taken out).
// Usage (dev server running): node scripts/look-next.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
mkdirSync('test-output/next', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-next-${Date.now()}` });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const shot = (n) => p.screenshot({ path: `test-output/next/${n}.png` });
const st = () =>
  p.evaluate(() => {
    const g = window.__game;
    const s = g.session;
    return {
      mode: g.mode,
      level: s.level.id,
      travel: g.travelTo?.id ?? null,
      hasTrimmer: s.hasTrimmer,
      driving: s.driving,
      intro: s.intro,
      starter: document.body.classList.contains('engine-off'),
      panel: getComputedStyle(document.querySelector('.hud-mid')).display !== 'none',
      objective: document.getElementById('objective').innerText.replace(/\s+/g, ' ').trim(),
      acts: [...document.querySelectorAll('#actions [data-id]')].map((x) => x.dataset.id),
    };
  });
await p.goto(`${base}?quality=low`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await p.evaluate(() => {
  const g = window.__game;
  Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20, harvestOffered: 99, weather: 'sunny', vehicle: 'patpat' });
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(2));
});
await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
await sleep(800);
await p.evaluate(() => {
  const s = window.__game.session;
  s.intro = null;
  s.hasTrimmer = true;
  s.x = 2;
  s.z = 2;
  s.field.mownCount = s.field.total;
});
await p.waitForFunction('document.getElementById("result").classList.contains("show")', { timeout: 20000 });
await sleep(600);
await p.evaluate(() => document.getElementById('btn-next').click());
await sleep(1200);
await p.evaluate(() => document.getElementById('btn-call-ok').click());
await sleep(1500);
let s = await st();
ok(s.mode === 'playing' && s.level === 2 && s.travel === 3, `KABUL ET: still in the finished field, on the way to job 3 (${JSON.stringify({ mode: s.mode, level: s.level, travel: s.travel })})`);
ok(!s.starter && !s.panel, `no starter, no gauges on the way (${s.starter}, ${s.panel})`);
ok(/Patpata git/.test(s.objective), `the way: ${s.objective}`);
await shot('1-accepted');
// Not finished again (the field is all mown).
await sleep(1500);
s = await st();
ok(s.mode === 'playing', `no second result (${s.mode})`);
// To the pat pat, the trimmer in it, on board.
await p.evaluate(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x + 1.6;
  s.z = v.z;
});
await sleep(700);
s = await st();
ok(s.acts.includes('drop') && /TIRPANI BIRAK/.test(s.objective), `by the pat pat: TIRPANI BIRAK (${s.acts.join(',')} | ${s.objective})`);
await p.evaluate(() => window.__game.session.dropTrimmer());
await sleep(500);
s = await st();
ok(!s.hasTrimmer && /Patpata bin/.test(s.objective), `the trimmer in the pat pat: ${s.objective}`);
await p.evaluate(() => window.__game.session.board());
await sleep(700);
s = await st();
const m0 = Number(/(\d+) m/.exec(s.objective)?.[1]);
ok(s.driving && /Ocaklı Bahçe: \d+ m/.test(s.objective), `driving: ${s.objective}`);
await shot('2-driving');
// Half way, then at the gate.
await p.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const gp = g.gatePoint(s, g.travelTo);
  const v = s.field.vehicle;
  Object.assign(v, { x: (v.x + gp.x) / 2, z: (v.z + gp.z) / 2, speed: 0 });
});
await sleep(800);
s = await st();
const m1 = Number(/(\d+) m/.exec(s.objective)?.[1]);
ok(m1 < m0 && s.level === 2, `the metres fall on the way: ${m0} → ${m1}`);
await p.evaluate(() => {
  const g = window.__game;
  const s = g.session;
  const gp = g.gatePoint(s, g.travelTo);
  const v = s.field.vehicle;
  Object.assign(v, { x: gp.x + 2, z: gp.z + 4, yaw: Math.PI, speed: 0 });
});
await p.waitForFunction('window.__game.mode === "playing" && window.__game.session.level.id === 3', { timeout: 60000 });
await sleep(1500);
s = await st();
ok(s.level === 3 && s.travel === null, `at the gate: job 3 loaded and opened (${s.level})`);
ok(s.intro === 'take' && !s.hasTrimmer, `the trimmer in the vehicle, to be taken out (${s.intro}, ${s.hasTrimmer})`);
ok(!!s.objective, `its objective: ${s.objective}`);
await shot('3-opened');
ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await b.close();
process.exit(bad ? 1 : 0);
