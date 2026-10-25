// Dev check: which GPU textures stay behind when one job is swapped for the next (uploaded, never
// disposed, no longer in the scene). Usage: node scripts/check-texleak.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 760 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
// Where each canvas is made (the stack), to name a leaked one.
await page.evaluateOnNewDocument(() => {
  const make = document.createElement.bind(document);
  document.createElement = (tag, o) => {
    const el = make(tag, o);
    if (String(tag).toLowerCase() === 'canvas') el.__made = new Error().stack.split(String.fromCharCode(10)).slice(2, 6).map((l) => l.trim()).join(' < ');
    return el;
  };
});
await page.goto(`${base}?quality=low`, { timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
await page.evaluate(() => {
  document.getElementById('daily')?.classList.remove('show');
  const g = window.__game;
  // Find the shared EventDispatcher prototype through any texture in the scene, and record every
  // texture the renderer uploads (it listens for their dispose).
  let tex = null;
  g.view.scene.traverse((o) => {
    const m = o.material;
    if (!tex && m && !Array.isArray(m) && m.map) tex = m.map;
  });
  let proto = Object.getPrototypeOf(tex);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'addEventListener')) proto = Object.getPrototypeOf(proto);
  const up = new Set();
  const add = proto.addEventListener;
  proto.addEventListener = function (type, fn) {
    if (this.isTexture && type === 'dispose') {
      up.add(this);
      add.call(this, 'dispose', () => up.delete(this));
    }
    return add.call(this, type, fn);
  };
  window.__uploaded = up;
});
const inScene = () => page.evaluate(() => {
  const g = window.__game;
  const seen = new Set();
  const look = (v) => {
    if (!v) return;
    if (v.isTexture) seen.add(v);
    else if (Array.isArray(v)) v.forEach(look);
  };
  g.view.scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k of Object.keys(m)) look(m[k]);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) look(u.value);
    }
  });
  if (g.view.scene.background?.isTexture) seen.add(g.view.scene.background);
  const left = [...window.__uploaded].filter((t) => !seen.has(t));
  return left.map((t) => {
    let px = '';
    try {
      const d = t.image.getContext('2d').getImageData(t.image.width / 2, t.image.height / 2, 1, 1).data;
      px = `rgba(${d.join(',')})`;
    } catch (e) {
      px = 'no2d';
    }
    return `${window.__owners?.[t.uuid] ?? 'owner?'} ${t.constructor.name} ${t.image?.width}x${t.image?.height} wrap ${t.wrapS} mip ${t.generateMipmaps} min ${t.minFilter} px ${px} made ${t.image?.__made}`;
  });
});
// Who holds each texture now (to name the ones left behind after the next job is built).
const owners = () => page.evaluate(() => {
  const g = window.__game;
  const out = window.__owners ?? (window.__owners = {});
  g.view.scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    const path = [];
    for (let q = o; q; q = q.parent) path.unshift(`${q.type}${q.name ? ':' + q.name : ''}`);
    for (const m of mats) {
      const vals = [...Object.values(m), ...(m.uniforms ? Object.entries(m.uniforms).map(([k, u]) => u.value) : [])];
      for (const v of vals) if (v && v.isTexture) out[v.uuid] = `${path.slice(-4).join('>')} ${m.type} geo ${o.geometry?.type}`;
    }
  });
});
for (let j = 0; j < 3; j++) {
  await owners();
  await page.evaluate(async (j) => {
    const g = window.__game;
    const { LEVELS } = await import('/src/game/config.ts');
    g.start(LEVELS[j]);
  }, j);
  await sleep(2500);
  console.log(`after job ${j + 1}:`, JSON.stringify(await inScene()));
}
await browser.close();
