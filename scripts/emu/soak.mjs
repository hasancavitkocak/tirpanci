// Device test: the game played for a while on a phone (ANDROID_SERIAL), its heat and memory watched.
// Mows with the engine running and the throttle held, then drives the pat pat, in turns; every 30 s it
// notes the battery temperature, the phone's thermal status and hottest sensor, the app's memory (PSS),
// the page's JS heap, the frame rate and the quality the automatic setting chose.
// Usage: ANDROID_SERIAL=<id> node scripts/emu/soak.mjs [minutes] (default 10). Results in test-output/soak.csv
// (OUT= another file). AUTO=1: the quality set back to automatic first. COOL=<minutes>: the app closed that
// long first, for the phone to cool down.
import { writeFileSync } from 'node:fs';
import { adb, connect, game, sleep } from './lib.mjs';

const MINUTES = Number(process.argv[2] ?? 10);
const sh = (...a) => adb('shell', ...a).toString();
const battery = () => Number(sh('dumpsys', 'battery').match(/temperature: (\d+)/)?.[1] ?? 0) / 10;
const thermal = () => {
  const t = sh('dumpsys', 'thermalservice');
  const status = Number(t.match(/Thermal Status: (\d)/)?.[1] ?? -1);
  // The current temperatures the HAL reports: CPU, GPU and the skin (the back of the phone, in the hand).
  const now = t.slice(t.indexOf('Current temperatures from HAL'), t.indexOf('Current cooling devices'));
  const at = (name) => Number(now.match(new RegExp(`mValue=([\\d.]+)[^}]*mName=${name}\\b`))?.[1] ?? NaN).toFixed(1);
  return { status, cpu: at('CPU'), gpu: at('GPU'), skin: at('SKIN') };
};
const pss = () => Math.round(Number(sh('dumpsys', 'meminfo', 'com.kraltirpan.game').match(/TOTAL PSS:\s+(\d+)/)?.[1] ?? sh('dumpsys', 'meminfo', 'com.kraltirpan.game').match(/TOTAL\s+(\d+)/)?.[1] ?? 0) / 1024);

sh('svc', 'power', 'stayon', 'true');
if (process.env.COOL) {
  sh('am', 'force-stop', 'com.kraltirpan.game');
  console.log(`cooling ${process.env.COOL} min from battery ${battery()} C`);
  await sleep(Number(process.env.COOL) * 60000);
}
sh('am', 'start', '-S', '-n', 'com.kraltirpan.game/.MainActivity');
await sleep(4000);
const { browser, page } = await connect();
const auto = !!process.env.AUTO;
await game(page, (auto) => {
  const g = window.__game;
  document.getElementById('daily')?.classList.remove('show');
  g.save.introDone = true;
  if (auto) {
    delete g.save.quality;
    g.view.setQuality(g.defaultQuality());
  }
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(1));
}, auto);
await page.waitFor(() => window.__game.mode === 'playing', 90000);
await sleep(2000);

// The two ways of playing, put on by the page's own pointers and the stick (as a held finger would).
const mow = () =>
  game(page, () => {
    const g = window.__game;
    const s = g.session;
    if (s.driving) s.alight?.();
    const f = s.field;
    s.hasTrimmer = true;
    s.intro = null;
    s.line = s.gear.lineMax;
    s.broken = false;
    s.fuel = s.gear.tank;
    s.temp = Math.min(s.temp, 0.5);
    // Started as a player does (tests/bot.ts crank): prime, choke while cold, pull, choke off once it coughs.
    const st = s.starter;
    for (let i = 0; i < 30 && !s.running; i++) {
      while (st.dry) st.prime();
      st.setChoke(!st.flooded && !st.warm && !st.popped);
      s.pull(1);
    }
    // Somewhere in the field, walking up it (round and round: turning a little).
    if (Math.abs(s.x) > f.width / 2 || Math.abs(s.z) > f.depth / 2) {
      s.x = 0;
      s.z = f.depth / 2 - 1;
      g.lookYaw = Math.PI;
    }
    g.input.stickX = 0.25;
    g.input.stickY = -0.8;
    document.getElementById('gas-btn').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 91, bubbles: true, pointerType: 'touch' }));
  });
const drive = () =>
  game(page, () => {
    const g = window.__game;
    const s = g.session;
    document.getElementById('gas-btn').dispatchEvent(new PointerEvent('pointerup', { pointerId: 91, bubbles: true, pointerType: 'touch' }));
    g.input.stickX = g.input.stickY = 0;
    s.running = false;
    const f = s.field;
    const v = f.vehicle;
    if (!s.driving) {
      Object.assign(v, f.harmanSpot, { speed: 0, art: 0 });
      s.x = v.x + 1.4;
      s.z = v.z;
      s.board();
    }
    document.getElementById('pedal-gas').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 92, bubbles: true, pointerType: 'touch' }));
  });
const letGo = () => game(page, () => document.getElementById('pedal-gas').dispatchEvent(new PointerEvent('pointerup', { pointerId: 92, bubbles: true, pointerType: 'touch' })));
const fps = () =>
  game(page, () => new Promise((done) => {
    let n = 0;
    const t0 = performance.now();
    const step = () => (++n, performance.now() - t0 < 2000 ? requestAnimationFrame(step) : done(Math.round((n * 1000) / (performance.now() - t0))));
    requestAnimationFrame(step);
  }));
const page_ = () => game(page, () => ({ heap: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576), q: window.__game.view.quality, mode: window.__game.mode, driving: window.__game.session?.driving, cov: Math.round((window.__game.session?.field.coverage ?? 0) * 100) }));

const rows = ['dakika,faz,pil_C,cpu_C,gpu_C,govde_C,termal_durum,bellek_PSS_MB,js_heap_MB,fps,kalite,bicilen_%'];
const t0 = Date.now();
let phase = '';
for (let k = 0; ; k++) {
  const min = (Date.now() - t0) / 60000;
  if (min >= MINUTES) break;
  // Two minutes mowing, one driving, round again.
  const want = Math.floor(min) % 3 === 2 ? 'sur' : 'bic';
  if (want !== phase) {
    if (phase === 'sur') await letGo();
    phase = want;
    await (phase === 'bic' ? mow() : drive());
  } else if (phase === 'bic') await mow();
  await sleep(500);
  const th = thermal();
  const p = await page_();
  const row = [min.toFixed(1), phase, battery().toFixed(1), th.cpu, th.gpu, th.skin, th.status, pss(), p.heap, await fps(), p.q, p.cov];
  rows.push(row.join(','));
  console.log(row.join('  '));
  writeFileSync(process.env.OUT ?? 'test-output/soak.csv', rows.join('\n') + '\n');
  // (A finished field would end the job: grown back each round.)
  await game(page, () => {
    const s = window.__game.session;
    if (s.field.coverage > 0.8) s.field.regrow?.(1);
  });
  await sleep(Math.max(0, 30000 - 3000));
}
await letGo();
browser.disconnect();
console.log('done');
process.exit(0);
