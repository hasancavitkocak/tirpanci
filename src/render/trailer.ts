import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TRAILER } from '../game/config';
import type { Field } from '../game/field';
import { prepared, tyre } from './tractor';

/**
 * The trailer from its artist model (romork: one mesh, drawbar towards +X, its own little wheels under
 * the bed, hidden by the tractor's front tyres put on its axle). Measured from the model (model units):
 * its axle and the eye of its drawbar.
 */
const BODY = {
  /** Model units to metres: a bed about 3.5 m long. */
  k: 4,
  axle: { x: -0.26, y: 0.055 },
  /** The drawbar's eye (0.49 forward: TRAILER.length from the axle). */
  eyeY: 0.06,
};

export class TrailerRig {
  /** Origin on the ground under its axle's centre, +Z towards the drawbar. */
  readonly group = new THREE.Group();
  private readonly wheels: { spin: THREE.Object3D; dir: number }[] = [];

  constructor(parts: { body: GLTF; tyre: GLTF }) {
    const k = BODY.k;
    const R = TRAILER.wheel / 2;
    const body = prepared(parts.body);
    body.scale.setScalar(k);
    // A quarter turn: the model's +X (the drawbar) to +Z.
    body.rotation.y = -Math.PI / 2;
    body.position.set(0, R - BODY.axle.y * k, -BODY.axle.x * k);
    this.group.add(body);
    for (const s of [-1, 1]) {
      const w = tyre(parts.tyre, TRAILER.wheel, s, true);
      w.outer.position.set(s * TRAILER.track, R, 0);
      this.group.add(w.outer);
      this.wheels.push({ spin: w.spin, dir: s < 0 ? -1 : 1 });
    }
  }

  /** Roll the wheels by `distance` metres. */
  update(distance: number): void {
    for (const w of this.wheels) w.spin.rotation.x += (distance / (TRAILER.wheel / 2)) * w.dir;
  }

  /** Behind the tractor's hitch, pitched from its axle up to the hitch and rolled to its two wheels. */
  place(f: Field, ground: (x: number, z: number) => number, hitchY: number): void {
    const a = f.trailerAxle();
    this.group.visible = !!a;
    if (!a) return;
    const w = f.trailerWheels();
    const gr = ground(w[0].x, w[0].z) + f.stoneLift(w[0].x, w[0].z);
    const gl = ground(w[1].x, w[1].z) + f.stoneLift(w[1].x, w[1].z);
    const y = (gr + gl) / 2;
    // The drawbar's eye stands on the hitch: nose up or down by the difference over its length.
    const eyeY = y + TRAILER.wheel / 2 - BODY.axle.y * BODY.k + BODY.eyeY * BODY.k;
    const pitch = Math.atan2(eyeY - hitchY, TRAILER.length);
    this.group.position.set(a.x, y, a.z);
    this.group.rotation.set(Math.max(-0.4, Math.min(0.4, pitch)), a.yaw, Math.atan2(gl - gr, TRAILER.track * 2), 'YXZ');
  }
}
