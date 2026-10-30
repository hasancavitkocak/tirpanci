// Dev: a player's tour of the whole game, a picture every step, to be looked over as a player would
// (not one thing checked: whatever looks wrong anywhere). The menus and the shop's tabs; every job from
// its field and from above; both villages driven along their roads; every vehicle from outside and from
// its seat; every tool in hand; the evening and the harvest; a job's result; portrait and tablet. Pictures
// in test-output/tour/<run>/, two by two on sheets (sheets/) to go through; the previous run kept beside
// it to set against (scripts/tour-sheets.py). Usage (dev server running): node scripts/tour.mjs [run] [baseUrl]
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const run = process.argv[2] ?? new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const base = process.argv[3] ?? 'http://localhost:5173/';
const OUT = `test-output/tour/${run}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/tour-${Date.now()}` });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('requestfailed', (r) => /\.(glb|wav|webp|png|jpg)$/.test(r.url()) && errors.push(`failed ${r.url()}`));
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const shots = [];
let n = 0;
const shot = async (label) => {
  const file = `${String(++n).padStart(3, '0')}.png`;
  await p.screenshot({ path: `${OUT}/${file}` });
  shots.push({ file, label });
  console.log(file, label);
};
const ev = (f, ...a) => p.evaluate(f, ...a);
const loaded = () => p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 90000 });
const click = async (sel) => {
  await ev((sel) => document.querySelector(sel)?.click(), sel);
  await sleep(500);
};
const closeAll = () => ev(() => document.querySelectorAll('.screen.dim').forEach((x) => x.classList.remove('show')));
const MID = { introDone: true, tutorialSeen: true, lookSeen: true, harvestOffered: 99, unlocked: 20, weather: 'sunny', money: 60000, dog: true, decor: ['kulube', 'saksi', 'cardak'], vehicles: ['patpat', 'traktor', 'buyuk', 'romork', 'patos'], vehicle: 'patpat', trailerOff: true, patosOn: false, mownAt: {}, mowedAt: {}, daily: { last: new Date().toISOString().slice(0, 10), streak: 1 }, driveTips: 9 };
const OWNED = ['standart', 'yuvarlak', 'testere', 'ufleyici', 'capa'];
const setSave = (extra = {}) =>
  ev(
    (MID, OWNED, extra) => {
      const g = window.__game;
      if (g.mode !== 'menu') g.quitToMenu();
      Object.assign(g.save, MID, extra);
      g.save.equipment = { ...g.save.equipment, owned: OWNED };
    },
    MID,
    OWNED,
    extra,
  );
/** A camera put at (x, y over the ground, z) looking at (tx, ty over the ground, tz). */
const cam = (c) =>
  ev((c) => {
    const g = window.__game;
    const f = g.session.field;
    const fy = f.height(c.x, c.z) + c.y;
    const ty = f.height(c.tx, c.tz) + c.ty;
    const d = { x: c.tx - c.x, y: ty - fy, z: c.tz - c.z };
    g.view.freeCam = { x: c.x, y: fy, z: c.z, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y / Math.hypot(d.x, d.y, d.z)) };
  }, c);
const noCam = () => ev(() => (window.__game.view.freeCam = null));
const job = async (id, extra = {}) => {
  await setSave(extra);
  await ev((id) => {
    const g = window.__game;
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    g.start(g.levelById(id));
  }, id);
  await loaded();
  await sleep(1300);
};
const roam = async (region, kind = '', extra = {}) => {
  await setSave(extra);
  await ev(
    async (region, kind) => {
      const g = window.__game;
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
      g.levelTab = region;
      await g.startRoam(kind);
    },
    region,
    kind,
  );
  await loaded();
  await sleep(1300);
};
/** In the field with the trimmer, line on, at its open bottom looking up into it. */
const inField = () =>
  ev(() => {
    const g = window.__game;
    const s = g.session;
    if (s.driving) {
      s.field.vehicle.speed = 0;
      s.alight();
    }
    s.intro = null;
    s.hasTrimmer = true;
    s.broken = false;
    s.line = s.gear.lineMax;
    g.view.worker.carrying = true;
    s.x = 0;
    s.z = s.field.depth / 2 - 3;
    s.yaw = Math.PI;
    g.lookYaw = Math.PI;
  });
/** On the vehicle's seat, the vehicle at (x, z, yaw). */
const driveAt = (x, z, yaw) =>
  ev(
    (x, z, yaw) => {
      const s = window.__game.session;
      const v = s.field.vehicle;
      if (!s.driving) {
        s.x = v.x + Math.cos(v.yaw) * 1.8;
        s.z = v.z - Math.sin(v.yaw) * 1.8;
        s.board();
      }
      if (x !== undefined) {
        v.x = x;
        v.z = z;
        v.yaw = yaw;
        v.art = 0;
        v.speed = 0;
      }
      return s.driving;
    },
    x,
    z,
    yaw,
  );

// ---- 1. A new player's menu, then the menus.
await p.goto(`${base}?quality=high`, { timeout: 120000 });
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await sleep(1500);
await shot('İlk açılış (yeni oyuncu)');
await closeAll();
await sleep(300);
await shot('Ana menü (yeni oyuncu)');
await setSave();
await ev(() => window.__game.showMenu());
await closeAll();
await sleep(600);
await shot('Ana menü (oyun ortası)');
await click('#btn-play');
await shot('Bahçeye git: iş listesi');
await closeAll();
for (const tab of ['tirpan', 'misina', 'donanim', 'yukseltme', 'arac', 'koy']) {
  await ev((tab) => {
    const g = window.__game;
    g.shopTab = tab;
    g.shopNote = null;
    g.openShop();
  }, tab);
  await sleep(600);
  await shot(`Dükkan: ${tab}`);
}
await closeAll();
for (const [sel, name] of [
  ['#btn-tasks', 'Görevler'],
  ['#btn-store', 'Mağaza'],
  ['#btn-settings', 'Ayarlar'],
  ['#btn-roam', 'Serbest gez sorusu'],
]) {
  await click(sel);
  await shot(name);
  await closeAll();
  await ev(() => document.getElementById('confirm')?.classList.remove('show'));
}

// ---- 2. A job's start from the house, each village; the map; the bagaj at the start.
for (const id of [1, 11]) {
  await job(id);
  await shot(`İş ${id}: başlangıç (evden)`);
  await click('#btn-map');
  await sleep(500);
  await shot(`İş ${id}: harita`);
  await click('#btn-map-close');
}

// ---- 3. Every job: from its field, the trimmer in hand; from above.
for (let id = 1; id <= 20; id++) {
  await job(id);
  await inField();
  await sleep(1300);
  const name = await ev(() => window.__game.session.level.name);
  await shot(`İş ${id} ${name}: tarlada, tırpan elde`);
  await ev(() => {
    const f = window.__game.session.field;
    const d = Math.max(f.width, f.depth);
    window.__tourCam = { x: f.width * 0.7, y: d * 0.75, z: f.depth / 2 + d * 0.55, tx: 0, ty: 0, tz: 0 };
  });
  await cam(await ev(() => window.__tourCam));
  await sleep(1300);
  await shot(`İş ${id} ${name}: yukarıdan`);
  await noCam();
}

// ---- 4. A job's end: the result.
await job(2);
await inField();
await ev(() => window.__game.finish());
await sleep(1500);
await shot('İş sonu: sonuç ekranı');
await closeAll();

// ---- 5. Both villages driven along their roads (the pat pat), and walked a little.
for (const region of [1, 2]) {
  await roam(region);
  await shot(`Köy ${region}: serbest gez başı`);
  const spots = await ev(() => {
    const f = window.__game.session.field;
    const out = [];
    for (const r of f.roads) {
      let acc = 40;
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1];
        const q = r.pts[i];
        acc += Math.hypot(q.x - a.x, q.z - a.z);
        if (acc < 45) continue;
        const yaw = Math.atan2(q.x - a.x, q.z - a.z);
        if (!f.vehicleFits(q.x, q.z, yaw, 0)) continue;
        acc = 0;
        out.push({ x: q.x, z: q.z, yaw });
      }
    }
    return out;
  });
  const step = Math.max(1, Math.ceil(spots.length / 14));
  for (let i = 0; i < spots.length; i += step) {
    const sp = spots[i];
    await driveAt(sp.x, sp.z, sp.yaw);
    await sleep(1200);
    await shot(`Köy ${region}: yolda patpatla (${i + 1}/${spots.length})`);
  }
  // The yard and its gate, the house, from where he stands.
  await ev(() => {
    const s = window.__game.session;
    if (s.driving) {
      s.field.vehicle.speed = 0;
      s.alight();
    }
  });
  await ev(() => {
    const f = window.__game.session.field;
    const y = f.yardGate;
    const pl = f.plateau;
    const mx = (y.ax + y.bx) / 2;
    const mz = (y.az + y.bz) / 2;
    // Outside the gate on the way out, looking in at it.
    const d = Math.hypot(mx - pl.x, mz - pl.z);
    const ox = mx + ((mx - pl.x) / d) * 9;
    const oz = mz + ((mz - pl.z) / d) * 9;
    window.__tourCam = { x: ox, y: 2.2, z: oz, tx: mx, ty: 1, tz: mz };
  });
  await cam(await ev(() => window.__tourCam));
  await sleep(1300);
  await shot(`Köy ${region}: avlu dışarıdan, kapı`);
  await noCam();
}

// ---- 6. Every vehicle at the harman: from outside and from its seat.
for (const [vehicle, extra, label] of [
  ['patpat', {}, 'Patpat'],
  ['patpat', { patosOn: true }, 'Patpat + patos'],
  ['traktor', {}, 'Traktör'],
  ['traktor', { trailerOff: false }, 'Traktör + römork'],
  ['buyuk', {}, 'Büyük traktör'],
  ['buyuk', { trailerOff: false }, 'Büyük traktör + römork'],
]) {
  for (const camera of ['follow', 'fpv']) {
    if (camera === 'fpv' && (extra.patosOn || extra.trailerOff === false)) continue;
    await roam(1, '', { vehicle, ...extra });
    await driveAt();
    // (Every job starts in first person: the eye button for the camera behind.)
    if (camera === 'follow') await click('#btn-cam');
    await ev(() => {
      const f = window.__game.session.field;
      const h = f.harmanSpot;
      if (!h) return;
      const v = f.vehicle;
      v.x = h.x;
      v.z = h.z;
      v.yaw = h.yaw;
    });
    await sleep(1400);
    await shot(`${label}: ${camera === 'fpv' ? 'koltuktan (FPS)' : 'arkadan'}`);
    if (camera === 'follow') {
      await ev(() => {
        const v = window.__game.session.field.vehicle;
        const a = v.yaw + Math.PI * 0.3;
        window.__tourCam = { x: v.x + Math.sin(a) * 7, y: 2, z: v.z + Math.cos(a) * 7, tx: v.x, ty: 1.3, tz: v.z };
      });
      await cam(await ev(() => window.__tourCam));
      await sleep(1200);
      await shot(`${label}: önden yandan`);
      await noCam();
    }
  }
}

// ---- 7. Every tool in hand, out of the bagaj (Karadere's job 15: a tree, tilling, burning).
await job(15);
await inField();
await ev(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x + Math.cos(v.yaw) * 1.8;
  s.z = v.z - Math.sin(v.yaw) * 1.8;
});
await sleep(800);
await shot('İş 15: aracın yanında, BAGAJ');
await ev(() => document.querySelector('#actions [data-id="bag"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })));
await sleep(600);
await shot('Bagaj açık');
for (const tool of ['saw', 'blower', 'tiller', 'trimmer']) {
  const took = await ev((tool) => {
    if (!document.getElementById('confirm').classList.contains('show')) document.querySelector('#actions [data-id="bag"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    return new Promise((r) =>
      setTimeout(() => {
        const t = document.querySelector(`#confirm .bag-tool[data-tool="${tool}"]`);
        if (!t || t.disabled) {
          document.getElementById('btn-confirm-yes')?.click();
          return r(false);
        }
        t.click();
        r(true);
      }, 300),
    );
  }, tool);
  await sleep(1200);
  await shot(`${tool} elde${took ? '' : ' (alınamadı)'}`);
}

// ---- 8. The evening's cows and the harvest.
await roam(1, 'evening');
await sleep(1500);
await shot('Akşam: inekler başlangıç');
await roam(1, 'harvest');
await sleep(1500);
await shot('Fındık harmanı başlangıç');

// ---- 9. Portrait and tablet.
for (const [w, h, name] of [
  [402, 874, 'Dikey telefon'],
  [1180, 820, 'Tablet'],
]) {
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await setSave();
  await ev(() => window.__game.showMenu());
  await closeAll();
  await sleep(800);
  await shot(`${name}: ana menü`);
  await job(4);
  await inField();
  await sleep(1300);
  await shot(`${name}: iş 4 tarlada`);
}

writeFileSync(`${OUT}/shots.json`, JSON.stringify({ shots, errors }, null, 1));
console.log(`\n${shots.length} pictures, ${errors.length} page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await b.close();
