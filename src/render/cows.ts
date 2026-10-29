import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Field } from '../game/field';
import type { Session } from '../game/session';
import { makeRng } from '../game/rng';

/**
 * The village's cows (inek.glb: rigged, one walk cycle in place): two by the barn where there is one,
 * grazing; two along the village's tracks on the verge, ambling to and fro and stopping to graze; and now
 * and then one that wanders in through a garden's open side during a job and grazes among the ocaks till
 * the worker (or Karabaş) goes at it and it trots off out of the garden (left in at the end, the owner
 * gives no tip: Game). Some are
 * the model's brown and white, some black and white (its brown painted out in the shader).
 *
 * Of an evening (the akşam's work, `herd`): the cows out on the tracks and the meadows round the village
 * instead, to be brought home: each moves off away from the worker and Karabaş when they come near (the
 * nearer, the faster), so they are driven; one that comes into the barn's door goes in and is home.
 */

/** A cow's height to the top of its horns (m), and how far one walk cycle carries it (m). */
const COW = { height: 1.65, stride: 1.8, cycle: 2.54, radius: 0.9 };
/** Its paces (m/s): grazing along, walking, trotting off. */
const PACE = { amble: 0.45, walk: 0.8, trot: 2.2, turn: 1.6 };

/** One cow: its place, heading, legs. (Exported for the tests.) */
export class Cow {
  readonly root = new THREE.Group();
  x: number;
  z: number;
  yaw: number;
  speed = 0;
  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly walk: THREE.AnimationAction | null = null;
  private weight = 0;
  /** Going round something in the way: on this heading for this long yet, and the side it went round last. */
  private detourYaw = 0;
  private detour = 0;
  private side = 1;
  /** Seconds since it last met something in the way (going round the same thing: the same side). */
  private sinceBlocked = 99;

  constructor(gltf: GLTF, black: boolean, x: number, z: number, yaw: number) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    const model = SkeletonUtils.clone(gltf.scene);
    model.updateMatrixWorld(true);
    // The way it faces (the model is turned a little off its axes): from its root to its head.
    let head: THREE.Object3D | null = null;
    let base: THREE.Object3D | null = null;
    model.traverse((o) => {
      if (!head && /head_1$/i.test(o.name)) head = o;
      if (!base && /root$/i.test(o.name)) base = o;
      o.castShadow = true;
      o.frustumCulled = false;
      const m = o as THREE.Mesh;
      if (m.isMesh && black) m.material = blackAndWhite(m.material as THREE.Material);
    });
    const turn = new THREE.Group();
    turn.add(model);
    if (head && base) {
      const h = (head as THREE.Object3D).getWorldPosition(new THREE.Vector3());
      const b = (base as THREE.Object3D).getWorldPosition(new THREE.Vector3());
      // (Turned so the head points along +z.)
      turn.rotation.y = -Math.atan2(h.x - b.x, h.z - b.z);
    }
    turn.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(turn);
    const k = COW.height / Math.max(1e-6, box.max.y - box.min.y);
    turn.scale.setScalar(k);
    turn.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
    this.root.add(turn);
    const clip = gltf.animations[0];
    if (clip) {
      this.mixer = new THREE.AnimationMixer(model);
      this.walk = this.mixer.clipAction(clip).play();
      this.walk.setEffectiveWeight(0);
      // (Each its own step.)
      this.walk.time = Math.random() * clip.duration;
    }
  }

  /** Towards (tx, tz) at up to `pace` (null: stand), round what is in the way; its legs with its pace. */
  step(dt: number, f: Field, to: { x: number; z: number } | null, pace: number, ground: (x: number, z: number) => number, solid = true): number {
    const d = to ? Math.hypot(to.x - this.x, to.z - this.z) : 0;
    const want = !to || d < 0.3 ? 0 : Math.min(pace, Math.max(0.25, d));
    this.speed += (want - this.speed) * Math.min(1, dt * 2);
    const goal = to && d > 0.05 ? Math.atan2(to.x - this.x, to.z - this.z) : this.yaw;
    // (Going round something: that way a while, else straight for it.)
    if (this.detour > 0) this.detour -= dt;
    this.sinceBlocked += dt;
    const head = this.detour > 0 ? this.detourYaw : goal;
    if (to && d > 0.05) {
      const turn = Math.atan2(Math.sin(head - this.yaw), Math.cos(head - this.yaw));
      // (Faster round an obstacle: it turns as it finds the way.)
      const rate = PACE.turn * (this.detour > 0 ? 2.5 : 1);
      this.yaw += Math.max(-rate * dt, Math.min(rate * dt, turn));
    }
    const free = (y: number, ahead: number) => f.pointFree(this.x + Math.sin(y) * ahead, this.z + Math.cos(y) * ahead);
    const nx = this.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.z + Math.cos(this.yaw) * this.speed * dt;
    if (!solid || f.pointFree(nx, nz) || !f.pointFree(this.x, this.z)) {
      this.x = nx;
      this.z = nz;
    } else if (to) {
      // In the way (a wall, a tree, the barn): round it, on the first free heading out from the one
      // it wants; nothing free, back the way it came. Still going round the same thing, all of that
      // side first (taking the other whenever it looked a little shorter, it went to and fro along a
      // wall; before that it turned a little and back each frame, standing against it for good).
      const angles = [0.45, 0.8, 1.2, 1.6, 2.1, 2.6];
      const tries = this.sinceBlocked < 3 ? [...angles.map((a) => this.side * a), ...angles.map((a) => -this.side * a)] : angles.flatMap((a) => [this.side * a, -this.side * a]);
      this.sinceBlocked = 0;
      this.detour = 1.4;
      this.detourYaw = goal + Math.PI;
      for (const a of tries) {
        const y = goal + a;
        // (All the way out: a corner's edge a few centimetres ahead stopped it there for good.)
        if ([0.01, 0.05, 0.3, 0.6, 0.9].every((k) => free(y, k))) {
          this.side = Math.sign(a);
          this.detourYaw = y;
          break;
        }
      }
      this.speed *= 0.6;
    } else this.speed = 0;
    if (this.mixer && this.walk) {
      this.weight += ((this.speed > 0.08 ? 1 : 0) - this.weight) * Math.min(1, dt * 4);
      this.walk.setEffectiveWeight(this.weight);
      this.walk.timeScale = Math.max(0.4, Math.min(3, this.speed / (COW.stride / COW.cycle)));
      this.mixer.update(dt);
    }
    this.root.position.set(this.x, ground(this.x, this.z), this.z);
    this.root.rotation.y = this.yaw;
    return d;
  }
}

/**
 * The model's brown painted black (a Holstein's patches): its strongly red-orange, darker colours (the
 * brown) made near black; the white, the cream, the horns, the pink muzzle and the brass bell kept.
 */
function blackAndWhite(src: THREE.Material): THREE.Material {
  const m = src.clone();
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      {
        vec3 c = diffuseColor.rgb;
        float g = c.g / max(c.r, 1e-3);
        float b = c.b / max(c.r, 1e-3);
        // Brown: red ahead, little green, hardly any blue; not light (the pink muzzle is light).
        // (Wide enough to take the orange fringe where the patches meet the white.)
        float brown = smoothstep(0.6, 0.4, g) * smoothstep(0.42, 0.24, b) * smoothstep(0.85, 0.65, c.r);
        diffuseColor.rgb = mix(c, vec3(0.025 + c.r * 0.05), brown);
      }`,
    );
  };
  m.customProgramCacheKey = () => 'cow-black';
  return m;
}

type Role =
  | { kind: 'barn'; home: { x: number; z: number }; to: { x: number; z: number } | null; t: number }
  | { kind: 'road'; pts: { x: number; z: number }[]; s: number; s0: number; s1: number; dir: number; side: number; t: number; graze: boolean }
  | { kind: 'garden'; phase: 'wait' | 'enter' | 'graze' | 'flee' | 'gone'; t: number; spot: { x: number; z: number }; gate: { x: number; z: number }; to: { x: number; z: number } | null }
  | { kind: 'herd'; phase: 'out' | 'in' | 'home'; to: { x: number; z: number } | null; t: number };

/** What happened this frame (Game tells the player and plays the sounds). */
export interface CowEvents {
  /** A cow mooed (where). */
  moo: { x: number; z: number } | null;
  /** The garden's cow came in, was sent off; a cow of the evening went into the barn. */
  entered: boolean;
  chased: boolean;
  home: boolean;
}

/** The barn's door, where an evening's cow goes in (field coordinates), and how near counts as at it (m). */
export const BARN_DOOR = { out: 6.5, r: 3.6 };

export class CowsView {
  readonly group = new THREE.Group();
  private readonly cows: { cow: Cow; role: Role }[] = [];
  private mooT = 15 + Math.random() * 20;
  readonly events: CowEvents = { moo: null, entered: false, chased: false, home: false };
  /** The barn's door and its middle (the evening's cows go in there). */
  readonly door: { x: number; z: number } | null = null;
  private readonly barnAt: { x: number; z: number } | null = null;

  constructor(
    private readonly f: Field,
    gltf: GLTF,
    /** A cow is to wander into this job's garden (after `after` seconds). */
    intruder: { after: number } | null,
    /** The evening's cows to bring home (how many): out round the village, none by the barn or on the tracks. */
    herd = 0,
  ) {
    const rnd = makeRng(f.level.seed * 7 + 3);
    let n = 0;
    const add = (x: number, z: number, yaw: number, role: Role) => {
      // Every other one black and white.
      const cow = new Cow(gltf, n++ % 2 === 1, x, z, yaw);
      this.cows.push({ cow, role });
      this.group.add(cow.root);
    };
    // By the barn: two, in front of it, a little apart.
    const barn = f.yardProps.find((y) => y.kind === 'barn');
    if (barn) {
      const yaw = Math.atan2(f.plateau.x - barn.x, f.plateau.z - barn.z);
      this.door = { x: barn.x + Math.sin(yaw) * BARN_DOOR.out, z: barn.z + Math.cos(yaw) * BARN_DOOR.out };
      this.barnAt = { x: barn.x, z: barn.z };
    }
    if (barn && herd && this.door) {
      // The evening: out on the meadows and the tracks round the village, 25 to 80 m from the barn.
      for (let k = 0; k < 400 && this.cows.length < herd; k++) {
        const a = rnd() * Math.PI * 2;
        const r = 25 + rnd() * 55;
        const x = this.door.x + Math.cos(a) * r;
        const z = this.door.z + Math.sin(a) * r;
        if (!f.pointFree(x, z) || f.inWater(x, z) || f.inField(x, z) || f.others.some((o) => x > o.minX - 2 && x < o.maxX + 2 && z > o.minZ - 2 && z < o.maxZ + 2)) continue;
        if (this.cows.some((c) => Math.hypot(c.cow.x - x, c.cow.z - z) < 12)) continue;
        add(x, z, rnd() * 6.28, { kind: 'herd', phase: 'out', to: null, t: rnd() * 5 });
      }
    } else if (barn) {
      const yaw = Math.atan2(f.plateau.x - barn.x, f.plateau.z - barn.z);
      for (const side of [-1, 1]) {
        // (Where that is not free, a little further out or across.)
        for (const [out, across] of [[7, 3.2], [8.5, 3.2], [7, 5], [9.5, 2], [6, 6.5]]) {
          const o = out + side * 0.8;
          const x = barn.x + Math.sin(yaw) * o + Math.cos(yaw) * side * across;
          const z = barn.z + Math.cos(yaw) * o - Math.sin(yaw) * side * across;
          if (!f.pointFree(x, z)) continue;
          add(x, z, yaw + side * 0.9, { kind: 'barn', home: { x, z }, to: null, t: 3 + rnd() * 8 });
          break;
        }
      }
    }
    // Along the tracks: two stretches of the village's roads out of the yard and off this garden.
    const spans: { pts: { x: number; z: number }[]; s0: number; s1: number; side: number }[] = [];
    const rect = (x: number, z: number) => Math.abs(x) < f.width / 2 + 6 && Math.abs(z) < f.depth / 2 + 10;
    const roads = f.roads.filter((r) => r.pts.length > 6).sort(() => rnd() - 0.5);
    for (const r of roads) {
      if (spans.length >= 2) break;
      const pts = r.pts;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
      const len = cum[cum.length - 1];
      if (len < 40) continue;
      const side = rnd() < 0.5 ? 1 : -1;
      const s0 = 8 + rnd() * Math.max(1, len - 40);
      const s1 = s0 + 24;
      // The verge along it free, out of the yard, off the garden, out of the water.
      let ok = true;
      for (let s = s0; s <= s1 && ok; s += 3) {
        const p = verge(pts, s, side);
        if (!f.pointFree(p.x, p.z) || f.inWater(p.x, p.z) || rect(p.x, p.z) || Math.hypot(p.x - f.plateau.x, p.z - f.plateau.z) < f.plateau.r + 4) ok = false;
      }
      if (ok) spans.push({ pts, s0, s1, side });
    }
    for (const sp of herd ? [] : spans) {
      const s = sp.s0 + rnd() * (sp.s1 - sp.s0);
      const p = verge(sp.pts, s, sp.side);
      add(p.x, p.z, rnd() * 6.28, { kind: 'road', pts: sp.pts, s, s0: sp.s0, s1: sp.s1, dir: rnd() < 0.5 ? 1 : -1, side: sp.side, t: 2 + rnd() * 6, graze: false });
    }
    // Into the garden: in by its open lower side, to graze in the first gap between the rows.
    if (intruder) {
      const gate = { x: f.entryX, z: f.depth / 2 + 10 };
      let spot = { x: f.entryX, z: f.depth / 2 - 3 };
      for (let k = 0; k < 30; k++) {
        const x = (rnd() - 0.5) * (f.width - 6);
        const z = f.depth / 2 - 2.5 - rnd() * Math.min(8, f.depth / 3);
        if (f.pointFree(x, z) && f.bushes.some((b) => b.kind === 'ocak' && Math.hypot(b.x - x, b.z - z) < 3.5)) {
          spot = { x, z };
          break;
        }
      }
      add(gate.x, gate.z, Math.PI, { kind: 'garden', phase: 'wait', t: intruder.after, spot, gate, to: null });
      this.cows[this.cows.length - 1].cow.root.visible = false;
    }
  }

  /** Where the cows stand in the way now (circles). */
  blocks(): { x: number; z: number; r: number }[] {
    return this.cows.filter((c) => c.cow.root.visible).map((c) => ({ x: c.cow.x, z: c.cow.z, r: COW.radius }));
  }

  /** The garden's cow is in it (not yet sent off). */
  get intruding(): boolean {
    return this.cows.some((c) => c.role.kind === 'garden' && (c.role.phase === 'enter' || c.role.phase === 'graze'));
  }

  /** The evening's cows: how many are home, of how many. */
  herdCount(): { home: number; all: number } {
    const h = this.cows.filter((c) => c.role.kind === 'herd');
    return { home: h.filter((c) => (c.role as { phase: string }).phase !== 'out').length, all: h.length };
  }

  /** The evening's cows still out (where they are). */
  herdOut(): { x: number; z: number }[] {
    return this.cows.filter((c) => c.role.kind === 'herd' && c.role.phase === 'out').map((c) => ({ x: c.cow.x, z: c.cow.z }));
  }

  /** The nearest cow moving (for its bell), metres from (x, z). */
  bellDistance(x: number, z: number): number {
    let best = Infinity;
    for (const c of this.cows) if (c.cow.root.visible && c.cow.speed > 0.1) best = Math.min(best, Math.hypot(c.cow.x - x, c.cow.z - z));
    return best;
  }

  update(dt: number, s: Session, ground: (x: number, z: number) => number, dog: { x: number; z: number } | null): void {
    const f = this.f;
    const ev = this.events;
    ev.moo = null;
    ev.entered = ev.chased = ev.home = false;
    for (const { cow, role } of this.cows) {
      if (role.kind === 'herd') {
        if (role.phase === 'home') continue;
        if (role.phase === 'in') {
          // Through the door and inside: gone from sight.
          const b = this.barnAt!;
          if (cow.step(dt, f, b, PACE.walk, ground, false) < 2.5) {
            role.phase = 'home';
            cow.root.visible = false;
          }
          continue;
        }
        // Driven: away from the worker and the dog, the nearer the faster; else grazing, a step now and then.
        let px = 0;
        let pz = 0;
        let press = 0;
        for (const [who, near] of [
          [s, 7.5],
          [dog, 9],
        ] as const) {
          if (!who) continue;
          const dx = cow.x - who.x;
          const dz = cow.z - who.z;
          const d = Math.hypot(dx, dz);
          if (d > near || d < 0.01) continue;
          const k = 1 - d / near;
          px += (dx / d) * k;
          pz += (dz / d) * k;
          press = Math.max(press, k);
        }
        if (press > 0) {
          role.to = { x: cow.x + px * 4, z: cow.z + pz * 4 };
          role.t = 2 + Math.random() * 3;
        } else {
          role.t -= dt;
          if (role.t <= 0) {
            role.t = 6 + Math.random() * 8;
            const a = Math.random() * Math.PI * 2;
            role.to = Math.random() < 0.5 ? null : { x: cow.x + Math.cos(a) * 2, z: cow.z + Math.sin(a) * 2 };
          }
        }
        // (Near the door it goes straight for it, not round the bales.)
        const nearDoor = !!this.door && Math.hypot(cow.x - this.door.x, cow.z - this.door.z) < 12;
        if (nearDoor && press > 0) role.to = { x: this.door.x, z: this.door.z };
        if (cow.step(dt, f, role.to, press > 0.45 ? PACE.trot : press > 0 ? PACE.walk : PACE.amble, ground, !nearDoor) < 0.3 && !press) role.to = null;
        // At the barn's door: in it goes.
        if (this.door && Math.hypot(cow.x - this.door.x, cow.z - this.door.z) < BARN_DOOR.r) {
          role.phase = 'in';
          ev.home = true;
          ev.moo = { x: cow.x, z: cow.z };
        }
        continue;
      }
      if (role.kind === 'barn') {
        // A step or two now and then, round where it stands.
        role.t -= dt;
        if (role.t <= 0) {
          role.t = 8 + Math.random() * 10;
          const a = Math.random() * Math.PI * 2;
          role.to = { x: role.home.x + Math.cos(a) * 1.5, z: role.home.z + Math.sin(a) * 1.5 };
        }
        if (cow.step(dt, f, role.to, PACE.amble, ground) < 0.3) role.to = null;
      } else if (role.kind === 'road') {
        // Along the verge, now grazing a while, now on a few metres; turned back at the ends.
        role.t -= dt;
        if (role.t <= 0) {
          role.graze = !role.graze;
          role.t = role.graze ? 5 + Math.random() * 10 : 4 + Math.random() * 8;
        }
        if (!role.graze) {
          role.s += role.dir * PACE.amble * dt;
          if (role.s > role.s1 || role.s < role.s0) {
            role.dir *= -1;
            role.s = Math.max(role.s0, Math.min(role.s1, role.s));
          }
        }
        const p = verge(role.pts, role.s, role.side);
        cow.step(dt, f, role.graze ? null : p, PACE.walk, ground, false);
      } else {
        const near = (x: number, z: number, r: number) => Math.hypot(x - cow.x, z - cow.z) < r;
        const scared = near(s.x, s.z, 3.5) || (!!dog && near(dog.x, dog.z, 4.5));
        switch (role.phase) {
          case 'wait':
            // (Not while the worker is still on the way.)
            if (s.vehicleAtField || !s.driving) role.t -= dt;
            if (role.t <= 0) {
              role.phase = 'enter';
              cow.root.visible = true;
              ev.entered = true;
              ev.moo = { x: cow.x, z: cow.z };
            }
            break;
          case 'enter':
          case 'graze': {
            if (scared) {
              role.phase = 'flee';
              role.to = role.gate;
              ev.chased = true;
              ev.moo = { x: cow.x, z: cow.z };
              break;
            }
            const d = cow.step(dt, f, role.phase === 'enter' ? role.spot : null, PACE.walk, ground, false);
            if (role.phase === 'enter' && d < 0.5) role.phase = 'graze';
            break;
          }
          case 'flee': {
            const d = cow.step(dt, f, role.to, PACE.trot, ground, false);
            if (d < 1) {
              if (role.to === role.gate) role.to = { x: role.gate.x + (Math.random() - 0.5) * 8, z: role.gate.z + 15 };
              else {
                role.phase = 'gone';
                cow.root.visible = false;
              }
            }
            break;
          }
          case 'gone':
            break;
        }
      }
    }
    // Now and then one of them moos (one in sight and in earshot).
    this.mooT -= dt;
    if (this.mooT <= 0) {
      this.mooT = 20 + Math.random() * 25;
      const c = this.cows.find((q) => q.cow.root.visible && Math.hypot(q.cow.x - s.x, q.cow.z - s.z) < 45);
      if (c && !ev.moo) ev.moo = { x: c.cow.x, z: c.cow.z };
    }
  }
}

/** A point `out` metres off a track's middle, `s` metres along it (field coordinates). */
function verge(pts: { x: number; z: number }[], s: number, side: number, out = 2.7): { x: number; z: number } {
  let i = 1;
  let acc = 0;
  for (; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (acc + l >= s) break;
    acc += l;
  }
  const a = pts[i - 1];
  const b = pts[i];
  const l = Math.max(1e-6, Math.hypot(b.x - a.x, b.z - a.z));
  const u = Math.max(0, Math.min(1, (s - acc) / l));
  const nx = (b.z - a.z) / l;
  const nz = -(b.x - a.x) / l;
  return { x: a.x + (b.x - a.x) * u + nx * out * side, z: a.z + (b.z - a.z) * u + nz * out * side };
}
