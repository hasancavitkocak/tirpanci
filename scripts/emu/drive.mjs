// Emulator test 1: into a job from the menu by touch, on the pat pat, GAZ, the steering wheel, FREN,
// and the yard gate (opens as the pat pat comes, stays open while it waits, shuts as it backs off).
import { alive, allOk, at, check, connect, dragAsync, game, shot, sleep, tap } from './lib.mjs';

const { browser, page } = await connect();
const W = (fn, t, ...a) => page.waitFor(fn, t, ...a);

// Menu -> job list -> job 1 -> the call -> the loading screen -> the game.
await game(page, () => window.__game.showMenu());
await sleep(500);
await game(page, () => document.getElementById('daily')?.classList.remove('show'));
await tap(page, '#btn-play');
check('job list opens by touch', await W(() => document.getElementById('levels').classList.contains('show'), 5000));
await game(page, () => {
  window.__game.levelTab = 1;
  window.__game.openLevels();
});
await tap(page, '#level-list button.level');
check('the call comes', await W(() => document.getElementById('call').classList.contains('show'), 5000));
await tap(page, '#btn-call-ok');
const loader = await W(() => document.getElementById('loading').classList.contains('show') || window.__game.mode === 'playing', 3000);
const sawLoader = await game(page, () => document.getElementById('loading').classList.contains('show'));
check('loading screen between', loader, sawLoader ? 'seen' : 'too quick to see');
check('job starts', await W(() => window.__game.mode === 'playing', 60000));
await sleep(1500);
shot('emu-drive-start');

// Next to the pat pat (placed there), then on by the button.
await game(page, () => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x + 1.4;
  s.z = v.z;
});
check('PATPATA BİN shows', await W(() => !!document.querySelector('[data-id="board"]'), 8000));
await tap(page, '[data-id="board"]');
check('on the pat pat', await W(() => window.__game.session.driving, 5000));
check('wheel and pedals on screen', await game(page, () => getComputedStyle(document.getElementById('drive-ui')).display !== 'none'));
await sleep(1000);
check('getting on does not open the gate', (await game(page, () => window.__game.session.field.gateOpen)) === 0);

const pos = () => game(page, () => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  const g = s.field.yardGate;
  return { x: v.x, z: v.z, yaw: v.yaw, speed: v.speed, gate: s.field.gateOpen, gd: g ? Math.hypot(v.x - (g.ax + g.bx) / 2, v.z - (g.az + g.bz) / 2) : -1 };
});

// GAZ: a finger on the pedal for 3 s.
const p0 = await pos();
const gas = await at(page, '#pedal-gas');
await dragAsync(gas.x, gas.y, gas.x, gas.y, 3000);
const p1 = await pos();
check('GAZ moves it', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, `${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2)} m`);

// The wheel: the gas held (a second finger, from the page: adb has one finger), the real finger turns
// the wheel from 12 o'clock round to 3.
await game(page, () => document.getElementById('pedal-gas').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9 })));
const wh = await at(page, '#drive-wheel');
const r = wh.w * 0.38;
const turning = dragAsync(wh.x, wh.y - r, wh.x + r, wh.y - r * 0.1, 3000);
let maxSteer = 0;
for (let i = 0; i < 10; i++) {
  await sleep(250);
  maxSteer = Math.max(maxSteer, await game(page, () => window.__game.driveUi.steer));
}
await turning;
const p2 = await pos();
await game(page, () => document.getElementById('pedal-gas').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9 })));
check('turning the wheel by touch steers right', maxSteer > 0.3, `steer up to ${maxSteer.toFixed(2)}`);
const dyaw = Math.atan2(Math.sin(p2.yaw - p1.yaw), Math.cos(p2.yaw - p1.yaw));
check('the pat pat turns', Math.abs(dyaw) > 0.15, `${dyaw.toFixed(2)} rad`);
await sleep(1500);
check('the wheel springs back', Math.abs(await game(page, () => window.__game.driveUi.steer)) < 0.15);
shot('emu-drive-turn');

// FREN: a finger on it for 4 s: stops, then backs up.
const br = await at(page, '#pedal-brake');
const braking = dragAsync(br.x, br.y, br.x, br.y, 4000);
let minSpeed = 9;
for (let i = 0; i < 14; i++) {
  await sleep(250);
  minSpeed = Math.min(minSpeed, (await pos()).speed);
}
await braking;
check('FREN stops it and backs up', minSpeed < -0.2, `speed down to ${minSpeed.toFixed(2)}`);

// The yard gate, from outside: the pat pat 9 m out, facing it, gate shut.
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
  v.x = mx + (ox / l) * 9;
  v.z = mz + (oz / l) * 9;
  v.yaw = Math.atan2(-ox, -oz);
  v.art = 0;
  v.speed = 0;
  f.gateOpen = 0;
  s.gateHeld = false;
  s.gateDist = Infinity;
});
await sleep(1500);
check('gate shut while the pat pat stands outside', (await pos()).gate === 0);
const driving = dragAsync(gas.x, gas.y, gas.x, gas.y, 2200);
let closestShut = 99;
for (let i = 0; i < 9; i++) {
  await sleep(250);
  const p = await pos();
  if (p.gate < 0.95) closestShut = Math.min(closestShut, p.gd);
}
await driving;
const near = await pos();
check('the gate opens as it comes (fully open before it gets there)', closestShut > 2, `gate below full only farther than ${closestShut.toFixed(1)} m; now ${near.gd.toFixed(1)} m away, open ${near.gate.toFixed(2)}`);
await sleep(2500);
check('stopped by it: stays open', (await pos()).gate === 1);
shot('emu-drive-gate');
const backing = dragAsync(br.x, br.y, br.x, br.y, 5000);
await backing;
await sleep(3000);
const away = await pos();
check('backed off: the gate shuts', away.gate < 0.5, `open ${away.gate.toFixed(2)} at ${away.gd.toFixed(1)} m`);
check('app still running', alive());
browser.disconnect();
process.exit(allOk() ? 0 : 1);
