import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Field } from '../game/field';
import type { Session } from '../game/session';

/**
 * Karabaş, the yard's Kangal (kopek.glb: rigged, one walk cycle in place, facing +z), with the player
 * once the kennel is bought: at heel on foot, round about sniffing while the trimmer works, trotting
 * behind the vehicle; called off to a snake (Game sets `chase`). Standing still it stands (the walk
 * faded out to its rest pose); the walk sped up as it goes faster, to a run.
 */

/** Its height to the top of the head (m), and how far one walk cycle carries it (m). */
const DOG = { height: 0.95, stride: 1.6 };
/** Its pace: walking, trotting, running flat out (m/s); turning (rad/s). */
const PACE = { walk: 1.2, trot: 3, run: 7, turn: 5 };

export class DogView {
  readonly root = new THREE.Group();
  x: number;
  z: number;
  yaw: number;
  private speed = 0;
  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly walk: THREE.AnimationAction | null = null;
  private weight = 0;
  /** Where it wanders to while the trimmer works (round the worker), and when it picks another spot. */
  private wander = { x: 0, z: 0, t: 0 };
  /** A snake it has been called off to (field coordinates), till the time runs out. */
  chase: { x: number; z: number; t: number } | null = null;

  constructor(gltf: GLTF, x: number, z: number, yaw: number) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    const model = SkeletonUtils.clone(gltf.scene);
    model.traverse((o) => {
      o.castShadow = true;
      o.frustumCulled = false;
    });
    const box = new THREE.Box3().setFromObject(model);
    const k = DOG.height / Math.max(1e-6, box.max.y - box.min.y);
    model.scale.multiplyScalar(k);
    model.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
    this.root.add(model);
    const clip = gltf.animations[0];
    if (clip) {
      this.mixer = new THREE.AnimationMixer(model);
      this.walk = this.mixer.clipAction(clip).play();
      this.walk.setEffectiveWeight(0);
    }
  }

  /** Every frame: where it wants to be, getting there, its legs going with its pace. */
  update(dt: number, s: Session, ground: (x: number, z: number) => number, time: number): void {
    const f = s.field;
    let tx: number;
    let tz: number;
    let pace = PACE.walk;
    if (this.chase) {
      // At the snake, barking.
      this.chase.t -= dt;
      tx = this.chase.x;
      tz = this.chase.z;
      pace = PACE.run;
      if (this.chase.t <= 0) this.chase = null;
    } else if (s.driving) {
      // Behind the vehicle, to one side.
      const v = f.vehicle;
      tx = v.x - Math.sin(v.yaw) * 4 + Math.cos(v.yaw) * 1.2;
      tz = v.z - Math.cos(v.yaw) * 4 - Math.sin(v.yaw) * 1.2;
      pace = PACE.run;
    } else if (s.hasTrimmer && s.running) {
      // The trimmer going: off out of its way, round about sniffing, now here now there.
      this.wander.t -= dt;
      if (this.wander.t <= 0) {
        const a = s.yaw + (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.4);
        const r = 4.5 + Math.random() * 3;
        this.wander = { x: s.x + Math.sin(a) * r, z: s.z + Math.cos(a) * r, t: 3 + Math.random() * 4 };
      }
      tx = this.wander.x;
      tz = this.wander.z;
      // (Kept clear of the line.)
      if (Math.hypot(tx - s.x, tz - s.z) < 3.5) this.wander.t = 0;
    } else {
      // At heel: a little behind, on his left.
      tx = s.x - Math.sin(s.yaw) * 1.8 - Math.cos(s.yaw) * 1.1;
      tz = s.z - Math.cos(s.yaw) * 1.8 + Math.sin(s.yaw) * 1.1;
    }
    let d = Math.hypot(tx - this.x, tz - this.z);
    // Left far behind (a fence between, the vehicle off at speed): it catches up out of sight.
    const far = Math.hypot(s.x - this.x, s.z - this.z);
    if (far > 40 && !this.chase) {
      this.x = tx;
      this.z = tz;
      d = 0;
    }
    // Faster the further it has to go; stopping short of where it is going.
    const want = d < 0.4 ? 0 : Math.min(pace, d < 3 ? PACE.walk * Math.min(1, d / 1.5) : d < 8 ? PACE.trot : PACE.run);
    this.speed += (want - this.speed) * Math.min(1, dt * 3);
    if (d > 0.05) {
      const goal = Math.atan2(tx - this.x, tz - this.z);
      const turn = Math.atan2(Math.sin(goal - this.yaw), Math.cos(goal - this.yaw));
      this.yaw += Math.max(-PACE.turn * dt, Math.min(PACE.turn * dt, turn));
    }
    const step = this.speed * dt;
    const nx = this.x + Math.sin(this.yaw) * step;
    const nz = this.z + Math.cos(this.yaw) * step;
    // (Round what is in the way: a bush, a wall; the fences are not its business.)
    if (f.pointFree(nx, nz) || !f.pointFree(this.x, this.z)) {
      this.x = nx;
      this.z = nz;
    } else {
      this.yaw += PACE.turn * dt;
      this.speed *= 0.5;
    }
    // The legs: the walk faded in as it moves, sped up with its pace.
    if (this.mixer && this.walk) {
      this.weight += ((this.speed > 0.15 ? 1 : 0) - this.weight) * Math.min(1, dt * 6);
      this.walk.setEffectiveWeight(this.weight);
      this.walk.timeScale = Math.max(0.6, Math.min(3.2, this.speed / (DOG.stride / 2.54)));
      this.mixer.update(dt);
    }
    // Barking at a snake: a jerk of the head (the whole dog) up.
    const bark = this.chase && d < 2.5 ? Math.max(0, Math.sin(time * 14)) * 0.05 : 0;
    this.root.position.set(this.x, ground(this.x, this.z) + bark, this.z);
    this.root.rotation.y = this.yaw;
  }

  /** How far it is from a point. */
  distanceTo(x: number, z: number): number {
    return Math.hypot(x - this.x, z - this.z);
  }

  /** Put down where it can stand: by the worker (a new job, the start). */
  static spawn(f: Field, s: Session): { x: number; z: number } {
    for (const r of [2, 3, 4, 6]) {
      for (let k = 0; k < 8; k++) {
        const a = s.yaw + Math.PI + (k / 8) * Math.PI * 2;
        const x = s.x + Math.sin(a) * r;
        const z = s.z + Math.cos(a) * r;
        if (f.pointFree(x, z)) return { x, z };
      }
    }
    return { x: s.x, z: s.z };
  }
}
