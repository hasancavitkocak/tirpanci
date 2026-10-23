import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from '../game/rng';

/** Paint a whole geometry one vertex colour (so parts can be merged into one mesh). */
export function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, jitter = 0, rnd = Math.random): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute('position').count;
  const c = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  // One shade per face keeps the low-poly look.
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (rnd() - 0.5) * jitter;
    for (let v = 0; v < 3 && i + v < n; v++) {
      arr[(i + v) * 3] = c.r * k;
      arr[(i + v) * 3 + 1] = c.g * k;
      arr[(i + v) * 3 + 2] = c.b * k;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Cylinder from point a to point b. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 5): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

export function stoneGeometry(): THREE.BufferGeometry {
  const rnd = makeRng(5);
  const g = new THREE.DodecahedronGeometry(1, 0);
  const p = g.getAttribute('position');
  for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.8 + rnd() * 0.4), p.getY(k) * 0.6, p.getZ(k) * (0.8 + rnd() * 0.4));
  return merge([paint(g, '#8b8a83', 0.25, rnd)]);
}

/** Wooden fence post. */
export function postGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.05, 0.06, 1.2, 5);
  g.translate(0, 0.6, 0);
  return merge([paint(g, '#7a6248', 0.2)]);
}

/** Fuel can, spare spool and a small stool: where the worker refills. */
export function depotGroup(): THREE.Group {
  const grp = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const rnd = makeRng(3);
  const parts: THREE.BufferGeometry[] = [];
  // Red jerrycan
  const can = new THREE.BoxGeometry(0.32, 0.42, 0.16);
  can.translate(0, 0.21, 0);
  parts.push(paint(can, '#c8261e', 0.1, rnd));
  const spout = limb(new THREE.Vector3(0.1, 0.42, 0), new THREE.Vector3(0.16, 0.52, 0), 0.025, 0.02);
  parts.push(paint(spout, '#2a2a2a', 0, rnd));
  const handle = new THREE.BoxGeometry(0.16, 0.04, 0.05);
  handle.translate(-0.04, 0.46, 0);
  parts.push(paint(handle, '#a81e18', 0, rnd));
  // Spool of orange line
  const spool = new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10);
  spool.rotateX(Math.PI / 2);
  spool.translate(0.42, 0.11, 0.05);
  parts.push(paint(spool, '#ff8a1c', 0.1, rnd));
  // Wooden crate
  const crate = new THREE.BoxGeometry(0.6, 0.35, 0.45);
  crate.translate(-0.55, 0.175, 0.1);
  parts.push(paint(crate, '#a07b4f', 0.2, rnd));
  const m = new THREE.Mesh(merge(parts), mat);
  m.castShadow = true;
  grp.add(m);
  return grp;
}

/** Wound orange line seen side-on: tight diagonal turns with a highlight on each. */
function lineTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d4560c';
  g.fillRect(0, 0, 64, 64);
  for (let y = -64; y < 128; y += 4) {
    g.strokeStyle = '#ff8a1c';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(64, y + 10);
    g.stroke();
    g.strokeStyle = 'rgba(255, 220, 160, 0.5)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(0, y - 0.6);
    g.lineTo(64, y + 9.4);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

/** A spool of trimmer line standing on its side: black flanges, orange line wound on it (~0.25 m). */
export function spoolGroup(): THREE.Group {
  const g = new THREE.Group();
  const flange = new THREE.MeshLambertMaterial({ color: '#222222' });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 24), new THREE.MeshLambertMaterial({ map: lineTexture() }));
  const flanges = [-0.075, 0.075].map((y) => {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.012, 24), flange);
    f.position.y = y;
    return f;
  });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.17, 12), new THREE.MeshLambertMaterial({ color: '#111111' }));
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.1005, 0.1005, 0.05, 24, 1, true, 0.3, 1.2), new THREE.MeshLambertMaterial({ color: '#f2efe6', side: THREE.DoubleSide }));
  const reel = new THREE.Group();
  reel.add(core, ...flanges, hub, label);
  // Lying on its side, resting on the flange rims.
  reel.rotation.z = Math.PI / 2;
  reel.position.y = 0.125;
  reel.traverse((o) => (o.castShadow = true));
  g.add(reel);
  return g;
}

/** A Black Sea village house: whitewashed stone ground floor, timber upper floor, hipped tin roof. */
export function houseGroup(): THREE.Group {
  const grp = new THREE.Group();
  const rnd = makeRng(8);
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.BoxGeometry(6, 2.6, 5);
  base.translate(0, 1.3, 0);
  parts.push(paint(base, '#ece7dc', 0.05, rnd));
  const upper = new THREE.BoxGeometry(6.6, 2.4, 5.6);
  upper.translate(0, 3.8, 0);
  parts.push(paint(upper, '#8a5a36', 0.12, rnd));
  for (let i = -3; i <= 3; i += 1.5) {
    const beam = new THREE.BoxGeometry(0.14, 2.4, 0.08);
    beam.translate(i * 1.05, 3.8, 2.84);
    parts.push(paint(beam, '#5e3b22', 0, rnd));
  }
  const roof = new THREE.ConeGeometry(5.6, 2, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1.25, 1, 1.05);
  roof.translate(0, 6, 0);
  parts.push(paint(roof, '#9a3d2a', 0.1, rnd));
  for (const x of [-1.7, 1.7]) {
    const w = new THREE.BoxGeometry(0.9, 1, 0.06);
    w.translate(x, 3.9, 2.83);
    parts.push(paint(w, '#33424f', 0, rnd));
    const w2 = new THREE.BoxGeometry(0.8, 0.9, 0.06);
    w2.translate(x, 1.5, 2.53);
    parts.push(paint(w2, '#33424f', 0, rnd));
  }
  const door = new THREE.BoxGeometry(1, 1.9, 0.06);
  door.translate(0, 0.95, 2.53);
  parts.push(paint(door, '#5e3b22', 0, rnd));
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.castShadow = true;
  m.receiveShadow = true;
  grp.add(m);
  return grp;
}

/** Spruce / alder trees around the field edge. */
export function treeGeometry(kind: number): THREE.BufferGeometry {
  const rnd = makeRng(40 + kind);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 2, 6);
  trunk.translate(0, 1, 0);
  parts.push(paint(trunk, '#5a4535', 0.1, rnd));
  if (kind === 0) {
    for (let i = 0; i < 4; i++) {
      const c = new THREE.ConeGeometry(1.8 - i * 0.35, 2.4, 7);
      c.translate(0, 2.2 + i * 1.3, 0);
      parts.push(paint(c, '#24502a', 0.2, rnd));
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const b = new THREE.IcosahedronGeometry(1.2 + rnd() * 0.5, 0);
      b.translate((rnd() - 0.5) * 1.6, 3 + rnd() * 2, (rnd() - 0.5) * 1.6);
      parts.push(paint(b, '#3c6b2c', 0.25, rnd));
    }
  }
  return merge(parts);
}

/** Tea bushes in rows: a low, rounded hedge segment. */
export function teaGeometry(): THREE.BufferGeometry {
  const rnd = makeRng(77);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.IcosahedronGeometry(0.6, 1);
    b.scale(1, 0.7, 1);
    b.translate(i * 0.8 - 1.2, 0.45, 0);
    parts.push(paint(b, '#2f6b2a', 0.2, rnd));
  }
  return merge(parts);
}

/**
 * A haystack (ot yığını) of radius `r`: a rounded heap of hay round a pole, its surface tufty and
 * streaked, the pole sticking out of the top.
 */
export function haystackGroup(r: number, seed: number): THREE.Group {
  const rnd = makeRng(seed);
  const h = r * 2.1;
  // Profile from the ground up: bulging a little above the base, then rounding over to the pole.
  const prof = [
    [0.86, 0], [1, 0.18], [1.04, 0.38], [0.98, 0.58], [0.82, 0.76], [0.58, 0.9], [0.3, 0.98], [0.08, 1],
  ].map(([x, y]) => new THREE.Vector2(x * r, y * h));
  const g = new THREE.LatheGeometry(prof, 28);
  // Tufts: push the surface in and out a little, more on the upper part.
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (rnd() - 0.5) * 0.12 * (0.4 + y / h);
    p.setXYZ(i, x * k, y + (rnd() - 0.5) * 0.04, z * k);
  }
  const hay = paint(g, '#b8964a', 0.25, rnd);
  const pole = paint(limb(new THREE.Vector3(0, h * 0.6, 0), new THREE.Vector3(0.05, h + 0.55, 0.03), 0.045, 0.035), '#5d4630', 0.1, rnd);
  const grp = new THREE.Group();
  const m = new THREE.Mesh(merge([hay, pole]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = m.receiveShadow = true;
  grp.add(m);
  return grp;
}

/** An old wooden post (by the way into a field), weathered grey-brown, a little crooked. */
export function oldPostGroup(seed: number): THREE.Group {
  const rnd = makeRng(seed);
  const g = new THREE.CylinderGeometry(0.06, 0.08, 1.25, 7);
  g.translate(0, 0.55, 0);
  g.rotateZ((rnd() - 0.5) * 0.12);
  g.rotateX((rnd() - 0.5) * 0.12);
  const m = new THREE.Mesh(paint(g, '#6e604f', 0.3, rnd), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = m.receiveShadow = true;
  const grp = new THREE.Group();
  grp.add(m);
  return grp;
}

/** A woodpile (odunluk) about `r` metres across: split logs stacked in three rows against a wall. */
export function woodpileGroup(r: number, seed: number): THREE.Group {
  const rnd = makeRng(seed);
  const bark: THREE.BufferGeometry[] = [];
  const ends: THREE.BufferGeometry[] = [];
  const len = 0.7;
  const across = r * 2;
  for (let row = 0; row < 4; row++) {
    const n = Math.floor(across / 0.22) - row;
    for (let i = 0; i < n; i++) {
      const lr = 0.08 + rnd() * 0.04;
      const x = -across / 2 + 0.11 + row * 0.11 + i * 0.22 + (rnd() - 0.5) * 0.03;
      const y = 0.1 + row * 0.19;
      const c = new THREE.CylinderGeometry(lr, lr, len + (rnd() - 0.5) * 0.12, 7, 1, false);
      c.rotateX(Math.PI / 2);
      c.rotateZ((rnd() - 0.5) * 0.2);
      c.translate(x, y, (rnd() - 0.5) * 0.06);
      // Side faces are the bark, the caps the pale cut wood.
      const idx = Array.from(c.index!.array);
      const side = c.clone();
      side.setIndex(idx.slice(0, c.groups[0].count));
      const caps = c.clone();
      caps.setIndex(idx.slice(c.groups[0].count));
      bark.push(paint(side, '#4f3a28', 0.3, rnd));
      ends.push(paint(caps, '#c9a774', 0.2, rnd));
    }
  }
  const grp = new THREE.Group();
  const m = new THREE.Mesh(merge([...bark, ...ends]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = m.receiveShadow = true;
  grp.add(m);
  return grp;
}

/** Chain-link wire mesh (tel örgü): galvanised diamonds on a transparent ground, one diamond per tile. */
let meshTex: THREE.CanvasTexture | null = null;
function wireMeshTexture(): THREE.CanvasTexture {
  if (meshTex) return meshTex;
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(176, 182, 186, 1)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, n / 2);
  g.lineTo(n / 2, 0);
  g.lineTo(n, n / 2);
  g.lineTo(n / 2, n);
  g.closePath();
  g.stroke();
  meshTex = new THREE.CanvasTexture(c);
  meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping;
  meshTex.colorSpace = THREE.SRGBColorSpace;
  meshTex.anisotropy = 4;
  return meshTex;
}

/**
 * A wire-mesh fence along a line of posts (each point on the ground): concrete posts, the mesh
 * between them and a tension wire along the top.
 */
export function wireFence(points: THREE.Vector3[], height = 1.3): THREE.Group {
  const grp = new THREE.Group();
  const rnd = makeRng(17);
  const posts: THREE.BufferGeometry[] = [];
  for (const p of points) {
    const b = new THREE.BoxGeometry(0.11, height + 0.25, 0.11);
    b.translate(p.x, p.y + (height + 0.25) / 2 - 0.1, p.z);
    posts.push(paint(b, '#a9a69e', 0.15, rnd));
  }
  const pm = new THREE.Mesh(merge(posts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  pm.castShadow = pm.receiveShadow = true;
  grp.add(pm);
  // The mesh: one strip of quads along the posts, the texture repeating every 6 cm.
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let run = 0;
  points.forEach((p, i) => {
    if (i) run += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    pos.push(p.x, p.y + 0.05, p.z, p.x, p.y + height, p.z);
    uv.push(run / 0.06, 0, run / 0.06, height / 0.06);
    if (i) idx.push(i * 2 - 2, i * 2, i * 2 - 1, i * 2 - 1, i * 2, i * 2 + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const wire = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: wireMeshTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
  wire.castShadow = true;
  grp.add(wire);
  const top: number[] = [];
  for (let i = 1; i < points.length; i++) top.push(points[i - 1].x, points[i - 1].y + height, points[i - 1].z, points[i].x, points[i].y + height, points[i].z);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  grp.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: '#8b9094' })));
  return grp;
}

/**
 * A sliding iron gate `width` metres long (along +x from its leading edge at the origin): a painted
 * steel frame with upright bars and a diagonal brace, on two small wheels.
 */
export function slidingGate(width: number, height = 1.35): THREE.Group {
  const rnd = makeRng(29);
  const parts: THREE.BufferGeometry[] = [];
  const bar = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const b = new THREE.BoxGeometry(len, t, t);
    b.rotateZ(Math.atan2(y1 - y0, x1 - x0));
    b.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    parts.push(paint(b, '#2f5f7a', 0.12, rnd));
  };
  const y0 = 0.12;
  bar(0, y0, width, y0, 0.07);
  bar(0, height, width, height, 0.07);
  bar(0, y0, 0, height, 0.07);
  bar(width, y0, width, height, 0.07);
  for (let x = 0.12; x < width - 0.05; x += 0.12) bar(x, y0, x, height, 0.025);
  bar(0, y0, width, height, 0.05);
  for (const x of [0.25, width - 0.25]) {
    const w = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12);
    w.rotateX(Math.PI / 2);
    w.translate(x, 0.07, 0);
    parts.push(paint(w, '#2a2a2a', 0.1, rnd));
  }
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = m.receiveShadow = true;
  const grp = new THREE.Group();
  grp.add(m);
  return grp;
}

/** Terracotta pots in a row, each with a mound of flowers (yard decoration). */
export function flowerPots(seed: number): THREE.Group {
  const rnd = makeRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const colours = ['#e4472b', '#f2c12e', '#d94fb0', '#ffffff', '#ff8a2a'];
  for (let i = 0; i < 5; i++) {
    const x = i * 0.55;
    const pot = new THREE.CylinderGeometry(0.17, 0.12, 0.28, 10);
    pot.translate(x, 0.14, 0);
    parts.push(paint(pot, '#b8613a', 0.12, rnd));
    const leaves = new THREE.IcosahedronGeometry(0.19, 0);
    leaves.scale(1, 0.75, 1);
    leaves.translate(x, 0.36, 0);
    parts.push(paint(leaves, '#3f7a2a', 0.2, rnd));
    for (let k = 0; k < 5; k++) {
      const f = new THREE.IcosahedronGeometry(0.05, 0);
      const a = rnd() * Math.PI * 2;
      f.translate(x + Math.cos(a) * 0.12, 0.43 + rnd() * 0.05, Math.sin(a) * 0.12);
      parts.push(paint(f, colours[(i + k) % colours.length], 0.1, rnd));
    }
  }
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** A wooden gazebo (çardak): four posts, a hipped roof, a bench and a table under it. */
export function gazebo(seed: number): THREE.Group {
  const rnd = makeRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const w = 2.6;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.BoxGeometry(0.12, 2.2, 0.12);
      p.translate((sx * w) / 2, 1.1, (sz * w) / 2);
      parts.push(paint(p, '#7a5532', 0.15, rnd));
    }
  }
  const roof = new THREE.ConeGeometry(w * 0.95, 0.9, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 2.65, 0);
  parts.push(paint(roof, '#8a3b22', 0.15, rnd));
  const table = new THREE.BoxGeometry(1.2, 0.06, 0.7);
  table.translate(0, 0.72, 0);
  parts.push(paint(table, '#9b7148', 0.1, rnd));
  const leg = new THREE.BoxGeometry(0.08, 0.72, 0.08);
  leg.translate(0, 0.36, 0);
  parts.push(paint(leg, '#6e4d2d', 0.1, rnd));
  for (const s of [-1, 1]) {
    const bench = new THREE.BoxGeometry(1.2, 0.06, 0.32);
    bench.translate(0, 0.45, s * 0.65);
    parts.push(paint(bench, '#9b7148', 0.1, rnd));
  }
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** A dog kennel: a little wooden house with a dark doorway. */
export function kennel(seed: number): THREE.Group {
  const rnd = makeRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const box = new THREE.BoxGeometry(0.9, 0.7, 1.1);
  box.translate(0, 0.35, 0);
  parts.push(paint(box, '#a77a4a', 0.15, rnd));
  const roof = new THREE.CylinderGeometry(0.01, 0.75, 0.45, 4, 1);
  roof.rotateY(Math.PI / 4);
  roof.scale(1, 1, 1.35);
  roof.translate(0, 0.92, 0);
  parts.push(paint(roof, '#6d3420', 0.15, rnd));
  const door = new THREE.BoxGeometry(0.4, 0.45, 0.02);
  door.translate(0, 0.26, 0.56);
  parts.push(paint(door, '#1d1510', 0, rnd));
  const bowl = new THREE.CylinderGeometry(0.12, 0.09, 0.07, 10);
  bowl.translate(0.35, 0.035, 0.8);
  parts.push(paint(bowl, '#c23a2a', 0.1, rnd));
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** A washing line between two poles with clothes pegged on it. */
export function clothesline(seed: number): THREE.Group {
  const rnd = makeRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const len = 3.4;
  for (const x of [0, len]) {
    const pole = new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6);
    pole.translate(x, 0.95, 0);
    parts.push(paint(pole, '#6e5a44', 0.1, rnd));
  }
  const colours = ['#ffffff', '#3a6fc4', '#e4472b', '#f2c12e', '#7cc46a'];
  for (let i = 0; i < 5; i++) {
    const w = 0.35 + rnd() * 0.25;
    const h = 0.4 + rnd() * 0.35;
    const cloth = new THREE.BoxGeometry(w, h, 0.01);
    cloth.translate(0.35 + i * 0.62, 1.82 - h / 2, 0);
    parts.push(paint(cloth, colours[i], 0.08, rnd));
  }
  const line = new THREE.BoxGeometry(len, 0.012, 0.012);
  line.translate(len / 2, 1.83, 0);
  parts.push(paint(line, '#d8d2c4', 0, rnd));
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}
