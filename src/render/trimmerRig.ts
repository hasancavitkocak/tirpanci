import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Attachment points of the artist trimmer parts, in each model's own units, measured from the Tripo exports:
 * - tirpan_govde: shaft along +X, engine at -X, cutting head at +X;
 * - tirpan_gidon: clamp hole along Z, throttle grip at +X;
 * - eller: forearms towards +Z (the viewer), throttle hand at +X.
 * Real-world sizes are in metres.
 */
export const TRIMMER_RIG = {
  body: { hook: [-0.2, 0.061, 0], head: [0.44, 0.03, 0], exhaust: [-0.4, 0.07, -0.08] },
  bar: {
    hole: [0, 0.036, 0.108],
    gripL: [-0.4, 0.38, 0.085],
    gripR: [0.41, 0.43, -0.065],
    left: { bottom: [-0.376, 0.275, 0.082], top: [-0.433, 0.511, 0.084] },
    right: { bottom: [0.37, 0.27, -0.003], top: [0.432, 0.529, -0.09] },
    /** Above this height (and beyond |x| > gripX) the bar is grip; cut off in first person. */
    gripCutY: 0.255,
    gripX: 0.33,
  },
  hands: {
    left: { bottom: [-0.286, 0.164, -0.09], top: [-0.222, 0.457, -0.193] },
    right: { bottom: [0.269, 0.168, -0.103], top: [0.221, 0.459, -0.167] },
  },
  /** Hook (strap ring) to cutting head. */
  hookToHead: 1.5,
  /** Third person: handlebar clamp distance along the shaft from the hook, and grip spacing. */
  barAlong: 0.3,
  /** Third person: the handlebar U is stretched up by this much (the Tripo bar is a little short). */
  barRise: 1.75,
  gripSpan: 0.56,
  /** First person: distance between the gloves' grips and where they sit in front of the eyes. */
  fpvGripSpan: 0.52,
  fpvHands: [0.05, -0.29, -0.7],
} as const;

export const vec = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);

/** Clone a model scene; `shadows` turns casting/receiving on. */
export function prepare(src: THREE.Object3D, shadows = true): THREE.Object3D {
  const m = src.clone(true);
  m.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = shadows;
      o.receiveShadow = shadows;
    }
  });
  return m;
}

/**
 * Remove triangles from every mesh of a cloned model: those whose centre passes `drop` (model space), or
 * with `anyVertex`, those with any corner passing it.
 */
export function cutTriangles(obj: THREE.Object3D, drop: (c: THREE.Vector3) => boolean, anyVertex = false): THREE.Object3D {
  const c = new THREE.Vector3();
  const q = new THREE.Vector3();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    const p = g.getAttribute('position');
    const src = g.index ? g.index.array : Array.from({ length: p.count }, (_, i) => i);
    const keep: number[] = [];
    for (let i = 0; i < src.length; i += 3) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.x += p.getX(src[i + k]) / 3;
      for (let k = 0; k < 3; k++) c.y += p.getY(src[i + k]) / 3;
      for (let k = 0; k < 3; k++) c.z += p.getZ(src[i + k]) / 3;
      let out = drop(c);
      if (anyVertex && !out) for (let k = 0; k < 3 && !out; k++) out = drop(q.fromBufferAttribute(p, src[i + k]));
      if (!out) keep.push(src[i], src[i + 1], src[i + 2]);
    }
    g.setIndex(keep);
    g.computeBoundingSphere();
    m.geometry = g;
  });
  return obj;
}

/**
 * The Tripo body has the nylon line baked in as two fixed strands sticking out of the spool; they would
 * stand still while the head spins, so they are cut away and the game draws its own spinning line.
 * Drops triangles around the spool (model units) that lie outside the spool radius at line height,
 * in front of the guard.
 */
export function isBakedLine(c: THREE.Vector3): boolean {
  const dx = c.x - SPOOL[0];
  const dz = c.z - SPOOL[1];
  return c.y > 0.022 && c.y < 0.062 && c.x > 0.41 && Math.hypot(dx, dz) > 0.05;
}
/** Spool centre (x, z) and the height of the line exit, model units. */
export const SPOOL = [0.443, 0, 0.04] as const;

/**
 * The Tripo body came with two fuel tanks under the engine; the rear one (towards -z in model space)
 * is cut away, with its cap.
 */
export function isSecondTank(c: THREE.Vector3): boolean {
  return c.x > -0.6 && c.x < -0.27 && c.y > -0.1 && c.y < 0.085 && c.z > -0.2 && c.z < -0.02;
}

/** The engine and tank behind the hook (cut away when the engine is carried on the back instead). */
export function isEngine(c: THREE.Vector3): boolean {
  return c.x < TRIMMER_RIG.body.hook[0] - 0.035;
}

/**
 * The Tripo back-pack machine came as the whole trimmer (pack, hose, shaft, head along +X); only the pack
 * (x < -0.25 in model space) is kept, the game's own shaft does the rest.
 */
export function isNotPack(c: THREE.Vector3): boolean {
  return c.x > -0.25;
}

/**
 * The pack of the back-pack machine on its own, `height` metres tall, stood as worn: its back pad (model
 * +X) facing +Z, the engine towards -Z, bottom at y = 0, the pad's face at z = 0, centred in x.
 */
export function backpackPart(model: GLTF, height: number): THREE.Group {
  const m = cutTriangles(prepare(model.scene), isNotPack);
  // Only the kept triangles' corners, so its box is the pack's.
  m.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry = mesh.geometry.toNonIndexed();
      mesh.castShadow = true;
    }
  });
  const turned = new THREE.Group();
  turned.rotation.y = -Math.PI / 2;
  turned.add(m);
  const box = new THREE.Box3().setFromObject(turned);
  const k = height / Math.max(1e-6, box.max.y - box.min.y);
  turned.scale.setScalar(k);
  const c = box.getCenter(new THREE.Vector3());
  turned.position.set(-c.x * k, -box.min.y * k, -box.max.z * k);
  const g = new THREE.Group();
  g.add(turned);
  return g;
}

/** How high the trimmer head rises at full lift (looking up in first person), metres. */
export const HEAD_LIFT = 1.2;
