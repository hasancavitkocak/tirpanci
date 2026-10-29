import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BURN, BurnTask, heaped } from '../game/burn';
import { spotMark } from './harvest';
import { cutTriangles } from './trimmerRig';

/**
 * The cut grass blown together and burned, drawn (game/burn.ts): the tufts of clippings lying where the
 * grass is mown (blown along the ground), the heap's place marked in the middle, the heap growing as they
 * come in; lit, flames and embers over it while it burns, then a ring of ash. And the backpack blower
 * (ufleyici.glb): on the worker's back, or before the eyes in first person, its tube ahead on the right.
 */

/** A tuft: a flat, ragged handful of cut grass. */
function tuftGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.2, 0);
  g.scale(1.2, 0.18, 0.8);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + Math.sin(i * 7.7) * 0.25), Math.max(0, p.getY(i)) + 0.01, p.getZ(i) * (0.8 + Math.cos(i * 5.3) * 0.25));
  g.computeVertexNormals();
  return g;
}

export class BurnView {
  readonly group = new THREE.Group();
  private readonly tufts: THREE.InstancedMesh;
  private readonly heap: THREE.Mesh;
  private readonly ash: THREE.Mesh;
  private readonly mark: THREE.Group;
  private readonly flames: THREE.Mesh[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();

  constructor(task: BurnTask, private readonly ground: (x: number, z: number) => number) {
    this.tufts = new THREE.InstancedMesh(tuftGeometry(), new THREE.MeshLambertMaterial({ color: '#a3b34a', flatShading: true }), task.tufts.length);
    this.tufts.frustumCulled = false;
    this.tufts.receiveShadow = true;
    // (Each tuft its own shade of drying green.)
    const c = new THREE.Color();
    task.tufts.forEach((_, i) => {
      c.setHSL(0.17 + Math.sin(i * 12.9) * 0.03, 0.45, 0.42 + Math.cos(i * 7.1) * 0.06);
      this.tufts.setColorAt(i, c);
    });
    this.group.add(this.tufts);
    const h = task.heap;
    const y = ground(h.x, h.z);
    this.mark = spotMark({ x: h.x, z: h.z, yaw: 0, w: BURN.heapR * 2, d: BURN.heapR * 2 }, 'YIĞIN', ground);
    this.group.add(this.mark);
    // The heap: a ragged mound of cut grass, as big as what is in it.
    const hg = new THREE.ConeGeometry(BURN.heapR * 0.8, 1.1, 14, 3);
    hg.translate(0, 0.55, 0);
    const hp = hg.getAttribute('position');
    for (let i = 0; i < hp.count; i++) hp.setXYZ(i, hp.getX(i) * (1 + Math.sin(i * 3.7) * 0.08), hp.getY(i) * (1 + Math.cos(i * 5.1) * 0.06), hp.getZ(i) * (1 + Math.sin(i * 2.3) * 0.08));
    hg.computeVertexNormals();
    this.heap = new THREE.Mesh(hg, new THREE.MeshLambertMaterial({ color: '#9aa548', flatShading: true }));
    this.heap.position.set(h.x, y - 0.05, h.z);
    this.heap.castShadow = this.heap.receiveShadow = true;
    this.heap.visible = false;
    this.group.add(this.heap);
    // Burnt: grey ash where the heap was.
    this.ash = new THREE.Mesh(new THREE.CircleGeometry(BURN.heapR * 0.9, 18), new THREE.MeshLambertMaterial({ color: '#3d3a36' }));
    this.ash.rotation.x = -Math.PI / 2;
    this.ash.position.set(h.x, y + 0.03, h.z);
    this.ash.visible = false;
    this.group.add(this.ash);
    // The flames: a few glowing tongues, flickering.
    for (let i = 0; i < 9; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(i ? 0.42 : 0.6, i ? 1.6 : 2.2, 7, 1, true), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffb02e' : '#ff6a1a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
      const a = (i / 8) * Math.PI * 2;
      f.position.set(h.x + Math.cos(a) * (i ? 0.75 : 0), y + (i ? 0.75 : 1.1), h.z + Math.sin(a) * (i ? 0.75 : 0));
      f.visible = false;
      this.flames.push(f);
      this.group.add(f);
    }
  }

  /** Every frame: the tufts where they lie (hidden till mown, gone into the heap), the heap, the fire. */
  /** Each tuft's ground height where it was last (worked out again only once it has been blown on). */
  private readonly lie: { x: number; z: number; y: number }[] = [];

  update(task: BurnTask, time: number): void {
    task.tufts.forEach((t, i) => {
      const show = t.shown && !t.heaped && task.lit === undefined;
      this.sc.set(show ? 1 : 0, show ? 1 : 0, show ? 1 : 0);
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), i * 2.17);
      // (The ground under every tuft every frame was a seventh of the game's own work.)
      let l = this.lie[i];
      if (!l || l.x !== t.x || l.z !== t.z) l = this.lie[i] = { x: t.x, z: t.z, y: this.ground(t.x, t.z) };
      this.m.compose(this.v.set(t.x, l.y, t.z), this.q, this.sc);
      this.tufts.setMatrixAt(i, this.m);
    });
    this.tufts.instanceMatrix.needsUpdate = true;
    const k = heaped(task);
    const burnt = task.lit !== undefined ? Math.min(1, task.lit / BURN.burns) : 0;
    this.heap.visible = k > 0.02 && burnt < 1;
    const s = Math.cbrt(Math.max(0.05, k)) * (1 - burnt * 0.85);
    this.heap.scale.set(s, s, s);
    // (Darkening as it burns.)
    (this.heap.material as THREE.MeshLambertMaterial).color.set('#9aa548').lerp(new THREE.Color('#2e2620'), Math.min(1, burnt * 1.6));
    this.mark.visible = task.lit === undefined;
    this.ash.visible = task.lit !== undefined;
    const on = task.lit !== undefined && burnt < 1;
    this.flames.forEach((f, i) => {
      f.visible = on;
      if (!on) return;
      const fade = burnt < 0.15 ? burnt / 0.15 : 1 - Math.max(0, (burnt - 0.7) / 0.3);
      const fl = 0.75 + Math.sin(time * (9 + i * 1.7) + i) * 0.18 + Math.sin(time * 23 + i * 3) * 0.08;
      f.scale.set(fl * fade, fl * fade * (1.1 - burnt * 0.5), fl * fade);
    });
  }

  /** Where the fire is (for its smoke and sound): its middle, or null when not burning. */
  fireAt(task: BurnTask): { x: number; y: number; z: number } | null {
    if (task.lit === undefined || task.lit >= BURN.burns) return null;
    return { x: task.heap.x, y: this.ground(task.heap.x, task.heap.z) + 1.2, z: task.heap.z };
  }
}

/** The blower: made to wear, the model's back pad (its -z) against the back, its tube out along the right. */
export function blowerModel(gltf: GLTF): THREE.Object3D {
  const s = gltf.scene.clone(true);
  const box = new THREE.Box3().setFromObject(s);
  const k = 1.0 / Math.max(1e-6, box.max.z - box.min.z);
  s.scale.setScalar(k);
  s.position.set(-((box.min.x + box.max.x) / 2) * k, -((box.min.y + box.max.y) / 2) * k, -((box.min.z + box.max.z) / 2) * k);
  s.traverse((o) => {
    o.castShadow = true;
    o.frustumCulled = false;
  });
  const g = new THREE.Group();
  g.add(s);
  return g;
}

/**
 * The blower in first person: only its tube (the model's -z half, along its +x side), its root by the
 * right cheek, low, its mouth out ahead and a little down; in the camera's own space (it faces -z).
 */
export function blowerTube(gltf: GLTF): THREE.Object3D {
  const k = 1.0 / 0.979;
  const tube = cutTriangles(gltf.scene.clone(true), (c) => c.z > -0.02);
  tube.scale.setScalar(k);
  // (Where the tube leaves the machine, (0.25, 0.15, 0) of the model, by the right cheek, low.)
  tube.position.set(0.14 - 0.25 * k, -0.36 - 0.15 * k, 0.05);
  tube.traverse((o) => (o.frustumCulled = false));
  const tilt = new THREE.Group();
  // (Tipped up a little at its root: its mouth in sight, ahead in the grass.)
  tilt.rotation.x = 0.22;
  tilt.add(tube);
  const g = new THREE.Group();
  g.add(tilt);
  return g;
}
