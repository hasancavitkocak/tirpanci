import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Field } from '../game/field';
import { TILL, TillTask } from '../game/tiller';
import { cutTriangles } from './trimmerRig';

/**
 * The motor çapa drawn: the model (motor-capa.glb, 1.4 m, its handles at its +x, its little wheel at its
 * -x) with its tines cut out of it into a part of their own, turned about their axle with the throttle;
 * and the ground it works: the bostan's bare, hard plot, and the tilled soil rising loose cell by cell.
 */

/** The tiller's length (m); its tines in the model's own units (their x and below what height). */
const LEN = 1.4;
const TINES = { x0: -0.215, x1: -0.035, y: 0.2 };
/** How far ahead of the worker its middle goes, and its tines (m). */
export const TILLER_AHEAD = 1.25;

export class TillerRig {
  readonly group = new THREE.Group();
  private readonly spin = new THREE.Group();
  /** Where its tines turn, along its heading from its middle (m). */
  readonly tinesAhead: number;

  constructor(model: GLTF) {
    const k = LEN / 0.978;
    const inTines = (c: THREE.Vector3) => c.x > TINES.x0 && c.x < TINES.x1 && c.y < TINES.y;
    const body = cutTriangles(model.scene.clone(true), inTines);
    const tines = cutTriangles(model.scene.clone(true), (c) => !inTines(c));
    // The tines' axle: the middle of what is left of them (across the machine, along its z).
    const box = new THREE.Box3().setFromObject(tines);
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2;
    tines.position.set(-cx, -cy, 0);
    this.spin.position.set(cx, cy, 0);
    this.spin.add(tines);
    const inner = new THREE.Group();
    inner.add(body, this.spin);
    inner.scale.setScalar(k);
    // (Its front, the model's -x, ahead along +z, the way the worker pushes it.)
    inner.rotation.y = Math.PI / 2;
    inner.traverse((o) => {
      o.castShadow = true;
      o.frustumCulled = false;
    });
    this.group.add(inner);
    this.group.visible = false;
    this.tinesAhead = -cx * k;
  }

  /** At (x, z) facing `yaw`, on the ground; its tines turning as fast as the throttle says. */
  place(x: number, y: number, z: number, yaw: number, pitch: number, spin: number, dt: number): void {
    this.group.position.set(x, y, z);
    this.group.rotation.set(pitch, yaw, 0, 'YXZ');
    // (Forward, the tines' tops towards the front.)
    this.spin.rotation.z -= spin * dt * 22;
  }
}

/** A tilled cell's soil: a low lumpy mound, the tilled soil's picture on it. */
function moundGeometry(): THREE.BufferGeometry {
  // (Bigger than its cell: the mounds run into each other, one stretch of loose soil.)
  const s = TILL.cell * 1.4;
  const g = new THREE.PlaneGeometry(s, s, 4, 4);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (s / 2);
    const z = p.getZ(i) / (s / 2);
    const e = Math.max(Math.abs(x), Math.abs(z));
    p.setY(i, 0.015 + (1 - e * e * e) * 0.08 + Math.sin(x * 7.3 + z * 3.1) * 0.012);
  }
  g.computeVertexNormals();
  return g;
}

/** The plot being tilled: the bostan's bare ground, the tilled cells rising as they are turned over. */
export class SoilView {
  readonly group = new THREE.Group();
  private readonly mounds: THREE.InstancedMesh;
  private readonly rise: Float32Array;
  private readonly m = new THREE.Matrix4();

  constructor(f: Field, task: TillTask, ground: (x: number, z: number) => number) {
    const tex = new THREE.TextureLoader().load('./textures/toprak-capali.webp');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // The bostan: hard, packed, faintly grassy ground before it is tilled.
    if (task.rect) {
      const r = task.rect;
      const g = new THREE.PlaneGeometry(r.w + 0.3, r.d + 0.3, Math.ceil(r.w * 2), Math.ceil(r.d * 2));
      g.rotateX(-Math.PI / 2);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) p.setY(i, ground(r.x + p.getX(i), r.z + p.getZ(i)) + 0.015);
      g.translate(r.x, 0, r.z);
      g.computeVertexNormals();
      const bare = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#5e4632' }));
      bare.receiveShadow = true;
      this.group.add(bare);
    }
    this.mounds = new THREE.InstancedMesh(moundGeometry(), new THREE.MeshLambertMaterial({ map: tex }), task.cells.length);
    this.mounds.receiveShadow = true;
    this.mounds.frustumCulled = false;
    this.rise = new Float32Array(task.cells.length);
    task.cells.forEach((c, i) => {
      this.m.makeScale(1, 0.0001, 1).setPosition(c.x, ground(c.x, c.z) + 0.012, c.z);
      this.mounds.setMatrixAt(i, this.m);
    });
    this.mounds.instanceMatrix.needsUpdate = true;
    this.group.add(this.mounds);
    void f;
  }

  /** Every frame: the cells tilled rise to full height (in about half a second); a little turned each. */
  update(task: TillTask, ground: (x: number, z: number) => number, dt: number): void {
    let changed = false;
    task.cells.forEach((c, i) => {
      const want = c.t >= 1 ? 1 : c.t * 0.35;
      if (Math.abs(want - this.rise[i]) < 0.005) return;
      this.rise[i] = Math.min(want, this.rise[i] + dt * 2.2);
      // (Turned by quarters: the soil's picture varied, no gaps at the corners.)
      const turn = new THREE.Matrix4().makeRotationY((i % 4) * (Math.PI / 2));
      this.m.makeScale(1, Math.max(0.0001, this.rise[i]), 1).premultiply(turn).setPosition(c.x, ground(c.x, c.z) + 0.012, c.z);
      this.mounds.setMatrixAt(i, this.m);
      changed = true;
    });
    if (changed) this.mounds.instanceMatrix.needsUpdate = true;
  }
}
