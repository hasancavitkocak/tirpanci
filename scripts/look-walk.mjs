// Dev: follow camera, easy controls, walking towards the camera / sideways with the throttle on.
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const p = await b.newPage();
await p.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5190/?quality=low');
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// First visit of the day: the daily reward pops up over the menu.
await p.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await p.evaluate(() => {
  window.__game.save.camera = 'follow';
  window.__game.save.controls = 'easy';
  window.__game.applyControls();
});
await p.click('#btn-play');
await sleep(300);
await p.click('.level');
await p.click('#btn-call-ok');
await p.waitForFunction('window.__game.mode === "playing"');
await p.evaluate(() => {
  const s = window.__game.session;
  for (let i = 0; i < 3; i++) s.starter.prime();
  s.temp = 0.3;
  s.pull(1);
  s.x = -5;
  s.z = -6;
});
await sleep(800);
for (const [name, key] of [['walk-down', 'KeyS'], ['walk-right', 'KeyD'], ['walk-up', 'KeyW']]) {
  await p.keyboard.down('Space');
  await p.keyboard.down(key);
  await sleep(1500);
  const samples = [];
  for (let k = 0; k < 1; k++) {
    await sleep(170);
    samples.push(await p.evaluate(() => {
      const w = window.__game.view.worker;
      const V = w.root.position.constructor;
      const loc = (o) => { const p = w.root.worldToLocal(o.getWorldPosition(new V())); return [p.x, p.y, p.z].map((n) => n.toFixed(2)).join(','); };
      const before = loc(w.ik[0].hand);
      w.ik[0].solve(w.trimmer.gripNegX.getWorldPosition(new V()), new V(0, -1, 0));
      const after = loc(w.ik[0].hand);
      const reach = w.ik[0].upper.getWorldPosition(new V()).distanceTo(w.ik[0].lower.getWorldPosition(new V())) + w.ik[0].lower.getWorldPosition(new V()).distanceTo(w.ik[0].hand.getWorldPosition(new V()));
      const ex = w.trimmer.exhaust;
      return 'exhaust ' + loc(ex) + ' handToGrip ' + w.ik.map((ik, i) => (i === 0 ? w.trimmer.gripNegX : w.trimmer.gripPosX).getWorldPosition(new V()).distanceTo(ik.hand.getWorldPosition(new V())).toFixed(2)).join('/') + ' grip ' + loc(w.trimmer.gripNegX) + ' shoulder ' + loc(w.ik[0].upper) + ' hand ' + loc(w.ik[0].hand) + ' pitch ' + w.trimmer.barMount.rotation.x.toFixed(2);
    }));
  }
  console.log(name, 'hand-grip R/L over time', samples.join(' '));
  const st = await p.evaluate(() => {
    const s = window.__game.session;
    const w = window.__game.view.worker;
    const V = w.root.position.constructor;
    const g = w.trimmer.gripNegX.getWorldPosition(new V());
    const h = w.ik[0]?.hand.getWorldPosition(new V());
    return { yaw: s.yaw.toFixed(2), head: [s.headX - s.x, s.headZ - s.z].map((n) => n.toFixed(2)), gripToHand: h ? g.distanceTo(h).toFixed(2) : null };
  });
  console.log(name, JSON.stringify(st));
  await p.screenshot({ path: `test-output/${name}.png` });
  await p.keyboard.up(key);
  await p.keyboard.up('Space');
}
await b.close();
