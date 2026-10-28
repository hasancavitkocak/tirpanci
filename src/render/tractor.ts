import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BIG_TRACTOR, TRACTOR, TRACTOR_LOCK, TRAILER, VehicleDims } from '../game/config';
import type { Field } from '../game/field';

/**
 * The tractor from its artist model (traktor: one mesh, front towards -X, wheels left off), with its
 * own tyres (traktor_teker_arka: the big lugged rear, axle along X; traktor_teker_on: the ribbed
 * front, axle along Z). Measured from the model (model units): its axle hubs, the seat cushion, the
 * top of the exhaust stack and its own steering wheel.
 */
const BODY = {
  /** Model units to metres (a Massey Ferguson 240 sized: 1.75 m between its axles). */
  k: 3.2,
  rearHub: { x: 0.295, y: 0.09 },
  frontHub: { x: -0.288, y: 0.053 },
  seat: { x: 0.34, y: 0.33 },
  pipe: { x: -0.19, y: 0.496, z: -0.105 },
  wheel: { x: -0.044, y: 0.32, r: 0.08 },
};
/** Rear and front tyre diameters, metres (the front two thirds of the rear, as on a real one). */
const REAR = 1.38;
const FRONT = 0.76;

/** A tractor's drawing: its body's measures (model units), its tyres, its vehicle measures; the front tyre's axle along the model's Z. */
export interface TractorSpec {
  body: typeof BODY;
  rear: number;
  front: number;
  dims: VehicleDims;
  frontAxleZ: boolean;
}
export const SMALL: TractorSpec = { body: BODY, rear: REAR, front: FRONT, dims: TRACTOR, frontAxleZ: true };
/**
 * The big tractor (buyuk-traktor: one mesh, its front towards -X, wheels left off but for their hubs), with
 * its own lugged tyres (both axles along X). Measured from the model (model units).
 */
export const BIG: TractorSpec = {
  body: {
    k: 4.15,
    rearHub: { x: 0.27, y: 0.105 },
    frontHub: { x: -0.27, y: 0.07 },
    seat: { x: 0.12, y: 0.25 },
    pipe: { x: -0.08, y: 0.56, z: -0.15 },
    wheel: { x: 0.02, y: 0.34, r: 0.035 },
  },
  rear: 1.62,
  front: 1.12,
  dims: BIG_TRACTOR,
  frontAxleZ: false,
};

/** A copy of a model with its own geometry (the old field's scene is disposed under the new one). */
export function prepared(gltf: GLTF): THREE.Object3D {
  const m = gltf.scene.clone(true);
  m.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    mesh.castShadow = mesh.receiveShadow = true;
  });
  return m;
}

/**
 * One tyre of the given diameter, its axle along X: `outer` sits at the hub, `spin` rolls about X.
 * `axleZ`: the model's axle lies along Z (turned a quarter to X). On the right (side -1) it is turned
 * round so its rim faces out there too.
 */
export function tyre(gltf: GLTF, diameter: number, side: number, axleZ: boolean): { outer: THREE.Object3D; spin: THREE.Object3D } {
  const m = prepared(gltf);
  if (axleZ) m.rotation.y = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(m);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  const k = diameter / Math.max(box.max.y - box.min.y, box.max.z - box.min.z);
  holder.scale.setScalar(k);
  holder.position.copy(c).multiplyScalar(-k);
  const spin = new THREE.Object3D();
  spin.add(holder);
  const outer = new THREE.Object3D();
  if (side < 0) outer.rotation.y = Math.PI;
  outer.add(spin);
  return { outer, spin };
}

export class TractorRig {
  /** The tractor with its rear wheels, origin on the ground under the vehicle's position, +Z forward. */
  readonly kasa = new THREE.Group();
  /** The front axle's wheels, origin on the ground under the front axle, turned with the steering. */
  readonly head = new THREE.Group();
  /** Where the hands hold the steering wheel: [driver's right, driver's left]. */
  readonly grips: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  readonly seatY: number;
  readonly floorY: number;
  /** The top of the exhaust stack (the smoke comes out of it, upwards). */
  readonly pipe = new THREE.Object3D();
  /** The hitch pin at the back (the trailer's drawbar rides on it). */
  readonly hitch = new THREE.Object3D();
  /** Each wheel's spin, radius and way round (the right-hand ones are turned about: they roll the other way in their own frame). */
  private readonly wheels: { spin: THREE.Object3D; r: number; dir: number }[] = [];
  private readonly fronts: THREE.Object3D[] = [];
  private readonly dims: VehicleDims;

  constructor(parts: { body: GLTF; rear: GLTF; front: GLTF }, spec: TractorSpec = SMALL) {
    const BODY = spec.body;
    const REAR = spec.rear;
    const FRONT = spec.front;
    const TRACTOR = spec.dims;
    this.dims = TRACTOR;
    const k = BODY.k;
    const R = REAR / 2;
    // The model floor rides so the rear hubs stand at the rear tyres' radius.
    const yOff = R - BODY.rearHub.y * k;
    // The body stands level; the front tyres, smaller than the model's front hubs stand high for, sit
    // on the ground a little below them (inside their rims it does not show).
    const frontD = FRONT;
    // Model x (front -X) to the vehicle's z: the rear hub at -rearAxle.
    const zOf = (x: number) => -TRACTOR.rearAxle - (x - BODY.rearHub.x) * k;
    const body = prepared(parts.body);
    body.scale.setScalar(k);
    body.rotation.y = Math.PI / 2;
    body.position.set(0, yOff, zOf(0));
    const inner = new THREE.Group();
    inner.add(body);
    this.kasa.add(inner);
    this.seatY = BODY.seat.y * k + yOff;
    this.floorY = this.seatY - 0.2;
    // Model (x, y, z) lands at (z, y, -x) in the body's turn (a quarter about Y): its z is our x.
    this.pipe.position.set(BODY.pipe.z * k, BODY.pipe.y * k + yOff + 0.05, zOf(BODY.pipe.x));
    inner.add(this.pipe);
    this.hitch.position.set(0, 0.45, -TRACTOR.rearAxle - TRAILER.hitch);
    this.kasa.add(this.hitch);
    for (const s of [-1, 1]) {
      const w = tyre(parts.rear, REAR, s, false);
      w.outer.position.set(s * TRACTOR.kasaTrack, R, -TRACTOR.rearAxle);
      this.kasa.add(w.outer);
      this.wheels.push({ spin: w.spin, r: R, dir: s < 0 ? -1 : 1 });
    }
    for (const s of [-1, 1]) {
      const w = tyre(parts.front, frontD, s, spec.frontAxleZ);
      // A pivot at the hub for the steering.
      const pivot = new THREE.Group();
      pivot.position.set(s * TRACTOR.headTrack, frontD / 2, 0);
      pivot.add(w.outer);
      this.head.add(pivot);
      this.fronts.push(pivot);
      this.wheels.push({ spin: w.spin, r: frontD / 2, dir: s < 0 ? -1 : 1 });
    }
    // The hands on the model's own steering wheel, at 10 and 2.
    const wx = zOf(BODY.wheel.x);
    const wy = BODY.wheel.y * k + yOff;
    const wr = BODY.wheel.r * k;
    this.grips[0].position.set(-wr * 0.85, wy + 0.04, wx);
    this.grips[1].position.set(wr * 0.85, wy + 0.04, wx);
    inner.add(this.grips[0], this.grips[1]);
  }

  /** The tractor is not repainted. */
  setPaint(): void {}

  /** Roll the wheels by `distance` metres; the front wheels turned with the steering. */
  update(distance: number, _art: number, steer = 0): void {
    for (const w of this.wheels) w.spin.rotation.x += (distance / w.r) * w.dir;
    for (const p of this.fronts) p.rotation.y = -steer * TRACTOR_LOCK;
  }

  /** Stand it on the ground: pitched and rolled to the ground under its four wheels. */
  place(f: Field, ground: (x: number, z: number) => number): void {
    const v = f.vehicle;
    const w = f.patpatWheels();
    // (Up on a stream boulder, a wheel stands that much higher.)
    const g = w.map((p) => ground(p.x, p.z) + f.stoneLift(p.x, p.z));
    // Wheels: [front right, front left, rear right, rear left].
    const front = (g[0] + g[1]) / 2;
    const rear = (g[2] + g[3]) / 2;
    const D = this.dims;
    const span = D.joint + D.rearAxle;
    const lim = (a: number, m: number) => Math.max(-m, Math.min(m, a));
    this.kasa.position.set(v.x, (front + rear) / 2, v.z);
    this.kasa.rotation.set(lim(Math.atan2(rear - front, span), 0.35), v.yaw, lim(Math.atan2(g[3] - g[2], D.kasaTrack * 2), 0.3), 'YXZ');
    // The front axle follows the body (it does not swing on its own).
    this.kasa.updateMatrixWorld(true);
    this.head.position.set(0, 0, D.joint).applyMatrix4(this.kasa.matrixWorld);
    this.head.quaternion.copy(this.kasa.quaternion);
  }
}
