// Dev: triangle count per kind of object in the first field (instanced counts included).
// Usage: node scripts/tri-budget.mjs [quality]
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';
const q = process.argv[2] ?? 'low';
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 412, height: 860 });
await p.goto(`http://localhost:5190/?quality=${q}`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
// First visit of the day: the daily reward pops up over the menu.
await p.evaluate(() => document.getElementById('daily')?.classList.remove('show'));
await p.click('#btn-play');
await new Promise((r) => setTimeout(r, 300));
await p.click('.level');
await p.click('#btn-call-ok');
await new Promise((r) => setTimeout(r, 1500));
console.log(q, await p.evaluate(() => {
  const v = window.__game.view;
  const out = {};
  const add = (k, n) => (out[k] = (out[k] ?? 0) + n);
  const tris = (o) => {
    const g = o.geometry;
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const inst = o.isInstancedMesh ? o.count : g.instanceCount ?? 1;
    return n * (Number.isFinite(inst) ? inst : 1);
  };
  v.grass.group.traverse((o) => o.isMesh && add('grass', tris(o)));
  v.world.group.children.forEach((c, i) => c.traverse((o) => o.isMesh && add(o.isInstancedMesh ? `inst#${i}` : `world#${i}:${o.material.type}`, tris(o))));
  v.worker.root.traverse((o) => o.isMesh && add('worker', tris(o)));
  v.worker.extras.traverse((o) => o.isMesh && add('trimmer', tris(o)));
  const top = Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}=${Math.round(n / 1000)}k`);
  return top.join(' ');
}));
await b.close();
