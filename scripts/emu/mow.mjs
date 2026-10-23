// Emulator test 3: in the field with the trimmer: start the engine by touch following the hints
// (POMPA, JİKLE, a quick pull on the cord), mow by holding and dragging, and the stone warning
// (the tick before a stone, the red "!" after hitting one).
import { alive, allOk, at, check, connect, dragAsync, game, inJob, shot, sleep, tap } from './lib.mjs';

const { browser, page } = await connect();
await inJob(page);
// In the field, the trimmer in hand with line, engine off and cold, first person.
await game(page, () => {
  const g = window.__game;
  const s = g.session;
  const f = s.field;
  if (s.driving) {
    f.vehicle.speed = 0;
    s.alight();
  }
  s.intro = null;
  s.hasTrimmer = true;
  s.broken = false;
  s.line = s.gear.lineMax;
  s.running = false;
  s.temp = 0;
  s.x = 0;
  s.z = f.depth / 2 - 2;
  g.lookYaw = Math.PI;
  g.view.mode = 'fpv';
  g.view.pitch = -0.5;
  // Count the stone ticks and hits.
  window.__ticks = 0;
  window.__hits = 0;
  const t = g.audio.tick.bind(g.audio);
  g.audio.tick = () => (window.__ticks++, t());
  const st = g.audio.stone.bind(g.audio);
  g.audio.stone = () => (window.__hits++, st());
});
await sleep(1500);
check('the starter shows', await page.waitFor(() => getComputedStyle(document.getElementById('starter')).display !== 'none', 5000));
shot('emu-mow-starter');

// Follow the highlighted control until it runs (a player reading the hint).
let pulls = 0;
for (let i = 0; i < 30 && !(await game(page, () => window.__game.session.running)); i++) {
  const focus = await game(page, () => (['btn-prime', 'btn-choke', 'cord'].find((id) => document.getElementById(id).classList.contains('highlight')) ?? 'cord'));
  if (focus === 'cord') {
    const h = await at(page, '#cord-handle');
    await dragAsync(h.x, h.y, h.x, h.y + 520, 140);
    pulls++;
    await sleep(700);
  } else await tap(page, `#${focus}`);
}
const running = await game(page, () => window.__game.session.running);
check('engine started by touch', running, `${pulls} pulls`);

// Mow: hold and drag up (walk forward with the throttle open) for 6 s.
const cov0 = await game(page, () => window.__game.session.field.coverage);
await dragAsync(540, 1750, 540, 1500, 6000);
const cov1 = await game(page, () => window.__game.session.field.coverage);
check('holding and dragging mows', cov1 > cov0 + 0.005, `coverage ${(cov0 * 100).toFixed(1)}% -> ${(cov1 * 100).toFixed(1)}%`);
shot('emu-mow-cut');

// A stone: stand 2.2 m from one, facing it, and walk slowly at it with the throttle open.
await game(page, () => {
  const g = window.__game;
  const s = g.session;
  const f = s.field;
  const clear = (st) => Math.min(...f.bushes.map((b) => Math.hypot(b.x - st.x, b.z - st.z)), 99);
  const st = [...f.stones].sort((a, b) => clear(b) - clear(a))[0];
  s.x = st.x;
  s.z = st.z + 2.2;
  g.lookYaw = Math.PI;
  s.line = s.gear.lineMax;
  s.broken = false;
  window.__stone = st;
});
await dragAsync(540, 1750, 540, 1690, 5000);
const st = await game(page, () => ({ ticks: window.__ticks, hits: window.__hits, marks: window.__game.view.stoneMarks.size }));
check('the line ticks near a stone (warning)', st.ticks > 0, `${st.ticks} ticks`);
check('a stone hit leaves the red "!"', st.hits === 0 || st.marks > 0, `${st.hits} hits, ${st.marks} marks`);
shot('emu-mow-stone');
check('app still running', alive());
browser.disconnect();
process.exit(allOk() ? 0 : 1);
