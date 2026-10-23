import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from '../game/rng';
import { paint } from './props';

/**
 * Procedural stand-ins for the new places (until the artist models in docs/MODELS.md exist):
 * gravestones, the village mosque, the highland hut, the courtyard wall, the road and its traffic,
 * and beehives. All vertex-coloured, flat-shaded low poly like props.ts.
 */

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function mesh(parts: THREE.BufferGeometry[]): THREE.Mesh {
  const m = new THREE.Mesh(merge(parts), MAT);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, rnd: () => number, jitter = 0.1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return paint(g, color, jitter, rnd);
}

/**
 * Old village gravestone, ~1.1 m: weathered slab facing +z. Variants: rounded top, a carved turban
 * (sarık) on top, pointed arch.
 */
export function graveGeometry(variant: number): THREE.BufferGeometry {
  const rnd = makeRng(300 + variant);
  const stone = ['#a9a69c', '#9c9a92', '#b5b0a3'][variant % 3];
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(0.46, 0.85, 0.1, 0, 0.42, 0, stone, rnd, 0.12));
  if (variant % 3 === 0) {
    const top = new THREE.CylinderGeometry(0.23, 0.23, 0.1, 10, 1, false, 0, Math.PI);
    // Half disc (x >= 0 half round the y axis) turned to face +z with the round side up.
    top.rotateX(Math.PI / 2);
    top.rotateZ(Math.PI / 2);
    top.translate(0, 0.85, 0);
    parts.push(paint(top, stone, 0.1, rnd));
  } else if (variant % 3 === 1) {
    const neck = new THREE.CylinderGeometry(0.1, 0.12, 0.12, 8);
    neck.translate(0, 0.91, 0);
    parts.push(paint(neck, stone, 0.1, rnd));
    const turban = new THREE.SphereGeometry(0.17, 8, 6);
    turban.scale(1, 0.75, 1);
    turban.translate(0, 1.06, 0);
    parts.push(paint(turban, '#c9c4b6', 0.15, rnd));
  } else {
    const arch = new THREE.ConeGeometry(0.33, 0.3, 4);
    arch.rotateY(Math.PI / 4);
    arch.scale(1, 1, 0.22);
    arch.translate(0, 0.99, 0);
    parts.push(paint(arch, stone, 0.1, rnd));
  }
  // Moss at the foot and a small footstone behind.
  parts.push(box(0.54, 0.08, 0.18, 0, 0.04, 0, '#5d6b3a', rnd, 0.2));
  parts.push(box(0.3, 0.32, 0.08, 0, 0.16, 1.5, stone, rnd, 0.12));
  return merge(parts);
}

/** A boulder (radius ~1): dark grey weathered rock, moss on the upper faces. */
export function boulderGeometry(): THREE.BufferGeometry {
  const rnd = makeRng(17);
  const g = new THREE.DodecahedronGeometry(1, 1).toNonIndexed();
  const p = g.getAttribute('position');
  // Jitter each corner once (faces sharing it get the same offset, so the rock stays closed).
  const key = (x: number, y: number, z: number) => `${Math.round(x * 50)},${Math.round(y * 50)},${Math.round(z * 50)}`;
  const base = new THREE.DodecahedronGeometry(1, 1).toNonIndexed().getAttribute('position');
  const jit = new Map<string, number>();
  const c = new THREE.Color();
  const col = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) {
    const id = key(base.getX(k), base.getY(k), base.getZ(k));
    if (!jit.has(id)) jit.set(id, 0.85 + rnd() * 0.3);
    const n = jit.get(id)!;
    p.setXYZ(k, base.getX(k) * n, base.getY(k) * 0.65 * n, base.getZ(k) * n);
  }
  for (let k = 0; k < p.count; k += 3) {
    const up = (p.getY(k) + p.getY(k + 1) + p.getY(k + 2)) / 3;
    c.set(up > 0.35 && rnd() < 0.7 ? '#4f5e33' : '#5f5d57').multiplyScalar(0.85 + rnd() * 0.3);
    for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (k + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** Small Black Sea village mosque: whitewashed stone base, timber upper walls, hipped tin roof, slim minaret. */
export function mosqueGroup(): THREE.Group {
  const rnd = makeRng(41);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(8, 3, 6.5, 0, 1.5, 0, '#ece7dc', rnd, 0.05));
  parts.push(box(8.3, 2.2, 6.8, 0, 4.1, 0, '#8a5a36', rnd, 0.1));
  for (let x = -3.6; x <= 3.6; x += 1.2) parts.push(box(0.14, 2.2, 0.06, x, 4.1, 3.42, '#5e3b22', rnd, 0));
  const roof = new THREE.ConeGeometry(6.6, 2.4, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1.25, 1, 1);
  roof.translate(0, 6.4, 0);
  parts.push(paint(roof, '#8d9296', 0.08, rnd));
  for (const x of [-2.6, -0.9, 0.9, 2.6]) parts.push(box(0.8, 1.4, 0.06, x, 4.2, 3.46, '#2c3a46', rnd, 0));
  parts.push(box(1.4, 2.2, 0.08, 0, 1.1, 3.27, '#5e3b22', rnd, 0));
  // Minaret: stone foot, slim white shaft, balcony, lead-grey cone.
  const mx = 4.9;
  const mz = 1.8;
  parts.push(box(1.3, 2.4, 1.3, mx, 1.2, mz, '#cfc9bb', rnd, 0.08));
  const shaft = new THREE.CylinderGeometry(0.42, 0.5, 8, 10);
  shaft.translate(mx, 6.4, mz);
  parts.push(paint(shaft, '#f1ede4', 0.04, rnd));
  const balcony = new THREE.CylinderGeometry(0.75, 0.6, 0.35, 10);
  balcony.translate(mx, 8.7, mz);
  parts.push(paint(balcony, '#d8d2c4', 0.05, rnd));
  const upper = new THREE.CylinderGeometry(0.36, 0.4, 1.4, 10);
  upper.translate(mx, 9.6, mz);
  parts.push(paint(upper, '#f1ede4', 0.04, rnd));
  const cap = new THREE.ConeGeometry(0.48, 2.2, 10);
  cap.translate(mx, 11.4, mz);
  parts.push(paint(cap, '#7d8287', 0.06, rnd));
  const g = new THREE.Group();
  g.add(mesh(parts));
  return g;
}

/** Yayla evi: dark log hut on a stone footing with a steep tin roof and a bench by the door. */
export function yaylaHutGroup(): THREE.Group {
  const rnd = makeRng(52);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(4.6, 0.6, 3.8, 0, 0.3, 0, '#8e8c84', rnd, 0.15));
  for (let y = 0.75; y < 2.7; y += 0.3) {
    const log = new THREE.CylinderGeometry(0.15, 0.15, 4.6, 6);
    log.rotateZ(Math.PI / 2);
    log.translate(0, y, 1.8);
    parts.push(paint(log, '#5a3e28', 0.15, rnd));
    const back = log.clone();
    back.translate(0, 0, -3.6);
    parts.push(paint(back, '#5a3e28', 0.15, rnd));
  }
  parts.push(box(4.3, 2.1, 3.4, 0, 1.65, 0, '#6b4a30', rnd, 0.1));
  const roof = new THREE.ConeGeometry(3.9, 2.6, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1.25, 1, 1.05);
  roof.translate(0, 3.95, 0);
  parts.push(paint(roof, '#8c9296', 0.1, rnd));
  parts.push(box(0.9, 1.7, 0.08, 0.8, 1.45, 1.96, '#3d2a1b', rnd, 0));
  parts.push(box(0.6, 0.5, 0.08, -1.2, 1.9, 1.96, '#2c3a46', rnd, 0));
  parts.push(box(1.4, 0.08, 0.35, -1, 0.75, 2.4, '#7a5a3a', rnd, 0.1));
  const g = new THREE.Group();
  g.add(mesh(parts));
  return g;
}

/** Metres of wall one tile of the stone texture covers (across, up). */
const STONE_TW = 1.5;
const STONE_TH = 1.5;

/** The dry-stone wall photo (public/textures), shared by every wall. */
let stoneTex: THREE.Texture | null = null;
function stoneWallTexture(): THREE.Texture {
  if (stoneTex) return stoneTex;
  stoneTex = new THREE.TextureLoader().load('./textures/tas_duvar.webp');
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  stoneTex.colorSpace = THREE.SRGBColorSpace;
  stoneTex.anisotropy = 4;
  return stoneTex;
}

/** Low dry-stone courtyard wall along a polyline (pieces between the points), faced with stone. */
export function stoneWall(points: THREE.Vector3[]): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = a.distanceTo(new THREE.Vector3(b.x, a.y, b.z)) + 0.1;
    const g = new THREE.BoxGeometry(len, 0.75, 0.42);
    // Texture in metres on every face: the faces are +x, -x, +y, -y, +z, -z, four corners each.
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const size = [[0.42, 0.75], [0.42, 0.75], [len, 0.42], [len, 0.42], [len, 0.75], [len, 0.75]];
    const shift = i * 0.37;
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 4; k++) {
        const v = f * 4 + k;
        uv.setXY(v, shift + (uv.getX(v) * size[f][0]) / STONE_TW, (uv.getY(v) * size[f][1]) / STONE_TH);
      }
    }
    g.translate(0, 0.3, 0);
    g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: stoneWallTexture() }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Two-lane country road along z at x = cx, following the ground. */
export function roadMesh(cx: number, z0: number, z1: number, heightAt: (x: number, z: number) => number): THREE.Group {
  const grp = new THREE.Group();
  const half = 3;
  const pos: number[] = [];
  const idx: number[] = [];
  const steps = Math.ceil((z1 - z0) / 1.5);
  // Several points across, each on the ground, so the bumps of the terrain don't show through.
  const across = 7;
  for (let i = 0; i <= steps; i++) {
    const z = z0 + ((z1 - z0) * i) / steps;
    for (let k = 0; k < across; k++) {
      const x = cx - half + (2 * half * k) / (across - 1);
      pos.push(x, heightAt(x, z) + 0.08, z);
    }
    if (i < steps) {
      for (let k = 0; k < across - 1; k++) {
        const a = i * across + k;
        idx.push(a, a + across, a + 1, a + 1, a + across, a + across + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const road = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#4a4c4f' }));
  road.receiveShadow = true;
  grp.add(road);
  // Dashed centre line and solid edge lines.
  const rnd = makeRng(9);
  const lines: THREE.BufferGeometry[] = [];
  for (let z = z0; z < z1; z += 6) {
    const y = heightAt(cx, z + 1.5) + 0.095;
    lines.push(box(0.12, 0.01, 3, cx, y, z + 1.5, '#e8e4d8', rnd, 0));
  }
  for (const s of [-1, 1]) {
    for (let z = z0; z < z1; z += 3) lines.push(box(0.12, 0.01, 3.02, cx + s * (half - 0.25), heightAt(cx + s * (half - 0.25), z + 1.5) + 0.095, z + 1.5, '#e8e4d8', rnd, 0));
  }
  const lm = new THREE.Mesh(merge(lines), new THREE.MeshBasicMaterial({ vertexColors: true }));
  grp.add(lm);
  return grp;
}

/** A small car (procedural), facing +z. */
export function carGroup(color: string, seed: number): THREE.Group {
  const rnd = makeRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(1.7, 0.6, 4, 0, 0.6, 0, color, rnd, 0.05));
  parts.push(box(1.5, 0.55, 2, 0, 1.17, -0.2, color, rnd, 0.05));
  parts.push(box(1.42, 0.45, 2.04, 0, 1.17, -0.2, '#2b3540', rnd, 0));
  for (const [x, z] of [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]]) {
    const w = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10);
    w.rotateZ(Math.PI / 2);
    w.translate(x, 0.32, z);
    parts.push(paint(w, '#1e1e1e', 0, rnd));
  }
  parts.push(box(1.5, 0.15, 0.05, 0, 0.7, 2.01, '#f3e9b5', rnd, 0));
  const g = new THREE.Group();
  g.add(mesh(parts));
  return g;
}

/** Wooden beehive painted pale blue, with a tin lid, on two stones (~0.75 m). Entrance faces +z. */
export function hiveGeometry(): THREE.BufferGeometry {
  const rnd = makeRng(81);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(0.2, 0.18, 0.4, -0.18, 0.09, 0, '#8b8a83', rnd, 0.2));
  parts.push(box(0.2, 0.18, 0.4, 0.18, 0.09, 0, '#8b8a83', rnd, 0.2));
  parts.push(box(0.52, 0.42, 0.44, 0, 0.39, 0, '#8fb6c9', rnd, 0.1));
  parts.push(box(0.52, 0.04, 0.44, 0, 0.42, 0.001, '#6f93a6', rnd, 0));
  const lid = new THREE.BoxGeometry(0.62, 0.07, 0.54);
  lid.rotateX(-0.12);
  lid.translate(0, 0.64, 0);
  parts.push(paint(lid, '#9da3a6', 0.05, rnd));
  parts.push(box(0.3, 0.035, 0.02, 0, 0.22, 0.225, '#2a241c', rnd, 0));
  return merge(parts);
}
