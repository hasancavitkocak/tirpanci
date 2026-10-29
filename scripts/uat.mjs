// Dev: a player's afternoon, the way a user would play it, under one of seven conditions (a new player on a
// phone, a small phone half way, a wide Android with everything, a tablet, low quality in rain, fog with
// the tractor, a phone held upright): every screen and overlay of the menu, the job map's villages and
// notices and a job's card, a job started and left for the menu, a job mown and paid and the next one
// taken, Serbest gez and a job taken at a gate, back to the menu and out again, a garden still growing,
// the settings changed and seen in the game. After every step: the right screen up, nothing left over
// from the last one, and the screen's layout looked at (anything off the screen, buttons on top of each
// other, words too long for their box). Shots of every step, put together on sheets to look over.
// Usage (dev server running): node scripts/uat.mjs <1..7> [baseUrl]   Shots: test-output/uat/<condition>
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const CONDS = [
  { name: '1-yeni-oyuncu-telefon', w: 874, h: 402, fresh: true },
  { name: '2-kucuk-telefon-orta', w: 667, h: 375, save: { unlocked: 8, money: 20000 } },
  { name: '3-genis-android-hepsi', w: 915, h: 412, save: { unlocked: 20, money: 250000, vehicles: ['patpat', 'traktor', 'romork', 'patos'], decor: ['kulube', 'saksi', 'cardak'], dog: true }, owned: ['usta', 'sirt', 'testere', 'capa', 'ufleyici'] },
  { name: '4-tablet', w: 1180, h: 820, save: { unlocked: 12, money: 60000 } },
  { name: '5-dusuk-kalite-yagmur', w: 874, h: 402, save: { unlocked: 6, money: 8000, weather: 'rain', quality: 'low' }, quality: 'low' },
  { name: '6-sis-traktor', w: 874, h: 402, save: { unlocked: 14, money: 40000, weather: 'fog', vehicle: 'traktor', vehicles: ['patpat', 'traktor', 'romork'] } },
  { name: '7-dikey-telefon', w: 402, h: 874, save: { unlocked: 5, money: 5000 } },
];
const which = Number(process.argv[2] ?? 1);
const C = CONDS[which - 1];
const base = process.argv[3] ?? 'http://localhost:5173/';
const OUT = `test-output/uat/${C.name}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS, userDataDir: `${process.env.TEMP}/look-uat-${Date.now()}` });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
p.on('console', (m) => m.type() === 'error' && !/favicon|ERR_FILE_NOT_FOUND|net::/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 160)}`));
p.on('dialog', (d) => void d.accept());
await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
await p.setViewport({ width: C.w, height: C.h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
let bad = 0;
let total = 0;
let n = 0;
const ok = (c, t) => {
  total++;
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'FAIL'} ${t}`);
};
const ev = (f, ...a) => p.evaluate(f, ...a);
const shown = (id) => ev((id) => document.getElementById(id)?.classList.contains('show'), id);
const click = async (sel) => {
  const e = await p.$(sel);
  if (!e) return false;
  await e.evaluate((x) => x.click());
  await sleep(350);
  return true;
};
const mode = () => ev(() => window.__game.mode);

/** The screen's layout looked at: what is off the screen, on top of another button, or too long for its box. */
const audit = () =>
  ev(() => {
    const W = innerWidth;
    const H = innerHeight;
    const out = [];
    const seen = (e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) return false;
      for (let a = e; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
      }
      return true;
    };
    // (In a box that scrolls, being past its edge is how it scrolls: not looked at for that.)
    const scrolled = (e) => {
      for (let a = e.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) return true;
      }
      return false;
    };
    const name = (e) => (e.id ? `#${e.id}` : '') + (e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '') + ` "${(e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
    // Only the top layer: the card or screen over the rest when there is one (what is under it is not to be touched).
    const tops = [...document.querySelectorAll('.screen.dim.show, #confirm.show')];
    const root = tops.length ? tops[tops.length - 1] : document;
    const inTop = (e) => root === document || root.contains(e);
    const els = [...document.querySelectorAll('button, .btn, .action-btn, .corner-btn, .shop-card, h1, h2, #objective, .toast, .card')].filter((e) => seen(e) && inTop(e));
    for (const e of els) {
      const r = e.getBoundingClientRect();
      if (!scrolled(e) && (r.right > W + 2 || r.bottom > H + 2 || r.left < -2 || r.top < -2)) out.push(`off the screen: ${name(e)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
    const clickable = els.filter((e) => e.matches('button, .btn, .action-btn, .corner-btn'));
    for (let i = 0; i < clickable.length; i++) {
      for (let j = i + 1; j < clickable.length; j++) {
        const a = clickable[i];
        const c = clickable[j];
        if (a.contains(c) || c.contains(a)) continue;
        const ra = a.getBoundingClientRect();
        const rc = c.getBoundingClientRect();
        const w = Math.min(ra.right, rc.right) - Math.max(ra.left, rc.left);
        const h = Math.min(ra.bottom, rc.bottom) - Math.max(ra.top, rc.top);
        if (w <= 0 || h <= 0) continue;
        const small = Math.min(ra.width * ra.height, rc.width * rc.height);
        if ((w * h) / small > 0.25) out.push(`on top of each other: ${name(a)} / ${name(c)}`);
      }
    }
    for (const e of document.querySelectorAll('button, .btn, .action-btn b, .action-btn small, .corner-btn span, .hv-chip, .shop-card b, .shop-card .btn.buy, #objective, .toast')) {
      if (!seen(e) || !inTop(e)) continue;
      if (e.scrollWidth > e.clientWidth + 3 && getComputedStyle(e).overflow !== 'visible') out.push(`too long for its box: ${name(e)} (${e.scrollWidth} > ${e.clientWidth})`);
    }
    return [...new Set(out)];
  });
/** A shot of this step, its layout looked at. */
const step = async (label) => {
  await sleep(450);
  const f = `${String(++n).padStart(2, '0')}-${label}`;
  await p.screenshot({ path: `${OUT}/${f}.png` });
  const issues = await audit();
  ok(!issues.length, `${label}: layout${issues.length ? ' — ' + issues.slice(0, 4).join(' | ') : ''}`);
};
/** Nothing left over from a job on the menu: no HUD, not playing, only the menu up. */
const menuClean = async (why) => {
  const st = await ev(() => ({
    mode: window.__game.mode,
    playing: document.body.classList.contains('playing'),
    screens: [...document.querySelectorAll('.screen.show')].map((s) => s.id),
  }));
  ok(st.mode === 'menu' && !st.playing && st.screens.every((s) => s === 'menu' || s === 'daily' || s === 'harvest-offer'), `${why}: on the menu, nothing left over (${JSON.stringify(st)})`);
};
const playing = async (why) => {
  await p.waitForFunction('window.__game.mode === "playing" && !document.getElementById("loading").classList.contains("show")', { timeout: 90000 }).catch(() => {});
  await sleep(1500);
  const st = await ev(() => ({ mode: window.__game.mode, hud: document.getElementById('hud').classList.contains('show'), level: window.__game.session?.level?.id, roam: window.__game.roaming }));
  ok(st.mode === 'playing' && st.hud, `${why}: playing (${JSON.stringify(st)})`);
  return st;
};
const toMenu = async () => {
  // (Dismiss what pops up over the menu at the start: the daily reward, a card.)
  for (let k = 0; k < 3; k++) {
    if (await shown('daily')) await click('#btn-daily-take');
    if (await shown('harvest-offer')) await click('#btn-harvest-close');
    if (await shown('noads-offer')) await click('#btn-offer-later');
  }
};
const quit = async () => {
  if ((await mode()) === 'playing') {
    await click('#btn-pause');
    await sleep(300);
    await click('#btn-quit');
    await sleep(1200);
  }
  await toMenu();
};
const section = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    ok(false, `${name}: stopped — ${String(e.message).split('\n')[0]}`);
    await p.screenshot({ path: `${OUT}/HATA-${name.replace(/\W+/g, '_')}.png` }).catch(() => {});
    await ev(() => {
      const g = window.__game;
      if (g.mode === 'playing' || g.mode === 'paused') g.quitToMenu?.();
      g.showMenu?.();
    }).catch(() => {});
  }
};

console.log(`== ${C.name} (${C.w}×${C.h})`);
await p.goto(`${base}${C.quality ? `?quality=${C.quality}` : ''}`, { timeout: 120000 });
await p.waitForFunction('window.__ready === true', { timeout: 120000 });
await sleep(800);
if (!C.fresh)
  await ev(
    (s, owned) => {
      const g = window.__game;
      Object.assign(g.save, { introDone: true, tutorialSeen: true, harvestOffered: 99 }, s);
      for (const id of owned ?? []) if (!g.save.equipment.owned.includes(id)) g.save.equipment.owned.push(id);
      g.applyLook?.();
      g.showMenu();
    },
    C.save,
    C.owned,
  );
await sleep(800);

// ---- A. The menu and everything over it.
await section('A. Menü', async () => {
  await step('menu-acilis');
  await toMenu();
  await step('menu');
  ok((await mode()) === 'menu', 'the menu');
  for (const [btn, screen, close, label] of [
    ['#btn-tasks', 'tasks', '#btn-tasks-close', 'gorevler'],
    ['#btn-store', 'store', '#btn-store-close', 'magaza'],
    ['#btn-noads', 'noads-offer', '#btn-offer-later', 'reklamsiz'],
    ['#btn-settings', 'settings', '#btn-settings-close', 'ayarlar'],
  ]) {
    await click(btn);
    await sleep(500);
    ok(await shown(screen), `${label}: opens`);
    await step(label);
    await click(close);
    await sleep(400);
    ok(!(await shown(screen)), `${label}: closes`);
  }
  // The shop, every tab (the Köy tab both its parts).
  await click('#btn-shop');
  await sleep(500);
  ok(await shown('shop'), 'dukkan: opens');
  for (const tab of ['tirpan', 'misina', 'donanim', 'yukseltme', 'arac', 'koy']) {
    await ev((tab) => {
      const g = window.__game;
      g.shopTab = tab;
      g.koyPart = 'boya';
      g.openShop();
    }, tab);
    await step(`dukkan-${tab}`);
  }
  await ev(() => {
    const g = window.__game;
    g.koyPart = 'avlu';
    g.openShop();
  });
  await step('dukkan-koy-avlu');
  await click('#btn-shop-close');
  await sleep(400);
  ok(!(await shown('shop')), 'dukkan: closes');
  // The corner buttons there are (harvest, evening).
  for (const [btn, label] of [
    ['#btn-harvest', 'harman-karti'],
  ]) {
    const vis = await ev((b) => getComputedStyle(document.querySelector(b)).display !== 'none', btn);
    if (!vis) continue;
    await click(btn);
    await sleep(500);
    await step(label);
    await click('#btn-harvest-close');
  }
  await menuClean('after the menu\'s overlays');
});

// ---- B. The job map: villages, notices, a job's card; a job started and left for the menu.
await section('B. İş haritası ve işten menüye', async () => {
  await click('#btn-play');
  await sleep(700);
  ok(await shown('levels'), 'BAHÇEYE GİT: the map');
  await step('is-haritasi');
  for (const [tab, label] of [
    [1, 'yesilyamac'],
    [2, 'karadere'],
    [0, 'ilanlar'],
  ]) {
    await ev((tab) => {
      const g = window.__game;
      g.levelTab = tab;
      g.openLevels();
    }, tab);
    await sleep(600);
    await step(`harita-${label}`);
  }
  // The job in turn: its card, taken.
  await ev(() => {
    const g = window.__game;
    g.levelTab = 1;
    g.openLevels();
  });
  await sleep(500);
  const opened = await ev(() => {
    const node = document.querySelector('#level-list .saga-node.next, #level-list .saga-node.current, #level-list .saga-node:not(.locked)');
    if (!node) return false;
    node.click();
    return true;
  });
  await sleep(700);
  ok(opened && (await shown('call')), 'a job tapped: its card');
  await step('is-karti');
  await click('#btn-call-ok');
  await playing('BAŞLA');
  await step('iste-ilk-an');
  await click('#btn-pause');
  await sleep(500);
  ok(await shown('pause'), 'MOLA');
  await step('mola');
  await click('#btn-resume');
  await sleep(400);
  await click('#btn-map');
  await sleep(600);
  await step('oyun-ici-harita');
  await click('#btn-map-close');
  await sleep(400);
  await quit();
  await menuClean('a job left for the menu');
  await step('menuye-donus');
});

// ---- C. A job mown and paid, the next one taken.
await section('C. İş bitir, sıradaki iş', async () => {
  await click('#btn-play');
  await sleep(600);
  await ev(() => document.querySelector('#level-list .saga-node.next, #level-list .saga-node.current, #level-list .saga-node:not(.locked)')?.click());
  await sleep(600);
  await click('#btn-call-ok');
  const st = await playing('a job');
  // At the field with the trimmer, most of it mown (as a player would have by now).
  await ev(() => {
    const s = window.__game.session;
    s.intro = null;
    s.hasTrimmer = true;
    s.broken = false;
    s.line = s.gear.lineMax;
    s.x = 0;
    s.z = s.field.depth / 2 - 3;
    s.field.mownCount = Math.round(s.field.total * 0.96);
  });
  await sleep(1200);
  await step('bicilmis-bahce');
  const fin = await ev(() => document.getElementById('btn-finish').classList.contains('show'));
  ok(fin, 'ninety-odd per cent mown: İŞİ BİTİR offered');
  const m0 = await ev(() => window.__game.save.money);
  await click('#btn-finish');
  await sleep(1200);
  ok(await shown('result'), 'the result');
  await step('sonuc');
  ok((await ev(() => window.__game.save.money)) > m0, 'paid');
  const next = await ev(() => getComputedStyle(document.getElementById('btn-next')).display !== 'none');
  if (next) {
    await click('#btn-next');
    await sleep(700);
    // (The next job's owner calls first: its card, BAŞLA.)
    if (await shown('call')) {
      await step('siradaki-is-karti');
      await click('#btn-call-ok');
    }
    // In the same village it is driven to from here (on the way: travelTo); in the other, it loads.
    await p.waitForFunction((id) => window.__game.mode === 'playing' && (window.__game.travelTo || window.__game.session?.level?.id !== id), { timeout: 60000 }, st.level).catch(() => {});
    await playing('SIRADAKİ İŞ');
    const nx = await ev(() => ({ travel: window.__game.travelTo?.id ?? null, level: window.__game.session.level.id, obj: document.getElementById('objective').innerText.replace(/\s+/g, ' ') }));
    ok(nx.travel === st.level + 1 || nx.level === st.level + 1, `the next job: on the way to it, or there (${JSON.stringify(nx)})`);
    await step('siradaki-ise-yolda');
  }
  await quit();
  await menuClean('after the next job');
});

// ---- D. Serbest gez: walked to a garden's gate, its job taken there.
await section('D. Serbest gez, kapıda iş', async () => {
  await click('#btn-roam');
  // (Which village: the first.)
  await sleep(400);
  await ev(() => document.getElementById('confirm').classList.contains('show') && document.getElementById('btn-confirm-yes').click());
  const st = await playing('SERBEST GEZ');
  ok(st.roam, 'roaming');
  await step('serbest-gez');
  const at = await ev(() => {
    const g = window.__game;
    const s = g.session;
    const q = s.field.others.find((o) => o.level.id <= g.save.unlocked) ?? s.field.others[0];
    if (!q) return null;
    s.x = q.level.theme === 'mezarlik' ? (q.minX + q.maxX) / 2 : q.entryX;
    s.z = q.maxZ + 2.5;
    return q.level.id;
  });
  await sleep(800);
  const acts = await ev(() => [...document.querySelectorAll('#actions [data-id]')].map((x) => x.dataset.id));
  ok(at !== null && (acts.includes('switch') || acts.includes('unlock')), `at a garden's gate (${at}): ${acts.join(',')}`);
  await step('kapida');
  if (acts.includes('switch')) {
    // (The action buttons answer the finger going down, as on the phone.)
    await ev(() => document.querySelector('#actions [data-id="switch"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    // (The job loads: not the roaming one still there for a moment.)
    await p.waitForFunction((id) => window.__game.session?.level?.id === id && !window.__game.roaming, { timeout: 60000 }, at).catch(() => {});
    const st2 = await playing('BU İŞE GEÇ');
    ok(!st2.roam && st2.level === at, `the job taken at the gate (${st2.level})`);
    await step('kapidan-ise');
  }
  await quit();
  await menuClean('Serbest gez → job → menu');
});

// ---- E. Serbest gez left, then straight out to a job (no job taken while roaming).
await section('E. Serbest gezden menüye, sonra işe', async () => {
  await click('#btn-roam');
  // (Which village: the first.)
  await sleep(400);
  await ev(() => document.getElementById('confirm').classList.contains('show') && document.getElementById('btn-confirm-yes').click());
  await playing('SERBEST GEZ again');
  await ev(() => {
    const s = window.__game.session;
    s.x += 6;
  });
  await sleep(600);
  await quit();
  await menuClean('Serbest gez left without a job');
  await click('#btn-play');
  await sleep(600);
  await ev(() => document.querySelector('#level-list .saga-node.next, #level-list .saga-node.current, #level-list .saga-node:not(.locked)')?.click());
  await sleep(600);
  await click('#btn-call-ok');
  const st = await playing('then a job');
  ok(!st.roam, 'a job, not roaming');
  const obj = await ev(() => document.getElementById('objective').innerText.replace(/\s+/g, ' '));
  ok(obj.length > 3, `its objective: ${obj}`);
  await step('gezden-sonra-is');
  await quit();
  await menuClean('and back');
});

// ---- F. A garden still growing: its card, not started.
await section('F. Büyüyen bahçe', async () => {
  const id = await ev(() => {
    const g = window.__game;
    (g.save.mownAt ??= {})[1] = Date.now();
    return 1;
  });
  await click('#btn-play');
  await sleep(600);
  await ev(() => {
    const g = window.__game;
    g.levelTab = 1;
    g.openLevels();
  });
  await sleep(500);
  await ev((id) => {
    const nodes = [...document.querySelectorAll('#level-list .saga-node')];
    const node = nodes.find((x) => x.querySelector('.sn-disc b')?.textContent.trim() === String(id));
    node?.click();
  }, id);
  await sleep(700);
  const st = await ev(() => ({ regrow: document.getElementById('regrow').classList.contains('show'), call: document.getElementById('call').classList.contains('show'), mode: window.__game.mode }));
  ok(st.regrow || st.call, `a garden mown just now: ${JSON.stringify(st)}`);
  await step('buyuyen-bahce');
  if (st.regrow) await click('#btn-regrow-other');
  if (st.call) await click('#btn-call-no');
  await sleep(400);
  await ev(() => document.querySelectorAll('.screen.dim.show').forEach((x) => x.classList.remove('show')));
  await ev(() => window.__game.showMenu());
  await sleep(400);
  await menuClean('after the growing garden');
});

// ---- G. The settings changed, seen in the game.
await section('G. Ayarlar oyunda', async () => {
  await click('#btn-settings');
  await sleep(400);
  const before = await ev(() => ({ q: window.__game.save.quality ?? 'auto', w: window.__game.save.weather ?? 'auto' }));
  await ev(() => {
    document.querySelector('#set-quality button[data-q="medium"]')?.click();
    document.querySelector('#set-weather button[data-w="fog"]')?.click();
  });
  await sleep(400);
  await step('ayarlar-degisti');
  await click('#btn-settings-close');
  await sleep(400);
  const after = await ev(() => ({ q: window.__game.save.quality, w: window.__game.save.weather }));
  ok(after.q === 'medium' && after.w === 'fog', `chosen and kept: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  await click('#btn-play');
  await sleep(600);
  await ev(() => document.querySelector('#level-list .saga-node.next, #level-list .saga-node.current, #level-list .saga-node:not(.locked)')?.click());
  await sleep(600);
  await click('#btn-call-ok');
  await playing('a job in fog');
  const w = await ev(() => window.__game.session.level.weather);
  ok(w === 'fog', `the job's weather is the one chosen: ${w}`);
  await step('siste-is');
  await quit();
  // (Back as they were.)
  await ev((b) => {
    const g = window.__game;
    g.save.quality = b.q;
    g.save.weather = b.w;
  }, before);
  await menuClean('after the settings');
});

ok(!errors.length, `no errors in the page${errors.length ? ': ' + [...new Set(errors)].slice(0, 4).join(' | ') : ''}`);
// The shots on sheets of six, to look over.
const files = readdirSync(OUT).filter((f) => /^\d\d-.*\.png$/.test(f) || /^HATA/.test(f)).sort();
const sheet = await b.newPage();
for (let i = 0; i < files.length; i += 6) {
  const part = files.slice(i, i + 6);
  const imgs = part.map((f) => `data:image/png;base64,${readFileSync(`${OUT}/${f}`).toString('base64')}`);
  const cw = C.w > C.h ? 640 : 300;
  const ch = Math.round((cw * C.h) / C.w);
  await sheet.setViewport({ width: cw * 3 + 8, height: (ch + 22) * 2 + 4 });
  await sheet.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(3,${cw}px);gap:2px;font:12px sans-serif;color:#fff">${imgs.map((src, k) => `<div><div style="height:18px;padding:2px 4px">${part[k]}</div><img src="${src}" style="width:${cw}px;height:${ch}px;display:block"></div>`).join('')}</body>`);
  await sleep(300);
  await sheet.screenshot({ path: `${OUT}/SAYFA-${String(i / 6 + 1).padStart(2, '0')}.png` });
}
console.log(bad ? `\n${C.name}: ${bad} FAIL of ${total}` : `\n${C.name}: all OK (${total})`);
await b.close();
process.exit(bad ? 1 : 0);
