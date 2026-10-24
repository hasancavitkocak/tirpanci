// Emulator test 2: driving up to a locked field (job 3, with job 2 locked before it) by touch:
// BÖLÜMÜ AÇ shows with both jobs' price; short of money it points to the store; with money it opens both.
import { alive, allOk, at, check, connect, dragAsync, game, inJob, shot, sleep, tap } from './lib.mjs';

const { browser, page } = await connect();
const W = (fn, t, ...a) => page.waitFor(fn, t, ...a);
await inJob(page);
check('in a job', (await game(page, () => window.__game.mode)) === 'playing');

// On the pat pat, 9 m in front of job 3's gate, facing it.
await game(page, () => {
  const g = window.__game;
  const s = g.session;
  const f = s.field;
  g.save.unlocked = 1;
  g.save.money = 100;
  const o = f.others.find((x) => x.level.id === 3);
  const v = f.vehicle;
  v.x = o.entryX;
  v.z = o.maxZ + 1.5 + 9;
  v.yaw = Math.PI;
  v.art = 0;
  v.speed = 0;
  if (!s.driving) {
    s.x = v.x + 1.4;
    s.z = v.z;
    s.board();
  }
});
await sleep(1000);
// Driven up to it: the stick pushed up on the right half.
const going = dragAsync(800, 1700, 800, 1520, 4000);
const seen = await W(() => !!document.querySelector('[data-id="unlock"]'), 6000);
await going;
check('BÖLÜMÜ AÇ shows driving up to the locked gate', seen);
const label = await game(page, () => document.querySelector('[data-id="unlock"]')?.textContent.trim());
check('it says both jobs and their price', /2 bölüm/.test(label ?? '') && /9\.000 TL/.test(label ?? ''), label);
shot('emu-unlock-gate');

// Short of money.
await tap(page, '[data-id="unlock"]');
check('short of money: the question comes', await W(() => document.getElementById('confirm').classList.contains('show'), 4000));
const shortText = await game(page, () => `${document.getElementById('confirm-text').textContent} | ${document.getElementById('btn-confirm-yes').textContent}`);
check('it offers the store', /eksik/.test(shortText) && /Mağaza/.test(shortText), shortText);
shot('emu-unlock-short');
await tap(page, '#btn-confirm-yes');
check('the store opens (the job waits)', await W(() => document.getElementById('store').classList.contains('show') && window.__game.mode === 'paused', 4000));
await tap(page, '#btn-store-close');
check('back to the job', await W(() => window.__game.mode === 'playing' && document.getElementById('hud').classList.contains('show'), 4000));

// With money.
await game(page, () => (window.__game.save.money = 50000));
await sleep(600);
check('button still there', await W(() => !!document.querySelector('[data-id="unlock"]'), 4000));
await tap(page, '[data-id="unlock"]');
check('the question comes', await W(() => document.getElementById('confirm').classList.contains('show'), 4000));
shot('emu-unlock-ask');
await tap(page, '#btn-confirm-yes');
const after = await W(() => window.__game.save.unlocked === 3, 4000);
const st = await game(page, () => ({ unlocked: window.__game.save.unlocked, money: window.__game.save.money }));
check('both jobs open', after, JSON.stringify(st));
check('paid 9.000 TL', st.money === 41000, `${50000 - st.money} TL`);
await sleep(800);
check('the button is gone (open now)', !(await game(page, () => document.querySelector('[data-id="unlock"]'))));
check('the padlock is off its gate', await game(page, () => window.__game.view.world.group.getObjectsByProperty('name', 'lock-3').every((o) => !o.visible)));
shot('emu-unlock-open');
check('app still running', alive());
browser.disconnect();
process.exit(allOk() ? 0 : 1);
