import * as THREE from 'three';
import { Field } from '../game/field';
import { makeRng } from '../game/rng';

import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { broadleafTrees, hazelnutBushes } from './hazelnut';
import { shootBushes } from './shootBush';
import { boulderGeometry, graveGeometry, stoneWall } from './landmarks';
import { oldPostGroup, paint, postGeometry } from './props';

/**
 * The rest of the village round the field being mown: the other fields (fenced, their gates shut, a
 * name board at each; a padlock on those not yet open), the cobbled road to the mosque, the village's
 * name board, and the trees.
 */

type Height = (x: number, z: number) => number;

/** A wooden name board on two legs: cream letters on weathered planks, a red padlock line if locked. */
export function nameBoard(text: string, sub: string | null, locked: boolean): THREE.Group {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const g = c.getContext('2d')!;
  const rnd = makeRng(text.length * 31 + 7);
  g.fillStyle = '#6b4a2c';
  g.fillRect(0, 0, c.width, c.height);
  // Planks and grain.
  for (let y = 0; y < c.height; y += 48) {
    g.fillStyle = `rgba(0, 0, 0, ${0.08 + rnd() * 0.1})`;
    g.fillRect(0, y, c.width, 3);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255, 230, 190' : '30, 18, 8'}, 0.08)`;
      g.fillRect(rnd() * c.width, y + 4 + rnd() * 40, 40 + rnd() * 120, 1.5);
    }
  }
  g.fillStyle = '#f3e6c8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${text.length > 16 ? 52 : 62}px system-ui, sans-serif`;
  g.fillText(text, c.width / 2, sub || locked ? 72 : 96);
  if (locked) {
    // A red band with a padlock and the word.
    g.fillStyle = '#a3261b';
    g.fillRect(0, 118, c.width, 60);
    g.fillStyle = '#ffd77a';
    const lx = c.width / 2 - 112;
    g.fillRect(lx - 16, 138, 32, 26);
    g.strokeStyle = '#ffd77a';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(lx, 138, 11, Math.PI, 0);
    g.stroke();
    g.fillStyle = '#fff1e6';
    g.font = 'bold 44px system-ui, sans-serif';
    g.fillText('KİLİTLİ', c.width / 2 + 20, 150);
  } else if (sub) {
    g.font = '40px system-ui, sans-serif';
    g.fillText(sub, c.width / 2, 148);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const grp = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.05), [
    ...Array.from({ length: 4 }, () => new THREE.MeshLambertMaterial({ color: '#5a3d24' })),
    new THREE.MeshLambertMaterial({ map: tex }),
    new THREE.MeshLambertMaterial({ map: tex }),
  ]);
  board.position.y = 1.35;
  board.castShadow = true;
  grp.add(board);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), new THREE.MeshLambertMaterial({ color: '#4b3420' }));
    leg.position.set(s * 0.65, 0.7, -0.05);
    leg.castShadow = true;
    grp.add(leg);
  }
  return grp;
}

/**
 * Where a name board goes by a gate at (gx, gz): beside it, off any road or track (the first spot
 * clear of them, else the one furthest from them).
 */
export function boardSpot(f: Field, gx: number, gz: number): { x: number; z: number } {
  const tries = [[-3.8, 1.2], [3.8, 1.2], [-3.8, 3], [3.8, 3], [-5.5, 1.2], [5.5, 1.2], [-5.5, 3.5], [5.5, 3.5]];
  let best = { x: gx - 3.8, z: gz + 1.2, d: -1 };
  for (const [dx, dz] of tries) {
    const x = gx + dx;
    const z = gz + dz;
    const d = f.roadDistance(x, z);
    if (d > 2.6) return { x, z };
    if (d > best.d) best = { x, z, d };
  }
  return best;
}

/** Tall, unmown grass seen from a distance: streaks of greens and dry tips. */
let grassPatchTex: THREE.CanvasTexture | null = null;
function tallGrassTexture(): THREE.CanvasTexture {
  if (grassPatchTex) return grassPatchTex;
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const rnd = makeRng(97);
  g.fillStyle = '#4c6e2a';
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * n;
    const y = rnd() * n;
    g.strokeStyle = `hsl(${70 + rnd() * 35}, ${35 + rnd() * 25}%, ${20 + rnd() * 25}%)`;
    g.lineWidth = 1 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 4, y - 4 - rnd() * 8);
    g.stroke();
  }
  grassPatchTex = new THREE.CanvasTexture(c);
  grassPatchTex.wrapS = grassPatchTex.wrapT = THREE.RepeatWrapping;
  grassPatchTex.colorSpace = THREE.SRGBColorSpace;
  return grassPatchTex;
}

/** A ground-hugging patch over a rectangle (a fine grid following the terrain). */
function groundPatch(minX: number, maxX: number, minZ: number, maxZ: number, heightAt: Height, mat: THREE.Material, lift = 0.05): THREE.Mesh {
  const w = maxX - minX;
  const d = maxZ - minZ;
  const g = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 1.5)), Math.max(1, Math.round(d / 1.5)));
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + (minX + maxX) / 2;
    const z = p.getZ(i) + (minZ + maxZ) / 2;
    p.setXYZ(i, x, heightAt(x, z) + lift, z);
    uv.setXY(i, x / 3, z / 3);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/**
 * The other fields: each with its tall grass, what stands in it (hazelnut ocaks, boulders, graves),
 * its fence or wall all round with a shut gate, and its name board by the gate. `unlockedUpTo`: the
 * highest level id the player may take on. Without `detail` (low quality) the hazelnut ocaks in them
 * are left out (they are many triangles).
 */
export function otherFields(f: Field, heightAt: Height, unlockedUpTo: number, detail = true, shoot?: GLTF, waitText: Record<number, string> = {}): THREE.Group {
  const grp = new THREE.Group();
  const grassMat = new THREE.MeshLambertMaterial({ map: tallGrassTexture() });
  const postMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const posts: THREE.Matrix4[] = [];
  const wire: number[] = [];
  const bushMatrices: THREE.Matrix4[][] = [[], [], []];
  const rocks: THREE.Matrix4[] = [];
  const graves: THREE.Matrix4[] = [];
  const o = new THREE.Object3D();
  for (const other of f.others) {
    const lv = other.level;
    // The field just mown stays open: no gate across its way in.
    const open = lv.id === f.openLevel;
    // The same layout as when that job is taken on (the same seed).
    const fo = new Field(lv, true);
    const dx = (other.minX + other.maxX) / 2;
    const dz = (other.minZ + other.maxZ) / 2;
    const wall = lv.theme === 'mezarlik';
    grp.add(groundPatch(other.minX, other.maxX, other.minZ, other.maxZ, heightAt, grassMat));
    // Ocaks only in the fields near this one (further off the haze hides them; they cost a lot).
    const nearBy = Math.hypot(dx, dz) < 80;
    for (const b of fo.bushes) {
      if (b.kind === 'ocak' && !nearBy) continue;
      const x = b.x + dx;
      const z = b.z + dz;
      o.position.set(x, heightAt(x, z) - 0.05, z);
      o.rotation.set(0, b.rot, 0);
      if (b.kind === 'ocak') {
        if (!detail) continue;
        o.scale.setScalar(b.scale);
        o.updateMatrix();
        bushMatrices[b.variant % 3].push(o.matrix.clone());
      } else if (b.kind === 'kaya') {
        o.position.y += 0.1 * b.scale;
        o.scale.set(0.8 * b.scale, 1.1 * b.scale, 0.75 * b.scale);
        o.updateMatrix();
        rocks.push(o.matrix.clone());
      } else {
        o.scale.setScalar(b.scale);
        o.updateMatrix();
        graves.push(o.matrix.clone());
      }
    }
    const gate = { x: other.entryX, z: other.maxZ };
    if (wall) {
      // The mosque yard's stone wall, all round (its gate is in the middle of the bottom side).
      const wx = lv.width / 2 + 1.6;
      const t = other.minZ - 1.6;
      const bt = other.maxZ + 1.2;
      const at = (x: number, z: number) => new THREE.Vector3(x + dx, heightAt(x + dx, z), z);
      const side = (x0: number, z0: number, x1: number, z1: number) => {
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2));
        return Array.from({ length: n + 1 }, (_, i) => at(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n));
      };
      grp.add(stoneWall([...side(-2.2, bt, -wx, bt), ...side(-wx, bt, -wx, t).slice(1), ...side(-wx, t, wx, t).slice(1), ...side(wx, t, wx, bt).slice(1), ...side(wx, bt, 2.2, bt).slice(1)]));
      gate.x = dx;
      gate.z = bt;
    } else {
      // The wooden fence all round, a gap at the way in with a shut gate across it.
      const fx0 = other.minX - 2.9;
      const fx1 = other.maxX + 2.9;
      const ft = other.minZ - 2.9;
      const fb = other.maxZ + 1.5;
      const ring: [number, number][] = [];
      const run = (x0: number, z0: number, x1: number, z1: number) => {
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2.4));
        for (let i = 0; i < n; i++) ring.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
      };
      run(fx0, fb, fx0, ft);
      run(fx0, ft, fx1, ft);
      if (!lv.stream) run(fx1, ft, fx1, fb);
      run(fx1, fb, gate.x + 2, fb);
      ring.push([gate.x + 2, fb]);
      const left: [number, number][] = [];
      const n = Math.max(1, Math.round((gate.x - 2 - fx0) / 2.4));
      for (let i = 0; i <= n; i++) left.push([gate.x - 2 - ((gate.x - 2 - fx0) * i) / n, fb]);
      for (const line of [ring, left]) {
        const pts = line.map(([x, z]) => new THREE.Vector3(x, heightAt(x, z), z));
        pts.forEach((p, i) => {
          o.position.copy(p);
          o.rotation.set(Math.sin(i * 7.1 + dx) * 0.06, 0, Math.cos(i * 3.3) * 0.06);
          o.scale.setScalar(1);
          o.updateMatrix();
          posts.push(o.matrix.clone());
          const q = pts[i + 1];
          if (q) for (const h of [0.55, 1.0]) wire.push(p.x, p.y + h, p.z, q.x, q.y + h, q.z);
        });
      }
      // The gate: two posts, and three rails across unless it is the open one.
      for (const s of [-1, 1]) {
        const post = oldPostGroup(lv.seed + s);
        post.position.set(gate.x + s * 2, heightAt(gate.x + s * 2, fb), fb);
        grp.add(post);
      }
      const rails: THREE.BufferGeometry[] = [];
      const y0 = heightAt(gate.x, fb);
      for (const h of open ? [] : [0.35, 0.65, 0.95]) {
        const r = new THREE.BoxGeometry(4, 0.09, 0.05);
        r.translate(gate.x, y0 + h, fb);
        rails.push(paint(r, '#7a6248', 0.2));
      }
      if (rails.length) {
        const rail = new THREE.Mesh(mergeAll(rails), postMat);
        rail.castShadow = true;
        grp.add(rail);
      }
      gate.z = fb;
    }
    // Not yet opened: a chain round the gate with a padlock on it (the mosque yard gets an iron gate).
    if (lv.id < 100 && lv.id > unlockedUpTo) {
      const y0 = heightAt(gate.x, gate.z);
      if (wall) {
        const iron = ironGate(gate.x, y0, gate.z, 4.4);
        iron.name = `lock-${lv.id}`;
        grp.add(iron);
      }
      const lock = padlock(lv.seed);
      lock.name = `lock-${lv.id}`;
      lock.position.set(gate.x, y0, gate.z);
      grp.add(lock);
    }
    // Jobs: their number (or how long until grown back); neighbours' gardens: the job posted there.
    const sub = lv.id >= 100 ? (lv.pay ? `İlan: ${lv.pay} TL` : 'İlan yok') : (waitText[lv.id] ?? `${lv.id}. iş`);
    const board = nameBoard(lv.name, sub, lv.id < 100 && lv.id > unlockedUpTo);
    const { x: bx, z: bz } = boardSpot(f, gate.x, gate.z);
    board.position.set(bx, heightAt(bx, bz), bz);
    board.name = `board-${lv.id}`;
    grp.add(board);
  }
  if (posts.length) {
    const pm = new THREE.InstancedMesh(postGeometry(), postMat, posts.length);
    posts.forEach((m, i) => pm.setMatrixAt(i, m));
    pm.castShadow = true;
    grp.add(pm);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    grp.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#8d8a80' })));
  }
  // The ocaks as in the job's own field: from the artist shoot when there is one.
  bushMatrices.forEach((m, v) => m.length && grp.add(shoot ? shootBushes(shoot, v, m) : hazelnutBushes(v, m)));
  if (rocks.length) {
    const rm = new THREE.InstancedMesh(boulderGeometry(), rockMat, rocks.length);
    rocks.forEach((m, i) => rm.setMatrixAt(i, m));
    rm.castShadow = true;
    grp.add(rm);
  }
  if (graves.length) {
    const gm = new THREE.InstancedMesh(graveGeometry(0), rockMat, graves.length);
    graves.forEach((m, i) => gm.setMatrixAt(i, m));
    gm.castShadow = true;
    grp.add(gm);
  }
  return grp;
}

/** A chain slung across a gate's middle, a brass padlock hanging from it (gate centre at the origin). */
function padlock(seed: number): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = makeRng(seed + 5);
  // The chain: links along a sagging curve from one rail to the other, each turned 90° from the last.
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (t - 0.5) * 1.6;
    const y = 0.72 - Math.sin(t * Math.PI) * 0.16;
    const link = new THREE.TorusGeometry(0.05, 0.014, 4, 8).scale(1.4, 1, 1);
    if (i % 2) link.rotateX(Math.PI / 2);
    link.rotateZ(Math.cos(t * Math.PI) * 0.35);
    link.translate(x, y, 0.06);
    parts.push(paint(link, '#5d6166', 0.25, rnd));
  }
  // The padlock under the middle of the chain: shackle and brass body.
  parts.push(paint(new THREE.TorusGeometry(0.085, 0.022, 6, 12, Math.PI).translate(0, 0.49, 0.07), '#8d9196', 0.1, rnd));
  parts.push(paint(new THREE.BoxGeometry(0.28, 0.25, 0.1).translate(0, 0.37, 0.07), '#c9a227', 0.15, rnd));
  parts.push(paint(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 6).rotateX(Math.PI / 2).translate(0, 0.35, 0.125), '#2b2410', 0, rnd));
  const m = new THREE.Mesh(mergeAll(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.castShadow = true;
  return m;
}

/** A shut iron gate (two leaves of bars) across a wall's gap `width` wide, centred at x. */
function ironGate(x: number, y: number, z: number, width: number): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  for (let bx = -width / 2 + 0.1; bx <= width / 2 - 0.05; bx += 0.18) parts.push(paint(new THREE.BoxGeometry(0.03, 1.3, 0.03).translate(bx, 0.65, 0), '#2f3236', 0.15));
  for (const h of [0.15, 0.7, 1.22]) parts.push(paint(new THREE.BoxGeometry(width, 0.05, 0.04).translate(0, h, 0), '#2f3236', 0.1));
  const m = new THREE.Mesh(mergeAll(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    pos.push(...(g.getAttribute('position').array as Float32Array));
    col.push(...(g.getAttribute('color').array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The cobblestone photo (public/textures). */
let cobbleTex: THREE.Texture | null = null;
function cobbleTexture(): THREE.Texture {
  if (cobbleTex) return cobbleTex;
  cobbleTex = new THREE.TextureLoader().load('./textures/kaldirim.webp');
  cobbleTex.wrapS = cobbleTex.wrapT = THREE.RepeatWrapping;
  cobbleTex.colorSpace = THREE.SRGBColorSpace;
  cobbleTex.anisotropy = 4;
  return cobbleTex;
}

/**
 * The cobbled road(s): a ribbon 3 m wide along the polyline, laid on the ground. Where it leaves the
 * dirt track the setts start ragged, mud trodden over them (it fades in over its first metres).
 */
export function cobbleRoads(f: Field, heightAt: Height): THREE.Group {
  const grp = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ map: cobbleTexture(), vertexColors: true, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const r of f.roads) {
    if (r.kind !== 'cobble') continue;
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const half = 1.5;
    const across = 7;
    let along = 0;
    r.pts.forEach((p, i) => {
      const a = r.pts[Math.max(0, i - 1)];
      const b = r.pts[Math.min(r.pts.length - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / l;
      const nz = (b.x - a.x) / l;
      if (i) along += Math.hypot(p.x - r.pts[i - 1].x, p.z - r.pts[i - 1].z);
      for (let k = 0; k < across; k++) {
        const s = -half + (2 * half * k) / (across - 1);
        const x = p.x + nx * s;
        const z = p.z + nz * s;
        pos.push(x, heightAt(x, z) + 0.06, z);
        uv.push((s + half) / 1.5, along / 1.5);
        // Out of the track: muddy at first (darker), the setts showing more and more, ragged at the edge.
        const t = Math.min(1, Math.max(0, (along - 2.5 - Math.abs(Math.sin(s * 3.1 + along)) * 1.2) / 3));
        const mud = 0.55 + 0.45 * t;
        col.push(mud, mud * 0.95, mud * 0.88, t);
      }
      if (i < r.pts.length - 1) for (let k = 0; k < across - 1; k++) {
        const q = i * across + k;
        idx.push(q, q + 1, q + across, q + 1, q + across + 1, q + across);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.renderOrder = 2;
    grp.add(m);
  }
  return grp;
}

/** The village's name board, by the trunk just below the yard gate. */
export function villageBoard(f: Field, heightAt: Height): THREE.Object3D {
  const p = f.lane.find((q) => Math.hypot(q.x - f.plateau.x, q.z - f.plateau.z) > f.plateau.r + 4) ?? f.lane[0];
  const b = nameBoard(`${f.region.name} Köyü`, 'Hoş geldiniz', false);
  // Beside the trunk, on whichever side is clear of the roads.
  const x = f.roadDistance(p.x + 3, p.z) > 2.4 || f.roadDistance(p.x - 3, p.z) <= f.roadDistance(p.x + 3, p.z) ? p.x + 3 : p.x - 3;
  b.position.set(x, heightAt(x, p.z), p.z);
  b.rotation.y = 0.4;
  return b;
}

/**
 * Trees scattered over the village (instanced), clear of the fields, the roads, the yard, the stream,
 * the mosque and the asphalt road; and rows of them along the dirt tracks.
 */
export function villageTrees(f: Field, heightAt: Height, count: number): THREE.Group {
  const rnd = makeRng(f.level.seed + 5);
  const up = new THREE.Vector3(0, 1, 0);
  const spots: { x: number; z: number }[] = [];
  const free = (x: number, z: number, roadGap: number) => {
    if (x < f.map.minX + 3 || z < f.map.minZ + 3 || z > f.map.maxZ - 3) return false;
    if (f.streamDistance(x, z) < 5 || x > f.streamX(z)) return false;
    if (f.roadDistance(x, z) < roadGap) return false;
    if (Math.hypot(x - f.plateau.x, z - f.plateau.z) < f.plateau.r + 5) return false;
    if (Math.hypot(x - f.mosque.x, z - f.mosque.z) < 12 || (f.hut && Math.hypot(x - f.hut.x, z - f.hut.z) < 7)) return false;
    const inRect = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, m: number) => x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m;
    if (inRect({ minX: -f.width / 2, maxX: f.width / 2, minZ: -f.depth / 2, maxZ: f.depth / 2 }, 7)) return false;
    if (f.others.some((o) => inRect(o, 6))) return false;
    return !spots.some((s) => Math.hypot(s.x - x, s.z - z) < 7);
  };
  const xMax = f.streamX(0);
  for (let tries = 0; spots.length < count && tries < count * 30; tries++) {
    const x = f.map.minX + rnd() * (xMax - f.map.minX);
    const z = f.map.minZ + rnd() * (f.map.maxZ - f.map.minZ);
    if (free(x, z, 6)) spots.push({ x, z });
  }
  // Along the tracks, both sides, every ten metres or so.
  for (const r of f.roads) {
    if (r.kind !== 'dirt') continue;
    let run = 0;
    let next = 6;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1];
      const b = r.pts[i];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      run += l;
      if (run < next) continue;
      next = run + 10 + rnd() * 8;
      for (const side of [-1, 1]) {
        const off = side * (5 + rnd() * 2);
        const x = b.x - ((b.z - a.z) / l) * off;
        const z = b.z + ((b.x - a.x) / l) * off;
        if (free(x, z, 4.4)) spots.push({ x, z });
      }
    }
  }
  return broadleafTrees(
    spots.map((s) => {
      const sc = 0.75 + rnd() * 0.5;
      return new THREE.Matrix4().compose(new THREE.Vector3(s.x, heightAt(s.x, s.z) - 0.1, s.z), new THREE.Quaternion().setFromAxisAngle(up, rnd() * 6), new THREE.Vector3(sc, sc, sc));
    }),
  );
}
