// Dev: the vehicle's bagaj and the rest the TestFlight found. By the vehicle BAGAJ opens the tools owned
// (trimmer, chainsaw, blower, tiller): one taken (the one in hand put back), and a tool with an engine
// comes with its starter (choke and cord), then its gas trigger. The chainsaw is never in hand by itself;
// the blower goes back in the bagaj. A job asks for burning or tilling only of a player who owns the tool
// (else a note says what it would bring; the shop card too). Karabaş rides inside the pat pat's box, on
// a lone tractor's crate (small and big tractor) and in the trailer. Karadere's arch is smaller, and the
// big tractor still goes through it.
// Usage (dev server running): node scripts/look-bag.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'test-output/bag';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-bag-${Date.now()}` });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: 874, height: 402, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
let bad = 0;
const ok = (c, t) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const ALL = ['standart', 'yuvarlak', 'testere', 'ufleyici', 'capa'];

await p.goto(`${base}?quality=high`, { timeout: 120000 });
await p.waitForFunction('window.__ready === true', { timeout: 120000 });

/** A job begun with the save as given; the worker on foot by the vehicle, the trimmer in hand. */
const job = async (id, save) => {
  await p.evaluate(
    (id, save) => {
      const g = window.__game;
      if (g.mode === 'playing') g.quitToMenu();
      Object.assign(g.save, { introDone: true, tutorialSeen: true, lookSeen: true, harvestOffered: 99, unlocked: 20, weather: 'sunny', dog: true, decor: ['kulube'], vehicle: 'patpat', vehicles: ['patpat', 'traktor', 'buyuk', 'romork'], trailerOff: true, patosOn: false }, save);
      g.save.equipment = { ...g.save.equipment, owned: save.owned ?? ['standart', 'yuvarlak'] };
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
      g.start(g.levelById(id));
    },
    id,
    save,
  );
  await p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 90000 });
  await sleep(1200);
  await p.evaluate(() => {
    const s = window.__game.session;
    s.intro = null;
    s.hasTrimmer = true;
    const v = s.field.vehicle;
    s.x = v.x + Math.cos(v.yaw) * 1.6;
    s.z = v.z - Math.sin(v.yaw) * 1.6;
  });
  await sleep(500);
};
const acts = () => p.evaluate(() => [...document.querySelectorAll('#actions .action-btn')].map((a) => a.dataset.id));
const tap = (id) =>
  p.evaluate((id) => {
    const el = document.querySelector(`#actions [data-id="${id}"]`);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    return true;
  }, id);
const bag = () =>
  p.evaluate(() => ({
    open: document.getElementById('confirm').classList.contains('show'),
    tools: [...document.querySelectorAll('#confirm .bag-tool')].map((t) => ({ id: t.dataset.tool, held: t.classList.contains('held'), off: t.disabled, text: t.querySelector('small').textContent, pic: !!t.querySelector('img.ok') })),
  }));
const pick = async (tool) => {
  await tap('bag');
  await sleep(300);
  const r = await p.evaluate((tool) => {
    const t = document.querySelector(`#confirm .bag-tool[data-tool="${tool}"]`);
    if (!t || t.disabled) return false;
    t.click();
    return true;
  }, tool);
  await sleep(500);
  return r;
};
const hands = () =>
  p.evaluate(() => {
    const g = window.__game;
    const s = g.session;
    const gas = document.getElementById('gas-btn');
    return {
      trimmer: s.hasTrimmer,
      saw: g.view.sawInHand,
      blower: g.view.blowerInHand,
      tiller: g.view.tillerInHand,
      starter: document.body.classList.contains('saw-start') && document.body.classList.contains('engine-off'),
      gas: !!gas && gas.getClientRects().length > 0,
      bagOpen: document.getElementById('confirm').classList.contains('show'),
    };
  });

// ---- A. Karadere, every tool owned: a storm's tree, tilling, burning, and the bagaj.
await job(15, { owned: ALL });
const tasks = await p.evaluate(() => ({ tree: !!window.__game.woodTree, till: !!window.__game.tillTask, burn: !!window.__game.burnTask }));
ok(tasks.tree && tasks.till && tasks.burn, `job 15 with every tool: a tree, tilling and burning (${JSON.stringify(tasks)})`);
let h = await hands();
ok(h.trimmer && !h.saw, `on foot with the trimmer: no chainsaw in hand by itself (${JSON.stringify(h)})`);
ok((await acts()).includes('bag'), `by the vehicle: BAGAJ (${await acts()})`);
ok(!(await acts()).some((a) => ['tiller', 'tiller-off', 'blower', 'blower-off'].includes(a)), 'no separate ÇAPAYI/ÜFLEYİCİYİ AL buttons');
await tap('bag');
await sleep(400);
let bg = await bag();
ok(bg.open && bg.tools.map((t) => t.id).join() === 'trimmer,saw,blower,tiller', `BAGAJ opens: four tools (${bg.tools.map((t) => t.id)})`);
ok(bg.tools.every((t) => t.pic), `each with its picture (${bg.tools.map((t) => `${t.id}:${t.pic}`)})`);
ok(bg.tools.find((t) => t.id === 'trimmer').held, 'the trimmer marked as in hand');
await shot('1-bagaj');
await p.evaluate(() => document.getElementById('btn-confirm-yes').click());
await sleep(300);

// The chainsaw out of the bagaj: in hand, its starter; started, its trigger cuts.
ok(await pick('saw'), 'Motorlu Testere picked');
h = await hands();
ok(h.saw && !h.trimmer && !h.bagOpen, `the chainsaw in hand, the trimmer back in the bagaj, the bagaj shut (${JSON.stringify(h)})`);
ok(h.starter, 'its starter shown: choke and cord');
await shot('2-testere-elde');
const started = await p.evaluate(async () => {
  const g = window.__game;
  const st = g.toolStarter;
  st.setChoke(true);
  g.pullSaw(1);
  g.pullSaw(1);
  st.setChoke(false);
  g.pullSaw(1);
  g.updateStarterUi();
  await new Promise((r) => setTimeout(r, 400));
  return g.sawRunning;
});
ok(started, 'choke, two pulls, choke off, a pull: it runs');
h = await hands();
ok(h.gas && !h.starter, `running: the gas trigger, the starter gone (${JSON.stringify(h)})`);
const revs = await p.evaluate(async () => {
  const g = window.__game;
  g.input.setGas(1);
  await new Promise((r) => setTimeout(r, 400));
  const v = g.view.sawing;
  g.input.setGas(0);
  return v;
});
ok(revs > 0.5, `the trigger revs it (${revs.toFixed(2)})`);
await shot('3-testere-calisiyor');

// The blower: taken (the chainsaw put back), carried off, back to the vehicle and put away.
ok(await pick('blower'), 'Üfleme Makinesi picked');
h = await hands();
ok(h.blower && !h.saw && h.starter, `the blower on, the chainsaw back, its starter (${JSON.stringify(h)})`);
await p.evaluate(() => {
  const s = window.__game.session;
  s.x = 0;
  s.z = 0;
});
await sleep(500);
ok(!(await acts()).includes('bag'), `away from the vehicle: no BAGAJ (${await acts()})`);
h = await hands();
ok(h.blower, 'the blower still on his back out in the garden');
await p.evaluate(() => {
  const s = window.__game.session;
  const v = s.field.vehicle;
  s.x = v.x + Math.cos(v.yaw) * 1.6;
  s.z = v.z - Math.sin(v.yaw) * 1.6;
});
await sleep(500);
await tap('bag');
await sleep(300);
bg = await bag();
ok(bg.tools.find((t) => t.id === 'blower').held, 'back at the vehicle: the blower marked in hand');
await p.evaluate(() => document.querySelector('#confirm .bag-tool[data-tool="blower"]').click());
await sleep(400);
h = await hands();
ok(!h.blower && !h.trimmer && !h.saw && !h.tiller, `tapped again: the blower put back, hands empty (${JSON.stringify(h)})`);
ok(await pick('tiller'), 'Motor Çapa picked');
h = await hands();
ok(h.tiller && h.starter, `the tiller out, its starter (${JSON.stringify(h)})`);
ok(await pick('trimmer'), 'the trimmer picked again');
h = await hands();
ok(h.trimmer && !h.tiller, `the trimmer in hand, the tiller back (${JSON.stringify(h)})`);
// The chainsaw taken, then driving: it goes back in.
await pick('saw');
await p.evaluate(() => window.__game.session.board());
await sleep(500);
h = await hands();
ok(!h.saw, 'boarding with the chainsaw: back in the bagaj');
await p.evaluate(() => window.__game.session.alight());
await sleep(500);

// ---- B. Without the blower and the tiller: the job never asks for them; a note says what they would bring.
await job(15, { owned: ['standart', 'yuvarlak'] });
const none = await p.evaluate(() => ({ till: !!window.__game.tillTask, burn: !!window.__game.burnTask }));
ok(!none.till && !none.burn, `no tools: no tilling, no burning asked (${JSON.stringify(none)})`);
ok(!(await acts()).includes('bag'), 'only the trimmer: no BAGAJ (TIRPANI AL/BIRAK as before)');
const note = await p.evaluate(async () => {
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    document.querySelectorAll('.toast, #toast, .toasts > *').forEach((e) => seen.push(e.textContent));
    if (seen.some((x) => x.includes('ⓘ'))) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  return seen.find((x) => x.includes('ⓘ')) ?? '';
});
ok(/Dükkân › Donanım/.test(note), `a note: what the tool would bring (${note.slice(0, 110)})`);
const job1 = await p.evaluate(() => [...document.querySelectorAll('.toast, #toast, .toasts > *')].map((e) => e.textContent).join(' | '));
ok(!/Dükkân › Donanım\)/.test(job1), 'the job line itself sends nobody to the shop');
const info = await p.evaluate(async () => {
  const g = window.__game;
  g.shopTab = 'donanim';
  g.shopNote = null;
  g.openShop();
  await new Promise((r) => setTimeout(r, 400));
  return [...document.querySelectorAll('.shop-card')].filter((c) => c.querySelector('.tool-info')).map((c) => c.querySelector('b').textContent);
});
ok(['Motorlu Testere', 'Üfleme Makinesi', 'Motor Çapa'].every((n) => info.includes(n)), `shop: each tool not owned says what it brings (${info})`);
await shot('4-dukkan-bilgi');
await p.evaluate(() => window.__game.closeShop?.() ?? document.getElementById('btn-shop-close')?.click());
await sleep(300);

// ---- C. Karabaş riding: inside the pat pat's box; on the crate of a lone small and big tractor; in the trailer.
const ride = async (vehicle, trailerOff, name) => {
  await job(18, { vehicle, trailerOff, owned: ['standart', 'yuvarlak'] });
  await p.evaluate(() => {
    const s = window.__game.session;
    const v = s.field.vehicle;
    v.x = 0;
    v.z = 0;
    v.yaw = 0;
    s.x = 1.6;
    s.z = 0;
    s.board();
  });
  await sleep(1800);
  const r = await p.evaluate(() => {
    const g = window.__game;
    const d = g.view.dog;
    const seat = g.view.world.dogSeat();
    const V = d.root.position.constructor;
    const w = d.root.getWorldPosition(new V());
    const local = seat ? seat.on.worldToLocal(w.clone()) : null;
    return { riding: d.root.parent !== g.view.scene, seat: !!seat, local: local && [local.x, local.y, local.z].map((n) => +n.toFixed(2)), yaw: seat?.yaw };
  });
  // From the side and above.
  await p.evaluate(() => {
    const g = window.__game;
    const f = g.session.field;
    const o = document.getElementById('objective');
    if (o) o.style.visibility = 'hidden';
    g.view.freeCam = { x: 3.4, y: f.height(3.4, -1.6) + 2.6, z: -1.6, yaw: -Math.PI / 2 - 0.3, pitch: -0.5 };
  });
  await sleep(900);
  await shot(`5-kopek-${name}`);
  await p.evaluate(() => (window.__game.view.freeCam = null));
  return r;
};
let r = await ride('patpat', true, 'patpat');
ok(r.riding && r.local && Math.abs(r.local[0]) < 0.1 && r.local[2] > -0.8 && r.local[2] < -0.55, `pat pat: in the box's middle, all of him inside it (${JSON.stringify(r)})`);
r = await ride('traktor', true, 'traktor');
ok(r.riding && r.seat && r.yaw !== undefined, `lone small tractor: on its crate (${JSON.stringify(r)})`);
r = await ride('buyuk', true, 'buyuk');
ok(r.riding && r.seat, `lone big tractor: on its crate (${JSON.stringify(r)})`);
r = await ride('traktor', false, 'romork');
ok(r.riding && r.seat, `tractor and trailer: in the trailer (${JSON.stringify(r)})`);
const off = await p.evaluate(async () => {
  const g = window.__game;
  g.session.alight();
  await new Promise((r) => setTimeout(r, 800));
  const d = g.view.dog;
  return { back: d.root.parent === g.view.scene, gap: Math.hypot(d.x - g.session.x, d.z - g.session.z) };
});
ok(off.back && off.gap < 5, `getting off: Karabaş jumps down beside him (${off.gap.toFixed(1)} m)`);

// ---- D. Karadere's arch: smaller, and the big tractor goes through it.
await job(11, { vehicle: 'buyuk', trailerOff: true });
const arch = await p.evaluate(() => {
  const g = window.__game;
  const f = g.session.field;
  const a = f.archAt;
  if (!a) return null;
  const v = f.vehicle;
  v.x = a.x - Math.sin(a.yaw) * 8;
  v.z = a.z - Math.cos(a.yaw) * 8;
  v.yaw = a.yaw;
  const fits = [-6, -3, 0, 3, 6].every((d) => f.vehicleFits(a.x + Math.sin(a.yaw) * d, a.z + Math.cos(a.yaw) * d, a.yaw));
  let box = null;
  g.view.scene.traverse((o) => {
    if (!box && o.name === 'arch') box = o;
  });
  return { a, fits };
});
ok(!!arch, 'Karadere has its arch');
ok(arch?.fits, 'the big tractor fits through it along the road');
if (arch) {
  await p.evaluate((a) => {
    const g = window.__game;
    const f = g.session.field;
    const s = g.session;
    s.x = f.vehicle.x + 1.6;
    s.z = f.vehicle.z;
    s.board();
    const cx = a.x - Math.sin(a.yaw) * 14 + Math.cos(a.yaw) * 4;
    const cz = a.z - Math.cos(a.yaw) * 14 - Math.sin(a.yaw) * 4;
    const d = { x: a.x - cx, z: a.z - cz };
    g.view.freeCam = { x: cx, y: f.height(cx, cz) + 2.2, z: cz, yaw: Math.atan2(d.x, d.z), pitch: 0.02 };
  }, arch.a);
  await sleep(1200);
  await shot('6-kemer');
}

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(bad ? `\n${bad} FAIL` : '\nall OK');
await b.close();
process.exit(bad ? 1 : 0);
