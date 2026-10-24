// Emulator test 1: into a job from the menu by touch, on the pat pat, driven by the stick (gas, steer, brake),
// and the yard gate (KAPIYI AÇ by it opens it, it stays open while waited at, KAPIYI KAPAT shuts it).
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
await tap(page, '#level-list .saga-node');
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
check('no wheel or pedals on screen: the stick drives', await game(page, () => !document.getElementById('drive-ui') && getComputedStyle(document.getElementById('stick')).display !== 'none'));
await sleep(1000);
// (The stick's test on the open harman: out of the garage it starts in, backing would meet its wall.)
await game(page, () => {
  const f = window.__game.session.field;
  Object.assign(f.vehicle, f.harmanSpot, { speed: 0, art: 0 });
});
// The gate no longer opens by itself: only its button does.
check('getting on does not open the gate', (await game(page, () => window.__game.session.field.gateOpen)) === 0);

const pos = () => game(page, () => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  const g = s.field.yardGate;
  return { x: v.x, z: v.z, yaw: v.yaw, speed: v.speed, gate: s.field.gateOpen, gd: g ? Math.hypot(v.x - (g.ax + g.bx) / 2, v.z - (g.az + g.bz) / 2) : -1 };
});

// GAZ: the stick pushed up (a finger on the right half) for 3 s.
const p0 = await pos();
await dragAsync(800, 1700, 800, 1520, 3000);
const p1 = await pos();
check('stick up drives it', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, `${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2)} m`);

// Steering: the stick up and to the right.
const turning = dragAsync(800, 1700, 960, 1560, 3000);
let maxSteer = 0;
for (let i = 0; i < 10; i++) {
  await sleep(250);
  maxSteer = Math.max(maxSteer, await game(page, () => window.__game.session.field.vehicle.steer));
}
await turning;
const p2 = await pos();
check('stick right steers right', maxSteer > 0.3, `steer up to ${maxSteer.toFixed(2)}`);
const dyaw = Math.atan2(Math.sin(p2.yaw - p1.yaw), Math.cos(p2.yaw - p1.yaw));
check('the pat pat turns', Math.abs(dyaw) > 0.15, `${dyaw.toFixed(2)} rad`);
await sleep(1500);
check('let go, it goes straight again', Math.abs(await game(page, () => window.__game.session.field.vehicle.steer)) < 0.15);
shot('emu-drive-turn');

// Stick down for 4 s: stops, then backs up.
const braking = dragAsync(800, 1600, 800, 1780, 4000);
let minSpeed = 9;
for (let i = 0; i < 14; i++) {
  await sleep(250);
  minSpeed = Math.min(minSpeed, (await pos()).speed);
}
await braking;
check('stick down stops it and backs up', minSpeed < -0.2, `speed down to ${minSpeed.toFixed(2)}`);

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
  s.gateWanted = false;
});
await sleep(1500);
check('gate shut while the pat pat stands outside', (await pos()).gate === 0);
check('KAPIYI AÇ shows by the gate', await W(() => !!document.querySelector('[data-id="gate"]'), 3000));
shot('emu-drive-gate-button');
await tap(page, '[data-id="gate"]');
await sleep(4500);
check('pressed: the gate opens', (await pos()).gate === 1);
check('open: KAPIYI KAPAT shows instead', await game(page, () => !!document.querySelector('[data-id="gate-shut"]') && !document.querySelector('[data-id="gate"]')));
await dragAsync(800, 1700, 800, 1520, 2200);
await sleep(2500);
const near = await pos();
check('driven up to it: stays open', near.gate === 1, `${near.gd.toFixed(1)} m away`);
shot('emu-drive-gate');
await dragAsync(800, 1600, 800, 1780, 5000);
await sleep(1500);
const back = await pos();
check('backed off: still open (only the button shuts it)', back.gate === 1, `open ${back.gate.toFixed(2)} at ${back.gd.toFixed(1)} m`);
if (await game(page, () => !!document.querySelector('[data-id="gate-shut"]'))) await tap(page, '[data-id="gate-shut"]');
await sleep(4500);
check('KAPIYI KAPAT: the gate shuts', (await pos()).gate === 0);
check('app still running', alive());
browser.disconnect();
process.exit(allOk() ? 0 : 1);
