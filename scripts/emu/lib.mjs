// Dev: driving the game on the Android emulator. Real touches go through adb (input tap / swipe); the
// game's state is read (and set up) through the WebView's DevTools socket (forwarded to :9222).
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ADB = `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const adb = (...a) => execFileSync(ADB, a, { encoding: 'buffer', maxBuffer: 64 << 20 });

/** The WebView's top on the screen (pixels): under the status bar. */
let topY = 0;

/**
 * Forward the WebView's DevTools socket and talk to the game's page over CDP (a small client: puppeteer
 * does not list an Android WebView's pages). The page object has evaluate(fn, ...args) like puppeteer's.
 */
export async function connect() {
  const unix = adb('shell', 'cat', '/proc/net/unix').toString();
  const sock = unix.match(/webview_devtools_remote_\d+/g)?.pop();
  if (!sock) throw new Error('no WebView debug socket (is the app running?)');
  adb('forward', 'tcp:9222', `localabstract:${sock}`);
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const target = list.find((t) => t.url.startsWith('https://localhost'));
  if (!target) throw new Error('game page not found');
  topY = JSON.parse(target.description).screenY ?? 0;
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, e) => {
    ws.onopen = r;
    ws.onerror = e;
  });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) {
      waiting.get(d.id)(d);
      waiting.delete(d.id);
    }
  };
  const send = (method, params) =>
    new Promise((r) => {
      const n = ++id;
      waiting.set(n, r);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const page = {
    async evaluate(fn, ...args) {
      const expression = `(${fn})(...${JSON.stringify(args)})`;
      const d = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (d.result?.exceptionDetails) throw new Error(`in page: ${d.result.exceptionDetails.exception?.description ?? d.result.exceptionDetails.text}`);
      return d.result?.result?.value;
    },
    async waitFor(fn, timeout = 30000, ...args) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        if (await page.evaluate(fn, ...args)) return true;
        await sleep(250);
      }
      return false;
    },
  };
  // The game finished loading first (its own start opens the menu and the daily reward: a test begun
  // before that had its job thrown back to the menu).
  if (!(await page.waitFor(() => window.__ready === true, 120000))) throw new Error('game did not get ready');
  return { browser: { disconnect: () => ws.close() }, page };
}

let ok = true;
export const results = [];
export function check(name, cond, info = '') {
  const line = `${cond ? 'OK  ' : 'FAIL'} ${name}${info ? ` — ${info}` : ''}`;
  console.log(line);
  results.push(line);
  if (!cond) ok = false;
}
export const allOk = () => ok;

/** Screen pixels of an element's centre (CSS px x devicePixelRatio). */
export async function at(page, sel) {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    // Scrolled into view first, as a player would.
    el.scrollIntoView({ block: 'nearest' });
    const b = el.getBoundingClientRect();
    return { x: (b.left + b.width / 2) * devicePixelRatio, y: (b.top + b.height / 2) * devicePixelRatio, w: b.width * devicePixelRatio, h: b.height * devicePixelRatio, shown: b.width > 0 && b.height > 0 };
  }, sel);
  if (!r || !r.shown) throw new Error(`not on screen: ${sel}`);
  await sleep(150);
  r.y += topY;
  return r;
}

export async function tap(page, sel) {
  const p = await at(page, sel);
  adb('shell', 'input', 'tap', String(Math.round(p.x)), String(Math.round(p.y)));
  await sleep(400);
}

/** Hold a finger on an element for ms (blocks for that long). */
export async function hold(page, sel, ms) {
  const p = await at(page, sel);
  const x = String(Math.round(p.x));
  const y = String(Math.round(p.y));
  adb('shell', 'input', 'swipe', x, y, x, y, String(ms));
}

/** A finger drag from (x1, y1) to (x2, y2) in screen pixels over ms; started without waiting. */
export function dragAsync(x1, y1, x2, y2, ms) {
  return new Promise((done) => spawn(ADB, ['shell', 'input', 'swipe', ...[x1, y1, x2, y2, ms].map((v) => String(Math.round(v)))]).on('exit', done));
}

export function shot(name) {
  writeFileSync(`test-output/${name}.png`, adb('exec-out', 'screencap', '-p'));
}

/** The app's process still alive (not crashed). */
export function alive() {
  return adb('shell', 'pidof', 'com.kraltirpan.game').toString().trim().length > 0;
}

export const game = (page, fn, ...args) => page.evaluate(fn, ...args);
/** The WebView's top on the screen, pixels. */
export const webTop = () => topY;

/** Into a job (job 1 unless another is given by id from the job list's data) if on the menu. */
export async function inJob(page) {
  if ((await page.evaluate(() => window.__game.mode)) !== 'playing') {
    await page.evaluate(() => {
      document.getElementById('daily')?.classList.remove('show');
      window.__game.start(window.__game.level);
    });
    await page.waitFor(() => window.__game.mode === 'playing', 60000);
    await sleep(1500);
  }
}
