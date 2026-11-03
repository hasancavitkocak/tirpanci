// Dev: the follow camera with the worker behind the vehicle in the garage, with and without keeping it out of walls.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.argv[2] ?? 'camwall';
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/camwall-${Date.now()}` });
const p = await b.newPage();
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await p.goto('http://localhost:5173/?quality=low');
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
for (const job of [1, 15]) {
  await p.evaluate((job) => { const g = window.__game; Object.assign(g.save, { introDone: true, tutorialSeen: true, unlocked: 20, camera: 'follow' }); document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show')); g.start(g.levelById(job)); }, job);
  await p.waitForFunction('window.__game.mode === "playing"', { timeout: 60000 });
  await sleep(1200);
  if (await p.evaluate(() => window.__game.view.mode === 'fpv')) await p.click('#btn-cam');
  await sleep(600);
  for (const [name, dx, dz] of [['back', 0, -2.2], ['side', 1.6, 0]]) {
    for (const on of [false, true]) {
      const r = await p.evaluate((dx, dz, on) => {
        const g = window.__game, s = g.session, v = s.field.vehicle, w = g.view.world;
        w.__occ ??= [...w.occluders];
        w.occluders.length = 0; if (on) w.occluders.push(...w.__occ);
        const c = Math.cos(v.yaw), sn = Math.sin(v.yaw);
        s.x = v.x + dx * c + dz * sn; s.z = v.z - dx * sn + dz * c; s.yaw = v.yaw + Math.PI; g.lookYaw = s.yaw;
        return { mode: g.view.mode, occ: w.__occ.length };
      }, dx, dz, on);
      await sleep(1500);
      const ms = await p.evaluate(() => { const v = window.__game.view; const t = performance.now(); for (let i = 0; i < 100; i++) v.keepOutOfBuildings(v.camera.position.clone().set(window.__game.session.x, 1.5 + window.__game.session.field.height(window.__game.session.x, window.__game.session.z), window.__game.session.z)); return (performance.now() - t) / 100; });
      await p.screenshot({ path: `${out}-${job}-${name}-${on ? 'on' : 'off'}.png` });
      console.log(job, name, on ? 'on ' : 'off', JSON.stringify(r), `ray ${ms.toFixed(3)} ms`);
    }
  }
}
await b.close();
