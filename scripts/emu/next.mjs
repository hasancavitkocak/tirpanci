// Emulator test 4: finish a job and go on with "Sonraki Bahçe" several times in a row, by touch (the
// interstitial ad closed with BACK if one shows), watching for a crash, the memory and the GPU objects.
import { adb, alive, allOk, check, connect, game, inJob, shot, sleep, tap } from './lib.mjs';

const ROUNDS = Number(process.argv[2] ?? 4);
let { browser, page } = await connect();
// Left on a call (an earlier run): take it.
if (await game(page, () => document.getElementById('call').classList.contains('show'))) {
  await tap(page, '#btn-call-ok');
  await page.waitFor(() => window.__game.mode === 'playing', 90000);
  await sleep(1500);
}
await inJob(page);
const focus = () => adb('shell', 'dumpsys', 'window').toString().match(/mFocusedApp=.*/)?.[0] ?? '';

for (let i = 0; i < ROUNDS; i++) {
  const from = await game(page, () => window.__game.level.id);
  // Mown enough to finish (as if mown), then FİNİŞ by touch.
  await game(page, () => {
    const s = window.__game.session;
    const f = s.field;
    if (s.driving) {
      f.vehicle.speed = 0;
      s.alight();
    }
    s.intro = null;
    s.hasTrimmer = true;
    f.mownCount = Math.ceil(f.total * 0.95);
    window.__game.save.mownAt = {};
  });
  const finishShown = await page.waitFor(() => document.getElementById('btn-finish').classList.contains('show'), 8000);
  check(`round ${i + 1}: finish button`, finishShown);
  await tap(page, '#btn-finish');
  check(`round ${i + 1}: result screen`, await page.waitFor(() => document.getElementById('result').classList.contains('show'), 8000));
  if (i === 0) shot('emu-next-result');
  await tap(page, '#btn-next');
  // An interstitial may cover the game (its own activity): BACK closes it.
  let ad = false;
  let adWait = true;
  for (let k = 0; k < 40; k++) {
    const f = focus();
    if (/AdActivity/i.test(f)) {
      if (!ad) adWait = await game(page, () => !document.getElementById('call').classList.contains('show')).catch(() => true);
      ad = true;
      if (k === 0 || k % 8 === 0) shot(`emu-next-ad-${i + 1}`);
      // BACK closes it (a tap on its X, where it stands upright, landed on the ad itself while the
      // screen was still sideways and opened the browser).
      adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
      await sleep(1500);
      continue;
    }
    if (await game(page, () => document.getElementById('call').classList.contains('show')).catch(() => false)) break;
    await sleep(500);
  }
  if (ad) check(`round ${i + 1}: the game waits behind the ad (no call under it)`, adWait);
  check(`round ${i + 1}: the next call comes${ad ? ' (after an ad)' : ''}`, await game(page, () => document.getElementById('call').classList.contains('show')));
  const t0 = Date.now();
  await tap(page, '#btn-call-ok');
  const loaded = await page.waitFor(() => window.__game.mode === 'playing', 90000);
  const ms = Date.now() - t0;
  await sleep(2000);
  const info = await game(page, () => ({
    id: window.__game.level.id,
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1,
    gpu: window.__game.view.renderer.info.memory,
    lost: window.__game.view.renderer.getContext().isContextLost(),
  }));
  check(`round ${i + 1}: job ${from} -> ${info.id} loaded`, loaded && info.id === from + 1 && !info.lost, `${ms} ms, heap ${info.heap} MB, gpu ${JSON.stringify(info.gpu)}`);
  check(`round ${i + 1}: app alive`, alive());
  shot(`emu-next-${info.id}`);
}
browser.disconnect();
process.exit(allOk() ? 0 : 1);
