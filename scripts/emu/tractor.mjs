// Emulator test 7: the tractor and its trailer, by touch where a player would touch.
//  - In a job on the pat pat's day, DÜKKAN by the house: the tractor and the trailer bought (asked first),
//    and they stand in the yard at once (no waiting for the next job).
//  - The worker sits on the tractor's seat (hips on the cushion, not floating or sunk).
//  - Its sound: only the tractor's own recording plays (not the pat pat's, nor its gear clunk); the
//    loops loaded are the diesel tractor's (idle, mid, high: cut-traktor2.py).
//  - Out of the garage with the stick; KAPIYI AÇ by the gate (it swings out of the yard); the
//    tractor and the trailer through it; the trailer stays on its hitch.
//  - Over a stream boulder (the pat pat stops at them, the tractor climbs them).
//  - Messages never over the objective, the buttons or the hints; the controls' how-to in the settings.
import { alive, allOk, check, connect, dragAsync, game, inJob, shot, sleep, tap } from './lib.mjs';

const { browser, page } = await connect();
const W = (fn, t, ...a) => page.waitFor(fn, t, ...a);
// The stick (right half): up = gas, sideways = steer.
const STICK = { x: 800, y: 1700 };
const stick = (dx, dy, ms) => dragAsync(STICK.x, STICK.y, STICK.x + dx, STICK.y + dy, ms);

await game(page, () => {
  const g = window.__game;
  g.save.vehicles = ['patpat'];
  g.save.vehicle = 'patpat';
  g.save.trailerOff = false;
  g.save.money = 60000;
});
await inJob(page);

// ---- The shop in the job: tractor and trailer bought, there at once.
await game(page, () => {
  const s = window.__game.session;
  if (s.driving) {
    s.field.vehicle.speed = 0;
    s.alight();
  }
  const d = s.field.doorstep;
  s.x = d.x;
  s.z = d.z;
});
check('DÜKKAN shows by the house', await W(() => !!document.querySelector('[data-id="shop"]'), 8000));
await tap(page, '[data-id="shop"]');
await W(() => document.getElementById('shop').classList.contains('show'), 4000);
await sleep(1200);
await tap(page, '#shop-tabs button:nth-child(5)');
await sleep(600);
const card = (name) => game(page, (name) => {
  const cards = [...document.querySelectorAll('#shop-list .shop-card')];
  cards.forEach((c, k) => (c.dataset.k = String(k)));
  const i = cards.findIndex((c) => c.querySelector('b')?.textContent === name);
  return i >= 0 ? `#shop-list .shop-card[data-k="${i}"] button.buy` : null;
}, name);
const label = async (name) => game(page, (sel) => document.querySelector(sel)?.textContent, await card(name));
check('the trailer needs the tractor first', (await label('Römork')) === 'ÖNCE TRAKTÖR', await label('Römork'));
shot('emu-tr-shop');
await tap(page, await card('Traktör'));
check('asked before buying the tractor', await W(() => document.getElementById('confirm').classList.contains('show'), 3000));
await tap(page, '#btn-confirm-yes');
check('tractor bought and chosen', await W(() => window.__game.save.vehicle === 'traktor', 3000));
check('the tractor stands in the yard at once', await W(() => window.__game.session.field.tractor && !!window.__game.view.world.patRig && 'hitch' in window.__game.view.world.patRig, 3000));
await sleep(600);
check('now the trailer is for sale', /TL$/.test((await label('Römork')) ?? ''), await label('Römork'));
await tap(page, await card('Römork'));
await W(() => document.getElementById('confirm').classList.contains('show'), 3000);
await tap(page, '#btn-confirm-yes');
check('trailer bought: hitched at once', await W(() => !!window.__game.session.field.trailer && !!window.__game.view.world.trailerRig, 3000));
await sleep(500);
check('its button now takes it off', (await label('Römork')) === 'ÇIKAR');
shot('emu-tr-shop-bought');
// Back to the job.
await game(page, () => document.getElementById('btn-shop-close')?.click() ?? window.__game.closeShop?.());
await W(() => window.__game.mode === 'playing', 4000);
await sleep(800);

// ---- In the garage, on the seat.
const parked = await game(page, () => {
  const f = window.__game.session.field;
  const g = f.garage;
  const v = f.vehicle;
  // Put back in the garage (the job may have started with it there or not).
  Object.assign(v, f.laneStart, { speed: 0 });
  f.trailer.yaw = NaN;
  return { inside: Math.abs(v.x - g.x) < g.w / 2 && Math.abs(v.z - g.z) < g.d / 2 };
});
check('the tractor waits in the garage', parked.inside);
await game(page, () => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x + 1.6;
  s.z = v.z + 1;
});
check('TRAKTÖRE BİN shows', await W(() => document.querySelector('[data-id="board"]')?.textContent.includes('TRAKTÖRE'), 5000));
await tap(page, '[data-id="board"]');
check('on the tractor', await W(() => window.__game.session.driving, 5000));
await sleep(5000);
const seat = await game(page, () => {
  const g = window.__game;
  const r = g.view.world.patRig;
  const w = g.view.worker;
  let hips = null;
  w.root.traverse((o) => {
    if (!hips && /hips/i.test(o.name)) hips = o;
  });
  r.kasa.updateMatrixWorld(true);
  const V = w.root.position.constructor;
  const h = new V();
  hips.getWorldPosition(h);
  h.applyMatrix4(r.kasa.matrixWorld.clone().invert());
  // The cushion's surface: the model's highest point (under 2 m) on the seat's flat part, from its
  // middle forward (just behind it the backrest rises to 1.6 m).
  const inv = r.kasa.matrixWorld.clone().invert();
  const D = g.session.field.dims;
  let top = -9;
  r.kasa.children[0].traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    const m = o.matrixWorld.clone().premultiply(inv);
    const v = new V();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      if (Math.abs(v.x) < 0.15 && v.z - D.seat > -0.02 && v.z - D.seat < 0.2 && v.y < 2) top = Math.max(top, v.y);
    }
  });
  return { dy: h.y - top, dz: h.z - D.seat, dx: h.x };
});
// (The hip joint stands about a hand's width over what one sits on.)
check('sitting on the seat: hips just over the cushion', seat.dy > 0 && seat.dy < 0.25 && Math.abs(seat.dz) < 0.2 && Math.abs(seat.dx) < 0.1, `hips ${seat.dy.toFixed(2)} over it, ${seat.dz.toFixed(2)} along, ${seat.dx.toFixed(2)} across`);

// ---- The engine's sound.
const sound = () => game(page, () => {
  const a = window.__game.audio;
  const t = a.tractorEngine;
  return { tractor: !!t?.running, patpat: !!a.patpatEngine?.running, drawn: !!a.drawnEngine?.running, loops: t?.buffers?.loops.map((b) => +b.duration.toFixed(1)) ?? [], gear: !!t?.buffers?.gear };
});
let snd = await sound();
check('the tractor recording runs', snd.tractor);
check('no pat pat sound: neither its recording nor the drawn engine', !snd.patpat && !snd.drawn);
check('the diesel tractor recording is the one loaded (idle, mid, high), no gear clunk', snd.loops.length === 3 && Math.abs(snd.loops[0] - 9.9) < 0.1 && !snd.gear, `loops ${snd.loops.join(' / ')} s, gear clunk ${snd.gear}`);

// ---- Out of the garage with the stick.
const pos = () => game(page, () => {
  const f = window.__game.session.field;
  const v = f.vehicle;
  const yg = f.yardGate;
  const a = f.trailerAxle();
  const h = f.hitch;
  const p = f.plateau;
  return { x: v.x, z: v.z, speed: v.speed, gate: f.gateOpen, gd: Math.hypot(v.x - (yg.ax + yg.bx) / 2, v.z - (yg.az + yg.bz) / 2), hitch: a ? Math.hypot(h.x - a.x, h.z - a.z) : -1, out: Math.hypot(v.x - p.x, v.z - p.z), trailerOut: a ? Math.hypot(a.x - p.x, a.z - p.z) : -1, r: p.r };
});
const p0 = await pos();
const driving = stick(0, -180, 3000);
let heard = { patpat: false, drawn: false, tractor: true };
for (let i = 0; i < 8; i++) {
  await sleep(300);
  const s = await sound();
  heard = { patpat: heard.patpat || s.patpat, drawn: heard.drawn || s.drawn, tractor: heard.tractor && s.tractor };
}
await driving;
const p1 = await pos();
check('stick up: out of the garage', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 3, `${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m`);
check('pulling away: still only the tractor heard', heard.tractor && !heard.patpat && !heard.drawn, JSON.stringify(heard));
check('the trailer stays on its hitch', Math.abs(p1.hitch - 3) < 0.01, p1.hitch.toFixed(3));
shot('emu-tr-out-of-garage');

// ---- The gate: KAPIYI AÇ, it swings in, through it with the trailer.
await game(page, () => {
  const s = window.__game.session;
  const f = s.field;
  const g = f.yardGate;
  const mx = (g.ax + g.bx) / 2;
  const mz = (g.az + g.bz) / 2;
  const ox = mx - f.plateau.x;
  const oz = mz - f.plateau.z;
  const l = Math.hypot(ox, oz);
  const v = f.vehicle;
  // Inside the yard, 8 m from the gate, facing out through it.
  v.x = mx - (ox / l) * 8;
  v.z = mz - (oz / l) * 8;
  v.yaw = Math.atan2(ox, oz);
  v.speed = 0;
  f.trailer.yaw = NaN;
  f.gateOpen = 0;
  s.gateWanted = false;
});
await sleep(1200);
check('KAPIYI AÇ shows driving up to the gate', await W(() => !!document.querySelector('[data-id="gate"]'), 3000));
await tap(page, '[data-id="gate"]');
await sleep(4500);
check('the gate opened', (await pos()).gate === 1);
const swing = await game(page, () => {
  const f = window.__game.session.field;
  const g = f.yardGate;
  const d = f.gateDir;
  const p = f.plateau;
  // The leaf's free end: out of the yard (farther from its middle than the gate's posts are).
  const len = Math.hypot(g.bx - g.ax, g.bz - g.az);
  const ex = g.ax + d.x * len;
  const ez = g.az + d.z * len;
  return { end: Math.hypot(ex - p.x, ez - p.z), post: Math.hypot(g.ax - p.x, g.az - p.z) };
});
check('it swung out of the yard', swing.end > swing.post + 2, `leaf end ${swing.end.toFixed(1)} m from the middle, posts ${swing.post.toFixed(1)} m`);
shot('emu-tr-gate-open');
await stick(0, -180, 5000);
await sleep(500);
const p2 = await pos();
check('the tractor drove out through the gate', p2.out > p2.r + 1, `${p2.out.toFixed(1)} m from the yard's middle (fence ${p2.r} m)`);
check('the trailer came through behind it', p2.trailerOut > p2.r, `trailer axle ${p2.trailerOut.toFixed(1)} m out`);
check('still on its hitch', Math.abs(p2.hitch - 3) < 0.01);
shot('emu-tr-through-gate');

// ---- The stream: over a boulder.
const stone = await game(page, () => {
  const s = window.__game.session;
  const f = s.field;
  const open = (x, z) => {
    const c = f.clampWalk(x, z);
    return Math.hypot(c.x - x, c.z - z) < 0.01;
  };
  const b = f.streamStones.find((b) => b.s > 0.5 && Math.abs(b.x - f.streamX(b.z)) < 1 && open(b.x, b.z - 8) && open(b.x, b.z + 4) && Math.abs(b.z) < 60);
  const v = f.vehicle;
  // 5 m up the stream from it, driving down it with the left wheels over the stone.
  v.yaw = 0;
  v.x = b.x + f.dims.kasaTrack;
  v.z = b.z - 5;
  v.speed = 0;
  f.trailer.yaw = NaN;
  window.__lift = 0;
  return { z: b.z, x: b.x };
});
const lifting = setInterval(() => game(page, () => {
  const g = window.__game;
  const r = g.view.world.patRig;
  const f = g.session.field;
  const v = f.vehicle;
  const lift = Math.max(...f.patpatWheels().map((w) => f.stoneLift(w.x, w.z)));
  window.__lift = Math.max(window.__lift, lift);
  return r.kasa.position.y;
}).catch(() => {}), 150);
await stick(0, -180, 3500);
clearInterval(lifting);
const over = await game(page, (z) => ({ dz: window.__game.session.field.vehicle.z - z, lift: window.__lift }), stone.z);
check('the tractor drove on over the boulder', over.dz > 1, `${over.dz.toFixed(1)} m past it`);
check('its wheel climbed it', over.lift > 0.3, `lifted ${over.lift.toFixed(2)} m`);
shot('emu-tr-stream');
check('the pat pat would have stopped at it', await game(page, (s) => {
  const f = window.__game.session.field;
  f.tractor = false;
  const blocked = !f.vehicleFits(s.x, s.z, 0, 0);
  f.tractor = true;
  return blocked;
}, stone));

// ---- Messages: never over the objective, the buttons or the hints.
await game(page, () => {
  const s = window.__game.session;
  s.field.vehicle.speed = 0;
  s.alight();
  const d = s.field.doorstep;
  s.x = d.x;
  s.z = d.z;
});
await W(() => !!document.querySelector('[data-id="shop"]'), 5000);
await game(page, () => {
  window.__game.toast('Bugün: Dedemin Bahçesi (Dedem). Yeri HARİTA\'da', 'good');
  window.__game.toast('Motor ısınıyor, birkaç saniye tam güç vermez');
});
await sleep(400);
const overlaps = await game(page, () => {
  const hit = (a, b) => a.width > 0 && b.width > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const others = [document.getElementById('objective'), ...document.querySelectorAll('#actions > *'), ...document.querySelectorAll('#tutorial.show > div')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
  const toasts = [...document.querySelectorAll('#toasts .toast')].map((e) => e.getBoundingClientRect());
  const acts = [...document.querySelectorAll('#actions > *')].map((e) => e.getBoundingClientRect());
  const hints = [...document.querySelectorAll('#tutorial.show > div')].map((e) => e.getBoundingClientRect());
  return { toasts: toasts.length, toastHits: toasts.filter((t) => others.some((o) => hit(t, o))).length, hintHits: hints.filter((h) => acts.some((a) => hit(h, a))).length };
});
check('messages shown, none over the objective, buttons or hints', overlaps.toasts === 2 && overlaps.toastHits === 0, JSON.stringify(overlaps));
check('the hints along the bottom clear of the buttons', overlaps.hintHits === 0);
shot('emu-tr-messages');
check('the how-to is in the settings', await game(page, () => document.querySelectorAll('#settings details.howto li').length >= 6));

check('app still running', alive());
browser.disconnect();
process.exit(allOk() ? 0 : 1);
