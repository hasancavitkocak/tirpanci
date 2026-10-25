// Device test: where the phone's CPU time goes while mowing. Puts the worker mowing (engine on, throttle
// held, walking) as soak.mjs does, records the page's JavaScript for some seconds with the DevTools
// profiler, and prints the functions that took the most time (self time) and the share of idle.
// Usage: ANDROID_SERIAL=<id> node scripts/emu/profile.mjs [seconds] [bic|sur] (default 15, bic). CAP=30: the
// page's animation frames held to 30 a second first (to see what a frame cap would save). HIDE=<css
// selector>: those elements hidden while recording (to see what drawing them costs).
import { adb, sleep } from './lib.mjs';

const SECONDS = Number(process.argv[2] ?? 15);
const PHASE = process.argv[3] ?? 'bic';
const unix = adb('shell', 'cat', '/proc/net/unix').toString();
const sock = unix.match(/webview_devtools_remote_\d+/g)?.pop();
adb('forward', 'tcp:9223', `localabstract:${sock}`);
const target = (await (await fetch('http://127.0.0.1:9223/json/list')).json()).find((t) => t.url.startsWith('https://localhost'));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const waiting = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting.has(d.id)) (waiting.get(d.id)(d), waiting.delete(d.id));
};
const send = (method, params) => new Promise((r) => (waiting.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
const run = async (fn) => (await send('Runtime.evaluate', { expression: `(${fn})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;

await run(String(() => {
  const g = window.__game;
  if (g.mode !== 'playing') {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.save.introDone = true;
    g.start(g.levelById(1));
  }
}));
await sleep(5000);
const setup = PHASE === 'sur'
  ? () => {
      const g = window.__game;
      const s = g.session;
      const f = s.field;
      s.running = false;
      if (!s.driving) {
        Object.assign(f.vehicle, f.harmanSpot, { speed: 0, art: 0 });
        s.x = f.vehicle.x + 1.4;
        s.z = f.vehicle.z;
        s.board();
      }
      document.getElementById('pedal-gas').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 92, bubbles: true, pointerType: 'touch' }));
    }
  : () => {
      const g = window.__game;
      const s = g.session;
      const f = s.field;
      if (s.driving) s.alight?.();
      s.hasTrimmer = true;
      s.intro = null;
      s.line = s.gear.lineMax;
      s.broken = false;
      s.temp = 0.3;
      const st = s.starter;
      for (let i = 0; i < 30 && !s.running; i++) {
        while (st.dry) st.prime();
        st.setChoke(!st.flooded && !st.warm && !st.popped);
        s.pull(1);
      }
      s.x = 0;
      s.z = f.depth / 2 - 1;
      g.lookYaw = Math.PI;
      g.input.stickX = 0.2;
      g.input.stickY = -0.7;
      document.getElementById('gas-btn').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 91, bubbles: true, pointerType: 'touch' }));
    };
await run(String(setup));
if (process.env.CAP) {
  await run(`() => {
    const raf = window.__raf ??= window.requestAnimationFrame.bind(window);
    let last = 0;
    window.requestAnimationFrame = (cb) => raf(function tick(t) { if (t - last < 1000 / ${Number(process.env.CAP)} - 2) return raf(tick); last = t; cb(t); });
  }`);
}
if (process.env.HIDE) await run(`() => document.querySelectorAll(${JSON.stringify(process.env.HIDE)}).forEach((e) => (e.style.visibility = 'hidden'))`);
const fpsNow = () => run(String(() => new Promise((done) => { let n = 0; const t0 = performance.now(); const step = () => (++n, performance.now() - t0 < 3000 ? requestAnimationFrame(step) : done(Math.round((n * 1000) / (performance.now() - t0)))); requestAnimationFrame(step); })));
await sleep(2000);
console.log('fps', await fpsNow());
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 1000 });
await send('Profiler.start');
await sleep(SECONDS * 1000);
const { result } = await send('Profiler.stop');
const p = result.profile;
const dt = p.timeDeltas;
const self = new Map();
const byId = new Map(p.nodes.map((n) => [n.id, n]));
for (let i = 0; i < p.samples.length; i++) {
  const n = byId.get(p.samples[i]);
  const f = n.callFrame;
  const key = `${f.functionName || '(anonymous)'}  ${(f.url.split('/').pop() || '').split('?')[0]}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log(`${PHASE}: ${(total / 1000).toFixed(0)} ms recorded over ${SECONDS} s`);
for (const [k, v] of rows) console.log(`${((v / total) * 100).toFixed(1).padStart(5)} %  ${k}`);
ws.close();
process.exit(0);
