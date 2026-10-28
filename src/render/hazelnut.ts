import * as THREE from 'three';
import { makeRng } from '../game/rng';
import { PAINTED_GROUND } from './scenery';

/**
 * Hazelnut bush (fındık ocağı) built the way games build trees: real stems with a bark texture, and
 * the foliage as leaf cards (alpha-cut quads) using leaf clusters cut from the reference photo
 * (textures made by scripts/make-bush-textures.py). Origin at the root, about 3–3.8 m tall.
 */

const loader = new THREE.TextureLoader();
let leafMat: THREE.MeshLambertMaterial | null = null;
let barkMat: THREE.MeshLambertMaterial | null = null;
let leafTex: THREE.Texture | null = null;
let barkTex: THREE.Texture | null = null;

/** Load the bush textures before the first field is shown (call during the loading screen). */
export async function preloadBushTextures(): Promise<void> {
  [leafTex, barkTex] = await Promise.all([loader.loadAsync('./textures/ocak-yaprak.png'), loader.loadAsync('./textures/ocak-kabuk.png')]);
  if (PAINTED_GROUND) {
    // With the painted ground: the photo leaves brighter and yellower, the bark a warm light brown.
    leafTex = regraded(leafTex, 'brightness(1.45) saturate(1.3) hue-rotate(-10deg)');
    barkTex = regraded(barkTex, 'brightness(2) sepia(0.4) saturate(1.1)');
  }
}

/** A texture's picture redrawn through a CSS filter (alpha kept). */
function regraded(t: THREE.Texture, filter: string): THREE.Texture {
  const img = t.image as HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.filter = filter;
  g.drawImage(img, 0, 0);
  const out = new THREE.CanvasTexture(c);
  t.dispose();
  return out;
}

function materials(): { leaf: THREE.MeshLambertMaterial; bark: THREE.MeshLambertMaterial } {
  if (!leafMat || !barkMat) {
    const leaves = leafTex ?? loader.load('./textures/ocak-yaprak.png');
    leaves.colorSpace = THREE.SRGBColorSpace;
    leaves.anisotropy = 4;
    leafMat = new THREE.MeshLambertMaterial({ map: leaves, alphaTest: 0.38, side: THREE.DoubleSide, vertexColors: true });
    // Both faces of a card use the same (crown-outward) normal, so back faces don't turn dark.
    leafMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize( vNormal );');
    };
    const bark = barkTex ?? loader.load('./textures/ocak-kabuk.png');
    bark.colorSpace = THREE.SRGBColorSpace;
    bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
    barkMat = new THREE.MeshLambertMaterial({ map: bark, color: '#ffffff', emissive: '#3a352c' });
    // Leaves let light through: lift the shaded side so the crown doesn't go black.
    leafMat.emissive = new THREE.Color(PAINTED_GROUND ? '#2c4512' : '#1c2a10');
    if (PAINTED_GROUND) barkMat.emissive = new THREE.Color('#5c4832');
  }
  return { leaf: leafMat, bark: barkMat };
}

/** A tube along a curve whose radius tapers from r0 to r1; v runs along the length for bark tiling. */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segs: number, radial: number): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const len = curve.getLength();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      // Only the lit middle of the photographed stem strip, mirrored round the tube (no seam).
      uv.push(0.5 + 0.18 * Math.cos(a), (t * len) / 0.6);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

interface BushGeo {
  stems: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
}

const cache = new Map<number, BushGeo>();

function build(variant: number): BushGeo {
  const rnd = makeRng(500 + variant * 97);
  // Variants: 0 tall and narrow, 1 wide and full, 2 young and sparse.
  const tall = [1.12, 0.95, 0.9][variant] ?? 1;
  const wide = [0.85, 1.15, 0.8][variant] ?? 1;
  const density = [1, 1.15, 0.7][variant] ?? 1;
  const stems = Math.round((12 + rnd() * 4) * (variant === 2 ? 0.75 : 1));
  const stemGeos: THREE.BufferGeometry[] = [];
  const cardPos: number[] = [];
  const cardNor: number[] = [];
  const cardUv: number[] = [];
  const cardCol: number[] = [];
  const cardIdx: number[] = [];
  const crownCentre = new THREE.Vector3(0, 2.4 * tall, 0);
  const tmp = new THREE.Vector3();

  const addCard = (c: THREE.Vector3, size: number, outward: THREE.Vector3, shade: number) => {
    // Card faces outwards from the crown (a small random turn and roll), never edge-on to a viewer outside.
    const out = outward.clone().normalize();
    const yaw = Math.atan2(out.x, out.z) + (rnd() - 0.5) * 0.7;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(right, -Math.max(-0.6, Math.min(0.9, out.y)) * 0.8 + (rnd() - 0.5) * 0.3);
    up.applyAxisAngle(new THREE.Vector3().crossVectors(right, up), (rnd() - 0.5) * 0.5);
    const w = size * (0.85 + rnd() * 0.3);
    const h = size;
    const cell = Math.floor(rnd() * 4);
    const u0 = (cell % 2) * 0.5;
    const v0 = cell < 2 ? 0.5 : 0;
    const flip = rnd() < 0.5;
    // Lighting normal: pointing out of the crown, so the cards shade like one leafy volume.
    const nrm = tmp.copy(c).sub(crownCentre).normalize().lerp(new THREE.Vector3(0, 1, 0), 0.55).normalize();
    const base = cardPos.length / 3;
    const corners: [number, number][] = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ];
    for (const [sx, sy] of corners) {
      cardPos.push(c.x + right.x * sx * w + up.x * sy * h, c.y + right.y * sx * w + up.y * sy * h, c.z + right.z * sx * w + up.z * sy * h);
      cardNor.push(nrm.x, nrm.y, nrm.z);
      cardUv.push(u0 + (flip ? 0.5 - (sx + 0.5) * 0.5 : (sx + 0.5) * 0.5), v0 + (sy + 0.5) * 0.5);
      const k = shade * (0.92 + rnd() * 0.16);
      cardCol.push(k, k, k * 0.95);
    }
    cardIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * Math.PI * 2 + rnd() * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    // Vase shape as in the photo: stems rise from a root clump, curve a little, cross and fan out.
    const spread = (1.3 + rnd() * 0.8) * wide;
    const height = (2.7 + rnd() * 0.8) * tall * (i % 4 === 0 ? 0.85 : 1);
    const lean = (rnd() - 0.5) * 0.9;
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const root = dir.clone().multiplyScalar(0.06 + rnd() * 0.16).addScaledVector(side, (rnd() - 0.5) * 0.12);
    const curve = new THREE.CatmullRomCurve3([
      root,
      dir.clone().multiplyScalar(spread * 0.3).addScaledVector(side, lean * 0.15).setY(height * 0.28),
      dir.clone().multiplyScalar(spread * 0.68).addScaledVector(side, lean * 0.5).setY(height * 0.62),
      dir.clone().multiplyScalar(spread * 0.9).addScaledVector(side, lean * 0.7).setY(height),
    ]);
    const r0 = 0.032 + rnd() * 0.02;
    stemGeos.push(taperedTube(curve, r0, r0 * 0.35, 7, 5));
    // A couple of side shoots in the upper half.
    for (let s = 0; s < 2; s++) {
      if (rnd() > 0.65) continue;
      const t = 0.5 + rnd() * 0.35;
      const from = curve.getPointAt(t);
      const out = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 2).multiplyScalar(0.3 + rnd() * 0.3);
      const shoot = new THREE.CatmullRomCurve3([from, from.clone().add(out.clone().multiplyScalar(0.5)).add(new THREE.Vector3(0, 0.35, 0)), from.clone().add(out).add(new THREE.Vector3(0, 0.6, 0))]);
      stemGeos.push(taperedTube(shoot, r0 * 0.45, r0 * 0.2, 3, 4));
    }
  }
  // Crown: leaf cards on a dome (an ellipsoid shell from just under the stem tops to above them),
  // the photo clusters already contain the twigs between the leaves.
  const cy = 2.25 * tall;
  const rx = 1.95 * wide;
  const ry = 1.3 * tall;
  const shell = Math.round(60 * density * (0.8 + wide * 0.2));
  for (let i = 0; i < shell; i++) {
    // Even spread over the upper ~70 % of the sphere (Fibonacci points), jittered.
    const k = (i + 0.5) / shell;
    const yy = 1 - k * 1.75;
    // The lower edge thins out into single clusters hanging on the outer stems.
    if (yy < -0.35 && rnd() < 0.45) continue;
    const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
    const th = i * 2.39996 + rnd() * 0.4;
    const depth = yy < -0.3 ? 0.9 + rnd() * 0.15 : 0.75 + rnd() * 0.25;
    // Gaps where the stems show through, and lobes so the outline is not a perfect dome.
    if (rnd() < 0.12) continue;
    const lobe = 1 + 0.16 * Math.sin(th * 3 + variant) * Math.cos(yy * 4) + 0.08 * Math.sin(th * 7 + 2);
    const dirc = new THREE.Vector3(Math.cos(th) * rr, yy, Math.sin(th) * rr);
    const p = new THREE.Vector3(dirc.x * rx * depth * lobe, cy + dirc.y * ry * depth * lobe, dirc.z * rx * depth * lobe);
    addCard(p, 0.85 + rnd() * 0.45, dirc, 0.82 + 0.28 * (yy * 0.5 + 0.5));
  }

  const stemsGeo = mergeAll(stemGeos);
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(cardPos, 3));
  leaves.setAttribute('normal', new THREE.Float32BufferAttribute(cardNor, 3));
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(cardUv, 2));
  leaves.setAttribute('color', new THREE.Float32BufferAttribute(cardCol, 3));
  leaves.setIndex(cardIdx);
  leaves.computeBoundingSphere();
  return { stems: stemsGeo, leaves };
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const g of geos) {
    const base = pos.length / 3;
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
    uv.push(...(g.getAttribute('uv').array as Float32Array));
    for (const i of g.index!.array) idx.push(base + i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

/** A new bush object (geometry and materials are shared between bushes of the same variant). */
export function hazelnutBush(variant: number): THREE.Group {
  let geo = cache.get(variant);
  if (!geo) {
    geo = build(variant);
    cache.set(variant, geo);
  }
  const { leaf, bark } = materials();
  const g = new THREE.Group();
  const stems = new THREE.Mesh(geo.stems, bark);
  const leaves = new THREE.Mesh(geo.leaves, leaf);
  stems.castShadow = leaves.castShadow = true;
  stems.receiveShadow = true;
  g.add(stems, leaves);
  return g;
}

/** Triangle count of a variant (for the budget). */
export function hazelnutTriangles(variant: number): number {
  const g = cache.get(variant) ?? build(variant);
  return (g.stems.index!.count + g.leaves.index!.count) / 3;
}

let treeGeo: BushGeo | null = null;

/** A broadleaf tree: one trunk forking into a few limbs, a big leafy crown of the same leaf cards. */
function buildTree(): BushGeo {
  const rnd = makeRng(4242);
  const stemGeos: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.12, 2.5, 0.05), new THREE.Vector3(0.05, 5, -0.05)]);
  stemGeos.push(taperedTube(trunk, 0.3, 0.16, 7, 8));
  const tops: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.5;
    const from = trunk.getPointAt(0.8 + rnd() * 0.2);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(1.6 + rnd() * 1.2);
    const tip = from.clone().add(out).add(new THREE.Vector3(0, 1.8 + rnd() * 1.4, 0));
    const limb = new THREE.CatmullRomCurve3([from, from.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.4, 0)), tip]);
    stemGeos.push(taperedTube(limb, 0.11, 0.03, 5, 5));
    tops.push(tip);
  }
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const centre = new THREE.Vector3(0, 7.4, 0);
  for (let i = 0; i < 70; i++) {
    const k = (i + 0.5) / 70;
    const yy = 1 - k * 1.6;
    const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
    const th = i * 2.39996 + rnd() * 0.4;
    const d = new THREE.Vector3(Math.cos(th) * rr, yy, Math.sin(th) * rr);
    const p = new THREE.Vector3(d.x * 3.2, centre.y + d.y * 2.4, d.z * 3.2).multiplyScalar(0.8 + rnd() * 0.25);
    p.y += centre.y * 0.15;
    const size = 1.9 + rnd() * 0.8;
    const yaw = Math.atan2(d.x, d.z) + (rnd() - 0.5) * 0.7;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(right, -Math.max(-0.6, Math.min(0.9, d.y)) * 0.8);
    const n = d.clone().lerp(new THREE.Vector3(0, 1, 0), 0.5).normalize();
    const shade = 0.8 + 0.3 * (yy * 0.5 + 0.5);
    const base = pos.length / 3;
    for (const [sx, sy] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]) {
      pos.push(p.x + (right.x * sx + up.x * sy) * size, p.y + (right.y * sx + up.y * sy) * size, p.z + (right.z * sx + up.z * sy) * size);
      nor.push(n.x, n.y, n.z);
      uv.push(sx + 0.5, sy + 0.5);
      // Darker, bluer green than the hazel: reads as a different, bigger tree.
      col.push(shade, shade, shade);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  leaves.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  leaves.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  leaves.setIndex(idx);
  leaves.computeBoundingSphere();
  return { stems: mergeAll(stemGeos), leaves };
}

/** Broadleaf trees at the given transforms (instanced: two draw calls for all of them). */
export function broadleafTrees(matrices: THREE.Matrix4[], tint?: { bark: string; leaf: string }): THREE.Group {
  treeGeo ??= buildTree();
  if (!tint) return instanced(treeGeo, matrices, treeLeafMaterial());
  // (Another kind of tree: its bark and leaves tinted.)
  const leaf = treeLeafMaterial().clone();
  leaf.color.set(tint.leaf);
  leaf.onBeforeCompile = treeLeafMaterial().onBeforeCompile;
  const bark = materials().bark.clone();
  bark.color.set(tint.bark);
  bark.emissive.multiplyScalar(0.45);
  return instanced(treeGeo, matrices, leaf, bark);
}

let treeLeafMat: THREE.MeshLambertMaterial | null = null;

/**
 * Leaf texture of the broadleaf trees: many small dark, glossy beech-like leaves drawn on a canvas,
 * clearly different from the large pale hazel leaves of the bushes.
 */
function treeLeafMaterial(): THREE.MeshLambertMaterial {
  if (treeLeafMat) return treeLeafMat;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rnd = makeRng(808);
  for (let i = 0; i < 420; i++) {
    const r = Math.sqrt(rnd()) * S * 0.47;
    const a = rnd() * Math.PI * 2;
    const x = S / 2 + Math.cos(a) * r;
    const y = S / 2 + Math.sin(a) * r;
    const len = 9 + rnd() * 8;
    const k = 0.55 + rnd() * 0.5;
    g.fillStyle = `rgb(${Math.round(52 * k)}, ${Math.round(98 * k)}, ${Math.round(40 * k)})`;
    g.save();
    g.translate(x, y);
    g.rotate(rnd() * Math.PI * 2);
    g.beginPath();
    g.ellipse(0, 0, len * 0.5, len * 0.27, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  treeLeafMat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true, emissive: '#0d1608' });
  treeLeafMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize( vNormal );');
  };
  return treeLeafMat;
}

function instanced(geo: BushGeo, matrices: THREE.Matrix4[], leafOverride?: THREE.Material, barkOverride?: THREE.Material): THREE.Group {
  const m = materials();
  const bark = barkOverride ?? m.bark;
  const leaf = leafOverride ?? m.leaf;
  const g = new THREE.Group();
  if (!matrices.length) return g;
  for (const [geometry, material] of [
    [geo.stems, bark],
    [geo.leaves, leaf],
  ] as const) {
    const im = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

/** Many bushes of one variant at the given transforms (instanced: two draw calls for all of them). */
export function hazelnutBushes(variant: number, matrices: THREE.Matrix4[]): THREE.Group {
  let geo = cache.get(variant);
  if (!geo) {
    geo = build(variant);
    cache.set(variant, geo);
  }
  return instanced(geo, matrices);
}
