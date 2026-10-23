import * as THREE from 'three';
import { makeRng } from '../game/rng';

/**
 * Bramble patch (böğürtlen): a low tangle of arching red-brown canes with thorns, three-lobed leaves
 * and a few blackberries. Leaves are alpha-cut cards with a canvas-drawn texture. Origin at the
 * patch centre on the ground, about 1 m radius and 0.9 m tall at scale 1.
 */

let leafMat: THREE.MeshLambertMaterial | null = null;
let caneMat: THREE.MeshLambertMaterial | null = null;
let berryMat: THREE.MeshLambertMaterial | null = null;

function leafTexture(): THREE.Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rnd = makeRng(71);
  // A cluster of serrated bramble leaflets in threes, dark glossy green.
  for (let i = 0; i < 9; i++) {
    const cx = S * (0.2 + rnd() * 0.6);
    const cy = S * (0.2 + rnd() * 0.6);
    const a = rnd() * Math.PI * 2;
    for (let k = -1; k <= 1; k++) {
      const ang = a + k * 0.9;
      const len = S * (0.13 + rnd() * 0.05) * (k === 0 ? 1.15 : 0.95);
      const wid = len * 0.55;
      g.save();
      g.translate(cx + Math.cos(ang) * len * 0.55, cy + Math.sin(ang) * len * 0.55);
      g.rotate(ang);
      const shade = 0.75 + rnd() * 0.35;
      g.fillStyle = `rgb(${Math.round(38 * shade)}, ${Math.round(78 * shade)}, ${Math.round(34 * shade)})`;
      g.beginPath();
      // Serrated edge: small teeth along an ellipse.
      for (let t = 0; t <= 40; t++) {
        const u = (t / 40) * Math.PI * 2;
        const tooth = 1 + 0.08 * (t % 2);
        g.lineTo(Math.cos(u) * len * 0.5 * tooth, Math.sin(u) * wid * 0.5 * tooth);
      }
      g.fill();
      g.strokeStyle = 'rgba(150, 190, 110, 0.5)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-len * 0.45, 0);
      g.lineTo(len * 0.45, 0);
      g.stroke();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function materials() {
  if (!leafMat || !caneMat || !berryMat) {
    leafMat = new THREE.MeshLambertMaterial({ map: leafTexture(), alphaTest: 0.4, side: THREE.DoubleSide, emissive: '#0c1608' });
    caneMat = new THREE.MeshLambertMaterial({ color: '#6b2c2a', flatShading: true });
    berryMat = new THREE.MeshLambertMaterial({ color: '#1e1424', emissive: '#120a18' });
  }
  return { leaf: leafMat, cane: caneMat, berry: berryMat };
}

interface BrambleGeo {
  canes: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  berries: THREE.BufferGeometry;
}
const cache = new Map<number, BrambleGeo>();

function build(variant: number): BrambleGeo {
  const rnd = makeRng(900 + variant * 13);
  const canes: THREE.BufferGeometry[] = [];
  const leafPos: number[] = [];
  const leafUv: number[] = [];
  const leafNor: number[] = [];
  const leafIdx: number[] = [];
  const berries: THREE.BufferGeometry[] = [];
  const addLeaf = (p: THREE.Vector3, size: number) => {
    const yaw = rnd() * Math.PI * 2;
    const tilt = -0.4 - rnd() * 0.7;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(right, tilt);
    const base = leafPos.length / 3;
    for (const [sx, sy] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]) {
      leafPos.push(p.x + (right.x * sx + up.x * sy) * size, p.y + (right.y * sx + up.y * sy) * size, p.z + (right.z * sx + up.z * sy) * size);
      leafUv.push(sx + 0.5, sy + 0.5);
      leafNor.push(0, 1, 0);
    }
    leafIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const count = 15 + Math.floor(rnd() * 5);
  for (let i = 0; i < count; i++) {
    // Each cane arches up and over, and its tip roots back into the ground.
    const a = rnd() * Math.PI * 2;
    const reach = 0.55 + rnd() * 0.5;
    const height = 0.55 + rnd() * 0.4;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const start = dir.clone().multiplyScalar(rnd() * 0.25);
    const curve = new THREE.CatmullRomCurve3([
      start,
      start.clone().addScaledVector(dir, reach * 0.35).setY(height * 0.85),
      start.clone().addScaledVector(dir, reach * 0.7).setY(height),
      start.clone().addScaledVector(dir, reach).setY(0.05),
    ]);
    canes.push(new THREE.TubeGeometry(curve, 8, 0.012, 4, false));
    // Thorns: tiny cones along the cane.
    for (let k = 1; k < 8; k++) {
      const p = curve.getPointAt(k / 8);
      const thorn = new THREE.ConeGeometry(0.008, 0.035, 3);
      thorn.rotateZ(Math.PI / 2 + (rnd() - 0.5));
      thorn.rotateY(rnd() * Math.PI * 2);
      thorn.translate(p.x, p.y, p.z);
      canes.push(thorn);
    }
    for (let k = 0; k < 6; k++) addLeaf(curve.getPointAt(0.15 + rnd() * 0.75).add(new THREE.Vector3(0, 0.05, 0)), 0.34 + rnd() * 0.2);
    if (rnd() < 0.6) {
      const p = curve.getPointAt(0.5 + rnd() * 0.3);
      for (let k = 0; k < 4; k++) {
        const b = new THREE.SphereGeometry(0.018, 5, 4);
        b.translate(p.x + (rnd() - 0.5) * 0.06, p.y - 0.04 - rnd() * 0.03, p.z + (rnd() - 0.5) * 0.06);
        berries.push(b);
      }
    }
  }
  // Low leafy fill in the middle.
  for (let k = 0; k < 20; k++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 0.6;
    addLeaf(new THREE.Vector3(Math.cos(a) * r, 0.15 + rnd() * 0.35, Math.sin(a) * r), 0.35 + rnd() * 0.2);
  }
  const merge = (gs: THREE.BufferGeometry[]) => {
    const parts = gs.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const p of parts) p.deleteAttribute('uv');
    const pos: number[] = [];
    const nor: number[] = [];
    for (const p of parts) {
      pos.push(...(p.getAttribute('position').array as Float32Array));
      nor.push(...(p.getAttribute('normal').array as Float32Array));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  };
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(leafPos, 3));
  leaves.setAttribute('normal', new THREE.Float32BufferAttribute(leafNor, 3));
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(leafUv, 2));
  leaves.setIndex(leafIdx);
  return { canes: merge(canes), leaves, berries: merge(berries.length ? berries : [new THREE.SphereGeometry(0.001)]) };
}

/** A bramble patch object; set `object.userData.radius` scale with the patch radius. */
export function brambleObject(variant: number, radius: number): THREE.Group {
  let geo = cache.get(variant % 3);
  if (!geo) {
    geo = build(variant % 3);
    cache.set(variant % 3, geo);
  }
  const m = materials();
  const g = new THREE.Group();
  const canes = new THREE.Mesh(geo.canes, m.cane);
  const leaves = new THREE.Mesh(geo.leaves, m.leaf);
  const berries = new THREE.Mesh(geo.berries, m.berry);
  canes.castShadow = leaves.castShadow = true;
  g.add(canes, leaves, berries);
  g.scale.set(radius / 0.85, 1.2, radius / 0.85);
  return g;
}
