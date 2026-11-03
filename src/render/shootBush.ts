import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makeRng } from '../game/rng';

/**
 * Hazelnut ocak built from one artist shoot (a single hazel stem with leaves, models.json "shoot"):
 * 10–14 copies rise from one root clump, some upright, most leaning out at 10–40°, of different
 * lengths, turned every way — the way a real ocak grows. Further away lighter versions (fewer shoots: BUSH_LOD).
 */

/** Height of a full shoot in the game, metres. */
const SHOOT_LEN = 4.6;

interface Variant {
  near: THREE.BufferGeometry;
  mid: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  /** The far one's shoots simplified (see prepareShootLite), past BUSH_LOD.distant. */
  distant: THREE.BufferGeometry | null;
}

/**
 * Where an ocak of the field being mown goes lighter (m): every shoot up close, under half of them past
 * `mid`, three past `far` (at 16 m it kept six shoots of 1,455 triangles each, to the far end of the
 * field: a quarter of a phone's triangles).
 */
const BUSH_LOD = { mid: 12, far: 22, farShoots: 3, distant: 34 };

let source: { geo: THREE.BufferGeometry; mat: THREE.Material } | null = null;
/** The shoot with about a third of its triangles, for ocaks too far off to show the difference. */
let lite: THREE.BufferGeometry | null = null;
const variants = new Map<number, Variant>();

function prepareSource(gltf: GLTF): { geo: THREE.BufferGeometry; mat: THREE.Material } {
  if (source) return source;
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  const m = mesh as unknown as THREE.Mesh;
  m.updateWorldMatrix(true, false);
  const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
  for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
  // Base of the stem at the origin, unit height scaled to SHOOT_LEN.
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const base = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
  // The stem's foot: average of the lowest vertices.
  const p = geo.getAttribute('position');
  let fx = 0;
  let fz = 0;
  let n = 0;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < b.min.y + (b.max.y - b.min.y) * 0.03) {
      fx += p.getX(i);
      fz += p.getZ(i);
      n++;
    }
  }
  if (n) base.set(fx / n, b.min.y, fz / n);
  geo.translate(-base.x, -base.y, -base.z);
  geo.scale(SHOOT_LEN / (b.max.y - b.min.y), SHOOT_LEN / (b.max.y - b.min.y), SHOOT_LEN / (b.max.y - b.min.y));
  const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
  const mat = src.clone();
  // Darker, deeper green than the Tripo export; double sided so leaves read from behind.
  mat.color = new THREE.Color(0.84, 0.86, 0.78);
  mat.side = THREE.DoubleSide;
  mat.roughness = 0.85;
  mat.metalness = 0;
  source = { geo, mat };
  return source;
}

function build(variant: number, count: number, src = source!.geo): THREE.BufferGeometry {
  const rnd = makeRng(3100 + variant * 71);
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.8;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    // A few stand almost upright in the middle, most lean outward.
    const lean = i % 4 === 0 ? 0.05 + rnd() * 0.12 : 0.18 + rnd() * 0.5;
    const len = (i % 6 === 0 ? 0.72 : 0.9) + rnd() * 0.25;
    const axis = new THREE.Vector3().crossVectors(up, dir).normalize();
    q.setFromAxisAngle(axis, lean);
    // Spin about its own stem so the leaves face every way.
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, rnd() * Math.PI * 2));
    const pos = dir.clone().multiplyScalar(0.05 + rnd() * 0.18);
    m.compose(pos, q, new THREE.Vector3(len * (0.9 + rnd() * 0.2), len, len * (0.9 + rnd() * 0.2)));
    parts.push(src.clone().applyMatrix4(m));
  }
  const g = mergeGeometries(parts)!;
  g.computeBoundingSphere();
  return g;
}

/**
 * Simplify the shoot once (after the models load, before any field is built): the far ocaks and the
 * other fields' ocaks are then drawn with it. Without it (if it fails) they keep the full shoot.
 */
export async function prepareShootLite(gltf: GLTF | undefined): Promise<void> {
  if (!gltf || lite) return;
  const { geo } = prepareSource(gltf);
  try {
    await MeshoptSimplifier.ready;
    // (Its leaves are separate little pieces with their own seams, so the careful simplifier can hardly
    // take anything off: the "sloppy" one, on a grid, keeps a third with its outline within ~7 cm.)
    const g = mergeVertices(geo.toNonIndexed(), 1e-4);
    const target = Math.floor((g.index!.count * 0.35) / 3) * 3;
    const [index] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(g.index!.array), Float32Array.from(g.getAttribute('position').array), 3, null, target, 1);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    lite = g;
  } catch {
    lite = null;
  }
}

/** An ocak object from the artist shoot (shared geometry per variant), with a distance LOD. */
export function shootBush(gltf: GLTF, variant: number, shoots: number): THREE.Object3D {
  const { mat } = prepareSource(gltf);
  let v = variants.get(variant);
  if (!v) {
    v = {
      near: build(variant, shoots),
      mid: build(variant + 10, Math.max(4, Math.round(shoots * 0.45))),
      far: build(variant + 30, BUSH_LOD.farShoots),
      // (The same shoots as `far`, so nothing jumps where it changes over.)
      distant: lite && build(variant + 30, BUSH_LOD.farShoots, lite),
    };
    variants.set(variant, v);
  }
  const lod = new THREE.LOD();
  const levels: [THREE.BufferGeometry, number][] = [
    [v.near, 0],
    [v.mid, BUSH_LOD.mid],
    [v.far, BUSH_LOD.far],
  ];
  if (v.distant) levels.push([v.distant, BUSH_LOD.distant]);
  for (const [geo, dist] of levels) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    lod.addLevel(mesh, dist);
  }
  return lod;
}

/** The lightest ocak: two shoots, for fields seen from afar. */
const distant = new Map<number, THREE.BufferGeometry>();

/** Many ocaks of one variant from the artist shoot, distant detail, at the given transforms (one draw call). */
export function shootBushes(gltf: GLTF, variant: number, matrices: THREE.Matrix4[]): THREE.InstancedMesh {
  const { mat } = prepareSource(gltf);
  let geo = distant.get(variant);
  if (!geo) distant.set(variant, (geo = build(variant + 20, 2, lite ?? undefined)));
  const m = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((x, i) => m.setMatrixAt(i, x));
  m.computeBoundingSphere();
  return m;
}
