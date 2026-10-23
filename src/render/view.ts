import * as THREE from 'three';
import { Session } from '../game/session';
import { GrassView } from './grass';
import { Models } from './models';
import { FpvRig } from './fpvRig';
import { Particles } from './particles';
import { HEAD_LIFT, TRIMMER_RIG } from './trimmerRig';
import { SLOPE, TRIMMER } from '../game/config';
import { SKY_HORIZON, WorldView, worldHeight } from './world';
import { WorkerView } from './worker';
import { CrittersView } from './critters';
import { Rain, WEATHER } from './weather';
import { MARK_LENGTH, TrackView } from './tracks';

export type Quality = 'low' | 'medium' | 'high';

/** The first-person hands are placed as seen with this downward look (radians). */
const FPV_HANDS_PITCH = -0.55;
/** The hands rise with the look no higher than this. */
const FPV_HANDS_MAX_PITCH = -0.35;

const QUALITY: Record<Quality, { ratio: number; shadows: boolean; shadowSize: number; blades: number; density: number; wild: number; trees: number; shoots: number }> = {
  low: { ratio: 1, shadows: false, shadowSize: 512, blades: 5, density: 0.8, wild: 0, trees: 8, shoots: 8 },
  medium: { ratio: 1.5, shadows: false, shadowSize: 1024, blades: 4, density: 1, wild: 2.4, trees: 14, shoots: 11 },
  high: { ratio: 2, shadows: false, shadowSize: 2048, blades: 6, density: 1.3, wild: 2.4, trees: 22, shoots: 13 },
};

const TEXTURE_SLOTS = ['map', 'normalMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap'] as const;

/** Dispose the geometries, materials and material textures under an object. */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.geometry) return;
    m.geometry.dispose();
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (!mat) continue;
      const rec = mat as unknown as Record<string, unknown>;
      for (const k of TEXTURE_SLOTS) (rec[k] as THREE.Texture | undefined)?.dispose?.();
      mat.dispose();
    }
  });
}

/** Owns the renderer and the scene of the current field. */
/** A red round sign with a white "!" (shared by every stone marked). */
let warnTex: THREE.CanvasTexture | null = null;
function warnTexture(): THREE.CanvasTexture {
  if (warnTex) return warnTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8321e';
  g.strokeStyle = '#fff';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 64, 68);
  warnTex = new THREE.CanvasTexture(c);
  warnTex.colorSpace = THREE.SRGBColorSpace;
  return warnTex;
}

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  quality: Quality;
  private world: WorldView | null = null;
  private grass: GrassView | null = null;
  private worker: WorkerView | null = null;
  critters: CrittersView | null = null;
  private tracks: TrackView | null = null;
  /** Distance the pat pat has rolled since the last tyre mark. */
  private trackAcc = 0;
  /** The scene is the menu background (the worker stands empty-handed). */
  private menu = false;
  private rain: Rain | null = null;
  private sprayAcc = 0;
  /** First-person gloves + handlebar (only with the artist models). */
  private fpvRig: FpvRig | null = null;
  /**
   * Frame the view model hangs from: at the eyes, turning with the worker but not with the look pitch
   * (looking up or down moves the eyes, not the hands).
   */
  private readonly fpvBody = new THREE.Group();
  private particles = new Particles();
  private session: Session | null = null;
  private readonly camTarget = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private time = 0;
  /** Camera mode: 'fpv' (eyes of the worker) or 'follow' while playing, 'orbit' behind menus. */
  mode: 'fpv' | 'follow' | 'orbit' = 'orbit';
  /** First-person look pitch, radians (negative = down). */
  pitch = -0.55;
  private bob = 0;
  /** Follow camera distance multiplier (pinch / settings zoom). */
  zoom = 1;
  /** Follow camera: turn round the worker (0 = looking uphill, towards -z) and height (0 low .. 1 high). */
  orbitYaw = 0;
  orbitHeight = 0.6;
  /** Driving: how far the player has turned the chase camera round the pat pat, radians. */
  driveOrbit = 0;
  /**
   * The driver's head turned into the bend (radians from straight along the trailer): he looks the way
   * the pat pat's head is going, a little ahead of it while steering.
   */
  private headTurn = 0;
  private shake = 0;
  private smokeAcc = 0;
  private lastThrottle = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    // PCF with a filter radius: soft shadow edges (PCFSoft ignores the radius).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene.fog = new THREE.Fog(SKY_HORIZON.clone(), 40, 260);
    this.scene.background = SKY_HORIZON.clone();
    this.scene.add(this.particles.points);
    this.scene.add(this.fpvBody);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].ratio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones need a wider view to see enough of the field around the worker.
    this.camera.fov = this.mode === 'fpv' ? (w < h ? 90 : 66) : w < h ? 62 : 50;
    this.camera.updateProjectionMatrix();
    this.particles.setViewport(h * this.renderer.getPixelRatio());
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.resize();
  }

  /** Build the scene for a session (also used for the menu background). */
  /** `menu`: the worker stands empty-handed, the trimmer leans in the pat pat's trailer. */
  load(session: Session, models: Models, menu = false): void {
    this.unload();
    this.session = session;
    const q = QUALITY[this.quality];
    this.grass = new GrassView(session.field, q.blades, q.density, q.wild, (x, z) => worldHeight(session.field, x, z), this.quality === 'low');
    // The trimmer lies in the trailer on the menu, and at the start of the first job until he takes it.
    WorldView.backpack = session.gear.backpack;
    this.world = new WorldView(session.field, this.grass.texture, models, q.shadows, q.shadowSize, q.trees, menu || !session.hasTrimmer, q.shoots);
    this.renderer.shadowMap.enabled = q.shadows;
    this.menu = menu;
    this.worker = new WorkerView(models);
    this.worker.carrying = !menu && session.hasTrimmer;
    this.tracks = new TrackView();
    this.scene.add(this.tracks.mesh);
    if (session.gear.backpack && !menu) this.worker.wearBackpack(models.backpack?.[0]);
    if (session.gear.earmuffs && !menu) this.worker.wearEarmuffs(models.earmuffs?.[0]);
    this.critters = new CrittersView(session.field, models, (x, z) => worldHeight(session.field, x, z));
    this.scene.add(this.world.group, this.grass.group, this.worker.root, this.worker.extras, this.critters.group);
    // Weather: haze, fog distance and exposure; rain streaks round the camera.
    const look = WEATHER[session.field.level.weather];
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(look.haze);
    fog.near = look.fogNear;
    fog.far = look.fogFar;
    (this.scene.background as THREE.Color).set(look.haze);
    this.renderer.toneMappingExposure = look.exposure;
    if (session.field.level.weather === 'rain' && !menu) {
      this.rain = new Rain();
      this.scene.add(this.rain.lines);
    }
    if (models.hands?.[0] && models.handlebar?.[0] && models.trimmer?.[0]) {
      this.fpvRig = new FpvRig(models.hands[0], models.handlebar[0]);
      this.fpvBody.add(this.fpvRig.root);
    }
    this.snapCamera();
  }

  unload(): void {
    this.stoneMarks.clear();
    // Free the GPU side of everything built for the level (models shared between levels are simply
    // uploaded again the next time they are drawn).
    for (const o of [this.world?.group, this.critters?.group, this.worker?.root, this.worker?.extras, this.fpvRig?.root]) if (o) disposeTree(o);
    if (this.world) this.scene.remove(this.world.group);
    if (this.grass) {
      this.scene.remove(this.grass.group);
      this.grass.dispose();
    }
    if (this.worker) this.scene.remove(this.worker.root, this.worker.extras);
    if (this.critters) this.scene.remove(this.critters.group);
    if (this.rain) {
      this.scene.remove(this.rain.lines);
      this.rain.lines.geometry.dispose();
    }
    if (this.tracks) {
      this.scene.remove(this.tracks.mesh);
      this.tracks.dispose();
    }
    this.critters = null;
    this.rain = null;
    this.tracks = null;
    if (this.fpvRig) this.fpvBody.remove(this.fpvRig.root);
    this.world = this.grass = this.worker = this.fpvRig = null;
    this.session = null;
  }

  snapCamera(): void {
    this.updateCamera(1, true);
  }

  /** Visual reaction to a hit. */
  kick(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  emit(x: number, z: number, n: number, kind: 'grass' | 'spark' | 'leaf' | 'dust' | 'water' | 'feather', up?: number): void {
    const s = this.session;
    if (!s) return;
    const y = worldHeight(s.field, x, z) + (up ?? (kind === 'leaf' ? 1.8 : kind === 'feather' ? 0.3 : 0.08));
    // Clippings are thrown out to the side the line is moving towards.
    const dx = x - s.x;
    const dz = z - s.z;
    const l = Math.hypot(dx, dz) || 1;
    this.particles.emit(x, y, z, n, kind, (dx / l) * 0.4, (dz / l) * 0.4);
  }

  /** A field bought open: off with its padlock. */
  unlockField(id: number, name: string): void {
    this.world?.unlockField(id, name);
  }

  /** A new paint on the pat pat in the scene (bought or picked in the yard's shop). */
  repaintPatpat(hue: number | null): void {
    this.world?.repaintPatpat(hue);
  }

  /** Stones already hit: a red "!" stands over each for the rest of the job. */
  private readonly stoneMarks = new Set<string>();

  markStone(x: number, z: number): void {
    const s = this.session;
    const key = `${x.toFixed(2)},${z.toFixed(2)}`;
    if (!s || !this.world || this.stoneMarks.has(key)) return;
    this.stoneMarks.add(key);
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: warnTexture(), depthTest: false, transparent: true }));
    m.scale.setScalar(0.42);
    m.position.set(x, worldHeight(s.field, x, z) + 0.6, z);
    m.renderOrder = 5;
    this.world.group.add(m);
  }

  /** Grass flung off the line where it just cut `n` cells (tall weeds throw paler bits). */
  emitCut(x: number, z: number, n: number, radius: number, tall: number): void {
    const s = this.session;
    if (!s) return;
    const count = Math.min(22, Math.round((n / 4) * (2.2 + tall)));
    // The head spins anticlockwise seen from above.
    this.particles.emitClippings(x, s.field.height(x, z), z, radius, count, 1, Math.min(1, tall));
  }

  shakeBushAt(x: number, z: number): void {
    const s = this.session;
    if (!s || !this.world) return;
    const i = s.field.bushes.findIndex((b) => b.x === x && b.z === z);
    this.world.shakeBush(i);
  }

  frame(dt: number): void {
    const s = this.session;
    if (!s || !this.world || !this.grass || !this.worker) return;
    this.time += dt;
    const ground = (x: number, z: number) => worldHeight(s.field, x, z);
    // Driving in first person the camera sits in the driver's seat (the driver is hidden), else it follows from behind.
    const fpv = this.mode === 'fpv' && !s.driving && !this.freeCam;
    const hide = this.mode === 'fpv' && !this.freeCam;
    if (this.worker.root.visible === hide || this.worker.firstPerson !== fpv) {
      this.worker.root.visible = !hide;
      this.worker.firstPerson = fpv;
      this.camera.near = hide ? 0.05 : 0.1;
      this.resize();
    }
    this.worker.ownHands = fpv && !!this.fpvRig;
    // The trimmer is in his hands, or in the trailer (menu, before he takes it, while driving).
    this.worker.driving = s.driving;
    if (s.driving) {
      const v = s.field.vehicle;
      const want = Math.max(-0.9, Math.min(0.9, v.art * 0.8 - v.steer * 0.25 * Math.min(1, Math.abs(v.speed))));
      this.headTurn += (want - this.headTurn) * Math.min(1, dt * 4);
    } else this.headTurn = 0;
    this.worker.headTurn = this.headTurn;
    this.worker.carrying = !this.menu && s.hasTrimmer && !s.driving;
    if (this.world.trailerTrimmer) this.world.trailerTrimmer.visible = !this.worker.carrying;
    // The yellow refill ring (beside the pat pat) only when fuel or line is running out, and not while driving.
    this.world.depotRing.visible = !this.menu && !s.driving && (s.fuel < s.gear.tank * 0.25 || s.spool < TRIMMER.rethreadUse || (s.broken && !s.intro));
    this.tyreMarks(s, dt);
    // The world first: the pat pat moves, and the driver's hands go to its steering wheel.
    this.world.update(dt, this.time, s.x, s.z, this.mode === 'orbit' ? null : this.camera.position, fpv);
    this.worker.wheelGrips = s.driving ? this.world.steeringGrips() : null;
    this.worker.seat = this.world.chassis;
    this.worker.update(dt, s, ground);
    this.grass.sync(this.time, s.headX, s.headZ, s.throttle);
    this.exhaustSmoke(dt, s);
    this.critters?.update(dt, this.time, s.x, s.z);
    this.rain?.update(this.time, this.camera.position);
    // A cut hose sprays water for the rest of the job.
    const hc = s.field.hoseCut;
    if (hc) {
      this.sprayAcc += dt * 40;
      const n = Math.floor(this.sprayAcc);
      this.sprayAcc -= n;
      if (n) this.particles.emit(hc.x, worldHeight(s.field, hc.x, hc.z) + 0.05, hc.z, n, 'water', 0.6, 0.2);
    }
    this.particles.update(dt, ground);
    this.updateCamera(dt, false);
    this.poseFirstPerson(s, ground);
    this.renderer.render(this.scene, this.camera);
  }

  /** First person: gloves fixed to the camera, handlebar under them, shaft from the clamp to the head. */
  private poseFirstPerson(s: Session, ground: (x: number, z: number) => number): void {
    const rig = this.fpvRig;
    if (!rig || !this.worker) return;
    const on = this.mode === 'fpv' && this.worker.carrying;
    rig.visible = on;
    if (!on) return;
    // Eyes position, worker's heading (an object facing (sin yaw, cos yaw) along -Z has rotation.y = yaw + PI)
    // and the default downward look.
    this.fpvBody.position.copy(this.camera.position);
    // The hands follow the look part of the way, so they stay in view looking down; looking up they
    // stay low (the machine would otherwise swing up in front of the face).
    const follow = FPV_HANDS_PITCH + (this.pitch - FPV_HANDS_PITCH) * (this.pitch > FPV_HANDS_PITCH ? 0.85 : 0.55);
    this.fpvBody.rotation.set(Math.min(follow, FPV_HANDS_MAX_PITCH), s.yaw + Math.PI, 0, 'YXZ');
    this.fpvBody.updateMatrixWorld(true);
    // A lifted head is drawn no higher than well below the eyes.
    const lifted = ground(s.headX, s.headZ) + 0.05 + s.lift * HEAD_LIFT;
    const target = new THREE.Vector3(s.headX, Math.min(lifted, this.camera.position.y - 0.75), s.headZ);
    const headCam = this.fpvBody.worldToLocal(target.clone());
    rig.update(headCam, Math.atan2(headCam.x, -headCam.z));
    rig.root.updateMatrixWorld(true);
    const clamp = rig.clamp.getWorldPosition(new THREE.Vector3());
    const dir = target.clone().sub(clamp).normalize();
    const body = this.worker.trimmer.body;
    body.position.copy(target).addScaledVector(dir, -TRIMMER_RIG.hookToHead);
    body.lookAt(target);
    body.updateMatrixWorld(true);
  }

  /** The pat pat's wheels mark the ground as it rolls (and splash through the stream). */
  private tyreMarks(s: Session, dt: number): void {
    const v = s.field.vehicle;
    if (!this.tracks || Math.abs(v.speed) < 0.05) return;
    this.trackAcc += Math.abs(v.speed) * dt;
    if (this.trackAcc < MARK_LENGTH) return;
    this.trackAcc = 0;
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    s.field.patpatWheels().forEach((w, i) => {
      const { x, z } = w;
      const lane = s.field.laneDistance(x, z) < 1.9;
      if (s.field.inWater(x, z)) this.particles.emit(x, worldHeight(s.field, x, z) + 0.1, z, 6, 'water', -fx * 0.5, -fz * 0.5);
      else if (s.field.puddleAt(x, z)) {
        // Through a puddle: brown water sprays out to the sides and behind.
        const y = worldHeight(s.field, x, z) + 0.1;
        this.particles.emit(x, y, z, 10, 'mud', -fx * Math.sign(v.speed) * 0.4, -fz * Math.sign(v.speed) * 0.4);
        this.particles.emit(x, y, z, 6, 'water', -fx * Math.sign(v.speed) * 0.3, -fz * Math.sign(v.speed) * 0.3);
      } else {
        // On the lane the tread is printed into the mud itself; elsewhere a tread mark is laid.
        const heading = (w.head ? v.yaw + v.art : v.yaw) + (v.speed < 0 ? Math.PI : 0);
        if (lane) this.world?.lane.print(i, x, z, heading, 0.23);
        else this.tracks?.add(x, worldHeight(s.field, x, z), z, heading);
        // In the muddy ruts of the lane the drive wheels fling mud up behind them.
        if (w.head && Math.abs(v.speed) > 1.2 && s.field.laneDistance(x, z) < 1.2) this.particles.emit(x, worldHeight(s.field, x, z) + 0.15, z, 3, 'mud', -fx * Math.sign(v.speed) * 0.6, -fz * Math.sign(v.speed) * 0.6);
      }
    });
  }

  /** A burst of exhaust smoke (engine start, cough). */
  puff(n: number, shade = 0): void {
    if (!this.worker) return;
    const p = this.worker.trimmer.exhaust.getWorldPosition(this.tmp);
    this.particles.emit(p.x, p.y, p.z, n, 'smoke', 0, 0, shade);
  }

  /** Two-stroke smoke: more with throttle and when revving up, whiter when cold, darker when hot. */
  private exhaustSmoke(dt: number, s: Session): void {
    const dThr = Math.max(0, s.throttle - this.lastThrottle) / Math.max(dt, 1e-3);
    this.lastThrottle = s.throttle;
    if (!s.running || !this.worker) return;
    // Many small puffs (a thin stream) rather than a few big ones; a burst when the throttle opens.
    this.smokeAcc += dt * (8 + 30 * s.throttle + 45 * Math.min(2, dThr));
    if (this.smokeAcc < 1) return;
    const n = Math.floor(this.smokeAcc);
    this.smokeAcc -= n;
    const shade = s.temp < 0.1 ? -0.15 : Math.max(0, (s.temp - 0.6) / 0.4);
    const p = this.worker.trimmer.exhaust.getWorldPosition(this.tmp);
    // Exhaust blows out sideways and backwards from the motor.
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    this.particles.emit(p.x, p.y, p.z, n, 'smoke', -fx * 0.4 - fz * 0.3, -fz * 0.4 + fx * 0.3, shade);
  }

  get stats(): { calls: number; triangles: number } {
    const i = this.renderer.info.render;
    return { calls: i.calls, triangles: i.triangles };
  }

  /** Development: fixed camera offset from the worker (in his facing frame) and look-at height. */
  debugCam: { side: number; up: number; back: number; lookY: number } | null = null;
  /** Development: the camera at a world point, looking at another (heights above the ground there). */
  debugLook: { x: number; z: number; up: number; atX: number; atZ: number; atUp: number } | null = null;
  /** Free camera (looking round the scene with the game stopped): position and heading, pitch. */
  freeCam: { x: number; y: number; z: number; yaw: number; pitch: number } | null = null;

  private updateCamera(dt: number, snap: boolean): void {
    const s = this.session;
    if (!s) return;
    if (this.freeCam) {
      const c = this.freeCam;
      this.camera.position.set(c.x, c.y, c.z);
      const cp = Math.cos(c.pitch);
      this.camera.lookAt(c.x + Math.sin(c.yaw) * cp, c.y + Math.sin(c.pitch), c.z + Math.cos(c.yaw) * cp);
      return;
    }
    if (this.debugLook) {
      const d = this.debugLook;
      this.camera.position.set(d.x, worldHeight(s.field, d.x, d.z) + d.up, d.z);
      this.camera.lookAt(d.atX, worldHeight(s.field, d.atX, d.atZ) + d.atUp, d.atZ);
      return;
    }
    if (this.debugCam) {
      const d = this.debugCam;
      const fx = Math.sin(s.yaw);
      const fz = Math.cos(s.yaw);
      const y = worldHeight(s.field, s.x, s.z);
      this.camera.position.set(s.x - fx * d.back - fz * d.side, y + d.up, s.z - fz * d.back + fx * d.side);
      this.camera.lookAt(s.x + fx * 0.4, y + d.lookY, s.z + fz * 0.4);
      return;
    }
    const f = s.field;
    if (s.driving && this.mode === 'fpv' && this.world?.driverView(this.camPos, this.tmp)) {
      // From the seat: looking where the pat pat goes (it pitches and rolls with it), dragging looks round.
      const a = Math.atan2(this.tmp.x, this.tmp.z) + this.driveOrbit + this.headTurn;
      const up = this.tmp.y - 0.3;
      this.camTarget.set(this.camPos.x + Math.sin(a), this.camPos.y + up, this.camPos.z + Math.cos(a));
      this.camera.position.copy(this.camPos);
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 2);
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.05;
      }
      this.camera.lookAt(this.camTarget);
      return;
    }
    if (s.driving) {
      // Chase camera behind the pat pat; dragging turns it round the pat pat (driveOrbit).
      const v = f.vehicle;
      const fx = Math.sin(v.yaw + this.driveOrbit);
      const fz = Math.cos(v.yaw + this.driveOrbit);
      const y = worldHeight(f, v.x, v.z);
      const k = snap ? 1 : 1 - Math.exp(-dt * 4);
      // Never below the ground behind it (driving downhill the slope behind is higher): keep looking down on it.
      const cx = v.x - fx * 7;
      const cz = v.z - fz * 7;
      const cy = Math.max(y + 3.4, worldHeight(f, cx, cz) + 2.6);
      this.camTarget.lerp(this.tmp.set(v.x + fx * 2, y + 1, v.z + fz * 2), k);
      this.camPos.lerp(this.tmp.set(cx, cy, cz), k);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camTarget);
      return;
    }
    if (this.mode === 'fpv') {
      // Eyes of the worker: slight head bob while walking, looking down at the trimmer head.
      this.bob += s.speed * dt * 4.2;
      const bobY = Math.abs(Math.sin(this.bob)) * 0.035 * Math.min(1, s.speed / 1.5);
      const fx = Math.sin(s.yaw);
      const fz = Math.cos(s.yaw);
      // A fall: the view drops to the ground and rolls over, then he gets back up.
      const t = SLOPE.fallTime - s.fallen;
      const down = s.fallen > 0 ? Math.min(1, t / 0.3) * Math.min(1, s.fallen / 0.7) : 0;
      const eye = this.camPos.set(s.x + fx * 0.12, worldHeight(f, s.x, s.z) + 1.62 + bobY - down * 1.25, s.z + fz * 0.12);
      const cp = Math.cos(this.pitch);
      this.camTarget.set(eye.x + fx * cp, eye.y + Math.sin(this.pitch), eye.z + fz * cp);
      this.camera.position.copy(eye);
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 2);
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.05;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.05;
      }
      this.camera.lookAt(this.camTarget);
      if (down > 0) this.camera.rotateZ(down * 1.1);
      return;
    }
    if (this.mode === 'orbit') {
      // Menu: the worker with his trimmer in front of the pat pat, the field behind; a slow drift.
      const y = worldHeight(f, s.x, s.z);
      const fx = Math.sin(s.yaw);
      const fz = Math.cos(s.yaw);
      const a = Math.sin(this.time * 0.12) * 0.35;
      const dx = fx * Math.cos(a) - fz * Math.sin(a);
      const dz = fz * Math.cos(a) + fx * Math.sin(a);
      // Look between the worker and the tractor (on his left, -x side of his facing).
      this.camTarget.set(s.x - fz * 1.1, y + 0.95, s.z + fx * 1.1);
      this.camPos.set(s.x + dx * 5.4 - fz * 0.6, y + 1.6, s.z + dz * 5.4 + fx * 0.6);
    } else {
      const y = worldHeight(f, s.x, s.z);
      // Look slightly ahead of the worker, uphill (-z), so more of the field is visible.
      // Behind the worker as seen from the orbit angle, looking a little ahead of him.
      const bx = Math.sin(this.orbitYaw);
      const bz = Math.cos(this.orbitYaw);
      const tx = s.x - bx * 0.8 + (s.headX - s.x) * 0.3;
      const tz = s.z - bz * 0.8 + (s.headZ - s.z) * 0.3;
      const want = new THREE.Vector3(tx, y + 0.6, tz);
      const h = 2.5 + this.orbitHeight * 7.5;
      const back = 7.5 - this.orbitHeight * 2;
      const pos = new THREE.Vector3(s.x + bx * back * this.zoom, y + h * this.zoom, s.z + bz * back * this.zoom);
      const k = snap ? 1 : 1 - Math.exp(-dt * 5);
      this.camTarget.lerp(want, k);
      this.camPos.lerp(pos, k);
    }
    if (snap) {
      this.camera.position.copy(this.camPos);
    } else this.camera.position.lerp(this.camPos, this.mode === 'orbit' ? 0.08 : 1);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.15;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.15;
    }
    this.camera.lookAt(this.camTarget);
  }
}
