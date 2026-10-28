import * as THREE from 'three';
import { Session } from '../game/session';
import { GrassView } from './grass';
import { Models } from './models';
import { FpvRig } from './fpvRig';
import { DogView } from './dog';
import { CowsView } from './cows';
import { TILLER_AHEAD, TillerRig } from './tiller';
import { blowerModel, blowerTube } from './burn';
import { Dusk } from './dusk';
import { TallGrassView } from './tallgrass';
import { Particles } from './particles';
import { HEAD_LIFT, TRIMMER_RIG } from './trimmerRig';
import { PATPAT, PLAYER, SLOPE, TRIMMER } from '../game/config';
import { DRIVER_EYE, SKY_HORIZON, WorldView, worldHeight } from './world';
import { WorkerView } from './worker';
import { MOBILE } from '../platform/device';
import { CrittersView } from './critters';
import { Rain, WEATHER } from './weather';
import { MARK_LENGTH, TrackView } from './tracks';

/**
 * The firings in the pat pat's start recording (public/audio/patpat_start.wav: seconds in, and how
 * loud each bang is, 0..1), found from its loudness: the starter's first slow beats, then it catching.
 */
const PATPAT_START_POPS = [
  { t: 0.62, k: 0.5 }, { t: 1.43, k: 0.48 }, { t: 2.16, k: 0.68 }, { t: 2.75, k: 0.85 }, { t: 2.89, k: 0.8 },
  { t: 3.02, k: 0.8 }, { t: 3.13, k: 0.85 }, { t: 3.31, k: 1 }, { t: 3.46, k: 0.85 }, { t: 3.53, k: 0.75 },
];

export type Quality = 'low' | 'medium' | 'high';

/** The grass's light by day and fallen night (an evening). */
const DAY = new THREE.Color(1, 1, 1);
const NIGHT_GRASS = new THREE.Color('#2b3349');
/** The first-person hands are placed as seen with this downward look (radians). */
const FPV_HANDS_PITCH = -0.55;
/** How much of the trimmer head's side swing the eyes follow in first person (the hands and bar turn the rest). */
const FPV_SWING_FOLLOW = 0.7;
/** The hands rise with the look no higher than this. */
const FPV_HANDS_MAX_PITCH = -0.35;

const QUALITY: Record<Quality, { ratio: number; shadows: boolean; shadowSize: number; blades: number; density: number; wild: number; trees: number; shoots: number }> = {
  low: { ratio: 1, shadows: false, shadowSize: 512, blades: 5, density: 0.8, wild: 0, trees: 8, shoots: 8 },
  medium: { ratio: 1.5, shadows: false, shadowSize: 1024, blades: 4, density: 1, wild: 2.4, trees: 14, shoots: 11 },
  high: { ratio: 2, shadows: false, shadowSize: 2048, blades: 6, density: 1.3, wild: 2.4, trees: 22, shoots: 13 },
};

/**
 * On a phone, the most pixels a CSS pixel draws at each quality: its screen is so fine (3x) that the
 * difference above these hardly shows, but the GPU's work (and the phone's heat) grows with the square.
 * The quality keeps everything else it has (trees, grass, smoothing).
 */
const PHONE_RATIO: Record<Quality, number> = { low: 1, medium: 1.3, high: 1.6 };

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
  /** The scene of the job (the harvest is drawn there). */
  world: WorldView | null = null;
  private grass: GrassView | null = null;
  private worker: WorkerView | null = null;
  critters: CrittersView | null = null;
  /** The motor çapa, pushed ahead of the worker while `tillerInHand`, its tines turning with `tillerGas` (0..1, running) . */
  tiller: TillerRig | null = null;
  tillerInHand = false;
  tillerGas = 0;
  tillerOn = false;
  /** The backpack blower worn (on the back; in first person its tube ahead on the right), running, its throttle. */
  blowerInHand = false;
  blowerOn = false;
  blowerGas = 0;
  private blowerFpv: THREE.Object3D | null = null;
  private blowerBack: THREE.Object3D | null = null;
  /** The village's cows (not on the menu); one wanders into the garden when `cowIntruder` is set for the job. */
  cows: CowsView | null = null;
  cowIntruder: { after: number } | null = null;
  /** The evening's cows to bring home (0: none), and how far the dark has fallen (null: no evening: daylight). */
  herd = 0;
  duskLevel: number | null = null;
  private dusk: Dusk | null = null;
  /** Boy boyu ot: the man-high clumps in the giant weeds (gardens with them). */
  tallGrass: TallGrassView | null = null;
  /** Karabaş, the yard's dog, with the player once the kennel is bought (not on the menu). */
  dog: DogView | null = null;
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
  /** The eyes' heading in first person (the worker's, turned with the trimmer's swing). */
  private fpvYaw = 0;
  private wasDriving = false;
  private shake = 0;
  private smokeAcc = 0;
  private lastThrottle = 0;
  /** The pat pat's exhaust: smoke owed, last speed, and where on its head the pipe is (found once). */
  private patSmokeAcc = 0;
  private patLastSpeed = 0;
  private patWasDriving = false;
  /** Seconds since the pat pat's engine was started (getting on); Infinity off it. */
  private patStartT = Infinity;
  private patPipe: THREE.Vector3 | null = null;
  private readonly tmp = new THREE.Vector3();
  /** The sky dome (WorldView's), kept round the camera. */
  private sky: THREE.Object3D | null = null;
  /** Odun İşi: the chainsaw in the worker's hands (on foot by the tree), and cutting (it shakes). */
  sawInHand = false;
  /** The chainsaw's throttle (0 ticking over .. 1 flat out), and its engine running. */
  sawing = 0;
  sawOn = false;
  /** The chainsaw held: in first person before the eyes (as the gloves are), else in the worker's hands. */
  private sawFpv: THREE.Object3D | null = null;
  private sawHand: THREE.Object3D | null = null;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    // PCF with a filter radius: soft shadow edges (PCFSoft ignores the radius).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    // (Odun İşi's tree is cut back with a clipping plane on its own materials.)
    this.renderer.localClippingEnabled = true;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? PHONE_RATIO[this.quality] : QUALITY[this.quality].ratio));
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
  /** The vehicle chosen again during a job: rebuilt where it stands (the rest of the scene stays). */
  swapVehicle(models: Models): void {
    this.world?.swapVehicle(models);
  }

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
    if (models.tiller?.[0] && !menu) {
      this.tiller = new TillerRig(models.tiller[0]);
      this.scene.add(this.tiller.group);
    }
    if (models.blower?.[0] && !menu) {
      // First person: the pad behind the eyes, the tube along the right and out ahead (camera -z).
      this.blowerFpv = blowerTube(models.blower[0]);
      this.blowerFpv.visible = false;
      this.scene.add(this.blowerFpv);
      // From behind: on his back (he faces +z: the model turned round, its tube on his right).
      this.blowerBack = blowerModel(models.blower[0]);
      this.blowerBack.rotation.y = Math.PI;
      this.blowerBack.position.set(0, 1.05, -0.32);
      this.blowerBack.visible = false;
      this.worker.root.add(this.blowerBack);
    }
    if (models.cow?.[0] && !menu) {
      this.cows = new CowsView(session.field, models.cow[0], this.cowIntruder, this.herd);
      this.scene.add(this.cows.group);
    }
    // The dog, once adopted: by the worker to start with.
    if (models.dog?.[0] && !menu && WorldView.dog) {
      const p = DogView.spawn(session.field, session);
      this.dog = new DogView(models.dog[0], p.x, p.z, session.yaw);
      this.scene.add(this.dog.root);
    }
    // Weather: haze, fog distance and exposure; rain streaks round the camera.
    const look = WEATHER[session.field.level.weather];
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(look.haze);
    fog.near = look.fogNear;
    fog.far = look.fogFar;
    // On a fine day nothing past the fog is drawn (there it would be only the fog's colour against the
    // painted sky): the camera sees as far as the fog does. In rain and fog the hills far off in the haze
    // are part of the look: as far as before. The sky dome, kept round the camera (frame), within that.
    this.camera.far = session.field.level.weather === 'sunny' ? look.fogFar + 30 : 900;
    this.camera.updateProjectionMatrix();
    this.sky = this.world.group.getObjectByName('sky') ?? null;
    this.sky?.scale.setScalar((this.camera.far * 0.9) / 650);
    (this.scene.background as THREE.Color).set(look.haze);
    this.renderer.toneMappingExposure = look.exposure;
    if (session.field.level.weather === 'rain' && !menu) {
      this.rain = new Rain();
      this.scene.add(this.rain.lines);
    }
    // The chainsaw (0.8 m long, its bar along the model's -x): pointing ahead and a little down.
    const saw = models.chainsaw?.[0];
    if (saw && !menu) {
      const make = () => {
        const s = saw.scene.clone(true);
        const box = new THREE.Box3().setFromObject(s);
        const k = 0.8 / (box.max.x - box.min.x);
        s.scale.setScalar(k);
        s.position.set((-(box.min.x + box.max.x) / 2) * k, (-(box.min.y + box.max.y) / 2) * k, (-(box.min.z + box.max.z) / 2) * k);
        s.traverse((o) => {
          o.frustumCulled = false;
          o.castShadow = true;
        });
        const g = new THREE.Group();
        g.add(s);
        g.visible = false;
        return g;
      };
      // First person: down to the right before the eyes, the bar ahead (camera -z).
      this.sawFpv = make();
      this.sawFpv.children[0].rotation.set(0, -Math.PI / 2, 0);
      this.sawFpv.children[0].position.applyEuler(new THREE.Euler(0, -Math.PI / 2, 0));
      this.scene.add(this.sawFpv);
      // Third person: in front of him at the hips, the bar ahead (he faces +z).
      this.sawHand = make();
      this.sawHand.children[0].rotation.set(0, Math.PI / 2, 0);
      this.sawHand.children[0].position.applyEuler(new THREE.Euler(0, Math.PI / 2, 0));
      this.sawHand.position.set(-0.18, 0.88, 0.5);
      this.worker.root.add(this.sawHand);
    }
    if (session.field.level.giant) {
      this.tallGrass = new TallGrassView(session.field, (x, z) => worldHeight(session.field, x, z), session.field.level.seed);
      this.scene.add(this.tallGrass.group);
    }
    // An evening: the dark falling, the lamps (built once the sky is known).
    if (this.duskLevel !== null && !menu) {
      this.dusk = new Dusk(session.field, (x, z) => worldHeight(session.field, x, z), { hemi: this.world.hemi, sun: this.world.sun, sky: this.sky, fog, background: this.scene.background as THREE.Color, exposure: look.exposure });
      this.scene.add(this.dusk.group);
      this.dusk.forehead.position.set(0, 1.71, 0.11);
      this.worker.root.add(this.dusk.forehead);
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
    if (this.dog) {
      disposeTree(this.dog.root);
      this.scene.remove(this.dog.root);
      this.dog = null;
    }
    if (this.blowerFpv) {
      disposeTree(this.blowerFpv);
      this.scene.remove(this.blowerFpv);
    }
    this.blowerFpv = this.blowerBack = null;
    if (this.tallGrass) {
      disposeTree(this.tallGrass.group);
      this.scene.remove(this.tallGrass.group);
      this.tallGrass = null;
    }
    if (this.dusk) {
      disposeTree(this.dusk.group);
      this.scene.remove(this.dusk.group);
      this.dusk = null;
    }
    if (this.tiller) {
      disposeTree(this.tiller.group);
      this.scene.remove(this.tiller.group);
      this.tiller = null;
    }
    if (this.cows) {
      disposeTree(this.cows.group);
      this.scene.remove(this.cows.group);
      this.cows = null;
    }
    if (this.sawFpv) {
      disposeTree(this.sawFpv);
      this.scene.remove(this.sawFpv);
    }
    this.sawFpv = this.sawHand = null;
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
    const count = Math.min(30, Math.round((n / 4) * (3 + tall)));
    // The head spins anticlockwise seen from above; the bits are thrown forward too, the way he faces.
    this.particles.emitClippings(x, s.field.height(x, z), z, radius, count, 1, Math.min(1, tall), { x: Math.sin(s.yaw), z: Math.cos(s.yaw) });
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
      // Just got on: looking that way at once (easing round to it from straight read as the view leaning).
      this.headTurn = this.wasDriving ? this.headTurn + (want - this.headTurn) * Math.min(1, dt * 4) : want;
    } else this.headTurn = 0;
    this.wasDriving = s.driving;
    this.worker.headTurn = this.headTurn;
    this.worker.carrying = !this.menu && s.hasTrimmer && !s.driving;
    // (Roaming the trimmer stays at home: none in the vehicle either.)
    if (this.world.trailerTrimmer) this.world.trailerTrimmer.visible = !this.worker.carrying && !s.roaming;
    // The yellow refill ring (beside the vehicle) only when fuel or line is running out, on foot with the
    // trimmer (not with it left in the vehicle, nor roaming without a job).
    this.world.depotRing.visible = !this.menu && !s.driving && s.hasTrimmer && !s.roaming && (s.fuel < s.gear.tank * 0.25 || s.spool < TRIMMER.rethreadUse || (s.broken && !s.intro));
    this.tyreMarks(s, dt);
    // The world first: the pat pat moves, and the driver's hands go to its steering wheel.
    this.world.update(dt, this.time, s.x, s.z, this.mode === 'orbit' ? null : this.camera.position, fpv);
    this.worker.wheelGrips = s.driving ? this.world.steeringGrips() : null;
    this.worker.seat = this.world.chassis;
    this.worker.seatPlace = { z: s.field.dims.seat, lift: s.field.dims.seatLift };
    this.worker.update(dt, s, ground);
    // The line spinning (the engine's revs, the line on and in hand): the grass round the head moves.
    this.grass.sync(this.time, s.headX, s.headZ, s.running && s.hasTrimmer && !s.broken ? s.rpm : 0);
    this.exhaustSmoke(dt, s);
    this.patpatSmoke(dt, s);
    this.critters?.update(dt, this.time, s.x, s.z);
    this.tallGrass?.update();
    this.dog?.update(dt, s, ground, this.time);
    this.cows?.update(dt, s, ground, this.dog);
    this.poseTiller(s, ground, dt);
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
    this.poseSaw(fpv);
    this.poseBlower(fpv);
    if (this.dusk) {
      this.dusk.update(this.duskLevel ?? 0, s, this.camera, this.renderer, fpv);
      // (The grass has its own light: darkened with the rest.)
      this.grass?.setLight(DAY.clone().lerp(NIGHT_GRASS, this.duskLevel ?? 0));
    }
    if (this.sky) {
      this.camera.getWorldPosition(this.sky.position);
      this.sky.updateMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** The blower worn: on his back from behind; in first person low on the right, its tube pointing ahead. */
  private poseBlower(fpv: boolean): void {
    const on = this.blowerInHand && !this.menu;
    const shake = this.blowerOn ? (Math.sin(this.time * 80) * 0.003 + Math.sin(this.time * 51) * 0.002) * (0.5 + this.blowerGas) : 0;
    if (this.blowerBack) this.blowerBack.visible = on && !fpv;
    const f = this.blowerFpv;
    if (!f) return;
    f.visible = on && fpv;
    if (!f.visible) return;
    f.position.copy(this.camera.position);
    f.quaternion.copy(this.camera.quaternion);
    // (Its tube out along the right, its mouth tipped down ahead into the grass.)
    f.translateX(shake);
    f.translateY(shake);
  }

  /** Smoke rising at a point (a fire). */
  smoke(x: number, y: number, z: number, n: number): void {
    this.particles.emit(x, y, z, n, 'smoke', 0, 0, 0.6, 1.6, 1.6);
  }

  /** The tiller pushed ahead of the worker (on foot), on the ground, tipped with the slope under it. */
  private poseTiller(s: Session, ground: (x: number, z: number) => number, dt: number): void {
    const t = this.tiller;
    if (!t) return;
    t.group.visible = this.tillerInHand && !s.driving;
    if (!t.group.visible) return;
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    const x = s.x + fx * TILLER_AHEAD;
    const z = s.z + fz * TILLER_AHEAD;
    const front = ground(x + fx * 0.6, z + fz * 0.6);
    const back = ground(x - fx * 0.6, z - fz * 0.6);
    // (Shaking a little as it runs, harder on the throttle.)
    const shake = this.tillerOn ? (Math.sin(this.time * 70) * 0.004 + Math.sin(this.time * 43) * 0.003) * (0.4 + this.tillerGas) : 0;
    t.place(x, ground(x, z) + shake, z, s.yaw, -Math.atan2(front - back, 1.2), this.tillerOn ? 0.15 + this.tillerGas : 0, dt);
  }

  /** The chainsaw in hand (Odun İşi): before the eyes in first person, in his hands from behind; shaking while it cuts. */
  private poseSaw(fpv: boolean): void {
    const on = this.sawInHand && !this.menu;
    // It shakes with the revs (a little ticking over), tips down into the wood with the throttle.
    const shake = (this.sawOn ? 0.3 + this.sawing * 0.7 : 0) * (Math.sin(this.time * 90) * 0.006 + Math.sin(this.time * 53) * 0.004);
    if (this.sawHand) {
      this.sawHand.visible = on && !fpv;
      this.sawHand.rotation.x = 0.12 + this.sawing * 0.23;
      this.sawHand.position.y = 0.88 + shake;
    }
    const f = this.sawFpv;
    if (!f) return;
    f.visible = on && fpv;
    if (!f.visible) return;
    f.position.copy(this.camera.position);
    f.quaternion.copy(this.camera.quaternion);
    // Down and to the right, the bar tipped down towards what it cuts (more while cutting).
    f.translateX(0.22 + shake);
    f.translateY(-0.27 + shake);
    f.translateZ(-0.52);
    f.rotateX(-0.16 - this.sawing * 0.22);
    f.rotateY(0.08);
  }

  /** First person: gloves fixed to the camera, handlebar under them, shaft from the clamp to the head. */
  private poseFirstPerson(s: Session, ground: (x: number, z: number) => number): void {
    const rig = this.fpvRig;
    if (!rig || !this.worker) return;
    const on = this.mode === 'fpv' && this.worker.carrying;
    rig.visible = on;
    this.worker.trimmer.engineVisible = !on;
    if (!on) return;
    // Eyes position, worker's heading (an object facing (sin yaw, cos yaw) along -Z has rotation.y = yaw + PI)
    // and the default downward look.
    this.fpvBody.position.copy(this.camera.position);
    // The hands follow the look part of the way, so they stay in view looking down; looking up they
    // stay low (the machine would otherwise swing up in front of the face).
    const follow = FPV_HANDS_PITCH + (this.pitch - FPV_HANDS_PITCH) * (this.pitch > FPV_HANDS_PITCH ? 0.85 : 0.55);
    this.fpvBody.rotation.set(Math.min(follow, FPV_HANDS_MAX_PITCH), this.fpvYaw + Math.PI, 0, 'YXZ');
    this.fpvBody.updateMatrixWorld(true);
    // A lifted head is drawn no higher than well below the eyes.
    // Down a bank, the head held at the feet's level (above the grass falling away, as a mower holds it
    // there): the machine then sits in the hands as on the level, never swung up into the eyes.
    const feet = ground(s.x, s.z);
    const lifted = Math.max(ground(s.headX, s.headZ), feet - 0.15) + 0.05 + s.lift * HEAD_LIFT;
    const target = new THREE.Vector3(s.headX, Math.min(lifted, this.camera.position.y - 0.75), s.headZ);
    // On a slope the head, on the ground, comes up towards the eyes going uphill (filling the view) and
    // drops away going downhill (the shaft swinging the engine up in front of the face). Drawn, its
    // angle below the eyes is held near what it is on the level, moving it in or out along the ground.
    {
      const eye = this.camera.position;
      const dx = target.x - eye.x;
      const dz = target.z - eye.z;
      const far = Math.hypot(dx, dz);
      const level = Math.atan2(eye.y - (ground(eye.x, eye.z) + 0.05 + s.lift * HEAD_LIFT), far);
      const now = Math.atan2(eye.y - target.y, far);
      const want = Math.max(level - 0.1, Math.min(level + 0.1, now));
      if (far > 0.2 && want !== now) {
        const k = Math.max(0.55, Math.min(1.4, (eye.y - target.y) / Math.tan(want) / far));
        target.x = eye.x + dx * k;
        target.z = eye.z + dz * k;
      }
    }
    // Where the head is held at rest: straight ahead (the same side offset), on level ground under the feet.
    const fwd0 = new THREE.Vector3(Math.sin(this.fpvYaw), 0, Math.cos(this.fpvYaw));
    const rest = new THREE.Vector3(s.x, ground(s.x, s.z) + 0.05, s.z)
      .addScaledVector(fwd0, PLAYER.reach)
      .add(new THREE.Vector3(-fwd0.z, 0, fwd0.x).multiplyScalar(PLAYER.headSide));
    const body = this.worker.trimmer.body;
    const place = () => {
      this.fpvBody.updateMatrixWorld(true);
      const headCam = this.fpvBody.worldToLocal(target.clone());
      rig.update(headCam, this.fpvBody.worldToLocal(rest.clone()));
      rig.root.updateMatrixWorld(true);
      const clamp = rig.clamp.getWorldPosition(new THREE.Vector3());
      const dir = target.clone().sub(clamp).normalize();
      body.position.copy(target).addScaledVector(dir, -TRIMMER_RIG.hookToHead);
      body.lookAt(target);
      body.updateMatrixWorld(true);
    };
    place();
  }

  /** How far in front of the eyes the trimmer's engine is (m; behind them: below 0). */
  engineClear(): number {
    const t = this.worker?.trimmer;
    return t ? -this.camera.worldToLocal(t.exhaust.getWorldPosition(new THREE.Vector3())).z : Infinity;
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

  /**
   * The pat pat's diesel smoke while it is driven, from the pipe on the right of its head: a thick
   * black burst as the engine starts (getting on), black while it speeds up or labours (throttle open
   * but the speed not coming: up a bank, in mud, against something), a thin grey trail ticking over
   * or cruising.
   */
  private patpatSmoke(dt: number, s: Session): void {
    const head = this.world?.patRig?.head;
    const v = s.field.vehicle;
    const accel = (Math.abs(v.speed) - Math.abs(this.patLastSpeed)) / Math.max(dt, 1e-3);
    this.patLastSpeed = v.speed;
    // Getting on starts the engine: time since then (the start recording plays from it).
    const was = this.patStartT;
    if (s.driving && !this.patWasDriving) this.patStartT = 0;
    else this.patStartT = s.driving ? this.patStartT + dt : Infinity;
    this.patWasDriving = s.driving;
    // A puff of black smoke with each firing in the start recording that falls in this frame.
    const fired = s.driving && was !== Infinity ? PATPAT_START_POPS.filter((p) => p.t > was && p.t <= this.patStartT) : [];
    if (!s.driving || !head) return;
    if (!this.patPipe) {
      // The pipe on the engine's right-hand side (the driver's right: -x of the head, which faces +z),
      // at the engine block's outer face behind the bonnet, near its top: from the head's box in its
      // own frame.
      head.updateMatrixWorld(true);
      const inv = head.matrixWorld.clone().invert();
      const box = new THREE.Box3();
      const m = new THREE.Matrix4();
      head.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.computeBoundingBox();
        box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld)));
      });
      this.patPipe = new THREE.Vector3(box.min.x + (box.max.x - box.min.x) * 0.43, box.min.y + (box.max.y - box.min.y) * 0.62, box.min.z + (box.max.z - box.min.z) * 0.8);
    }
    // Black smoke only when the engine is worked: pulling away from standing, climbing a slope,
    // labouring (throttle open, the speed not coming); none ticking over or cruising on the level.
    const thr = Math.max(0, s.patThrottle);
    const pull = Math.abs(v.speed) < 1.6 ? Math.min(1, Math.max(0, accel) / 1.2) * thr : 0;
    const labour = thr > 0.3 && Math.abs(v.speed) < 0.5 * thr * PATPAT.forward ? thr : 0;
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    const grade = (s.field.height(v.x + fx, v.z + fz) - s.field.height(v.x - fx, v.z - fz)) / 2;
    const climb = Math.min(1, Math.max(0, (grade - 0.05) / 0.15)) * thr;
    const work = Math.min(1, Math.max(pull, labour, climb));
    if (!fired.length && work < 0.15) {
      this.patSmokeAcc = 0;
      return;
    }
    this.patSmokeAcc += dt * 130 * work;
    const n = Math.floor(this.patSmokeAcc);
    this.patSmokeAcc -= n;
    const pop = fired.reduce((m, f) => Math.max(m, f.k), 0);
    // The tractor's own stack: straight up out of it.
    const stack = (this.world?.patRig as { pipe?: THREE.Object3D } | null)?.pipe;
    if (stack) {
      const q = stack.getWorldPosition(this.tmp);
      if (n) this.particles.emit(q.x, q.y, q.z, n, 'smoke', 0, 0, 1.5, 1.2 + work * 0.4, 1.4 + work * 0.5);
      if (pop) this.particles.emit(q.x, q.y, q.z, Math.round(5 + 14 * pop), 'smoke', 0, 0, 1.5, 1.3 + pop * 0.7, 1.8);
      return;
    }
    const p = head.localToWorld(this.tmp.copy(this.patPipe));
    // Blown out to the right (the pipe points that way; the head, turned by the articulation, has its
    // own right) and rising; leaving the pipe with some of the pat pat's speed.
    const yaw = v.yaw + v.art;
    const carry = 0.4 * v.speed;
    const out = 0.9;
    const dx = -Math.cos(yaw) * out + fx * carry;
    const dz = Math.sin(yaw) * out + fz * carry;
    if (n) this.particles.emit(p.x, p.y, p.z, n, 'smoke', dx, dz, 1.5, 1.2 + work * 0.4, 1.1 + work * 0.5);
    // A firing: a burst, as big as the bang, shot out of the pipe.
    if (pop) this.particles.emit(p.x, p.y, p.z, Math.round(5 + 14 * pop), 'smoke', dx * 1.8, dz * 1.8, 1.5, 1.3 + pop * 0.7, 1.4);
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
      const up = this.tmp.y - DRIVER_EYE.down;
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
      // With the trimmer in hand the eyes follow the head's swing half way (a right swing: yaw down).
      this.fpvYaw = s.yaw - (s.hasTrimmer && this.worker?.carrying ? s.sweep * FPV_SWING_FOLLOW : 0);
      const fx = Math.sin(this.fpvYaw);
      const fz = Math.cos(this.fpvYaw);
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
