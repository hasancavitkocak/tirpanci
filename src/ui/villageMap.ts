import { makeRng } from '../game/rng';
import { Pt, REGIONS, Region, fieldRect, regionLevels, streamX, village } from '../game/village';

/**
 * The village map (the HARİTA button), drawn like a hand-coloured survey, turned to fit a phone held
 * sideways (the village is long north to south): north to the right, west up; the hill shaded
 * from the west, trees, the stream, the tracks (brown, edged) and the cobbled road (grey); every field
 * with its rows and a label; this job's field glowing with a pin; the fields not yet open greyed with a
 * padlock; the buildings; where the worker (arrow) and the pat pat are.
 */
export interface MapState {
  /** This job's level id, and the village (region) it is in. */
  current: number;
  region: number;
  /** The highest level id the player may take on. */
  unlockedUpTo: number;
  /** Per level: how long until it has grown back ("2 sa 15 dk"), null when ready. */
  waiting: Record<number, string | null>;
  /** Drawn without the labels (the plan the painted map is made from). */
  plain?: boolean;
  /** The worker and the pat pat, village coordinates; the worker's heading. */
  worker: Pt & { yaw: number };
  patpat: Pt;
}

/** A village's part shown where the plain one would cut its fields (Karadere: Taşlı Yamaç at its north end, the far row at its west). */
const VIEWS: Record<number, { minX: number; maxX: number; minZ: number; maxZ: number }> = { 2: { minX: -116, maxX: 52, minZ: -194, maxZ: 100 } };

/** The part of the village shown. */
function viewOf(r: Region): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return VIEWS[r.id] ?? { minX: r.map.minX + 12, maxX: 52, minZ: r.map.minZ + 8, maxZ: r.map.maxZ - 8 };
}

/**
 * Village to map: `pt(x, z)` a point on the canvas (north, -z, to the right; east, +x, down), `box` a
 * rectangle's corner and size, `at(sx, sy)` back from the canvas to the village; k pixels a metre.
 */
interface Frame {
  k: number;
  pt: (x: number, z: number) => { x: number; y: number };
  box: (r: { minX: number; maxX: number; minZ: number; maxZ: number }) => { x: number; y: number; w: number; h: number };
  at: (sx: number, sy: number) => { x: number; z: number };
}

function frameFor(cw: number, ch: number, VIEW: ReturnType<typeof viewOf>): Frame {
  const k = Math.min(cw / (VIEW.maxZ - VIEW.minZ), ch / (VIEW.maxX - VIEW.minX));
  const ox = (cw - (VIEW.maxZ - VIEW.minZ) * k) / 2;
  const oy = (ch - (VIEW.maxX - VIEW.minX) * k) / 2;
  return {
    k,
    pt: (x, z) => ({ x: ox + (VIEW.maxZ - z) * k, y: oy + (x - VIEW.minX) * k }),
    box: (r) => ({ x: ox + (VIEW.maxZ - r.maxZ) * k, y: oy + (r.minX - VIEW.minX) * k, w: (r.maxZ - r.minZ) * k, h: (r.maxX - r.minX) * k }),
    at: (sx, sy) => ({ x: VIEW.minX + (sy - oy) / k, z: VIEW.maxZ - (sx - ox) / k }),
  };
}

/** The static layer (everything but the markers), kept while the size and the state stay the same. */
let cache: { key: string; canvas: HTMLCanvasElement } | null = null;

/**
 * The artist's painting of a village from above (public/harita/koy<region>-ust.webp): made from its plan
 * (this map drawn plain: scripts/village-plan.mjs), so its roads, stream, fields and buildings are where
 * the game's are. It is laid exactly over the part of the village shown; the labels and the markers go
 * on it. `true`: there is one for the village.
 */
const ART: Record<number, boolean> = { 1: true, 2: true };
const artImg: Record<number, HTMLImageElement | 'failed'> = {};
/** Every village's painting, loaded and decoded (awaited with the game's first load: the map opens on it at once). */
export async function preloadVillageArt(): Promise<void> {
  await Promise.all(
    Object.keys(ART).map(async (r) => {
      artFor(Number(r));
      const im = artImg[Number(r)];
      if (im && im !== 'failed') await im.decode().catch(() => {});
    }),
  );
}

function artFor(region: number): HTMLImageElement | null {
  if (!ART[region]) return null;
  let im = artImg[region];
  if (!im) {
    const img = new Image();
    img.onload = () => (cache = null);
    img.onerror = () => (artImg[region] = 'failed');
    img.src = `./harita/koy${region}-ust.webp`;
    artImg[region] = im = img;
  }
  return im !== 'failed' && im.complete && im.naturalWidth ? im : null;
}

function staticLayer(cw: number, ch: number, dpr: number, st: MapState): HTMLCanvasElement {
  const R = REGIONS.find((r) => r.id === st.region) ?? REGIONS[0];
  const VIEW = viewOf(R);
  const ground = R.ground;
  const art = artFor(st.region);
  const key = `${cw}x${ch}@${dpr}:${st.region}:${st.current}:${st.unlockedUpTo}:${JSON.stringify(st.waiting)}:${!!art}:${!!st.plain}`;
  if (cache?.key === key) return cache.canvas;
  const c = document.createElement('canvas');
  c.width = Math.round(cw * dpr);
  c.height = Math.round(ch * dpr);
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { k, pt, box, at } = frameFor(cw, ch, VIEW);
  const rnd = makeRng(77);

  if (art) {
    // The painting from above, exactly over the village's part shown (its plan was drawn in this frame).
    const v = box(VIEW);
    g.drawImage(art, v.x, v.y, v.w, v.h);
  } else if (ART[st.region] && !st.plain) {
    // (A village with a painting never shows the drawn map; the picture is loaded before the game starts.)
    g.fillStyle = '#a9cf6a';
    g.fillRect(0, 0, cw, ch);
  } else {
  // The land: meadow green, the hill shaded (lit from the north-west), paler as it rises.
  g.fillStyle = '#9fbf6e';
  g.fillRect(0, 0, cw, ch);
  const cell = 4;
  for (let sy = 0; sy < ch; sy += cell) {
    for (let sx = 0; sx < cw; sx += cell) {
      const { x, z } = at(sx + cell / 2, sy + cell / 2);
      const h = ground(x, z);
      const gx = ground(x + 1, z) - h;
      const gz = ground(x, z + 1) - h;
      const light = Math.max(-1, Math.min(1, (-gx * 0.7 - gz * 0.7) * 3));
      const up = Math.min(1, Math.max(0, h / 50));
      g.fillStyle = light > 0 ? `rgba(255, 252, 225, ${0.12 * light + up * 0.18})` : `rgba(30, 60, 20, ${-0.18 * light})`;
      g.fillRect(sx, sy, cell, cell);
    }
  }
  // Contour lines every 5 m of height.
  g.strokeStyle = 'rgba(70, 90, 40, 0.18)';
  g.lineWidth = 1;
  for (let sy = 0; sy < ch; sy += 2) {
    for (let sx = 0; sx < cw; sx += 2) {
      const { x, z } = at(sx, sy);
      const a = Math.floor(ground(x, z) / 5);
      const b = Math.floor(ground(x + 2 / k, z) / 5);
      const d = Math.floor(ground(x, z + 2 / k) / 5);
      if (a !== b || a !== d) g.fillRect(sx, sy, 1, 1);
    }
  }

  // The stream: banks, water, a light middle.
  const streamPath = () => {
    g.beginPath();
    for (let z = VIEW.minZ; z <= VIEW.maxZ; z += 2) {
      const q = pt(streamX(z, R), z);
      (z === VIEW.minZ ? g.moveTo : g.lineTo).call(g, q.x, q.y);
    }
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  streamPath();
  g.strokeStyle = '#6b8f4e';
  g.lineWidth = Math.max(5, 5 * k);
  g.stroke();
  streamPath();
  g.strokeStyle = '#3f86c4';
  g.lineWidth = Math.max(3, 3 * k);
  g.stroke();
  streamPath();
  g.strokeStyle = 'rgba(190, 225, 250, 0.7)';
  g.lineWidth = 1;
  g.stroke();
  }

  const fields = regionLevels(R).map((lv) => ({ lv, r: fieldRect(lv) }));
  const roads = village(R).roads;
  const nearRoad = (x: number, z: number, d: number) => roads.some((r) => r.pts.some((p) => Math.abs(p.x - x) < d && Math.abs(p.z - z) < d));
  const { x: mx, y: my } = pt(R.mosque.x, R.mosque.z);
  // (On the painting all this is painted already: only the labels go on it.)
  drawn: {
  if (art || (ART[st.region] && !st.plain)) break drawn;
  // Trees: little round crowns with a shadow, clear of the fields, the roads, the yard and the stream
  // (the painted ground has its own).
  for (let i = 0; i < (art ? 0 : 260); i++) {
    const x = VIEW.minX + rnd() * (VIEW.maxX - VIEW.minX);
    const z = VIEW.minZ + rnd() * (VIEW.maxZ - VIEW.minZ);
    if (Math.abs(x - streamX(z, R)) < 6 || x > (R.stream ? 46 : streamX(z, R))) continue;
    if (fields.some(({ r }) => x > r.minX - 5 && x < r.maxX + 5 && z > r.minZ - 5 && z < r.maxZ + 6)) continue;
    if (Math.hypot(x - R.plateau.x, z - R.plateau.z) < 16 || Math.hypot(x - R.mosque.x, z - R.mosque.z) < 14) continue;
    if (nearRoad(x, z, 5)) continue;
    const r = Math.max(2.5, (2 + rnd() * 1.6) * k);
    g.fillStyle = 'rgba(30, 50, 20, 0.35)';
    g.beginPath();
    const q = pt(x, z);
    g.arc(q.x + r * 0.35, q.y + r * 0.35, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `hsl(${100 + rnd() * 25}, ${35 + rnd() * 15}%, ${26 + rnd() * 10}%)`;
    g.beginPath();
    g.arc(q.x, q.y, r, 0, Math.PI * 2);
    g.fill();
  }

  // The roads: a dark edge, the surface, a lighter middle (the hump between the ruts).
  for (const pass of [0, 1, 2]) {
    for (const r of roads) {
      const cobble = r.kind === 'cobble';
      g.beginPath();
      r.pts.forEach((p, i) => {
        const q = pt(p.x, p.z);
        (i ? g.lineTo : g.moveTo).call(g, q.x, q.y);
      });
      // On the painted ground: a soft dark edge and warm sandy earth, like the job maps' paths.
      if (art) {
        g.strokeStyle = pass === 0 ? (cobble ? 'rgba(70, 66, 58, 0.55)' : 'rgba(96, 62, 30, 0.55)') : pass === 1 ? (cobble ? '#c9c2b2' : '#d2a868') : cobble ? 'rgba(255,255,255,0.3)' : 'rgba(240, 210, 150, 0.7)';
        g.lineWidth = pass === 0 ? Math.max(6, 5.4 * k) : pass === 1 ? Math.max(3.6, 3.8 * k) : 1.2;
      } else {
        g.strokeStyle = pass === 0 ? (cobble ? '#5f5d58' : '#5c4027') : pass === 1 ? (cobble ? '#b9b6ad' : '#a37a4c') : cobble ? 'rgba(255,255,255,0.25)' : 'rgba(200, 170, 120, 0.6)';
        g.lineWidth = pass === 0 ? Math.max(4, 4.4 * k) : pass === 1 ? Math.max(2.6, 3.2 * k) : 1;
      }
      if (pass === 2 && cobble) g.setLineDash([2, 2]);
      g.stroke();
      g.setLineDash([]);
    }
  }

  // The yard: the harman and the fence round it.
  g.fillStyle = '#b9955f';
  g.beginPath();
  const yard = pt(R.plateau.x, R.plateau.z);
  g.arc(yard.x, yard.y, (R.plateau.r - 0.4) * k, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#e8e2d0';
  g.lineWidth = 1.5;
  g.stroke();

  // The fields: the sward, rows of ocaks (or graves, rocks), a fence line; greyed when locked.
  for (const { lv, r } of fields) {
    const locked = lv.id < 100 && lv.id > st.unlockedUpTo;
    const { x, y, w, h } = box(r);
    const base = locked ? '#aeb0a4' : lv.theme === 'mezarlik' ? '#a7bf7e' : lv.theme === 'yayla' ? '#9ccc62' : '#6fae45';
    if (art) {
      // A soft shadow under it, the sward with a little light from the top left.
      g.fillStyle = 'rgba(30, 50, 10, 0.3)';
      g.fillRect(x + 2, y + 3, w, h);
      const sward = g.createLinearGradient(x, y, x + w, y + h);
      sward.addColorStop(0, locked ? '#c3c4b8' : lv.theme === 'mezarlik' ? '#bcd38e' : '#8ccf4e');
      sward.addColorStop(1, base);
      g.fillStyle = sward;
    } else g.fillStyle = base;
    g.fillRect(x, y, w, h);
    // Stripes of the sward.
    g.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let i = 0; i < w; i += 6) g.fillRect(x + i, y, 3, h);
    // What stands in it.
    g.fillStyle = locked ? 'rgba(80, 80, 72, 0.45)' : lv.theme === 'mezarlik' ? '#e9e5d8' : lv.theme === 'findik' ? '#2f5d22' : '#7f7b72';
    const rows = Math.max(1, Math.floor((r.maxZ - r.minZ - 4) / lv.rowGap));
    const cols = Math.max(1, Math.floor((r.maxX - r.minX - 4) / lv.plantGap));
    if (lv.theme !== 'yol') {
      for (let a = 0; a <= rows; a++) {
        for (let b = 0; b <= cols; b++) {
          const { x: cx, y: cy } = pt(r.minX + 2 + ((r.maxX - r.minX - 4) * b) / cols, r.minZ + 2 + ((r.maxZ - r.minZ - 4) * a) / rows);
          if (lv.theme === 'mezarlik') g.fillRect(cx - 1, cy - 1.5, 2, 3);
          else if (art && lv.theme === 'findik' && !locked) {
            // A little bush: shadow, crown, a light on its top left.
            const br = Math.max(2.2, 1.7 * k);
            g.fillStyle = 'rgba(20, 40, 10, 0.35)';
            g.beginPath();
            g.arc(cx + br * 0.3, cy + br * 0.35, br, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#2f6a1c';
            g.beginPath();
            g.arc(cx, cy, br, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(170, 220, 90, 0.55)';
            g.beginPath();
            g.arc(cx - br * 0.3, cy - br * 0.3, br * 0.45, 0, Math.PI * 2);
            g.fill();
          } else {
            g.beginPath();
            g.arc(cx, cy, lv.theme === 'findik' ? Math.max(1.6, 1.4 * k) : 1.2, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    g.strokeStyle = lv.theme === 'mezarlik' ? '#8c877c' : locked ? '#85867c' : '#7b5d3a';
    g.lineWidth = lv.theme === 'mezarlik' ? 2.5 : art ? 2 : 1.2;
    g.strokeRect(x - 2, y - 2, w + 4, h + 4);
    // A wooden fence: posts round the edge.
    if (art && lv.theme !== 'mezarlik') {
      g.fillStyle = locked ? '#85867c' : '#5e4226';
      const step = 9;
      for (let i = 0; i <= w + 4; i += step) {
        g.fillRect(x - 2 + i - 1, y - 3.5, 2, 3);
        g.fillRect(x - 2 + i - 1, y + h + 0.5, 2, 3);
      }
      for (let i = step; i < h + 4; i += step) {
        g.fillRect(x - 3.5, y - 2 + i - 1, 3, 2);
        g.fillRect(x + w + 0.5, y - 2 + i - 1, 3, 2);
      }
    }
  }

  // The buildings.
  const roofHouse = (wx: number, wz: number, wall: string, roof: string, s: number) => {
    const { x, y } = pt(wx, wz);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x - s + 2, y - s * 0.5 + 2, s * 2, s * 1.4);
    g.fillStyle = wall;
    g.fillRect(x - s, y - s * 0.5, s * 2, s * 1.4);
    g.fillStyle = roof;
    g.beginPath();
    g.moveTo(x - s * 1.25, y - s * 0.5);
    g.lineTo(x, y - s * 1.4);
    g.lineTo(x + s * 1.25, y - s * 0.5);
    g.closePath();
    g.fill();
  };
  roofHouse(R.house.x, R.house.z, '#f3ecdc', '#c0392b', Math.max(6, 3.6 * k));
  if (R.hut) roofHouse(R.hut.x, R.hut.z, '#d9c7a4', '#6d4c30', Math.max(5, 2.6 * k));
  if (R.mill) roofHouse(R.mill.x, R.mill.z, '#c9c1b2', '#a6452f', Math.max(5, 2.4 * k));
  // The stone bridge over the stream: a grey band along the track.
  if (R.bridge) {
    const b = R.bridge;
    const e = pt(b.x + (Math.cos(b.rot) * b.len) / 2, b.z - (Math.sin(b.rot) * b.len) / 2);
    const w = pt(b.x - (Math.cos(b.rot) * b.len) / 2, b.z + (Math.sin(b.rot) * b.len) / 2);
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(e.x, e.y);
    g.lineTo(w.x, w.y);
    g.strokeStyle = '#5e5648';
    g.lineWidth = Math.max(7, (b.width + 1.2) * k);
    g.stroke();
    g.strokeStyle = '#c4bcab';
    g.lineWidth = Math.max(4.5, b.width * k);
    g.stroke();
    g.lineCap = 'round';
  }
  // The mosque: a dome and a minaret.
  const ms = Math.max(6, 4 * k);
  g.fillStyle = '#f1ece0';
  g.fillRect(mx - ms, my - ms * 0.3, ms * 2, ms);
  g.beginPath();
  g.arc(mx, my - ms * 0.3, ms * 0.8, Math.PI, 0);
  g.fill();
  g.fillRect(mx + ms * 1.2, my - ms * 1.6, ms * 0.35, ms * 2.3);
  g.beginPath();
  g.moveTo(mx + ms * 1.2, my - ms * 1.6);
  g.lineTo(mx + ms * 1.375, my - ms * 2.2);
  g.lineTo(mx + ms * 1.55, my - ms * 1.6);
  g.fill();

  }
  if (st.plain) {
    cache = { key, canvas: c };
    return c;
  }

  // Labels: a white pill with the job's number in a circle and its name; a padlock if locked. Each
  // goes at the first of its places (`ys`) clear of the labels already put down.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const pill = (text: string, x: number, ys: number[], num: string | null, locked: boolean): number => {
    g.font = 'bold 11px system-ui, sans-serif';
    const tw = g.measureText(text).width;
    const w = tw + (num ? 22 : 12) + (locked ? 12 : 0);
    const h = 18;
    // Each place centred on x first, then moved half or all its width either way; the first clear of the others.
    const fit = (dx: number) => Math.max(4, Math.min(cw - w - 4, x - w / 2 + dx));
    const free = (lx: number, y: number) => !placed.some((b) => lx < b.x1 + 3 && lx + w > b.x0 - 3 && y - h / 2 < b.y1 + 2 && y + h / 2 > b.y0 - 2);
    const ok = ys.filter((v) => v > h / 2 + 2 && v < ch - h / 2 - 2);
    const tries = [0, -w * 0.55, w * 0.55, -w * 1.1, w * 1.1].flatMap((dx) => ok.map((v) => ({ lx: fit(dx), y: v })));
    const spot = tries.find((t) => free(t.lx, t.y)) ?? { lx: fit(0), y: ys[0] };
    const { lx, y } = spot;
    placed.push({ x0: lx, x1: lx + w, y0: y - h / 2, y1: y + h / 2 });
    g.fillStyle = 'rgba(0, 0, 0, 0.2)';
    g.beginPath();
    g.roundRect(lx + 1, y - h / 2 + 2, w, h, 9);
    g.fill();
    g.fillStyle = locked ? '#e7e6e0' : '#fffdf6';
    g.beginPath();
    g.roundRect(lx, y - h / 2, w, h, 9);
    g.fill();
    let tx = lx + 6;
    if (num) {
      g.fillStyle = locked ? '#8d8d86' : '#3d7a26';
      g.beginPath();
      g.arc(lx + 10, y, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 10px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(num, lx + 10, y + 0.5);
      tx = lx + 20;
    }
    g.font = 'bold 11px system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = locked ? '#77776f' : '#2b3a1a';
    g.fillText(text, tx, y + 0.5);
    if (locked) {
      const cx = tx + tw + 7;
      g.strokeStyle = '#77776f';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(cx, y - 2, 2.6, Math.PI, 0);
      g.stroke();
      g.fillStyle = '#77776f';
      g.fillRect(cx - 3.5, y - 2, 7, 5.5);
    }
    return y;
  };
  // The buildings' first (they cannot move), then the fields'.
  const home = pt(R.house.x, R.house.z);
  pill('Ev', home.x, [home.y + Math.max(14, 6 * k)], null, false);
  pill('Cami', mx, [my + Math.max(14, 6 * k)], null, false);
  if (R.hut) {
    const hut = pt(R.hut.x, R.hut.z);
    pill('Yayla evi', hut.x, [hut.y + Math.max(13, 5 * k)], null, false);
  }
  for (const { lv, r } of fields) {
    const locked = lv.id < 100 && lv.id > st.unlockedUpTo;
    const fb = box(r);
    const cx = fb.x + fb.w / 2;
    // Below the field (by its way in), or beside a long thin one.
    // Jobs by their number; the neighbours' gardens by the coffee-house job posted there (or none).
    // (Where that is taken by another's: above the field, or a row further down.)
    const below = fb.y + fb.h + 12;
    const above = fb.y - 12;
    // (Beyond the stream, over the field: under it lies the water.)
    const beyond = R.stream && (r.minX + r.maxX) / 2 < streamX((r.minZ + r.maxZ) / 2, R);
    // (Last, on the field itself.)
    const mid = fb.y + fb.h / 2;
    const ys = beyond ? [above, above - 20, below, mid] : [below, above, below + 20, above - 20, mid];
    const ly = pill(lv.name, cx, ys, lv.id < 100 ? String(lv.id) : null, locked);
    // Grass still growing back: how long, in amber under the name.
    const wait = st.waiting[lv.id];
    if (wait && !locked) {
      g.font = 'bold 10px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#8a4b05';
      g.fillText(`⏳ ${wait}`, cx, ly + 16);
    }
  }

  cache = { key, canvas: c };
  return c;
}

export function drawVillageMap(canvas: HTMLCanvasElement, st: MapState, time: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  // (Not laid out: the map's screen hidden, or the window not sized yet.)
  if (!cw || !ch) return;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const g = canvas.getContext('2d')!;
  const R = REGIONS.find((r) => r.id === st.region) ?? REGIONS[0];
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(staticLayer(cw, ch, dpr, st), 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { pt, box } = frameFor(cw, ch, viewOf(R));
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);

  // This job's field: a glowing outline and a pin over it.
  const lv = regionLevels(R).find((l) => l.id === st.current);
  if (lv) {
    const r = fieldRect(lv);
    const b = box(r);
    const x = b.x - 4;
    const y = b.y - 4;
    const w = b.w + 8;
    const h = b.h + 8;
    g.strokeStyle = `rgba(255, 140, 30, ${0.5 + pulse * 0.5})`;
    g.lineWidth = 3 + pulse * 2;
    g.beginPath();
    g.roundRect(x, y, w, h, 4);
    g.stroke();
    const cx = x + w / 2;
    const cy = y - 4 - pulse * 4;
    g.fillStyle = 'rgba(0, 0, 0, 0.25)';
    g.beginPath();
    g.ellipse(cx, y + 2, 6, 2.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f07a1a';
    g.beginPath();
    g.arc(cx, cy - 12, 10, Math.PI * 0.85, Math.PI * 2.15);
    g.lineTo(cx, cy);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('İŞ', cx, cy - 12);
  }

  // The pat pat: a small blue tractor badge.
  const { x: tx, y: ty } = pt(st.patpat.x, st.patpat.z);
  g.fillStyle = '#fff';
  g.beginPath();
  g.roundRect(tx - 6, ty - 5, 12, 10, 3);
  g.fill();
  g.fillStyle = '#1f5fa8';
  g.beginPath();
  g.roundRect(tx - 4.5, ty - 3.5, 9, 7, 2);
  g.fill();

  // The worker: an arrow the way he faces, ringed in white.
  const { x: wx, y: wy } = pt(st.worker.x, st.worker.z);
  g.fillStyle = `rgba(232, 85, 43, ${0.25 * (1 - pulse)})`;
  g.beginPath();
  g.arc(wx, wy, 10 + pulse * 6, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(wx, wy);
  // Facing (sin yaw, cos yaw) in x and z: where a step that way goes on the map.
  const ahead = pt(st.worker.x + Math.sin(st.worker.yaw), st.worker.z + Math.cos(st.worker.yaw));
  g.rotate(Math.atan2(ahead.y - wy, ahead.x - wx) - Math.PI / 2);
  g.beginPath();
  g.moveTo(0, 9);
  g.lineTo(6.5, -6);
  g.lineTo(0, -2.5);
  g.lineTo(-6.5, -6);
  g.closePath();
  g.fillStyle = '#e8552b';
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.stroke();
  g.fill();
  g.restore();
}


/**
 * The village's plan for the painter: the map without labels or markers, `w` pixels wide, cropped to
 * the part shown (as the painting is laid back over it). For scripts/village-plan.mjs.
 */
export function villagePlan(region: number, w: number): HTMLCanvasElement {
  const R = REGIONS.find((r) => r.id === region) ?? REGIONS[0];
  const VIEW = viewOf(R);
  const h = Math.round((w * (VIEW.maxX - VIEW.minX)) / (VIEW.maxZ - VIEW.minZ));
  cache = null;
  const layer = staticLayer(w, h, 1, { current: 0, region, unlockedUpTo: 99, waiting: {}, worker: { x: 0, z: 0, yaw: 0 }, patpat: { x: 0, z: 0 }, plain: true });
  cache = null;
  return layer;
}
