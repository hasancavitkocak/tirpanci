import * as THREE from 'three';
import { Field } from '../game/field';
import { PATPAT } from '../game/config';
import { makeRng } from '../game/rng';
import { PAINTED_GROUND, groundTextures } from './scenery';

/** Half the width of the dirt lane, metres (its texture fades into the grass at the edges). */
export const LANE_HALF = 1.9;
/** The track's middle, out to this from its line (m), is drawn solid: the ground under it is cut out to less (mask). */
const SOLID_HALF = LANE_HALF - 0.42;
/**
 * How far out from the track's line the ground under it is cut away (m): past the wheel ruts (the pat
 * pat's and the trailer's, out to about a metre), not further. The ribbon's sides can lie a little over
 * the coarse ground; cut out under them too, the eye passed under their edge looking across the track
 * and the sky showed through.
 */
const CUT_HALF = 1.15;

/**
 * How far the ground is lowered under the lane at `r` metres from its middle: a worn bed with two deep
 * wheel ruts (where the pat pat's wheels run) and a grassy hump between them, plus a few potholes.
 */
export function laneDip(r: number, x: number, z: number): number {
  if (r >= LANE_HALF) return 0;
  const bed = 0.035 * (1 - smooth(1.1, LANE_HALF, r));
  const rut = 0.045 * Math.exp(-(((r - PATPAT.track) / 0.2) ** 2));
  const holes = 0.015 * Math.max(0, Math.sin(z * 1.9 + x) * Math.sin(z * 0.55 - 1.3)) * (1 - smooth(0.9, 1.5, r));
  // Clods and smears of mud: a gently lumpy surface.
  const clods = 0.012 * Math.sin(x * 5.3 + z * 2.1) * Math.sin(z * 4.7 - x * 1.9) * (1 - smooth(1.2, LANE_HALF, r));
  return bed + rut + holes + clods;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Muddy lane seen from above: across = u (left edge to right edge), along = v (one tile = TILE metres). */
const TILE = 6;
function laneTexture(seed: number): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const rnd = makeRng(seed);
  const px = (m: number) => ((m + LANE_HALF) / (2 * LANE_HALF)) * w;
  // The painted earth (the ground's own, about 2.4 m to a tile), its edges faded below.
  const soil = PAINTED_GROUND ? (groundTextures()?.soil.image as CanvasImageSource | undefined) : undefined;
  if (soil) return paintedLane(g, c, soil, rnd, px);
  // Packed earth, fading into the grass at both edges.
  const base = g.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, 'rgba(92, 72, 48, 0)');
  base.addColorStop(0.06, 'rgba(92, 72, 48, 0.7)');
  base.addColorStop(0.11, 'rgba(96, 74, 50, 1)');
  base.addColorStop(0.89, 'rgba(96, 74, 50, 1)');
  base.addColorStop(0.94, 'rgba(92, 72, 48, 0.7)');
  base.addColorStop(1, 'rgba(92, 72, 48, 0)');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  // Lighter dry patches and darker damp ones, so it isn't one flat brown.
  for (let i = 0; i < 40; i++) {
    const y = rnd() * h;
    const x = w * (0.2 + rnd() * 0.6);
    const r = 20 + rnd() * 50;
    const m = g.createRadialGradient(x, y, 0, x, y, r);
    const dry = rnd() < 0.5;
    m.addColorStop(0, dry ? 'rgba(140, 116, 84, 0.3)' : 'rgba(64, 48, 32, 0.3)');
    m.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = m;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Grit and clods.
  for (let i = 0; i < 1400; i++) {
    const x = w * (0.12 + rnd() * 0.76);
    const y = rnd() * h;
    const l = 22 + rnd() * 30;
    g.fillStyle = `hsla(30, ${25 + rnd() * 20}%, ${l}%, ${0.25 + rnd() * 0.35})`;
    g.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  // Grass hump down the middle, between the ruts.
  for (let i = 0; i < 500; i++) {
    const x = px((rnd() - 0.5) * 0.55);
    const y = rnd() * h;
    g.strokeStyle = `hsla(${80 + rnd() * 25}, 40%, ${22 + rnd() * 14}%, ${0.5 + rnd() * 0.4})`;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 6, y - 4 - rnd() * 8);
    g.stroke();
  }
  for (const side of [-1, 1]) {
    const cx = px(side * PATPAT.track);
    const rw = (0.36 / (2 * LANE_HALF)) * w;
    // The rut: dark wet mud, wetter in the middle.
    const rut = g.createLinearGradient(cx - rw, 0, cx + rw, 0);
    rut.addColorStop(0, 'rgba(70, 52, 34, 0)');
    rut.addColorStop(0.3, 'rgba(70, 52, 34, 0.35)');
    rut.addColorStop(0.5, 'rgba(62, 46, 30, 0.5)');
    rut.addColorStop(0.7, 'rgba(70, 52, 34, 0.35)');
    rut.addColorStop(1, 'rgba(70, 52, 34, 0)');
    g.fillStyle = rut;
    g.fillRect(cx - rw, 0, rw * 2, h);
    // Tread prints pressed into the mud.
    // Faint and broken: only here and there where the ground was soft.
    for (let y = 0; y < h; y += 14) {
      g.fillStyle = `rgba(40, 30, 18, ${0.08 + 0.14 * Math.max(0, Math.sin(y * 0.031 + side))})`;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx, y);
        g.lineTo(cx + s * rw * 0.6, y + 6);
        g.lineTo(cx + s * rw * 0.6, y + 10);
        g.lineTo(cx, y + 4);
        g.closePath();
        g.fill();
      }
    }
    // Squeezed-out mud along the rut's lips.
    for (let i = 0; i < 70; i++) {
      const x = cx + (rnd() < 0.5 ? -1 : 1) * rw * (0.8 + rnd() * 0.5);
      const y = rnd() * h;
      g.fillStyle = `rgba(${60 + rnd() * 20}, ${44 + rnd() * 12}, 28, ${0.15 + rnd() * 0.25})`;
      g.beginPath();
      g.ellipse(x, y, 1.5 + rnd() * 3, 3 + rnd() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Puddles standing in the rut: brown water with a sky glint.
    // Now and then a damp, darker patch of mud in the rut.
    if (rnd() < 0.6) {
      const y = rnd() * h;
      const ph = 25 + rnd() * 35;
      const m = g.createRadialGradient(cx, y, 0, cx, y, ph / 2);
      m.addColorStop(0, 'rgba(52, 40, 27, 0.6)');
      m.addColorStop(1, 'rgba(52, 40, 27, 0)');
      g.fillStyle = m;
      g.beginPath();
      g.ellipse(cx, y, rw * 0.9, ph / 2, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Ragged edges: the grass eats into the earth unevenly, with tufts growing over it.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    const left = rnd() < 0.5;
    const y = rnd() * h;
    const reach = (0.04 + rnd() * 0.035 * (1 + Math.sin(y * 0.02 + (left ? 0 : 2)))) * w;
    g.fillStyle = `rgba(0, 0, 0, ${0.3 + rnd() * 0.5})`;
    g.beginPath();
    g.ellipse(left ? 0 : w, y, reach, 6 + rnd() * 18, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 700; i++) {
    const left = rnd() < 0.5;
    const d = Math.pow(rnd(), 1.6) * 0.3 * w;
    const x = left ? d : w - d;
    const y = rnd() * h;
    g.strokeStyle = `hsla(${78 + rnd() * 25}, ${35 + rnd() * 15}%, ${24 + rnd() * 16}%, ${0.5 + rnd() * 0.4})`;
    g.lineWidth = 1 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 8, y - 5 - rnd() * 10);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * The lane on the painted earth: the earth tiled (about 2.4 m to a tile), warm wet ruts with faint tread
 * prints and squeezed-out mud, damp patches in them, and ragged grassy edges.
 */
function paintedLane(g: CanvasRenderingContext2D, c: HTMLCanvasElement, soil: CanvasImageSource, rnd: () => number, px: (m: number) => number): THREE.CanvasTexture {
  const w = c.width;
  const h = c.height;
  const perM = w / (2 * LANE_HALF);
  const tile = Math.round(2.4 * perM);
  // The texture repeats every TILE metres along: the earth's tile is fitted to divide it evenly.
  const along = h / Math.max(1, Math.round(TILE / 2.4));
  for (let y = 0; y < h; y += along) for (let x = -tile / 3; x < w; x += tile) g.drawImage(soil, x, y, tile, along);
  // The painted earth is sandy yellow: a calmer, browner Black Sea soil (some colour taken out, then
  // a light brown laid over).
  g.globalCompositeOperation = 'saturation';
  g.fillStyle = 'rgba(128, 128, 128, 0.55)';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#cdb193';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  for (const side of [-1, 1]) {
    const cx = px(side * PATPAT.track);
    const rw = (0.36 / (2 * LANE_HALF)) * w;
    const rut = g.createLinearGradient(cx - rw, 0, cx + rw, 0);
    rut.addColorStop(0, 'rgba(120, 72, 30, 0)');
    rut.addColorStop(0.3, 'rgba(110, 70, 36, 0.22)');
    rut.addColorStop(0.5, 'rgba(96, 60, 30, 0.32)');
    rut.addColorStop(0.7, 'rgba(110, 70, 36, 0.22)');
    rut.addColorStop(1, 'rgba(120, 72, 30, 0)');
    g.fillStyle = rut;
    g.fillRect(cx - rw, 0, rw * 2, h);
    for (let y = 0; y < h; y += 14) {
      g.fillStyle = `rgba(90, 58, 30, ${0.03 + 0.07 * Math.max(0, Math.sin(y * 0.031 + side))})`;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx, y);
        g.lineTo(cx + s * rw * 0.6, y + 6);
        g.lineTo(cx + s * rw * 0.6, y + 10);
        g.lineTo(cx, y + 4);
        g.closePath();
        g.fill();
      }
    }
    for (let i = 0; i < 70; i++) {
      const x = cx + (rnd() < 0.5 ? -1 : 1) * rw * (0.8 + rnd() * 0.5);
      const y = rnd() * h;
      g.fillStyle = `rgba(${110 + rnd() * 25}, ${66 + rnd() * 14}, 28, ${0.18 + rnd() * 0.25})`;
      g.beginPath();
      g.ellipse(x, y, 1.5 + rnd() * 3, 3 + rnd() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (rnd() < 0.6) {
      const y = rnd() * h;
      const ph = 25 + rnd() * 35;
      const m = g.createRadialGradient(cx, y, 0, cx, y, ph / 2);
      m.addColorStop(0, 'rgba(96, 62, 32, 0.32)');
      m.addColorStop(1, 'rgba(96, 62, 32, 0)');
      g.fillStyle = m;
      g.beginPath();
      g.ellipse(cx, y, rw * 0.9, ph / 2, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Faded into the grass at both edges, raggedly.
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, w, 0);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(0.06, 'rgba(0, 0, 0, 0.7)');
  fade.addColorStop(0.11, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(0.89, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(0.94, 'rgba(0, 0, 0, 0.7)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    const left = rnd() < 0.5;
    const y = rnd() * h;
    const reach = (0.04 + rnd() * 0.035 * (1 + Math.sin(y * 0.02 + (left ? 0 : 2)))) * w;
    g.fillStyle = `rgba(0, 0, 0, ${0.3 + rnd() * 0.5})`;
    g.beginPath();
    g.ellipse(left ? 0 : w, y, reach, 6 + rnd() * 18, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** How far a puddle's bowl is pressed into the lane at a point (the water stands in it). */
export function puddleDip(f: Field, x: number, z: number): number {
  let d = 0;
  for (const p of f.puddles) {
    if (Math.abs(p.x - x) > p.r * 2.2 || Math.abs(p.z - z) > p.r * 2.2) continue;
    const e = f.inPuddle(p, x, z);
    // Bigger puddles stand in deeper holes.
    if (e < 1.3) d = Math.max(d, Math.min(0.16, 0.12 * p.r) * (1 - smooth(0.55, 1.3, e)));
  }
  return d;
}

/** Lumpy mud as a tiling normal map: clods and smears at a few sizes. */
function mudNormals(seed: number): THREE.DataTexture {
  const n = 256;
  const rnd = makeRng(seed + 61);
  const hgt = new Float32Array(n * n);
  for (const [count, size, amp] of [[90, 18, 1], [400, 7, 0.6], [1500, 2.5, 0.35]] as const) {
    for (let i = 0; i < count; i++) {
      const cx = rnd() * n;
      const cy = rnd() * n;
      const r = size * (0.6 + rnd() * 0.8);
      const a = amp * (rnd() < 0.7 ? 1 : -1);
      for (let y = Math.floor(cy - r); y <= cy + r; y++) {
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          const d = Math.hypot(x - cx, y - cy) / r;
          if (d >= 1) continue;
          hgt[((y + n) % n) * n + ((x + n) % n)] += a * (1 - d * d) * (1 - d * d);
        }
      }
    }
  }
  const data = new Uint8Array(n * n * 4);
  const at = (x: number, y: number) => hgt[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.35;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.35;
      const l = Math.hypot(dx, dy, 1);
      const k = (y * n + x) * 4;
      data[k] = (-dx / l) * 127 + 128;
      data[k + 1] = (-dy / l) * 127 + 128;
      data[k + 2] = (1 / l) * 127 + 128;
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, n, n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** How rough the lane is (green channel): wet and smooth in the ruts and damp patches, dull elsewhere. */
function mudRoughness(seed: number): THREE.CanvasTexture {
  const w = 128;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const rnd = makeRng(seed + 73);
  g.fillStyle = 'rgb(235, 235, 235)';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) {
    const x = w * (0.2 + rnd() * 0.6);
    const y = rnd() * h;
    const r = 10 + rnd() * 30;
    const m = g.createRadialGradient(x, y, 0, x, y, r);
    m.addColorStop(0, 'rgba(150, 150, 150, 0.8)');
    m.addColorStop(1, 'rgba(150, 150, 150, 0)');
    g.fillStyle = m;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (const side of [-1, 1]) {
    const cx = ((side * PATPAT.track + LANE_HALF) / (2 * LANE_HALF)) * w;
    const rw = (0.32 / (2 * LANE_HALF)) * w;
    const m = g.createLinearGradient(cx - rw, 0, cx + rw, 0);
    m.addColorStop(0, 'rgba(110, 110, 110, 0)');
    m.addColorStop(0.5, 'rgba(110, 110, 110, 0.9)');
    m.addColorStop(1, 'rgba(110, 110, 110, 0)');
    g.fillStyle = m;
    g.fillRect(cx - rw, 0, rw * 2, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Rows of the lane ribbon, metres apart; rows per chunk (each chunk is its own mesh and print canvas). */
export const LANE_ROW = 0.2;
const CHUNK_ROWS = 120;
/** The print canvas of a chunk: pixels across the lane and along a chunk. */
const PRINT_W = 128;
const PRINT_H = 1024;

interface LanePoint {
  x: number;
  z: number;
  /** Right of the direction of travel. */
  nx: number;
  nz: number;
  along: number;
  /** On a round cap past an end that runs into another track: how far past the end, metres. */
  cap?: number;
}

interface Chunk {
  mesh: THREE.Mesh;
  /** Every vertex (near), and a coarse net of every fourth row and third column (far off). */
  fine: THREE.BufferAttribute;
  coarse: THREE.BufferAttribute;
  /** The middle of the chunk, for its distance from the camera. */
  mid: THREE.Vector3;
  /** First row and row count (the last row is shared with the next chunk). */
  row0: number;
  rows: number;
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The canvas the tyres print into: made at the first print (until then plain white). */
  g: CanvasRenderingContext2D | null;
  tex: { value: THREE.Texture };
  dirty: boolean;
  normals: number;
}

/** Plain white: no prints yet. */
const NO_PRINTS = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
NO_PRINTS.needsUpdate = true;

/**
 * Heights for laying a track: the full surface anywhere (`height`), the ground before any wear
 * (`base`), and that ground worn down by a track r metres from its middle (`surface`).
 */
export interface LaneGround {
  height: (x: number, z: number) => number;
  base: (x: number, z: number) => number;
  surface: (x: number, z: number, r: number, base: number) => number;
}

interface LaneLooks {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/**
 * One dirt track: a fine ribbon laid on the (rutted) ground along a polyline, in chunks of a dozen
 * metres. Rows every LANE_ROW metres and a vertex every 13 cm across, so the ruts the wheels press
 * into it show; wet mud (lumpy normals, shiny where wet); and on each chunk a canvas the tyres print
 * their tread into, darkening (and wetting) the mud where they ran. A track that ends at a field's way
 * in runs out there in two ragged ruts.
 */
class LaneStrip {
  readonly pts: LanePoint[] = [];
  private readonly chunks: Chunk[] = [];
  private readonly across = 31;
  readonly box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };

  constructor(
    l: { x: number; z: number }[],
    private readonly ragged: boolean,
    /** Whether each end is loose (the track fades out there) or runs into another track. */
    readonly loose: [boolean, boolean],
    looks: LaneLooks,
    private readonly group: THREE.Group,
    private readonly ground: LaneGround,
    private readonly joints: { x: number; z: number }[],
  ) {
    if (l.length < 2) return;
    // Resample the polyline every LANE_ROW metres.
    let along = 0;
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1];
      const b = l[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-6) continue;
      const nx = -(b.z - a.z) / len;
      const nz = (b.x - a.x) / len;
      for (let t = this.pts.length ? Math.ceil(along / LANE_ROW) * LANE_ROW - along : 0; t <= len; t += LANE_ROW) {
        this.pts.push({ x: a.x + ((b.x - a.x) * t) / len, z: a.z + ((b.z - a.z) * t) / len, nx, nz, along: along + t });
      }
      along += len;
    }
    // Smooth the sideways direction over the corners of the polyline.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < this.pts.length - 1; i++) {
        const p = this.pts;
        const nx = p[i - 1].nx + p[i].nx * 2 + p[i + 1].nx;
        const nz = p[i - 1].nz + p[i].nz * 2 + p[i + 1].nz;
        const ln = Math.hypot(nx, nz) || 1;
        p[i].nx = nx / ln;
        p[i].nz = nz / ln;
      }
    }
    // An end running into another track gets a round cap past it: two tracks meeting at a corner
    // otherwise leave a square notch on its outside, where neither reaches.
    for (const k of [0, 1] as const) {
      if (loose[k] || this.pts.length < 2) continue;
      const end = k ? this.pts[this.pts.length - 1] : this.pts[0];
      const prev = k ? this.pts[this.pts.length - 2] : this.pts[1];
      const len = Math.hypot(end.x - prev.x, end.z - prev.z) || 1;
      const dx = (end.x - prev.x) / len;
      const dz = (end.z - prev.z) / len;
      const cap: LanePoint[] = [];
      for (let d = LANE_ROW; d <= LANE_HALF + 1e-6; d += LANE_ROW) cap.push({ x: end.x + dx * d, z: end.z + dz * d, nx: end.nx, nz: end.nz, along: end.along + (k ? d : -d), cap: d });
      if (k) this.pts.push(...cap);
      else this.pts.unshift(...cap.reverse());
    }
    for (const q of this.pts) {
      this.box.minX = Math.min(this.box.minX, q.x);
      this.box.maxX = Math.max(this.box.maxX, q.x);
      this.box.minZ = Math.min(this.box.minZ, q.z);
      this.box.maxZ = Math.max(this.box.maxZ, q.z);
    }
    for (let r0 = 0; r0 < this.pts.length - 1; r0 += CHUNK_ROWS) this.chunks.push(this.chunk(r0, Math.min(CHUNK_ROWS, this.pts.length - 1 - r0), looks));
    // Into a field: the tread of the wheels that went in before, printed into its last stretch.
    if (ragged) {
      const total = this.pts[this.pts.length - 1].along;
      for (let i = 1; i < this.pts.length; i += 2) {
        const p = this.pts[i];
        if (p.along < total - 14) continue;
        const yaw = Math.atan2(p.nz, -p.nx);
        for (const s of [-1, 1]) this.print(p.x + p.nx * s * PATPAT.track, p.z + p.nz * s * PATPAT.track, yaw, 0.23, i);
      }
    }
  }

  private chunk(row0: number, rows: number, { map, normalMap, roughnessMap }: LaneLooks): Chunk {
    const n = this.across;
    const count = (rows + 1) * n;
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const uvPrint = new Float32Array(count * 2);
    // Alpha: the lane fades in over its first metres and out over its last, into the harman and the path.
    const col = new Float32Array(count * 4).fill(1);
    const total = this.pts[this.pts.length - 1].along;
    const idx: number[] = [];
    const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (let r = 0; r <= rows; r++) {
      const p = this.pts[row0 + r];
      // The ground across the track from three samples (left, middle, right): it varies slowly.
      const gl = this.ground.base(p.x - p.nx * LANE_HALF, p.z - p.nz * LANE_HALF);
      const gm = this.ground.base(p.x, p.z);
      const gr = this.ground.base(p.x + p.nx * LANE_HALF, p.z + p.nz * LANE_HALF);
      // Where tracks meet the full surface (the nearest track's ruts), so both ribbons lie on the same ground.
      const joint = this.joints.some((j) => (j.x - p.x) ** 2 + (j.z - p.z) ** 2 < 49);
      for (let k = 0; k < n; k++) {
        const s = -LANE_HALF + (2 * LANE_HALF * k) / (n - 1);
        const x = p.x + p.nx * s;
        const z = p.z + p.nz * s;
        const v = r * n + k;
        const u = s / LANE_HALF;
        const base = gm + ((gr - gl) / 2) * u + ((gr + gl) / 2 - gm) * u * u;
        // Towards the sides, on the terrain's own surface (the roads levelled, the ruts worn in): there
        // the three-sample fit of the unlevelled ground stood up to a hand over it, its edge a lip the eye
        // passed under looking across the track, into the ground cut away under it.
        const side = joint ? 0 : smooth(0.9, 1.5, Math.abs(s));
        pos[v * 3] = x;
        const own = joint ? this.ground.height(x, z) : this.ground.surface(x, z, Math.abs(s), base);
        pos[v * 3 + 1] = (side > 0 ? own + (this.ground.height(x, z) - own) * side : own) + 0.025;
        pos[v * 3 + 2] = z;
        uv.set([k / (n - 1), p.along / TILE], v * 2);
        uvPrint.set([k / (n - 1), r / CHUNK_ROWS], v * 2);
        const e = Math.min(this.loose[0] ? p.along : Infinity, this.loose[1] ? total - p.along : Infinity) / (PAINTED_GROUND ? 6 : 3.5);
        let alpha = e >= 1 ? 1 : e * e * (3 - 2 * e);
        if (this.ragged && p.along > total / 2) {
          // Into the field only the two wheel tracks run on, ragged, right up to its edge.
          const rut = Math.exp(-(((Math.abs(s) - PATPAT.track) / 0.22) ** 2));
          const ragged = 0.75 + 0.25 * Math.sin(p.along * 9 + s * 5) * Math.sin(p.along * 3.7 - s * 11);
          const end = Math.min(1, (total - p.along) / 0.6);
          alpha = Math.max(alpha, rut * ragged * end);
        }
        // The round cap: clear outside the half disc, softly at its rim.
        if (p.cap !== undefined) alpha *= Math.min(1, Math.max(0, (LANE_HALF - Math.hypot(s, p.cap)) / 0.5));
        col[v * 4 + 3] = alpha;
        box.minX = Math.min(box.minX, x);
        box.maxX = Math.max(box.maxX, x);
        box.minZ = Math.min(box.minZ, z);
        box.maxZ = Math.max(box.maxZ, z);
      }
      if (r < rows) {
        for (let k = 0; k < n - 1; k++) {
          const q = r * n + k;
          idx.push(q, q + 1, q + n, q + 1, q + n + 1, q + n);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('uvPrint', new THREE.BufferAttribute(uvPrint, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const fine = geo.index!;
    // Far off the ruts don't show: a net of every fourth row and every third column is enough.
    const cidx: number[] = [];
    const rs: number[] = [];
    for (let r = 0; r < rows; r += 4) rs.push(r);
    rs.push(rows);
    for (let a = 0; a + 1 < rs.length; a++) {
      for (let k = 0; k + 3 < n; k += 3) {
        const q0 = rs[a] * n + k;
        const q1 = rs[a + 1] * n + k;
        cidx.push(q0, q0 + 3, q1, q0 + 3, q1 + 3, q1);
      }
    }
    const coarse = new THREE.BufferAttribute(new Uint32Array(cidx), 1);
    const tex = { value: NO_PRINTS as THREE.Texture };
    // (The coarse terrain under it is pushed back in depth instead, world.ts: pulling the track forward
    // drew it over the pat pat's low parts too.)
    const mat = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap, roughness: 1, metalness: 0, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    // The prints: darker where the tyres ran (and more so where they ran again), and wet there.
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPrints = tex;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 uvPrint;\nvarying vec2 vUvPrint;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvUvPrint = uvPrint;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uPrints;\nvarying vec2 vUvPrint;')
        // The middle (where the ground under it is not drawn, world.ts) always solid: far off, the texture's
        // smaller copies blur its soft edges inwards, and the sky showed through the track's sides.
        .replace('#include <map_fragment>', `#include <map_fragment>\nif (abs(vMapUv.x - 0.5) * 2.0 < ${(SOLID_HALF / LANE_HALF).toFixed(3)}) diffuseColor.a = 1.0;\nvec3 printed = texture2D(uPrints, vUvPrint).rgb;\ndiffuseColor.rgb *= printed;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= mix(0.45, 1.0, printed.g);');
    };
    mat.customProgramCacheKey = () => 'lane-prints';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    const mid = new THREE.Vector3((box.minX + box.maxX) / 2, pos[Math.floor(count / 2) * 3 + 1], (box.minZ + box.maxZ) / 2);
    return { mesh, fine, coarse, mid, row0, rows, box, g: null, tex, dirty: false, normals: 0 };
  }

  /** The row nearest a point (searching on from `hint`), or -1 off the lane. */
  rowAt(x: number, z: number, hint: number): number {
    const p = this.pts;
    if (!p.length) return -1;
    const d = (i: number) => (p[i].x - x) ** 2 + (p[i].z - z) ** 2;
    let best = Math.max(0, Math.min(p.length - 1, hint));
    // Walk downhill on the distance from the hint; fall back to a full search if that lands far off.
    for (let moved = true; moved; ) {
      moved = false;
      for (const j of [best - 1, best + 1]) {
        if (j >= 0 && j < p.length && d(j) < d(best)) {
          best = j;
          moved = true;
        }
      }
    }
    if (d(best) > LANE_HALF * LANE_HALF * 4) {
      for (let i = 0; i < p.length; i += 5) if (d(i) < d(best)) best = i;
      for (let i = Math.max(0, best - 5); i < Math.min(p.length, best + 6); i++) if (d(i) < d(best)) best = i;
    }
    return d(best) < (LANE_HALF + 0.5) ** 2 ? best : -1;
  }

  /** A tyre `width` metres wide rolled over (x, z) heading `yaw` on row `row`: print its tread into the mud. */
  print(x: number, z: number, yaw: number, width: number, row: number): void {
    const p = this.pts[row];
    const tx = p.nz;
    const tz = -p.nx;
    const dx = x - p.x;
    const dz = z - p.z;
    const s = dx * p.nx + dz * p.nz;
    const along = dx * tx + dz * tz;
    // The heading in the lane's frame: +x across (right), +y along.
    const hx = Math.sin(yaw);
    const hz = Math.cos(yaw);
    const rot = Math.atan2(-(hx * p.nx + hz * p.nz), hx * tx + hz * tz);
    const ci = Math.min(this.chunks.length - 1, Math.floor(row / CHUNK_ROWS));
    for (const c of [this.chunks[ci - 1], this.chunks[ci], this.chunks[ci + 1]]) {
      if (!c) continue;
      const v = (row - c.row0) * LANE_ROW + along;
      if (v < -0.6 || v > c.rows * LANE_ROW + 0.6) continue;
      if (!c.g) {
        const cv = document.createElement('canvas');
        cv.width = PRINT_W;
        cv.height = PRINT_H;
        c.g = cv.getContext('2d')!;
        c.g.fillStyle = '#ffffff';
        c.g.fillRect(0, 0, PRINT_W, PRINT_H);
        const t = new THREE.CanvasTexture(cv);
        t.flipY = false;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        c.tex.value = t;
      }
      const g = c.g;
      g.save();
      g.scale(PRINT_W / (2 * LANE_HALF), PRINT_H / (CHUNK_ROWS * LANE_ROW));
      g.translate(s + LANE_HALF, v);
      g.rotate(rot);
      g.globalCompositeOperation = 'multiply';
      // The tyre's band pressed smooth and wet, then the lugs: chevrons pointing the way it rolled.
      g.fillStyle = 'rgb(205, 196, 186)';
      g.fillRect(-width / 2, -0.26, width, 0.52);
      g.fillStyle = 'rgb(150, 138, 124)';
      for (let y = -0.24; y < 0.26; y += 0.085) {
        for (const side of [-1, 1]) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo((side * width) / 2, y - 0.05);
          g.lineTo((side * width) / 2, y - 0.02);
          g.lineTo(0, y + 0.03);
          g.closePath();
          g.fill();
        }
      }
      g.restore();
      c.dirty = true;
    }
  }

  /**
   * Once a frame: where the wheels pressed the lane down, lower the ribbon too; upload the prints;
   * the shading follows a moment later (normals are recomputed a few times a second at most).
   */
  update(dt: number, b: { minX: number; maxX: number; minZ: number; maxZ: number } | null, camera: THREE.Vector3 | null): void {
    for (const c of this.chunks) {
      // Fine near the camera (within 35 m of the chunk's middle), coarse beyond.
      const want = camera && c.mid.distanceTo(camera) > 35 ? c.coarse : c.fine;
      if (c.mesh.geometry.index !== want) c.mesh.geometry.setIndex(want);
      if (b && !(c.box.maxX < b.minX - 0.2 || c.box.minX > b.maxX + 0.2 || c.box.maxZ < b.minZ - 0.2 || c.box.minZ > b.maxZ + 0.2)) {
        const pos = c.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          if (x < b.minX - 0.15 || x > b.maxX + 0.15 || z < b.minZ - 0.15 || z > b.maxZ + 0.15) continue;
          pos.setY(i, this.ground.height(x, z) + 0.025);
        }
        pos.needsUpdate = true;
        c.normals = Math.max(c.normals, 0.0001);
      }
      if (c.normals > 0) {
        c.normals += dt;
        if (c.normals > 0.15) {
          c.normals = 0;
          c.mesh.geometry.computeVertexNormals();
        }
      }
      if (c.dirty) {
        c.dirty = false;
        (c.tex.value as THREE.CanvasTexture).needsUpdate = true;
      }
    }
  }
}

let looks: LaneLooks | null = null;

/** All the village's dirt tracks (one LaneStrip each). */
export class LaneView {
  readonly group = new THREE.Group();
  private readonly strips: LaneStrip[] = [];
  /** Last strip and row found for each wheel, to start the next search from. */
  private readonly hints = new Map<number, { s: number; row: number }>();

  constructor(
    private readonly f: Field,
    ground: LaneGround,
  ) {
    // The same village every job: its track textures are made once.
    looks ??= (() => {
      const normalMap = mudNormals(1);
      // About 0.8 m per tile of lumps: across the lane and along a TILE.
      normalMap.repeat.set((2 * LANE_HALF) / 0.8, TILE / 0.8);
      return { map: laneTexture(1), normalMap, roughnessMap: mudRoughness(1) };
    })();
    for (const r of f.roads) {
      if (r.kind !== 'dirt') continue;
      // A track ending in a loose end at the bottom of a field runs into it as two ragged ruts.
      const end = r.pts[r.pts.length - 1];
      // (Not on the painted ground: there the track just fades softly into the grass.)
      const ragged = !PAINTED_GROUND && f.roadEnds.some((e) => e === end) && (f.inField(end.x, end.z - 1) || f.others.some((o) => end.x > o.minX && end.x < o.maxX && Math.abs(end.z - o.maxZ) < 2));
      const loose: [boolean, boolean] = [f.roadEnds.includes(r.pts[0]), f.roadEnds.includes(end)];
      this.strips.push(new LaneStrip(r.pts, ragged, loose, looks, this.group, ground, f.roadJoints));
    }
  }

  /** A tyre (`wheel` tells them apart) `width` metres wide rolled over (x, z) heading `yaw`: print its tread. */
  print(wheel: number, x: number, z: number, yaw: number, width: number): void {
    const h = this.hints.get(wheel);
    // The strip it was on before first, then any whose box it is in.
    const order = h ? [h.s, ...this.strips.keys()] : [...this.strips.keys()];
    for (const i of order) {
      const st = this.strips[i];
      const b = st.box;
      if (x < b.minX - 3 || x > b.maxX + 3 || z < b.minZ - 3 || z > b.maxZ + 3) continue;
      const row = st.rowAt(x, z, h && h.s === i ? h.row : 0);
      if (row < 0) continue;
      this.hints.set(wheel, { s: i, row });
      st.print(x, z, yaw, width, row);
      return;
    }
  }

  /** Once a frame: follow the ruts the wheels pressed, upload the prints, detail by distance from the camera. */
  update(dt: number, camera: THREE.Vector3 | null = null): void {
    const b = this.f.sinkDirty;
    this.f.sinkDirty = null;
    for (const st of this.strips) st.update(dt, b, camera);
  }

  /** Top-down mask of the tracks' middles (where the terrain under them is not drawn) and the area it covers. */
  /**
   * Whether a point (field coordinates) is within `margin` metres of where the mask is white (a track's
   * middle): the terrain's triangles near one are drawn by the material that cuts the track out, the
   * rest by the one without (whose GPU work is cheaper: no discard).
   */
  nearMask(margin: number): (x: number, z: number) => boolean {
    const strips = this.strips.filter((s) => s.pts.length);
    if (!strips.length) return () => false;
    const pad = margin + 3;
    const minX = Math.min(...strips.map((s) => s.box.minX)) - pad;
    const maxX = Math.max(...strips.map((s) => s.box.maxX)) + pad;
    const minZ = Math.min(...strips.map((s) => s.box.minZ)) - pad;
    const maxZ = Math.max(...strips.map((s) => s.box.maxZ)) + pad;
    const ppm = 1;
    const c = document.createElement('canvas');
    c.width = Math.ceil((maxX - minX) * ppm);
    c.height = Math.ceil((maxZ - minZ) * ppm);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.strokeStyle = '#fff';
    g.lineWidth = (2 * LANE_HALF + 2 * margin) * ppm;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const s of strips) {
      g.beginPath();
      s.pts.forEach((q, i) => (i ? g.lineTo((q.x - minX) * ppm, (q.z - minZ) * ppm) : g.moveTo((q.x - minX) * ppm, (q.z - minZ) * ppm)));
      g.stroke();
    }
    const d = g.getImageData(0, 0, c.width, c.height).data;
    return (x, z) => {
      const i = Math.floor((x - minX) * ppm);
      const j = Math.floor((z - minZ) * ppm);
      return i >= 0 && j >= 0 && i < c.width && j < c.height && d[(j * c.width + i) * 4 + 3] > 0;
    };
  }

  mask(): { tex: THREE.CanvasTexture; box: THREE.Vector4 } | null {
    const strips = this.strips.filter((s) => s.pts.length);
    if (!strips.length) return null;
    const minX = Math.min(...strips.map((s) => s.box.minX)) - 3;
    const maxX = Math.max(...strips.map((s) => s.box.maxX)) + 3;
    const minZ = Math.min(...strips.map((s) => s.box.minZ)) - 3;
    const maxZ = Math.max(...strips.map((s) => s.box.maxZ)) + 3;
    const ppm = 3;
    const c = document.createElement('canvas');
    c.width = Math.ceil((maxX - minX) * ppm);
    c.height = Math.ceil((maxZ - minZ) * ppm);
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#fff';
    g.lineWidth = 2 * CUT_HALF * ppm;
    // Square ends: the ribbon stops where the track does, the mask must not reach past it.
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    for (const s of strips) {
      const p = s.pts;
      // Not where the track fades out at its ends (as long as the fade in chunk()): the ground shows through there.
      const total = p[p.length - 1].along;
      const fade = PAINTED_GROUND ? 6 : 3.5;
      const solid = p.filter((q) => q.cap === undefined && (!s.loose[0] || q.along > fade) && (!s.loose[1] || q.along < total - fade));
      g.beginPath();
      solid.forEach((q, i) => (i ? g.lineTo((q.x - minX) * ppm, (q.z - minZ) * ppm) : g.moveTo((q.x - minX) * ppm, (q.z - minZ) * ppm)));
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return { tex, box: new THREE.Vector4(minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ)) };
  }
}

/** The puddle picture (public/textures, transparent round the mud rim), shared by all puddles. */
let puddleTex: THREE.Texture | null = null;

/**
 * The puddles standing in the ruts: the artist's picture of a muddy puddle with a tyre track through
 * it, laid on the ground along the lane (on a fine grid, so it follows the rut it lies in).
 */
export function puddleMeshes(f: Field, heightAt: (x: number, z: number) => number): THREE.Group {
  const grp = new THREE.Group();
  if (!f.puddles.length) return grp;
  if (!puddleTex) {
    puddleTex = new THREE.TextureLoader().load('./textures/su_birikintisi.webp');
    puddleTex.colorSpace = THREE.SRGBColorSpace;
    puddleTex.anisotropy = 4;
  }
  // Darkened to sit with the wet mud round it (the picture is lit brighter than the scene).
  // (On the painted ground, lighter: the dark mud read as a black hole in the light earth.)
  const mat = new THREE.MeshStandardMaterial({ map: puddleTex, color: PAINTED_GROUND ? '#d6cbb8' : '#8f8173', roughness: 0.3, metalness: 0, transparent: true, depthWrite: false, opacity: PAINTED_GROUND ? 0.85 : 1 });
  for (const p of f.puddles) {
    // The picture is twice as long as wide; its long side runs along the lane.
    const len = p.r * 1.6 * 2.6;
    const g = new THREE.PlaneGeometry(len, len / 2, 16, 8);
    g.rotateX(-Math.PI / 2);
    g.rotateY(p.dir + Math.PI / 2);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(p.x + pos.getX(i), p.z + pos.getZ(i)) + 0.035);
    g.computeVertexNormals();
    const w = new THREE.Mesh(g, mat);
    w.position.set(p.x, 0, p.z);
    w.renderOrder = 2;
    w.receiveShadow = true;
    grp.add(w);
  }
  return grp;
}

/**
 * The hazelnut drying floor (harman) of old village concrete, about 3 m to a tile, `len` by `wid`
 * metres: a rounded slab, its rim softening into the grass and broken unevenly.
 */
function concreteHarman(seed: number, len: number, wid: number, concrete: CanvasImageSource): THREE.CanvasTexture {
  const ppm = 48;
  const w = Math.round(len * ppm);
  const h = Math.round(wid * ppm);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const rnd = makeRng(seed + 17);
  const tile = 3 * ppm;
  for (let y = 0; y < h; y += tile) for (let x = 0; x < w; x += tile) g.drawImage(concrete, x, y, tile, tile);
  // The moss painted in the picture read as grass growing on the concrete: its colour taken out.
  g.globalCompositeOperation = 'saturation';
  g.fillStyle = 'rgba(128, 128, 128, 0.85)';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  // Lighter, sun-bleached, a touch warm.
  g.fillStyle = 'rgba(255, 248, 232, 0.3)';
  g.fillRect(0, 0, w, h);
  // The slab: a rounded rectangle a little inside the canvas, its edge blurred into the grass.
  const pad = 0.5 * ppm;
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mg = mask.getContext('2d')!;
  mg.filter = `blur(${0.25 * ppm}px)`;
  mg.fillStyle = '#000';
  mg.beginPath();
  mg.roundRect(pad, pad, w - 2 * pad, h - 2 * pad, 2.2 * ppm);
  mg.fill();
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask, 0, 0);
  // Broken bits along the rim.
  g.globalCompositeOperation = 'destination-out';
  const rim = 2 * (w + h);
  for (let i = 0; i < rim / 14; i++) {
    const t = rnd() * rim;
    const [x, y] = t < w ? [t, pad] : t < w + h ? [w - pad, t - w] : t < 2 * w + h ? [t - w - h, h - pad] : [pad, t - 2 * w - h];
    g.fillStyle = `rgba(0, 0, 0, ${0.3 + rnd() * 0.5})`;
    g.beginPath();
    g.arc(x, y, (0.1 + rnd() * 0.3) * ppm, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Packed earth of the threshing floor with straw ground into it, fading into the grass at the rim. */
function harmanTexture(seed: number): THREE.CanvasTexture {
  const n = 512;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const rnd = makeRng(seed + 17);
  const base = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  base.addColorStop(0, 'rgba(112, 88, 60, 1)');
  base.addColorStop(0.72, 'rgba(104, 81, 55, 1)');
  base.addColorStop(0.9, 'rgba(98, 76, 52, 0.55)');
  base.addColorStop(1, 'rgba(98, 76, 52, 0)');
  g.fillStyle = base;
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 50; i++) {
    const x = rnd() * n;
    const y = rnd() * n;
    const r = 20 + rnd() * 60;
    const m = g.createRadialGradient(x, y, 0, x, y, r);
    m.addColorStop(0, rnd() < 0.5 ? 'rgba(170, 146, 108, 0.25)' : 'rgba(96, 76, 52, 0.25)');
    m.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = m;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Straw.
  for (let i = 0; i < 220; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * n * 0.44;
    const x = n / 2 + Math.cos(a) * d;
    const y = n / 2 + Math.sin(a) * d;
    const l = 2 + rnd() * 5;
    const t = rnd() * Math.PI;
    g.strokeStyle = `hsla(${38 + rnd() * 10}, ${25 + rnd() * 15}%, ${48 + rnd() * 14}%, ${0.25 + rnd() * 0.3})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(t) * l, y + Math.sin(t) * l);
    g.stroke();
  }
  // Ragged rim: the grass creeps in.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 160; i++) {
    const a = rnd() * Math.PI * 2;
    const d = n * (0.42 + rnd() * 0.08);
    g.fillStyle = `rgba(0, 0, 0, ${0.3 + rnd() * 0.5})`;
    g.beginPath();
    g.arc(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, 6 + rnd() * 16, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * The harman in front of the house: a round patch laid on the levelled ground; on the painted ground a
 * concrete slab instead, from the front of the house out over the harman (as village yards are poured).
 */
export function harmanMesh(f: Field, heightAt: (x: number, z: number) => number): THREE.Mesh | null {
  const h = f.harman;
  if (!h) return null;
  const concrete = groundTextures()?.concrete?.image as CanvasImageSource | undefined;
  let g: THREE.PlaneGeometry;
  let cx = h.x;
  let cz = h.z;
  let map: THREE.CanvasTexture;
  let span: [number, number];
  if (concrete) {
    // Along the line from the house to the harman: from just off the house's front to past the harman.
    const dx = h.x - f.house.x;
    const dz = h.z - f.house.z;
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d;
    const uz = dz / d;
    const from = 0.5;
    const to = d + h.r * 1.15;
    const len = to - from;
    const wid = h.r * 2.3;
    cx = f.house.x + ux * (from + len / 2);
    cz = f.house.z + uz * (from + len / 2);
    g = new THREE.PlaneGeometry(len, wid, Math.round(len * 2), Math.round(wid * 2));
    g.rotateX(-Math.PI / 2);
    g.rotateY(-Math.atan2(uz, ux));
    map = concreteHarman(f.level.seed, len, wid, concrete);
    span = [len, wid];
  } else {
    const r = h.r * 1.15;
    // A fine grid (the texture makes it round), every vertex on the ground, so nothing pokes through.
    g = new THREE.PlaneGeometry(r * 2, r * 2, 32, 32);
    g.rotateX(-Math.PI / 2);
    map = harmanTexture(f.level.seed);
    span = [r * 2, r * 2];
  }
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(cx + p.getX(i), cz + p.getZ(i)) + 0.04);
  g.computeVertexNormals();
  // The same lumpy mud as the lane, so the one runs into the other (concrete: nearly flat).
  const normalMap = mudNormals(f.level.seed);
  normalMap.repeat.set(span[0] / 0.8, span[1] / 0.8);
  const bump = concrete ? 0.2 : 0.7;
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(bump, bump), roughness: 0.95, metalness: 0, transparent: true, depthWrite: false }));
  m.position.set(cx, 0, cz);
  m.receiveShadow = true;
  m.renderOrder = 1;
  return m;
}
