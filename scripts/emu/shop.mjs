// Emulator test 5: the shop from the yard by touch: DÜKKAN by the house (and that touch not landing on
// anything in the shop), the Köy tab's turning preview, picking a paint to see it, buying it (asked
// first), the pat pat repainted at once, the yard tab, and back to the job with the game's buttons.
import { alive, allOk, check, connect, game, inJob, shot, sleep, tap } from './lib.mjs';

const { browser, page } = await connect();
await inJob(page);
await game(page, () => {
  const g = window.__game;
  const s = g.session;
  if (s.driving) {
    s.field.vehicle.speed = 0;
    s.alight();
  }
  const h = s.field.house;
  s.x = h.x + 4;
  s.z = h.z + 2;
  g.save.money = 20000;
  g.save.paint = 'mavi';
  // (On the pat pat: the paints are for it; an earlier test may have left the tractor chosen.)
  g.save.vehicle = 'patpat';
  g.applyVehicle();
  g.save.decor = [];
});
check('DÜKKAN shows by the house', await page.waitFor(() => !!document.querySelector('[data-id="shop"]'), 8000));
await tap(page, '[data-id="shop"]');
check('the shop opens on the Köy tab, the job waits', await page.waitFor(() => document.getElementById('shop').classList.contains('show') && window.__game.mode === 'paused' && window.__game.shopTab === 'koy', 4000));
await sleep(1500);
const untouched = await game(page, () => ({ money: window.__game.save.money, paint: window.__game.save.paint, confirm: document.getElementById('confirm').classList.contains('show') }));
check('the opening touch did not press anything in the shop', untouched.money === 20000 && untouched.paint === 'mavi' && !untouched.confirm, JSON.stringify(untouched));
check('the preview is on screen', await game(page, () => {
  const c = document.querySelector('.shop-preview-canvas');
  return !!c && c.isConnected && c.clientHeight > 100;
}));
shot('emu-shop-open');

// Tap the yellow paint's card (not its button): the preview shows the pat pat in yellow.
const findYellow = () => game(page, () => {
  const cards = [...document.querySelectorAll('#shop-list .shop-card')];
  const i = cards.findIndex((c) => /Sarı/.test(c.textContent));
  cards.forEach((c, k) => (c.dataset.k = String(k)));
  return i >= 0 ? `#shop-list .shop-card[data-k="${i}"]` : null;
});
await tap(page, `${await findYellow()} b`);
check('tapping a card previews it', await page.waitFor(() => window.__game.koyLook.boya === 'sari', 3000));
await sleep(1200);
shot('emu-shop-preview-yellow');

// Buy it: asked first, then paid and on the pat pat.
await tap(page, `${await findYellow()} button.buy`);
check('asked before buying', await page.waitFor(() => document.getElementById('confirm').classList.contains('show'), 3000));
await tap(page, '#btn-confirm-yes');
const bought = await page.waitFor(() => window.__game.save.paint === 'sari', 3000);
const money = await game(page, () => window.__game.save.money);
check('bought: yellow, 2.500 TL paid', bought && money === 17500, `money ${money}`);
check('the pat pat out there repainted', await game(page, () => {
  const u = window.__game.view.world.patRig?.paintU;
  return !!u && u.uOn.value === 1 && Math.abs(u.uHue.value - 0.13) < 0.01;
}));

// The yard tab: a decoration in the preview.
await tap(page, '#shop-list .sub-tabs button:nth-child(2)');
check('the yard tab shows its preview', await page.waitFor(() => window.__game.koyPart === 'avlu' && !!document.querySelector('.shop-preview-canvas')?.isConnected, 3000));
await sleep(1200);
shot('emu-shop-yard');

// Back to the job.
await tap(page, '#btn-shop-close');
check('back to the job, its buttons there', await page.waitFor(() => window.__game.mode === 'playing' && document.getElementById('hud').classList.contains('show') && !!document.querySelector('[data-id]'), 4000));
await sleep(1500);
shot('emu-shop-back');
check('app still running', alive());
browser.disconnect();
process.exit(allOk() ? 0 : 1);
