import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';

/**
 * Stand-ins of the buildings for keeping the follow camera out of their walls (view.ts): never drawn,
 * only hit by its one ray a frame. The artist's buildings are 5–11 thousand triangles each, and the ray
 * through them took 2.4 ms a frame on a desktop; their outlines in a few hundred take a few hundredths.
 */
const PROXY = { tris: 300, error: 0.06 };
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

/** A mesh's positions alone, as numbers (they may be packed small as integers), in the world. */
function positions(m: THREE.Mesh): THREE.BufferGeometry {
  const at = m.geometry.getAttribute('position');
  const pos = new Float32Array(at.count * 3);
  for (let i = 0; i < at.count; i++) pos.set([at.getX(i), at.getY(i), at.getZ(i)], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (m.geometry.index) g.setIndex(m.geometry.index.clone());
  return (g.index ? g.toNonIndexed() : g).applyMatrix4(m.matrixWorld);
}

/** The stand-in of a building placed in the scene (its world position as it stands now): one simplified shape. */
export function wallProxy(obj: THREE.Object3D): THREE.Mesh | null {
  obj.updateWorldMatrix(true, true);
  const parts: THREE.BufferGeometry[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry.getAttribute('position')) parts.push(positions(m));
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  if (!merged) return null;
  const geo = mergeVertices(merged, 1e-3);
  try {
    const target = Math.min(geo.index!.count, PROXY.tris * 3);
    const [index] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(geo.index!.array), geo.getAttribute('position').array as Float32Array, 3, null, target, PROXY.error);
    if (index.length >= 3) geo.setIndex(new THREE.BufferAttribute(index, 1));
  } catch {
    // Not loaded: the full shape (slower, still right).
  }
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  const mesh = new THREE.Mesh(geo, material);
  mesh.updateMatrixWorld();
  return mesh;
}
