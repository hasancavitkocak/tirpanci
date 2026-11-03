// Dev: the game in the Android emulator (debug build, WebView debugging): a player's day played through
// its own buttons, with frames a second, the app's CPU and memory and the phone's thermal state read at
// every step, the screen's messages checked for lying over one another, and page errors caught.
// Before: emulator running with the debug APK installed and started; then
//   adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
// Usage: node scripts/emu-flow.mjs [port=9333]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '9333';
const OUT = 'test-output/emu';
mkdirSync(OUT, { recursive: true });
const ADB = `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// (The WebView's DevTools answers a page's own socket, not puppeteer's browser-wide one: plain CDP.)
const list = await (await fetch(`http://localhost:${port}/json`)).json();
const page = list.find((t) => t.type === 'page' && t.url.startsWith('https://localhost'));
if (!page) throw new Error('the game page is not open in the WebView');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, x) => ((ws.onopen = r), (ws.onerror = x)));
let msgId = 0;
const waiting = new Map();
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting.has(d.id)) {
    waiting.get(d.id)(d);
    waiting.delete(d.id);
  } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description?.split(String.fromCharCode(10))[0] ?? d.params.exceptionDetails.text);
};
const cdp = (method, params = {}) =>
  new Promise((r) => {
    const id = ++msgId;
    waiting.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
await cdp('Runtime.enable');
const p = {
  evaluate: async (f, ...a) => {
    const d = await cdp('Runtime.evaluate', { expression: `(${f.toString()})(...${JSON.stringify(a)})`, awaitPromise: true, returnByValue: true });
    if (d.result?.exceptionDetails) throw new Error(d.result.exceptionDetails.exception?.description ?? d.result.exceptionDetails.text);
    return d.result?.result?.value;
  },
  waitForFunction: async (expr, { timeout = 30000 } = {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const d = await cdp('Runtime.evaluate', { expression: `!!(${expr})`, returnByValue: true });
      if (d.result?.result?.value) return;
      await sleep(500);
    }
    throw new Error(`timed out: ${expr}`);
  },
};
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const ev = (f, ...a) => p.evaluate(f, ...a);
const report = [];

/** The app's share of the CPU (all cores: 100 = one core) and its memory (MB), from the phone. */
const appLoad = () => {
  try {
    const pid = adb('shell', 'pidof', 'com.kraltirpan.game').trim();
    const top = adb('shell', 'top', '-b', '-n', '1', '-p', pid).split('\n').find((l) => l.trim().startsWith(pid));
    const cpu = top ? Number(top.trim().split(/\s+/)[8]) : NaN;
    const mem = adb('shell', 'dumpsys', 'meminfo', pid).match(/TOTAL PSS:\s+(\d+)/)?.[1] ?? adb('shell', 'dumpsys', 'meminfo', pid).match(/TOTAL\s+(\d+)/)?.[1];
    return { cpu, mem: mem ? Math.round(Number(mem) / 1024) : NaN };
  } catch {
    return { cpu: NaN, mem: NaN };
  }
};
/** Frames counted over `ms`, the slowest frame, and what the game eased to for the phone. */
const measure = (ms) =>
  ev(
    (ms) =>
      new Promise((done) => {
        const t0 = performance.now();
        let n = 0;
        let last = t0;
        let worst = 0;
        const f = (t) => {
          n++;
          worst = Math.max(worst, t - last);
          last = t;
          if (t - t0 < ms) requestAnimationFrame(f);
          else {
            const g = window.__game;
            done({ fps: Math.round((n / (t - t0)) * 1000 * 10) / 10, worst: Math.round(worst), quality: g.quality ?? g.save?.quality ?? null, ease: g.ease ?? null });
          }
        };
        requestAnimationFrame(f);
      }),
    ms,
  );
const thermal = () => ev(async () => (window.Capacitor?.Plugins?.Thermal ? await window.Capacitor.Plugins.Thermal.getState().catch((e) => ({ error: String(e) })) : { missing: true }));
const overlaps = () =>
  ev(() => {
    const pick = [['hedef', '#objective'], ['mesaj', '#toasts .toast'], ['rehber', '#guide.show'], ['buton', '#actions .action-btn'], ['göstergeler', '.hud-top .gauges'], ['bahşiş', '#request-chip'], ['motor ipucu', '#starter-hint'], ['sağ butonlar', '.hud-btns'], ['pedallar', '.drive-pedals'], ['direksiyon', '#drive-wheel']];
    const boxes = [];
    for (const [name, sel] of pick)
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 4 || r.height < 4 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.2 || !el.closest('.screen.show')) continue;
        if ((name === 'mesaj' || name === 'motor ipucu' || name === 'bahşiş') && !el.textContent.trim()) continue;
        boxes.push({ name, r });
      }
    const out = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r;
        const c = boxes[j].r;
        const w = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (w > 4 && h > 4 && boxes[i].name !== boxes[j].name) out.push(`${boxes[i].name} × ${boxes[j].name}`);
      }
    return out;
  });
let shotN = 0;
/** A step: its picture from the phone's own screen, frames over 6 s, the load, the messages. */
const step = async (label) => {
  await sleep(800);
  const file = `${String(++shotN).padStart(2, '0')}.png`;
  writeFileSync(`${OUT}/${file}`, execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
  const m = await measure(6000);
  const load = appLoad();
  const over = await overlaps();
  const th = await thermal();
  report.push({ file, label, ...m, ...load, thermal: th, over });
  console.log(`${file} ${label}: ${m.fps} fps (en yavaş kare ${m.worst} ms), CPU %${load.cpu}, ${load.mem} MB${over.length ? `, ÜST ÜSTE: ${over.join(', ')}` : ''}`);
  return m;
};
const tapAct = (id) => ev((id) => document.querySelector(`#actions [data-id="${id}"]`)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })), id);
const loaded = () => p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 180000 });
/** Keys held for `ms` (W gas / walk, A D steer, Space the trimmer's throttle), then let go. */
const hold = async (codes, ms) => {
  await ev((codes) => codes.forEach((c) => window.__game.input.keys.add(c)), codes);
  await sleep(ms);
  await ev((codes) => codes.forEach((c) => window.__game.input.keys.delete(c)), codes);
};
const drive = (throttle, steer, ms) => hold([throttle > 0 ? 'KeyW' : 'KeyS', ...(steer > 0.05 ? ['KeyD'] : steer < -0.05 ? ['KeyA'] : [])], ms);

await p.waitForFunction('window.__ready === true', { timeout: 180000 });
console.log('Cihaz:', adb('shell', 'getprop', 'ro.product.model').trim(), '· Android', adb('shell', 'getprop', 'ro.build.version.release').trim());
ok((await thermal()).missing !== true, `the Thermal plugin is in the build (${JSON.stringify(await thermal())})`);

// ---- 1. A new player: the menu as it opens.
await ev(() => document.querySelectorAll('.screen.dim').forEach((x) => x.classList.remove('show')));
await step('Ana menü');

// ---- 2. The first job from the menu, through its own buttons.
await ev(() => document.getElementById('btn-play').click());
await sleep(1200);
await ev(() => (document.querySelector('#level-list .saga-node.current, #level-list .saga-node.next, #level-list .saga-node:not(.locked)') ?? document.querySelector('.saga-node'))?.click());
await sleep(800);
await ev(() => document.getElementById('btn-call-ok')?.click());
await loaded();
await step('İş başı (evden)');
// To the vehicle and on, down to the field.
await ev(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x + Math.cos(v.yaw) * 1.6;
  s.z = v.z - Math.sin(v.yaw) * 1.6;
});
await sleep(600);
await tapAct('board');
await sleep(500);
ok(await ev(() => window.__game.session.driving), 'PATPATA BİN: at the wheel');
await hold(['KeyW'], 1500);
await ev(() => window.__game.input.keys.add('KeyW'));
await step('Sürerken (köy yolu)');
await ev(() => window.__game.input.keys.delete('KeyW'));
await ev(() => {
  const s = window.__game.session;
  const f = s.field;
  const v = f.vehicle;
  v.speed = 0;
  v.x = f.entryX;
  v.z = f.depth / 2 + 2;
  v.yaw = Math.PI;
});
await sleep(400);
await tapAct('off');
await sleep(600);
const acts = await ev(() => [...document.querySelectorAll('#actions [data-id]')].map((x) => x.dataset.id));
ok(acts.includes('take') || acts.includes('bag'), `by the vehicle at the field: TIRPANI AL or BAGAJ (${acts})`);
if (acts.includes('bag')) {
  await tapAct('bag');
  await sleep(500);
  await ev(() => document.querySelector('#confirm .bag-tool[data-tool="trimmer"]')?.click());
} else await tapAct('take');
await sleep(800);
ok(await ev(() => window.__game.session.hasTrimmer), 'the trimmer in hand');
// Line on (held), then the engine started through its own controls.
await ev(() => {
  const s = window.__game.session;
  s.rethread = 1;
});
await sleep(1500);
await ev(() => {
  const s = window.__game.session;
  s.intro = null;
  s.broken = false;
  s.line = s.gear.lineMax;
});
for (let i = 0; i < 3; i++) await ev(() => document.getElementById('btn-prime')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
await ev(() => document.getElementById('btn-choke')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
for (let i = 0; i < 8 && !(await ev(() => window.__game.session.running)); i++) {
  const st = await ev(() => ({ popped: window.__game.session.starter.popped, choke: window.__game.session.starter.choke }));
  if (st.popped && st.choke) await ev(() => document.getElementById('btn-choke').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await ev(() => window.__game.pullCord(0.9));
  await sleep(300);
}
ok(await ev(() => window.__game.session.running), 'the engine started (prime, choke, cord)');
// Mowing: walking into the field with the throttle held, 20 s.
await ev(() => {
  const g = window.__game;
  const s = g.session;
  s.x = 0;
  s.z = s.field.depth / 2 - 2;
  s.yaw = Math.PI;
  g.lookYaw = Math.PI;
});
const cov0 = await ev(() => window.__game.session.field.coverage);
// (Held while the frames are counted, and on for 20 s.)
await ev(() => ['KeyW', 'Space'].forEach((c) => window.__game.input.keys.add(c)));
await step('Biçerken (gaz basılı, yürüyerek)');
await sleep(8000);
await step('Biçerken, 20 sn sonra');
await ev(() => ['KeyW', 'Space'].forEach((c) => window.__game.input.keys.delete(c)));
const cov1 = await ev(() => window.__game.session.field.coverage);
ok(cov1 > cov0, `grass mown (%${Math.round(cov0 * 100)} → %${Math.round(cov1 * 100)})`);

// ---- 3. The rest of the day: the shop, the job's end, Karadere, the evening.
await ev(() => window.__game.finish());
await sleep(1500);
await step('İş sonu ekranı');
await ev(() => {
  const g = window.__game;
  g.quitToMenu();
  g.showMenu();
  document.querySelectorAll('.screen.dim').forEach((x) => x.classList.remove('show'));
  g.shopTab = 'arac';
  g.openShop();
});
await step('Dükkan');
await ev(() => {
  const g = window.__game;
  document.querySelectorAll('.screen.dim').forEach((x) => x.classList.remove('show'));
  Object.assign(g.save, { unlocked: 20, introDone: true, tutorialSeen: true, vehicle: 'buyuk', vehicles: ['patpat', 'traktor', 'buyuk', 'romork'] });
  g.levelTab = 2;
  void g.startRoam();
});
await loaded();
await step('Karadere, serbest gez (büyük traktör)');
await ev(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x + Math.cos(v.yaw) * 1.8;
  s.z = v.z - Math.sin(v.yaw) * 1.8;
  s.board();
});
await ev(() => window.__game.input.keys.add('KeyW'));
await step('Karadere, büyük traktörle sürerken');
await ev(() => window.__game.input.keys.delete('KeyW'));
await ev(() => {
  const g = window.__game;
  g.quitToMenu();
  delete g.save.eveningDay;
  g.levelTab = 2;
  void g.startRoam('evening');
});
await loaded();
await step('Akşam: inekler');

// ---- 4. Ten minutes on in a heavy job (Karadere's biggest), to see it warm and ease off.
await ev(() => {
  const g = window.__game;
  g.quitToMenu();
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  g.start(g.levelById(20));
});
await loaded();
const long = [];
for (let i = 0; i < 5; i++) {
  long.push(await step(`İş 20, ${i * 2} dk`));
  await sleep(114000);
}

writeFileSync(`${OUT}/report.json`, JSON.stringify({ report, errors }, null, 1));
ok(!report.some((r) => r.over.length), `no messages over one another (${report.filter((r) => r.over.length).map((r) => r.label).join(', ') || 'none'})`);
ok(!errors.length, `no page errors${errors.length ? ': ' + [...new Set(errors)].slice(0, 5).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
ws.close();
process.exit(bad ? 1 : 0);
