import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PATPAT } from '../game/config';
import { ArmIk } from './armIk';
import { Models, fitted } from './models';
import { HEAD_LIFT, TRIMMER_RIG, backpackPart, cutTriangles, isBakedLine, isEngine, isSecondTank, prepare } from './trimmerRig';

const SKIN = '#d9a27a';
const SHIRT = '#a8322c';
const VEST = '#3f4535';
const TROUSERS = '#3a3d42';
const CAP = '#2d2a26';
const BOOT = '#222222';

/** Hip height where the trimmer's harness hook sits, metres. */
const HIP = 0.92;

function lambert(color: THREE.ColorRepresentation): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

/** The back-pack's shoulder straps, in the pack's frame (bottom 0, against the back at z = 0, he faces +Z). */
function straps(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: '#2b2622' });
  for (const s of [-1, 1]) {
    const p = (x: number, y: number, z: number) => new THREE.Vector3(s * x, y, z);
    const curve = new THREE.CatmullRomCurve3([p(0.08, 0.47, -0.02), p(0.11, 0.57, 0.06), p(0.12, 0.56, 0.17), p(0.12, 0.44, 0.27), p(0.14, 0.24, 0.27), p(0.19, 0.1, 0.17), p(0.15, 0.04, -0.01)]);
    const strap = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.017, 5), mat);
    strap.castShadow = true;
    g.add(strap);
  }
  return g;
}

function part(geo: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, lambert(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** A unit cylinder along +Y (0..1) that can be stretched between two points. */
function stretchable(r0: number, r1: number, color: string): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r1, r0, 1, 6);
  g.translate(0, 0.5, 0);
  const m = new THREE.Mesh(g, lambert(color));
  m.castShadow = true;
  return m;
}

const UP = new THREE.Vector3(0, 1, 0);
/** Throttle at which the clutch engages and the head starts turning. */
const CLUTCH = 0.32;
function stretch(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const d = b.clone().sub(a);
  const len = d.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
  m.scale.set(1, len, 1);
}

/**
 * Keep the hips over the feet: a Mixamo clip exported without "In Place" carries the character
 * forward (and a little sideways) over the cycle. The game moves the worker itself, so the hips'
 * horizontal travel is removed and only the up-down bob is kept.
 */
/**
 * Height of the worker's root above the ground while driving: the Drive clip's hips are 0.56 above
 * its root, and they rest on the pat pat's seat cushion (0.89 m up) — his feet then reach the floor.
 */
const SEAT_HEIGHT = 0.43;

function stripRootMotion(clip: THREE.AnimationClip): void {
  for (const t of clip.tracks) {
    if (!/hips\.position$/i.test(t.name)) continue;
    const v = t.values;
    const x0 = v[0];
    const z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
    }
  }
}

/**
 * The line turning slowly: each strand's tip seen with a short smear behind it (two comet arcs on the
 * tips' circle, fading back from the tip). Turned with the strands.
 */
function lineTrailTexture(): THREE.Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const cx = S / 2;
  for (const start of [0, Math.PI]) {
    for (let k = 0; k < 24; k++) {
      // From the tip (at `start`) back against the turn, fading.
      const a0 = start - (k / 24) * 1.4;
      g.strokeStyle = `rgba(255, 215, 90, ${0.9 * (1 - k / 24) ** 1.3})`;
      g.lineWidth = 10 - k * 0.3;
      g.beginPath();
      g.arc(cx, cx, S * 0.42, a0 - 0.07, a0);
      g.stroke();
      g.strokeStyle = `rgba(255, 220, 120, ${0.35 * (1 - k / 24)})`;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(cx, cx, S * 0.3, a0 - 0.07, a0);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Motion blur of spinning line at speed: a bright ring where the tips travel, streaked, faint inside. */
function lineBlurTexture(): THREE.Texture {
  // A spinning nylon line is almost invisible: a faint ring where the tips travel, a hint of the
  // line colour, and nearly nothing towards the hub.
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const cx = S / 2;
  const fill = g.createRadialGradient(cx, cx, S * 0.06, cx, cx, S * 0.5);
  fill.addColorStop(0, 'rgba(255, 220, 160, 0)');
  fill.addColorStop(0.6, 'rgba(255, 220, 160, 0)');
  fill.addColorStop(0.82, 'rgba(255, 210, 120, 0.06)');
  fill.addColorStop(0.92, 'rgba(255, 200, 90, 0.5)');
  fill.addColorStop(0.97, 'rgba(255, 235, 170, 0.85)');
  fill.addColorStop(1, 'rgba(255, 190, 90, 0)');
  g.fillStyle = fill;
  g.beginPath();
  g.arc(cx, cx, S * 0.5, 0, Math.PI * 2);
  g.fill();
  // Streaks round the circle (the two strands smeared): lighter arcs near the rim.
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.strokeStyle = `rgba(255, 230, 150, ${0.25 + (i % 2) * 0.2})`;
    g.lineWidth = 2.2;
    g.beginPath();
    g.arc(cx, cx, S * (0.42 + (i % 3) * 0.025), a, a + 0.9);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The brush cutter: motor at the back, long shaft, bike handlebar, gearbox, guard and spinning line. */
class TrimmerView {
  /** Positioned at the harness hook, +Z points along the shaft to the head. */
  readonly body = new THREE.Group();
  /** Placed at the cutting head, kept level. */
  readonly head = new THREE.Group();
  /** Grip points on the -X / +X side of the trimmer frame (+Z = towards the head, so -X is the worker's right). */
  readonly gripNegX = new THREE.Object3D();
  readonly gripPosX = new THREE.Object3D();
  /** Exhaust outlet on the motor (smoke comes out here). */
  readonly exhaust = new THREE.Object3D();
  private readonly shaft: THREE.Mesh;
  private readonly lines = new THREE.Group();
  private readonly blur: THREE.Mesh;
  /** The strands' smears while turning slowly. */
  private readonly trail: THREE.Mesh;
  private time = 0;
  private readonly custom: boolean;
  /** Handlebar mount; counter-tilted so the grips stay upright when the shaft slopes down. */
  private readonly barMount = new THREE.Group();
  private spinAngle = 0;
  /** The procedural motor parts (no artist body). */
  private readonly motor: THREE.Mesh[] = [];
  /** The artist body's engine and tank (a child of the model). */
  private engineModel: THREE.Object3D | null = null;
  /** Carried on the back instead (sırt motoru): never drawn on the shaft. */
  private engineDropped = false;

  constructor(model?: GLTF, barModel?: GLTF) {
    this.custom = !!model;
    if (model) this.buildCustom(model, barModel);
    else this.exhaust.position.set(0.11, 0.0, -0.52);
    this.body.add(this.exhaust);
    this.shaft = stretchable(0.018, 0.016, '#9aa0a6');
    this.shaft.rotation.x = Math.PI / 2;
    if (!model) {
      this.body.add(this.shaft);
      // Motor and tank behind the hook.
      this.motor.push(
        part(new THREE.BoxGeometry(0.2, 0.2, 0.26), '#e2661b', this.body, 0, 0.02, -0.42),
        part(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 8).rotateZ(Math.PI / 2), '#f2f2f2', this.body, 0, -0.08, -0.4),
        part(new THREE.BoxGeometry(0.16, 0.12, 0.08), '#2b2b2b', this.body, 0, 0.06, -0.58),
      );
      // Handlebar
      const bar = new THREE.Group();
      bar.position.set(0, 0.03, 0.38);
      this.body.add(bar);
      part(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 6).rotateZ(Math.PI / 2), '#333333', bar, 0, 0.1, 0);
      part(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), '#333333', bar, 0, 0.05, 0);
      for (const s of [-1, 1]) part(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6).rotateZ(Math.PI / 2), '#e2661b', bar, s * 0.29, 0.1, 0);
      bar.add(this.gripNegX, this.gripPosX);
      this.gripNegX.position.set(-0.29, 0.1, 0);
      this.gripPosX.position.set(0.29, 0.1, 0);
      // Head: gearbox, guard, spool
      part(new THREE.CylinderGeometry(0.035, 0.04, 0.07, 8), '#555555', this.head, 0, 0.09, 0);
      const guard = part(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12, 1, true, -Math.PI * 0.55, Math.PI * 1.1), '#e2661b', this.head, 0, 0.09, -0.02);
      guard.rotation.y = Math.PI;
      part(new THREE.CylinderGeometry(0.055, 0.05, 0.05, 10), '#e2661b', this.head, 0, 0.04, 0);
    }
    // Two strands of nylon line (seen when idling) ...
    const lineMat = new THREE.MeshStandardMaterial({ color: '#ffb21a', emissive: '#5a2a00', roughness: 0.35, metalness: 0 });
    // Out of the spool along +X to 1 (scaled to the line's length): sagging and kinked a little at its end.
    const strand = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.35, -0.012, 0.02), new THREE.Vector3(0.7, -0.035, 0.035), new THREE.Vector3(0.88, -0.05, 0.02), new THREE.Vector3(1, -0.075, 0.05)]);
    const strandGeo = new THREE.TubeGeometry(strand, 12, 0.0065, 5, false);
    for (let i = 0; i < 2; i++) {
      const l = new THREE.Mesh(strandGeo, lineMat);
      l.rotation.y = i * Math.PI;
      this.lines.add(l);
    }
    this.lines.position.y = 0.03;
    this.head.add(this.lines);
    // ... and their motion blur when spinning: a faint disc with streaks, brightest at the line tips.
    this.blur = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: lineBlurTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.blur.position.y = 0.03;
    this.head.add(this.blur);
    this.trail = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: lineTrailTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.trail.position.y = 0.02;
    this.head.add(this.trail);
  }

  /**
   * Assemble the artist's body (engine + shaft + head) and handlebar (see TRIMMER_RIG for the
   * attachment points). In first person the handlebar is drawn by FpvRig instead.
   */
  private buildCustom(model: GLTF, barModel?: GLTF): void {
    const R = TRIMMER_RIG;
    const v = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);
    // Body: shaft along +X in the model -> +Z here (rotate -90° about Y), hook point at the origin.
    const hook = v(R.body.hook);
    const s = R.hookToHead / hook.distanceTo(v(R.body.head));
    const whole = cutTriangles(cutTriangles(prepare(model.scene), isBakedLine, true), isSecondTank);
    // The engine and tank (behind the hook) apart from the rest: first person leaves them out.
    const engine = cutTriangles(whole.clone(true), (c) => !isEngine(c));
    const body = cutTriangles(whole, isEngine);
    body.add(engine);
    this.engineModel = engine;
    body.rotation.y = -Math.PI / 2;
    body.scale.setScalar(s);
    const toFrame = (p: THREE.Vector3) => new THREE.Vector3(-p.z, p.y, p.x).sub(new THREE.Vector3(-hook.z, hook.y, hook.x)).multiplyScalar(s);
    body.position.copy(toFrame(new THREE.Vector3()));
    this.body.add(body);
    this.exhaust.position.copy(toFrame(v(R.body.exhaust)));

    // Handlebar: clamped on the shaft, throttle grip on the worker's right (-X here, facing +Z).
    this.barMount.position.set(0, 0, R.barAlong);
    this.body.add(this.barMount);
    if (!barModel) {
      this.barMount.add(this.gripNegX, this.gripPosX);
      this.gripNegX.position.set(-0.29, 0.25, 0);
      this.gripPosX.position.set(0.29, 0.25, 0);
      return;
    }
    const bar = prepare(barModel.scene);
    const bs = R.gripSpan / v(R.bar.gripL).distanceTo(v(R.bar.gripR));
    bar.rotation.y = Math.PI;
    bar.scale.set(bs, bs * TRIMMER_RIG.barRise, bs);
    const hole = v(R.bar.hole);
    bar.position.set(hole.x, -hole.y, hole.z).multiplyScalar(bs);
    this.barMount.add(bar);
    // Grip points as children of the model, so they follow its transform. The model's +X (throttle)
    // grip ends up on the frame's -X side after the 180° turn.
    bar.add(this.gripNegX, this.gripPosX);
    this.gripNegX.position.copy(v(R.bar.gripR));
    this.gripPosX.position.copy(v(R.bar.gripL));

  }

  /** The engine is on his back (sırt motoru): the shaft starts at the hook, nothing behind it. */
  dropEngine(): void {
    this.engineDropped = true;
    this.engineVisible = false;
  }

  /**
   * The engine on the shaft shown or not: first person leaves it out (it is at the hip, out of sight
   * looking down at the head; drawn, it swung into the middle of the view turning and on banks).
   */
  set engineVisible(v: boolean) {
    const on = v && !this.engineDropped;
    if (this.engineModel) this.engineModel.visible = on;
    for (const m of this.motor) m.visible = on;
  }

  get hasHandlebar(): boolean {
    return this.custom && this.barMount.children.length > 0;
  }

  /** Third-person handlebar on/off (first person draws its own). */
  set barVisible(v: boolean) {
    this.barMount.visible = v;
  }

  setLength(len: number): void {
    if (!this.custom) this.shaft.scale.set(1, len - 0.05, 1);
  }

  /** Keep the handlebar roughly upright whatever the shaft angle (pitch = shaft angle below horizontal). */
  setPitch(pitch: number): void {
    // Leaning the U back towards the worker brings the grips within arm's reach.
    this.barMount.rotation.x = -pitch - 0.35;
  }

  /** Head speed 0..1: the centrifugal clutch only engages above idle, so the head stops at idle. */
  private headSpeed = 0;

  update(dt: number, spin: number, radius: number, yaw: number): void {
    const want = Math.max(0, (spin - CLUTCH) / (1 - CLUTCH));
    this.headSpeed += (want - this.headSpeed) * Math.min(1, dt * (want > this.headSpeed ? 6 : 1.8));
    const w = this.headSpeed;
    this.time += dt;
    this.spinAngle += dt * w * 160;
    this.lines.rotation.y = this.spinAngle;
    this.lines.scale.set(radius, 1, 1);
    // Standing and turning slowly the strands are seen (smeared behind as they turn); faster, only the
    // ring the tips draw, bright at its rim and flickering.
    this.lines.visible = w < 0.35 && radius > 0;
    this.trail.visible = w > 0.03 && w < 0.6 && radius > 0;
    this.trail.rotation.y = this.spinAngle;
    this.trail.scale.setScalar(Math.max(0.01, radius));
    (this.trail.material as THREE.MeshBasicMaterial).opacity = Math.min(1, w * 10) * Math.min(1, (0.6 - w) * 4);
    this.blur.visible = w > 0.25 && radius > 0;
    this.blur.scale.setScalar(Math.max(0.01, radius));
    this.blur.rotation.y = this.spinAngle * 0.37;
    (this.blur.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (w - 0.25) * 2.5) * (0.85 + 0.15 * Math.sin(this.time * 47));
    this.head.rotation.y = yaw;
  }
}

/** The worker (procedural or the artist's model) plus the trimmer, posed from the simulation each frame. */
export class WorkerView {
  readonly root = new THREE.Group();
  /** World-space parts posed directly in world coordinates (trimmer, arms). Add to the scene too. */
  readonly extras = new THREE.Group();
  readonly trimmer: TrimmerView;
  /** Seen through the worker's eyes: only the forearms are drawn, the upper arms would fill the screen. */
  firstPerson = false;
  /** First person with the artist gloves: FpvRig draws hands and handlebar, the stand-in arms are hidden. */
  ownHands = false;
  private readonly body = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly arms: THREE.Mesh[] = [];
  private readonly shoulders: THREE.Object3D[] = [];
  private readonly hook = new THREE.Object3D();
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private driveAction: THREE.AnimationAction | null = null;
  /** Sitting on the pat pat (the Drive clip), raised to the seat. */
  driving = false;
  /** Driving: his head turned into the bend (radians, + = to his left). */
  headTurn = 0;
  /** Driving: the steering wheel grips for the hands, [right, left] in world space. */
  wheelGrips: [THREE.Vector3, THREE.Vector3] | null = null;
  /** The pat pat's chassis (its origin on the ground under the trailer's centre) while he drives. */
  seat: THREE.Object3D | null = null;
  /** Where the seat is on it: ahead of the vehicle's position, and its cushion's height over the pat pat's. */
  seatPlace = { z: PATPAT.seat, lift: 0 };
  private idleAction: THREE.AnimationAction | null = null;
  private walkPhase = 0;
  private twist = 0;
  private readonly v = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();

  /** False on the menu: no trimmer in his hands (it is in the trailer), arms as the animation has them. */
  carrying = true;

  constructor(models: Models) {
    this.trimmer = new TrimmerView(models.trimmer?.[0], models.handlebar?.[0]);
    this.extras.add(this.trimmer.body, this.trimmer.head);
    this.root.add(this.body);
    const custom = models.worker?.[0];
    if (custom) this.buildCustom(custom);
    else this.buildProcedural();
    this.torso.add(this.hook);
    // Harness hook on the right hip (the worker faces +Z, so right is -X), a little in front.
    this.hook.position.set(-0.14, 0.8 - this.torso.position.y, 0.16);
  }

  /** The back-pack engine, shown only while he carries the trimmer (otherwise it is in the trailer). */
  private pack: THREE.Object3D | null = null;

  /**
   * Sırt motoru: the engine pack strapped on his back (artist model or a simple orange box with a frame);
   * the trimmer loses its own engine and the smoke comes from the pack.
   */
  wearBackpack(model?: GLTF): void {
    let pack: THREE.Object3D;
    if (model) pack = backpackPart(model, 0.55);
    else {
      const mat = (c: string) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
      pack = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.55, 0.05), mat('#2a2a2a'));
      frame.position.set(0, 0.28, 0.03);
      const engine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.24), mat('#e46a1c'));
      engine.position.set(0, 0.17, -0.12);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.26, 8), mat('#f0e6d2'));
      tank.rotation.z = Math.PI / 2;
      tank.position.set(0, 0.38, -0.1);
      pack.add(frame, engine, tank);
      pack.traverse((o) => (o.castShadow = true));
    }
    this.trimmer.dropEngine();
    pack.add(this.trimmer.exhaust);
    this.trimmer.exhaust.position.set(0.12, 0.2, -0.22);
    // The pack hangs from the top of its frame and swings a little as he walks and turns.
    const swing = new THREE.Group();
    swing.position.y = 0.5;
    pack.position.y = -0.5;
    swing.add(pack);
    this.packSwing = swing;
    // The drive hose leaves the bottom of the pack on his right (-X) and runs to the shaft at the hook.
    this.hoseFrom.position.set(-0.13, 0.1, -0.06);
    pack.add(this.hoseFrom);
    this.hose = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: '#1e1e1e' }));
    this.hose.frustumCulled = false;
    this.extras.add(this.hose);
    // The shoulder straps: from the top of the frame over each shoulder, down his chest, back under
    // the arm to the bottom of the frame (they stay put while the pack swings).
    const worn = new THREE.Group();
    worn.add(swing, straps());
    pack = worn;
    this.pack = pack;
    const bone = this.spineTop;
    if (bone) {
      // Placed on his back as he stands (bottom at the belt, against the back), then handed to the upper
      // spine bone keeping that place, so it bends and turns with him.
      this.body.add(pack);
      pack.position.set(-0.05, 0.95, -0.13);
      this.root.updateMatrixWorld(true);
      bone.attach(pack);
      return;
    }
    // The worker faces +Z: his back is -Z.
    pack.position.set(0, 1.0 - this.torso.position.y, -0.2);
    this.torso.add(pack);
  }

  private packSwing: THREE.Object3D | null = null;
  private hose: THREE.Mesh | null = null;
  private readonly hoseFrom = new THREE.Object3D();
  /** The pack's swing: sideways roll and its rate, and his heading a frame ago. */
  private sway = { roll: 0, rate: 0, yaw: NaN };

  private get spineTop(): THREE.Object3D | null {
    return this.spine[this.spine.length - 1] ?? null;
  }

  /** Ear muffs on his head (artist worker only: they follow the head bone). */
  wearEarmuffs(model?: GLTF): void {
    const bone = this.headBone;
    if (!bone || !model) return;
    const muffs = fitted(model.scene, 0.2);
    // The bone carries the rig's scale; undo it so the muffs keep their real size.
    bone.updateWorldMatrix(true, false);
    const s = new THREE.Vector3().setFromMatrixScale(bone.matrixWorld);
    const holder = new THREE.Group();
    holder.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
    // Mixamo head bone: +Y up the head, +Z forward. Centre the band over the ears.
    muffs.position.set(0, 0, -0.01);
    holder.add(muffs);
    holder.position.set(0, 0.02 / s.y, 0);
    bone.add(holder);
  }

  /** Artist worker (Mixamo rig): skinned model, idle/walk clips, arms solved onto the handlebar grips. */
  private buildCustom(gltf: GLTF): void {
    // Skinned meshes must be cloned with their skeleton.
    const model = SkeletonUtils.clone(gltf.scene);
    const bones: Record<string, THREE.Object3D> = {};
    model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
      if ((o as THREE.Bone).isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
    });
    const holder = new THREE.Group();
    holder.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const k = 1.75 / Math.max(1e-6, box.max.y - box.min.y);
    model.scale.multiplyScalar(k);
    model.position.y = -box.min.y * k;
    this.body.add(holder);
    this.body.add(this.torso);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of gltf.animations) stripRootMotion(c);
    const clip = (re: RegExp) => gltf.animations.find((a) => re.test(a.name));
    const walk = clip(/walk|yuru/i);
    const idle = clip(/idle|bekle|stand/i);
    if (walk) this.walkAction = this.mixer.clipAction(walk).play();
    if (idle) this.idleAction = this.mixer.clipAction(idle).play();
    const drive = clip(/drive|sur/i);
    if (drive) this.driveAction = this.mixer.clipAction(drive).play().setEffectiveWeight(0);
    this.spine = ['Spine', 'Spine1', 'Spine2'].map((n) => bones[n]).filter(Boolean);
    this.headBone = bones.Head ?? null;
    const arm = (side: 'Left' | 'Right') =>
      bones[`${side}Arm`] && bones[`${side}ForeArm`] && bones[`${side}Hand`] ? new ArmIk(bones[`${side}Arm`], bones[`${side}ForeArm`], bones[`${side}Hand`]) : null;
    // The worker faces +Z, so his right hand is on the -X side: index 0 = right = gripNegX.
    this.ik = [arm('Right'), arm('Left')];
  }

  private spine: THREE.Object3D[] = [];
  /** The artist worker's head bone (for the ear muffs). */
  private headBone: THREE.Object3D | null = null;
  private ik: (ArmIk | null)[] = [];
  private readonly pole = new THREE.Vector3();
  private readonly qTwist = new THREE.Quaternion();

  private buildProcedural(): void {
    // Legs pivot at the hips.
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.11, HIP, 0);
      part(new THREE.CylinderGeometry(0.075, 0.06, HIP - 0.08, 6).translate(0, -(HIP - 0.08) / 2, 0), TROUSERS, leg);
      part(new THREE.BoxGeometry(0.13, 0.1, 0.26).translate(0, -HIP + 0.05, 0.04), BOOT, leg);
      this.body.add(leg);
      this.legs.push(leg);
    }
    this.torso.position.y = HIP;
    this.body.add(this.torso);
    part(new THREE.CylinderGeometry(0.16, 0.19, 0.18, 8), TROUSERS, this.torso, 0, 0.02, 0);
    part(new THREE.CylinderGeometry(0.21, 0.16, 0.55, 8), SHIRT, this.torso, 0, 0.36, 0);
    part(new THREE.CylinderGeometry(0.215, 0.195, 0.42, 8, 1, true), VEST, this.torso, 0, 0.4, 0);
    const head = new THREE.Group();
    head.position.y = 0.78;
    this.torso.add(head);
    part(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 6), SKIN, head, 0, -0.08, 0);
    part(new THREE.SphereGeometry(0.12, 10, 8), SKIN, head, 0, 0.04, 0);
    part(new THREE.SphereGeometry(0.03, 6, 4), SKIN, head, 0, 0.03, 0.12);
    // Short beard and a cap
    part(new THREE.SphereGeometry(0.105, 10, 6, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), '#2b211b', head, 0, 0.035, 0.012);
    part(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), CAP, head, 0, 0.06, 0);
    part(new THREE.BoxGeometry(0.17, 0.015, 0.12).translate(0, 0, 0.06), CAP, head, 0, 0.075, 0.09);
    // Arms: shoulder anchors, the meshes are stretched to the handlebar grips every frame.
    for (const s of [-1, 1]) {
      const sh = new THREE.Object3D();
      sh.position.set(s * 0.23, 0.6, 0.02);
      this.torso.add(sh);
      this.shoulders.push(sh);
      const arm = stretchable(0.055, 0.045, SHIRT);
      this.extras.add(arm);
      this.arms.push(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), lambert(SKIN));
      arm.add(hand);
      hand.position.y = 1;
      hand.scale.set(1, 0.06, 1);
    }
  }

  /**
   * Pose for this frame. `headX/Z` is the simulated trimmer head, `groundAt` gives terrain height.
   * All in world space; root is placed at the player.
   */
  update(
    dt: number,
    s: { x: number; z: number; yaw: number; speed: number; headX: number; headZ: number; throttle: number; cutRadius: number; lift?: number },
    groundAt: (x: number, z: number) => number,
  ): void {
    if (this.driving && this.seat) {
      // On the seat: placed and tilted with the pat pat's chassis (on a side slope he leans with it).
      this.seat.updateMatrixWorld();
      this.root.position.set(0, SEAT_HEIGHT + this.seatPlace.lift, this.seatPlace.z).applyMatrix4(this.seat.matrixWorld);
      this.root.quaternion.setFromRotationMatrix(this.seat.matrixWorld);
    } else {
      const y = groundAt(s.x, s.z) + (this.driving ? SEAT_HEIGHT : 0);
      this.root.position.set(s.x, y, s.z);
      this.root.rotation.set(0, s.yaw, 0);
    }
    this.root.updateMatrixWorld();

    // Twist the upper body towards the trimmer head.
    const local = this.v.set(s.headX, 0, s.headZ).sub(this.root.position.clone().setY(0));
    local.applyAxisAngle(UP, -s.yaw);
    const ang = Math.atan2(local.x, local.z);
    this.twist += ((this.carrying ? ang * 0.8 : 0) - this.twist) * Math.min(1, dt * 18);
    this.torso.rotation.y = this.twist;
    this.torso.rotation.x = 0.12 + s.throttle * 0.05;

    // Walk cycle from distance travelled.
    const moving = this.driving ? 0 : Math.min(1, s.speed / 1.5);
    this.walkPhase += s.speed * dt * 4.2;
    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(this.walkPhase + i * Math.PI) * 0.55 * moving;
    });
    this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.03 * moving;
    if (this.mixer) {
      const sit = this.driving && this.driveAction ? 1 : 0;
      this.driveAction?.setEffectiveWeight(sit);
      this.walkAction?.setEffectiveWeight(moving * (1 - sit));
      this.idleAction?.setEffectiveWeight((1 - moving) * (1 - sit));
      // Mixamo's walk covers about 1.4 m per cycle second.
      if (this.walkAction) this.walkAction.timeScale = Math.max(0.4, s.speed / 1.4);
      this.mixer.update(dt);
      // Upper-body twist towards the trimmer head, spread over the spine bones (their Y runs up the spine).
      for (const b of this.spine) b.quaternion.multiply(this.qTwist.setFromAxisAngle(UP, this.twist / this.spine.length));
      // Driving, he looks into the bend (the head bone's Y runs up the neck).
      if (this.headBone && this.headTurn) this.headBone.quaternion.multiply(this.qTwist.setFromAxisAngle(UP, this.headTurn));
    }
    this.root.updateMatrixWorld(true);

    // Trimmer: from the harness hook to the head on the ground.
    const hook = this.hook.getWorldPosition(this.v);
    // On ground well above his feet (a bank in front while he stands in a dip) the head would come up
    // to his face (in first person, a big guard in front of the eyes): it stays below the hip, the
    // line skimming over the top.
    const headY = Math.min(groundAt(s.headX, s.headZ) + 0.05, hook.y - 0.45) + (s.lift ?? 0) * HEAD_LIFT;
    const target = this.v2.set(s.headX, headY, s.headZ);
    const t = this.trimmer;
    t.body.position.copy(hook);
    t.body.lookAt(target);
    t.setLength(hook.distanceTo(target));
    t.setPitch(Math.asin(Math.max(-1, Math.min(1, (hook.y - target.y) / Math.max(0.01, hook.distanceTo(target))))));
    t.barVisible = !this.ownHands;
    t.head.position.copy(target);
    t.update(dt, s.throttle, s.cutRadius, s.yaw + this.twist);
    t.body.updateMatrixWorld(true);

    // Artist model: hands on the grips by IK, elbows down, a little out and back.
    t.body.visible = t.head.visible = this.carrying;
    if (this.pack) this.pack.visible = this.carrying;
    if (this.hose) {
      this.hose.visible = this.carrying;
      if (this.carrying) {
        // Sagging a little between the pack and the hook.
        const a = this.hoseFrom.getWorldPosition(new THREE.Vector3());
        const b = this.hook.getWorldPosition(new THREE.Vector3());
        const mid = a.clone().lerp(b, 0.5);
        mid.y = Math.min(a.y, b.y) - 0.12;
        this.hose.geometry.dispose();
        this.hose.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 14, 0.013, 5);
      }
    }
    if (this.packSwing && dt > 0) {
      // Turning throws it outwards, each step rocks it; a damped spring brings it back.
      const sw = this.sway;
      const turn = Number.isNaN(sw.yaw) ? 0 : Math.atan2(Math.sin(s.yaw - sw.yaw), Math.cos(s.yaw - sw.yaw)) / dt;
      sw.yaw = s.yaw;
      const want = THREE.MathUtils.clamp(-turn * 0.06, -0.25, 0.25) + Math.sin(this.walkPhase) * 0.05 * moving;
      sw.rate += ((want - sw.roll) * 60 - sw.rate * 7) * dt;
      sw.roll += sw.rate * dt;
      this.packSwing.rotation.z = sw.roll;
      this.packSwing.rotation.x = Math.abs(Math.sin(this.walkPhase)) * 0.04 * moving;
    }
    if (this.ik.length && this.carrying) {
      const right = this.v.set(-1, 0, 0).applyQuaternion(this.root.quaternion);
      this.ik.forEach((ik, i) => {
        if (!ik) return;
        const side = i === 0 ? 1 : -1;
        this.pole.set(0, -1, 0).addScaledVector(right, side * 0.6);
        const grip = (i === 0 ? t.gripNegX : t.gripPosX).getWorldPosition(new THREE.Vector3());
        ik.solve(grip, this.pole);
      });
    } else if (this.ik.length && this.driving && this.wheelGrips) {
      // Hands on the steering wheel, elbows down and out.
      const right = this.v.set(-1, 0, 0).applyQuaternion(this.root.quaternion);
      this.ik.forEach((ik, i) => {
        if (!ik) return;
        this.pole.set(0, -1, 0).addScaledVector(right, (i === 0 ? 1 : -1) * 0.8);
        ik.solve(this.wheelGrips![i], this.pole);
      });
    }
    // Stand-in arms reach for the grips.
    this.arms.forEach((arm, i) => {
      arm.visible = !this.ownHands;
      const sh = this.shoulders[i].getWorldPosition(new THREE.Vector3());
      const grip = (i === 0 ? t.gripNegX : t.gripPosX).getWorldPosition(new THREE.Vector3());
      if (this.firstPerson) sh.lerp(grip, 0.5);
      stretch(arm, sh, grip);
      if (this.firstPerson) arm.scale.x = arm.scale.z = 0.6;
    });
  }
}
