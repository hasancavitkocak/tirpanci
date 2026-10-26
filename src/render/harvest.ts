import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LEVELS, TRAILER } from '../game/config';
import type { Field } from '../game/field';
import { HARVEST, HarvestState, PilePlace, beansKg } from '../game/harvest';
import { village } from '../game/village';

/**
 * The harvest drawn (game/harvest.ts): the white sacks, lying, waiting by a track and stacked on
 * the vehicle; the nuts spread on the harman (green-brown in their husks, browner dried) the hose takes
 * away cell by cell; the blue tarp beside the harman with the clean nuts heaped on it; the patos behind
 * the tractor (PatosRig), its hose from the worker's hands to its cyclone, and the nuts pouring out of
 * its chute onto the tarp while it sucks.
 */

/** A sack (cuval.glb when there is one; else drawn): its size lying, metres. */
export const SACK = { len: 0.78, dia: 0.4 };

/**
 * The harvest's places in the yard, marked on the ground (field coordinates): where the load is emptied
 * (the vehicle's bed in it: east of the harman), where the patos stands (backed in, its tow bar to the
 * south: north-east of the harman, by the garage) and the blue tarp beside it.
 */
export function harvestSpots(f: Field): { unload: Spot; patos: Spot; tarp: Spot } {
  const h = f.harman;
  return {
    unload: { x: h.x + h.r + 2.4, z: h.z + 0.5, yaw: 0, w: 3, d: 4.4 },
    patos: { x: h.x + 6.5, z: h.z - 7, yaw: 0, w: 2.6, d: 4.2 },
    tarp: { x: h.x + 2.8, z: h.z - 7.4, yaw: 0, w: 3.4, d: 3.4 },
  };
}
export interface Spot {
  x: number;
  z: number;
  yaw: number;
  /** Its size across and along (m). */
  w: number;
  d: number;
}

/** A point inside a spot (with `m` metres to spare round it). */
export function inSpot(sp: Spot, x: number, z: number, m = 0): boolean {
  const dx = x - sp.x;
  const dz = z - sp.z;
  const c = Math.cos(sp.yaw);
  const sn = Math.sin(sp.yaw);
  const across = dx * c - dz * sn;
  const along = dx * sn + dz * c;
  return Math.abs(across) <= sp.w / 2 + m && Math.abs(along) <= sp.d / 2 + m;
}

/** The heap of nuts on the harman: one, big, in its middle (kept as a list so it could be several). */
export const HEAPS = 1;
export function harmanHeaps(f: Field): { x: number; z: number }[] {
  const h = f.harman;
  const out = [{ x: h.x, z: h.z }];
  for (let i = 0; i < HEAPS - 1; i++) {
    const a = (i / (HEAPS - 1)) * Math.PI * 2 + 0.4;
    out.push({ x: h.x + Math.cos(a) * h.r * 0.58, z: h.z + Math.sin(a) * h.r * 0.58 });
  }
  return out;
}

/** The harman's nut cells (HARVEST.cells): a share of each heap, cell i in heap i % HEAPS (at its middle). */
export function harmanCells(f: Field): { x: number; z: number }[] {
  const heaps = harmanHeaps(f);
  return Array.from({ length: HARVEST.cells }, (_, i) => heaps[i % HEAPS]);
}

/** Where the blue tarp lies (its marked place). */
export function tarpSpot(f: Field): { x: number; z: number; yaw: number } {
  return harvestSpots(f).tarp;
}

/** A spot's mark on the ground: a yellow frame, its name painted in it. */
function spotMark(sp: Spot, label: string, ground: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.85, depthWrite: false });
  const t = 0.14;
  for (const [w, d, x, z] of [
    [sp.w, t, 0, -sp.d / 2],
    [sp.w, t, 0, sp.d / 2],
    [t, sp.d, -sp.w / 2, 0],
    [t, sp.d, sp.w / 2, 0],
  ]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0, z);
    g.add(m);
  }
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.font = 'bold 40px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 8;
  x.strokeStyle = 'rgba(40, 30, 0, 0.7)';
  x.strokeText(label, 128, 34);
  x.fillStyle = '#ffd23a';
  x.fillText(label, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const text = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(sp.w * 0.95, 2.6), Math.min(sp.w * 0.95, 2.6) / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  text.rotation.x = -Math.PI / 2;
  text.rotation.z = Math.PI;
  text.position.z = sp.d / 2 - 0.45;
  g.add(text);
  g.position.set(sp.x, ground(sp.x, sp.z) + 0.04, sp.z);
  g.rotation.y = sp.yaw;
  g.renderOrder = 2;
  return g;
}

/** A photo of nuts heaped, seen from above, as a texture repeated over a heap (the photos tile without seams). */
function nutSkin(file: string, u: number, v: number): THREE.Texture {
  const t = new THREE.TextureLoader().load(`./textures/${file}`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(u, v);
  t.anisotropy = 4;
  return t;
}

/** The tarp's side (m), and the clean nuts' texture: its tiles a metre. */
const TARP = 3.6;
const NUTS_A_METRE = 1.6;

/** A heap's size when full (m). */
const HEAP = { r: 3.0, h: 2.1 };
/** The heap's foot from its middle (m), for the hose reaching it. */
export const HEAP_R = HEAP.r;
/** A heap's height at a share t of its radius out (0 the top, 1 the foot): wide, rising high, its top rounded. */
const heapY = (t: number): number => HEAP.h * (1 - t ** 1.6);

/** A heap's mound: a tall cone, lumpy, its colours the green and brown of husks. */
function heapGeometry(seed: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(HEAP.r * t, heapY(t)));
  }
  const g = new THREE.LatheGeometry(pts, 32);
  const p = g.getAttribute('position');
  const col: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const n = Math.sin(x * 9 + seed) * Math.cos(z * 11 - seed) * 0.04;
    p.setY(i, Math.max(0, p.getY(i) + n));
    c.setHSL(0.16 + Math.sin(x * 23 + z * 17 + seed) * 0.03, 0.45, 0.28 + Math.cos(x * 13 - z * 19) * 0.05);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}


/** How far a pile stands from the middle of its track (m). */
const PILE_OFF = 3.4;

/** Where the vehicle's bed is brought to load a lot of sacks: on the track beside its pile, along it. */
export function loadSpot(f: Field, garden: number): Spot | null {
  const p = (f.harvestPiles ?? HARVEST.piles)[garden];
  const lv = LEVELS.find((l) => l.id === garden);
  if (!lv || !p || (lv.region ?? 1) !== f.region.id) return null;
  return { x: p.x - f.origin.x, z: p.z - f.origin.z, yaw: p.yaw, w: 2.8, d: 4.2 };
}

/** Where a lot of sacks waits by its track (field coordinates; null: not in this village), and the track's heading. */
export function sackPile(f: Field, garden: number): { x: number; z: number; yaw: number } | null {
  const sp = loadSpot(f, garden);
  const p = (f.harvestPiles ?? HARVEST.piles)[garden];
  if (!sp) return null;
  return { x: sp.x + Math.cos(p.yaw) * PILE_OFF * p.side, z: sp.z - Math.sin(p.yaw) * PILE_OFF * p.side, yaw: p.yaw };
}

/**
 * Two places for a new harvest's sacks, by the village's tracks (the routes to its fields): somewhere the
 * track runs straight, the pile's side of it clear, away from the harman, every field and its gate, the
 * stream and the bridge; picked with `rnd` (field coordinates in, village coordinates kept). Null if
 * none fit.
 */
export function pickPiles(f: Field, rnd: () => number): Record<number, PilePlace> | null {
  const V = village(f.region);
  const O = f.origin;
  const gates = [...f.others.map((o) => ({ x: o.level.theme === 'mezarlik' ? (o.minX + o.maxX) / 2 : o.entryX, z: o.maxZ + 1.5 })), { x: f.entryX, z: f.depth / 2 + 1.5 }];
  const rects = [...f.others, { minX: -f.width / 2, maxX: f.width / 2, minZ: -f.depth / 2, maxZ: f.depth / 2 }];
  const br = f.region.bridge;
  const ok = (x: number, z: number, clear: number) =>
    f.pointFree(x, z) &&
    !f.inWater(x, z) &&
    !rects.some((r) => x > r.minX - clear && x < r.maxX + clear && z > r.minZ - clear && z < r.maxZ + clear);
  const cands: PilePlace[] = [];
  for (const pts of Object.values(V.routes)) {
    for (let i = 4; i < pts.length - 4; i += 3) {
      const a = pts[i - 4];
      const b = pts[i + 4];
      const p = pts[i];
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const turn = Math.atan2(p.x - a.x, p.z - a.z) - Math.atan2(b.x - p.x, b.z - p.z);
      if (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 0.2) continue;
      const x = p.x - O.x;
      const z = p.z - O.z;
      const dh = Math.hypot(x - f.harman.x, z - f.harman.z);
      if (dh < 45 || dh > 230) continue;
      if (gates.some((g) => Math.hypot(g.x - x, g.z - z) < 16)) continue;
      if (br && Math.hypot(br.x - p.x, br.z - p.z) < br.len / 2 + 8) continue;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      // The vehicle's place on the track.
      if (![-2.2, 0, 2.2].every((t) => ok(x + fx * t, z + fz * t, 2))) continue;
      for (const side of rnd() < 0.5 ? [1, -1] : [-1, 1]) {
        const px = x + Math.cos(yaw) * PILE_OFF * side;
        const pz = z - Math.sin(yaw) * PILE_OFF * side;
        if ([-1.2, 0, 1.2].every((t) => ok(px + fx * t, pz + fz * t, 3)) && ok(px + Math.cos(yaw) * side, pz - Math.sin(yaw) * side, 3)) {
          cands.push({ x: p.x, z: p.z, yaw, side });
          break;
        }
      }
    }
  }
  if (!cands.length) return null;
  const first = cands[Math.floor(rnd() * cands.length)];
  // The second some way from the first (another stretch of track, or the same one further on).
  const far = cands.filter((c) => Math.hypot(c.x - first.x, c.z - first.z) > 25 && Math.hypot(c.x - first.x, c.z - first.z) < 120);
  const second = far.length ? far[Math.floor(rnd() * far.length)] : (cands.find((c) => c !== first) ?? first);
  const [g1, g2] = HARVEST.gardens;
  return { [g1]: first, [g2]: second };
}

function sackGeometry(): THREE.BufferGeometry {
  // A squashed capsule lying along x, a little lumpy; its sewn mouth a seam at +x.
  const g = new THREE.CapsuleGeometry(SACK.dia / 2, SACK.len - SACK.dia, 4, 10);
  g.rotateZ(Math.PI / 2);
  g.scale(1, 0.72, 1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const k = 1 + Math.sin(x * 19 + p.getZ(i) * 13) * 0.04;
    p.setY(i, p.getY(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  g.translate(0, (SACK.dia * 0.72) / 2, 0);
  g.computeVertexNormals();
  return g;
}

/** A sack, lying, its middle bottom at its origin, along x. */
function makeSack(model?: GLTF): THREE.Object3D {
  if (model) {
    const s = model.scene.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    // Made standing (taller than long): laid down on its side.
    const o = new THREE.Group();
    if (size.y > Math.max(size.x, size.z)) {
      s.rotation.z = Math.PI / 2;
      s.scale.setScalar(SACK.len / size.y);
    } else s.scale.setScalar(SACK.len / Math.max(size.x, size.z));
    o.add(s);
    const b = new THREE.Box3().setFromObject(o);
    s.position.y -= b.min.y;
    s.position.x -= (b.min.x + b.max.x) / 2;
    s.position.z -= (b.min.z + b.max.z) / 2;
    return o;
  }
  const m = new THREE.Mesh(SACK_GEO, SACK_MAT);
  m.castShadow = m.receiveShadow = true;
  const seam = new THREE.Mesh(SEAM_GEO, SEAM_MAT);
  seam.position.set(SACK.len / 2 - 0.06, (SACK.dia * 0.72) / 2, 0);
  m.add(seam);
  return m;
}
const SACK_GEO = sackGeometry();
const SACK_MAT = new THREE.MeshLambertMaterial({ color: '#f1efe8' });
const SEAM_GEO = new THREE.BoxGeometry(0.04, SACK.dia * 0.62, SACK.dia * 0.8);
const SEAM_MAT = new THREE.MeshLambertMaterial({ color: '#d9d4c4' });

/**
 * Slots for `n` sacks in a load bed (local to it): lying across it, side by side along it, `rows` a layer
 * from `z0` towards `z1`, `cols` across, layer upon layer from the floor `y`.
 */
function slots(n: number, cols: number, rows: number, y: number, z0: number, z1: number, width: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; out.length < n; i++) {
    const layer = Math.floor(i / (cols * rows));
    const k = i % (cols * rows);
    const row = Math.floor(k / cols);
    const col = k % cols;
    const x = cols === 1 ? 0 : -width / 2 + (width * (col + 0.5)) / cols;
    const z = rows === 1 ? (z0 + z1) / 2 : z0 + ((z1 - z0) * row) / (rows - 1);
    out.push(new THREE.Vector3(x, y + layer * SACK.dia * 0.68, z));
  }
  return out;
}

/** The patos, towed behind the tractor (as the trailer, on its hitch): a drawn machine until patos.glb comes. */
export class PatosRig {
  /** Origin on the ground under its axle, +Z towards the tractor. */
  readonly group = new THREE.Group();
  /** Where its hose leaves the cyclone on top, and its chute's mouth (local). */
  readonly inlet = new THREE.Vector3(0, 2.3, 0.9);
  readonly chute = new THREE.Vector3(1.0, 0.9, -0.2);
  private readonly wheels: THREE.Object3D[] = [];
  private readonly drum: THREE.Object3D;

  constructor(model?: GLTF) {
    const orange = new THREE.MeshLambertMaterial({ color: '#f07a12' });
    const black = new THREE.MeshLambertMaterial({ color: '#222' });
    const grey = new THREE.MeshLambertMaterial({ color: '#9a9a9a' });
    const R = 0.36;
    this.drum = new THREE.Group();
    if (model) {
      // The model: its tow bar towards +X, about 3.5 m long with it.
      const s = model.scene.clone(true);
      const box = new THREE.Box3().setFromObject(s);
      const k = 3.5 / Math.max(0.01, box.max.x - box.min.x);
      s.scale.setScalar(k);
      s.rotation.y = -Math.PI / 2;
      // Its tow bar's eye (the model's +X end, now +Z) on the tractor's hitch, TRAILER.length ahead of
      // this group's origin; its width centred (the model's z turns to -x).
      s.position.set(((box.min.z + box.max.z) / 2) * k, -box.min.y * k, TRAILER.length - box.max.x * k);
      this.group.add(s);
    } else {
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.set(rx, ry, rz);
        m.castShadow = m.receiveShadow = true;
        this.group.add(m);
        return m;
      };
      add(new THREE.BoxGeometry(1.5, 1.0, 2.0), orange, 0, R + 0.65, 0);
      add(new THREE.BoxGeometry(1.3, 0.6, 0.9), orange, 0, R + 1.4, -0.6, -0.25, 0, 0);
      // The conveyor arm up to the cyclone.
      add(new THREE.BoxGeometry(0.35, 0.18, 2.3), black, -0.6, R + 1.4, 0.2, 0.75, 0, 0);
      add(new THREE.CylinderGeometry(0.42, 0.18, 0.9, 12), orange, 0, R + 2.0, 0.9);
      // The chute for the clean nuts out to the side.
      add(new THREE.BoxGeometry(0.7, 0.12, 0.35), orange, 0.95, R + 0.55, -0.2, 0, 0, -0.35);
      // The drum's belt cover (turns while it runs).
      const cover = add(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14), black, -0.8, R + 0.75, -0.4, 0, 0, Math.PI / 2);
      this.drum = cover;
      // The tow bar to the hitch.
      add(new THREE.BoxGeometry(0.12, 0.1, TRAILER.length - 0.7), grey, 0, R + 0.25, 1.0 + (TRAILER.length - 0.7) / 2);
      for (const s of [-1, 1]) {
        const w = add(new THREE.CylinderGeometry(R, R, 0.22, 16), black, s * 0.9, R, 0, 0, 0, Math.PI / 2);
        this.wheels.push(w);
      }
    }
  }

  update(distance: number, running: boolean, dt: number): void {
    for (const w of this.wheels) w.rotation.x += distance / 0.36;
    if (running) this.drum.rotation.x += dt * 14;
  }

  /** Behind the tractor's hitch, on the ground under its wheels. */
  place(f: Field, ground: (x: number, z: number) => number): void {
    const a = f.trailerAxle();
    this.group.visible = !!a;
    if (!a) return;
    const w = f.trailerWheels();
    const gr = ground(w[0].x, w[0].z);
    const gl = ground(w[1].x, w[1].z);
    this.group.position.set(a.x, (gr + gl) / 2, a.z);
    this.group.rotation.set(0, a.yaw, Math.atan2(gl - gr, TRAILER.track * 2), 'YXZ');
  }
}

/** The harvest in the village: built for the field's village, updated every frame from the state. */
export class HarvestView {
  readonly group = new THREE.Group();
  private readonly heaps: { x: number; z: number }[];
  /** Each heap: its mound (scaled with how much is left). */
  private readonly heapObjs: { mound: THREE.Mesh; group: THREE.Group }[] = [];
  private readonly marks: { unload: THREE.Group; patos: THREE.Group; piles: Map<number, THREE.Group> };
  private readonly piles = new Map<number, THREE.Group>();
  private readonly tarp: THREE.Group;
  /** The clean nuts spread over the tarp (as wide as there are). */
  private readonly layer: THREE.Mesh;
  private readonly cargo = new THREE.Group();
  private cargoKey = '';
  private readonly hose: THREE.Mesh;
  private readonly pour: THREE.InstancedMesh;
  private key = '';
  /** The player has a patos (bought; on the tractor or not): its place by the harman is shown. */
  patosOwned = false;

  constructor(
    f: Field,
    private readonly ground: (x: number, z: number) => number,
    private readonly sackModel?: GLTF,
  ) {
    // The heaps of nuts in their husks: a wide mound, a photo of them for its skin.
    this.heaps = harmanHeaps(f);
    // Its skin: fresh nuts in their husks seen from above, about 2.3 m a tile.
    const moundMat = new THREE.MeshLambertMaterial({ map: nutSkin('yas-findik.webp', 8, 1.6), side: THREE.DoubleSide });
    for (const c of this.heaps) {
      const group = new THREE.Group();
      // (Shown once the state says there are nuts: update.)
      group.visible = false;
      group.position.set(c.x, ground(c.x, c.z), c.z);
      const mound = new THREE.Mesh(heapGeometry(c.x * 3.1 + c.z), moundMat);
      mound.castShadow = mound.receiveShadow = true;
      group.add(mound);
      this.group.add(group);
      this.heapObjs.push({ mound, group });
    }
    // The places marked on the ground.
    const spots = harvestSpots(f);
    this.marks = { unload: spotMark(spots.unload, 'BOŞALTMA', ground), patos: spotMark(spots.patos, 'PATOS', ground), piles: new Map() };
    this.group.add(this.marks.unload, this.marks.patos);
    // The tarp: all blue, a little crumpled, its edges turned up; the clean nuts spread thin over it.
    const t = tarpSpot(f);
    this.tarp = new THREE.Group();
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(TARP, TARP, 20, 20), new THREE.MeshLambertMaterial({ color: '#2a63c9', side: THREE.DoubleSide }));
    sheet.rotation.x = -Math.PI / 2;
    const sp = sheet.geometry.getAttribute('position');
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i);
      const y = sp.getY(i);
      const e = Math.max(Math.abs(x), Math.abs(y)) / (TARP / 2);
      // Creases (a few long folds and small wrinkles), the edges a little up.
      const crease = Math.abs(Math.sin(x * 2.3 + y * 0.9)) * 0.035 + Math.sin(x * 7.1 - y * 5.3) * 0.012;
      sp.setZ(i, 0.015 + crease + (e > 0.92 ? 0.05 : 0));
    }
    sheet.geometry.computeVertexNormals();
    sheet.receiveShadow = true;
    // The nuts: a thin bumpy layer, its edge ragged, laid on the tarp's middle.
    const lg = new THREE.PlaneGeometry(1, 1, 24, 24);
    const lp = lg.getAttribute('position');
    for (let i = 0; i < lp.count; i++) {
      const x = lp.getX(i);
      const y = lp.getY(i);
      const e = Math.max(Math.abs(x), Math.abs(y)) * 2;
      // The edge rounded off and gently wavy (as raked out); the middle a little thicker.
      const pull = e > 0.95 ? 0.94 + Math.sin(Math.atan2(y, x) * 5) * 0.025 - (Math.abs(x) > 0.45 && Math.abs(y) > 0.45 ? 0.08 : 0) : 1;
      lp.setXYZ(i, x * pull, y * pull, 0.05 * (1 - e * e) + Math.abs(Math.sin(x * 41) * Math.cos(y * 37)) * 0.015);
    }
    lg.computeVertexNormals();
    this.layer = new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ map: nutSkin('tane-findik.webp', 1, 1) }));
    this.layer.rotation.x = -Math.PI / 2;
    this.layer.position.y = 0.05;
    this.layer.receiveShadow = true;
    this.tarp.add(sheet, this.layer);
    this.tarp.position.set(t.x, ground(t.x, t.z) + 0.02, t.z);
    this.tarp.rotation.y = t.yaw;
    this.group.add(this.tarp);
    for (const g of HARVEST.gardens) {
      const p = sackPile(f, g);
      if (!p) continue;
      const pile = new THREE.Group();
      pile.position.set(p.x, ground(p.x, p.z), p.z);
      // The sacks lying along the track.
      pile.rotation.y = p.yaw + Math.PI / 2;
      this.group.add(pile);
      this.piles.set(g, pile);
      // Where the vehicle's bed is brought, beside the pile.
      const mark = spotMark(loadSpot(f, g)!, 'ÇUVAL YÜKLE', ground);
      this.group.add(mark);
      this.marks.piles.set(g, mark);
    }
    // The hose: a corrugated tube, rebuilt along its sag while in hand.
    this.hose = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: '#e0521a' }));
    this.hose.castShadow = true;
    this.hose.visible = false;
    this.group.add(this.hose);
    // The nuts pouring from the chute.
    this.pour = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 5, 4), new THREE.MeshLambertMaterial({ color: '#8a5a2b' }), 40);
    this.pour.visible = false;
    this.pour.frustumCulled = false;
    this.group.add(this.pour);
  }

  /**
   * Sacks in a group, stacked as at a gate: lying side by side in a row, the next layer in the hollows
   * between them, one fewer each layer up (4, 3, 1 for eight).
   */
  private fillPile(g: THREE.Group, n: number): void {
    if (g.children.length === n) return;
    g.clear();
    const d = SACK.dia;
    const h = d * 0.62;
    const rows = [4, 3, 2, 1];
    let left = n;
    for (let layer = 0; left > 0; layer++) {
      const m = Math.min(left, rows[Math.min(layer, rows.length - 1)]);
      for (let i = 0; i < m; i++) {
        const s = makeSack(this.sackModel);
        // Across the row (each lying along x, the row along z), centred, each layer half a sack in.
        s.position.set(0, layer * h, (i - (m - 1) / 2) * d * 1.02);
        s.rotation.y = ((i * 37 + layer * 11) % 7) * 0.012;
        g.add(s);
      }
      left -= m;
    }
  }

  /**
   * Every frame: the piles at the gates, the load on the vehicle (in `bed`: the pat pat's chassis or the
   * trailer, its floor `floorY`, the bed from `z0` to `z1`, `width` across), the harman, the tarp, and the
   * patos's hose to `hand` (null: not in hand) with the nuts pouring while it sucks.
   */
  update(
    h: HarvestState | null,
    bed: { obj: THREE.Object3D; floorY: number; z0: number; z1: number; width: number; cols: number; rows: number; along?: boolean } | null,
    patos: PatosRig | null,
    hand: THREE.Vector3 | null,
    sucking: boolean,
    time: number,
  ): void {
    this.group.visible = !!h;
    if (!h) return;
    for (const [g, pile] of this.piles) this.fillPile(pile, h.stage === 'collect' ? (h.waiting[g] ?? 0) : 0);
    // The load: rebuilt when it or the bed changes.
    const ck = `${h.load}:${bed?.obj.uuid ?? ''}`;
    if (ck !== this.cargoKey) {
      this.cargoKey = ck;
      this.cargo.removeFromParent();
      this.cargo.clear();
      if (bed && h.load > 0) {
        const ps = slots(h.load, bed.cols, bed.rows, bed.floorY, bed.z0, bed.z1, bed.width);
        // (Each layer up drawn in a little, as a load is roped on.)
        for (const p of ps) p.x *= 1 - Math.min(0.25, (p.y - bed.floorY) * 0.12);
        for (const p of ps) {
          const s = makeSack(this.sackModel);
          s.position.copy(p);
          // (Lengthways, mouths to the front, where the bed is longer than a sack is.)
          if (bed.along) s.rotation.y = Math.PI / 2;
          this.cargo.add(s);
        }
        bed.obj.add(this.cargo);
      }
    }
    // The heaps: each as big as its share spread and not yet sucked up (cell i is heap i % HEAPS).
    const spreadCells = h.stage === 'collect' ? Math.round((h.spread / (HARVEST.gardens.length * HARVEST.sacksPer)) * HARVEST.cells) : h.stage === 'drying' || h.stage === 'thresh' ? HARVEST.cells : 0;
    const sucked = new Set(h.sucked ?? []);
    const nk = `${h.stage}:${spreadCells}:${sucked.size}`;
    if (nk !== this.key) {
      this.key = nk;
      const per = HARVEST.cells / HEAPS;
      const dried = h.stage !== 'collect' && h.stage !== 'drying';
      this.heapObjs.forEach((o, k) => {
        let left = 0;
        for (let i = k; i < spreadCells; i += HEAPS) if (!sucked.has(i)) left++;
        const f = left / per;
        o.group.visible = f > 0.01;
        // Lower and narrower as it goes (its volume with what is left).
        o.group.scale.set(0.55 + 0.45 * Math.sqrt(f), 0.3 + 0.7 * f, 0.55 + 0.45 * Math.sqrt(f));
        (o.mound.material as THREE.MeshLambertMaterial).color.set(dried ? '#c99a62' : '#ffffff');
      });
    }
    // The marks: where to go next.
    const loaded = h.load > 0;
    for (const [g, m] of this.marks.piles) m.visible = h.stage === 'collect' && (h.waiting[g] ?? 0) > 0;
    this.marks.unload.visible = h.stage === 'collect' && loaded;
    // The patos's place: shown once one is bought (none bought, nothing there), while the nuts dry and are threshed.
    this.marks.patos.visible = (h.stage === 'drying' || h.stage === 'thresh') && (this.patosOwned || !!patos);
    // The clean nuts on the tarp, spread as wide as there are (the nuts the same size whatever the width).
    const kg = beansKg(h);
    const all = HARVEST.gardens.length * HARVEST.sacksPer * HARVEST.kgPerSack;
    const k = kg / all;
    const w = (TARP - 0.5) * (0.3 + 0.7 * Math.sqrt(k));
    this.layer.visible = k > 0.01;
    this.layer.scale.set(w, w, 1);
    const lm = this.layer.material as THREE.MeshLambertMaterial;
    lm.map!.repeat.set(w * NUTS_A_METRE, w * NUTS_A_METRE);
    // Still damp: a little darker until it dries.
    lm.color.set(h.stage === 'thresh' || h.stage === 'beans' ? '#d9c6b0' : '#ffffff');
    this.tarp.visible = h.stage === 'thresh' || h.stage === 'beans' || h.stage === 'sell';
    // The hose: from the cyclone to the hands, sagging to the ground between.
    this.hose.visible = !!(patos && hand);
    if (patos && hand) {
      patos.group.updateMatrixWorld(true);
      const a = patos.inlet.clone().applyMatrix4(patos.group.matrixWorld);
      const mid = a.clone().lerp(hand, 0.5);
      mid.y = Math.min(a.y, hand.y) - 0.9;
      mid.y = Math.max(mid.y, this.ground(mid.x, mid.z) + 0.1);
      const curve = new THREE.CatmullRomCurve3([a, a.clone().lerp(mid, 0.5).setY(a.y - 0.3), mid, hand.clone()]);
      this.hose.geometry.dispose();
      this.hose.geometry = new THREE.TubeGeometry(curve, 24, 0.06, 8, false);
    }
    // The nuts pouring from the chute onto the tarp in an arc while it sucks.
    this.pour.visible = !!(patos && sucking);
    if (patos && sucking) {
      const from = patos.chute.clone().applyMatrix4(patos.group.matrixWorld);
      const to = this.tarp.position.clone().setY(this.tarp.position.y + 0.1);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 40; i++) {
        const t = (i / 40 + time * 1.3) % 1;
        const p = from.clone().lerp(to, t);
        p.y += Math.sin(t * Math.PI) * 0.6 + (Math.sin(i * 12.9) * 0.05);
        p.x += Math.sin(i * 7.1) * 0.08;
        p.z += Math.cos(i * 5.3) * 0.08;
        m.makeTranslation(p.x, p.y, p.z);
        this.pour.setMatrixAt(i, m);
      }
      this.pour.instanceMatrix.needsUpdate = true;
    }
  }
}
