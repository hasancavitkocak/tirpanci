import { makeRng } from '../game/rng';
import { Pt, REGIONS, Region, fieldRect, regionLevels, streamX, village } from '../game/village';

/**
 * The village map (the HARİTA button), drawn like a hand-coloured survey: north up; the hill shaded
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
  /** The worker and the pat pat, village coordinates; the worker's heading. */
  worker: Pt & { yaw: number };
  patpat: Pt;
}

/** The part of the village shown. */
function viewOf(r: Region): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return { minX: r.map.minX + 12, maxX: 52, minZ: r.map.minZ + 8, maxZ: r.map.maxZ - 8 };
}

interface Frame {
  k: number;
  px: (x: number) => number;
  py: (z: number) => number;
}

function frameFor(cw: number, ch: number, VIEW: ReturnType<typeof viewOf>): Frame {
  const k = Math.min(cw / (VIEW.maxX - VIEW.minX), ch / (VIEW.maxZ - VIEW.minZ));
  const ox = (cw - (VIEW.maxX - VIEW.minX) * k) / 2;
  const oy = (ch - (VIEW.maxZ - VIEW.minZ) * k) / 2;
  return { k, px: (x) => ox + (x - VIEW.minX) * k, py: (z) => oy + (z - VIEW.minZ) * k };
}

/** The static layer (everything but the markers), kept while the size and the state stay the same. */
let cache: { key: string; canvas: HTMLCanvasElement } | null = null;

function staticLayer(cw: number, ch: number, dpr: number, st: MapState): HTMLCanvasElement {
  const R = REGIONS.find((r) => r.id === st.region) ?? REGIONS[0];
  const VIEW = viewOf(R);
  const ground = R.ground;
  const key = `${cw}x${ch}@${dpr}:${st.region}:${st.current}:${st.unlockedUpTo}:${JSON.stringify(st.waiting)}`;
  if (cache?.key === key) return cache.canvas;
  const c = document.createElement('canvas');
  c.width = Math.round(cw * dpr);
  c.height = Math.round(ch * dpr);
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { k, px, py } = frameFor(cw, ch, VIEW);
  const rnd = makeRng(77);

  // The land: meadow green, the hill shaded (lit from the north-west), paler as it rises.
  g.fillStyle = '#9fbf6e';
  g.fillRect(0, 0, cw, ch);
  const cell = 4;
  for (let sy = 0; sy < ch; sy += cell) {
    for (let sx = 0; sx < cw; sx += cell) {
      const x = VIEW.minX + (sx + cell / 2 - px(VIEW.minX)) / k;
      const z = VIEW.minZ + (sy + cell / 2 - py(VIEW.minZ)) / k;
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
      const x = VIEW.minX + (sx - px(VIEW.minX)) / k;
      const z = VIEW.minZ + (sy - py(VIEW.minZ)) / k;
      const a = Math.floor(ground(x, z) / 5);
      const b = Math.floor(ground(x + 2 / k, z) / 5);
      const d = Math.floor(ground(x, z + 2 / k) / 5);
      if (a !== b || a !== d) g.fillRect(sx, sy, 1, 1);
    }
  }

  // The stream: banks, water, a light middle.
  const streamPath = () => {
    g.beginPath();
    for (let z = VIEW.minZ; z <= VIEW.maxZ; z += 2) (z === VIEW.minZ ? g.moveTo : g.lineTo).call(g, px(streamX(z)), py(z));
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

  const fields = regionLevels(R).map((lv) => ({ lv, r: fieldRect(lv) }));
  const roads = village(R).roads;
  const nearRoad = (x: number, z: number, d: number) => roads.some((r) => r.pts.some((p) => Math.abs(p.x - x) < d && Math.abs(p.z - z) < d));
  // Trees: little round crowns with a shadow, clear of the fields, the roads, the yard and the stream.
  for (let i = 0; i < 260; i++) {
    const x = VIEW.minX + rnd() * (VIEW.maxX - VIEW.minX);
    const z = VIEW.minZ + rnd() * (VIEW.maxZ - VIEW.minZ);
    if (x > streamX(z) - 4) continue;
    if (fields.some(({ r }) => x > r.minX - 5 && x < r.maxX + 5 && z > r.minZ - 5 && z < r.maxZ + 6)) continue;
    if (Math.hypot(x - R.plateau.x, z - R.plateau.z) < 16 || Math.hypot(x - R.mosque.x, z - R.mosque.z) < 14) continue;
    if (nearRoad(x, z, 5)) continue;
    const r = Math.max(2.5, (2 + rnd() * 1.6) * k);
    g.fillStyle = 'rgba(30, 50, 20, 0.35)';
    g.beginPath();
    g.arc(px(x) + r * 0.35, py(z) + r * 0.35, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `hsl(${100 + rnd() * 25}, ${35 + rnd() * 15}%, ${26 + rnd() * 10}%)`;
    g.beginPath();
    g.arc(px(x), py(z), r, 0, Math.PI * 2);
    g.fill();
  }

  // The roads: a dark edge, the surface, a lighter middle (the hump between the ruts).
  for (const pass of [0, 1, 2]) {
    for (const r of roads) {
      const cobble = r.kind === 'cobble';
      g.beginPath();
      r.pts.forEach((p, i) => (i ? g.lineTo(px(p.x), py(p.z)) : g.moveTo(px(p.x), py(p.z))));
      g.strokeStyle = pass === 0 ? (cobble ? '#5f5d58' : '#5c4027') : pass === 1 ? (cobble ? '#b9b6ad' : '#a37a4c') : cobble ? 'rgba(255,255,255,0.25)' : 'rgba(200, 170, 120, 0.6)';
      g.lineWidth = pass === 0 ? Math.max(4, 4.4 * k) : pass === 1 ? Math.max(2.6, 3.2 * k) : 1;
      if (pass === 2 && cobble) g.setLineDash([2, 2]);
      g.stroke();
      g.setLineDash([]);
    }
  }

  // The yard: the harman and the fence round it.
  g.fillStyle = '#b9955f';
  g.beginPath();
  g.arc(px(R.plateau.x), py(R.plateau.z), (R.plateau.r - 0.4) * k, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#e8e2d0';
  g.lineWidth = 1.5;
  g.stroke();

  // The fields: the sward, rows of ocaks (or graves, rocks), a fence line; greyed when locked.
  for (const { lv, r } of fields) {
    const locked = lv.id < 100 && lv.id > st.unlockedUpTo;
    const x = px(r.minX);
    const y = py(r.minZ);
    const w = (r.maxX - r.minX) * k;
    const h = (r.maxZ - r.minZ) * k;
    const base = locked ? '#aeb0a4' : lv.theme === 'mezarlik' ? '#a7bf7e' : lv.theme === 'yayla' ? '#9ccc62' : '#6fae45';
    g.fillStyle = base;
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
          const cx = px(r.minX + 2 + ((r.maxX - r.minX - 4) * b) / cols);
          const cy = py(r.minZ + 2 + ((r.maxZ - r.minZ - 4) * a) / rows);
          if (lv.theme === 'mezarlik') g.fillRect(cx - 1, cy - 1.5, 2, 3);
          else {
            g.beginPath();
            g.arc(cx, cy, lv.theme === 'findik' ? Math.max(1.6, 1.4 * k) : 1.2, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    g.strokeStyle = lv.theme === 'mezarlik' ? '#8c877c' : locked ? '#85867c' : '#7b5d3a';
    g.lineWidth = lv.theme === 'mezarlik' ? 2.5 : 1.2;
    g.strokeRect(x - 2, y - 2, w + 4, h + 4);
  }

  // The buildings.
  const roofHouse = (x: number, z: number, wall: string, roof: string, s: number) => {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(px(x) - s + 2, py(z) - s * 0.5 + 2, s * 2, s * 1.4);
    g.fillStyle = wall;
    g.fillRect(px(x) - s, py(z) - s * 0.5, s * 2, s * 1.4);
    g.fillStyle = roof;
    g.beginPath();
    g.moveTo(px(x) - s * 1.25, py(z) - s * 0.5);
    g.lineTo(px(x), py(z) - s * 1.4);
    g.lineTo(px(x) + s * 1.25, py(z) - s * 0.5);
    g.closePath();
    g.fill();
  };
  roofHouse(R.house.x, R.house.z, '#f3ecdc', '#c0392b', Math.max(6, 3.6 * k));
  if (R.hut) roofHouse(R.hut.x, R.hut.z, '#d9c7a4', '#6d4c30', Math.max(5, 2.6 * k));
  // The mosque: a dome and a minaret.
  const mx = px(R.mosque.x);
  const my = py(R.mosque.z);
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

  // Labels: a white pill with the job's number in a circle and its name; a padlock if locked.
  const pill = (text: string, x: number, y: number, num: string | null, locked: boolean) => {
    g.font = 'bold 11px system-ui, sans-serif';
    const tw = g.measureText(text).width;
    const w = tw + (num ? 22 : 12) + (locked ? 12 : 0);
    const h = 18;
    const lx = Math.max(4, Math.min(cw - w - 4, x - w / 2));
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
  };
  for (const { lv, r } of fields) {
    const locked = lv.id < 100 && lv.id > st.unlockedUpTo;
    const cx = px((r.minX + r.maxX) / 2);
    // Below the field (by its way in), or beside a long thin one.
    // Jobs by their number; the neighbours' gardens by the coffee-house job posted there (or none).
    pill(lv.name, cx, py(r.maxZ) + 13, lv.id < 100 ? String(lv.id) : null, locked);
    // Grass still growing back: how long, in amber under the name.
    const wait = st.waiting[lv.id];
    if (wait && !locked) {
      g.font = 'bold 10px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#8a4b05';
      g.fillText(`⏳ ${wait}`, cx, py(r.maxZ) + 29);
    }
  }
  pill('Ev', px(R.house.x), py(R.house.z) + Math.max(14, 6 * k), null, false);
  pill('Cami', mx, my + Math.max(14, 6 * k), null, false);
  if (R.hut) pill('Yayla evi', px(R.hut.x), py(R.hut.z) + Math.max(13, 5 * k), null, false);

  cache = { key, canvas: c };
  return c;
}

export function drawVillageMap(canvas: HTMLCanvasElement, st: MapState, time: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const g = canvas.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(staticLayer(cw, ch, dpr, st), 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const R = REGIONS.find((r) => r.id === st.region) ?? REGIONS[0];
  const { px, py } = frameFor(cw, ch, viewOf(R));
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);

  // This job's field: a glowing outline and a pin over it.
  const lv = regionLevels(R).find((l) => l.id === st.current);
  if (lv) {
    const r = fieldRect(lv);
    const x = px(r.minX) - 4;
    const y = py(r.minZ) - 4;
    const w = px(r.maxX) - px(r.minX) + 8;
    const h = py(r.maxZ) - py(r.minZ) + 8;
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
  const tx = px(st.patpat.x);
  const ty = py(st.patpat.z);
  g.fillStyle = '#fff';
  g.beginPath();
  g.roundRect(tx - 6, ty - 5, 12, 10, 3);
  g.fill();
  g.fillStyle = '#1f5fa8';
  g.beginPath();
  g.roundRect(tx - 4.5, ty - 3.5, 9, 7, 2);
  g.fill();

  // The worker: an arrow the way he faces, ringed in white.
  const wx = px(st.worker.x);
  const wy = py(st.worker.z);
  g.fillStyle = `rgba(232, 85, 43, ${0.25 * (1 - pulse)})`;
  g.beginPath();
  g.arc(wx, wy, 10 + pulse * 6, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(wx, wy);
  // Facing (sin yaw, cos yaw) in x and z; on the map z grows downwards, so that is the rotation.
  g.rotate(Math.atan2(Math.cos(st.worker.yaw), Math.sin(st.worker.yaw)) - Math.PI / 2);
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
