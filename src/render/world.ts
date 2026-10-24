import * as THREE from 'three';
import { Field, STREAM } from '../game/field';
import { PATPAT } from '../game/config';
import { Models, fitted } from './models';
import { backpackPart, cutTriangles, isBakedLine, isEngine, prepare } from './trimmerRig';
import { PatpatRig } from './patpat';
import { brambleObject } from './bramble';
import { shootBush } from './shootBush';
import { hazelnutBush } from './hazelnut';
import { MEADOW_PATCHES, PAINTED_GROUND, groundTextures, hills, skyDome } from './scenery';
import { boulderGeometry, graveGeometry, mosqueGroup, stoneWall, yaylaHutGroup } from './landmarks';
import { WEATHER } from './weather';
import { StreamView } from './stream';
import { LaneView, harmanMesh, laneDip, puddleDip, puddleMeshes } from './lane';
import { boardSpot, cobbleRoads, nameBoard, otherFields, villageBoard, villageTrees } from './villageView';
import { clothesline, depotGroup, flowerPots, gazebo, haystackGroup, houseGroup, kennel, oldPostGroup, postGeometry, slidingGate, spoolGroup, stoneGeometry, paintedStoneGeometry, wireFence, woodpileGroup } from './props';

/** How far the terrain extends beyond the village on each side. */
const MARGIN = 45;

/** Height of the levelled ground the house and its harman stand on, per field. */
const plateauHeight = new WeakMap<Field, number>();

/** Terrain height anywhere in the village: the hill, the house's levelled ground, the tracks worn in. */
export function worldHeight(f: Field, x: number, z: number): number {
  return laneSurface(f, x, z, f.laneDistance(x, z), groundHeight(f, x, z));
}

/** The ground at a point (the hill and the house's levelled ground), before the tracks wear it down. */
export function groundHeight(f: Field, x: number, z: number): number {
  let h = f.height(x, z);
  const p = f.plateau;
  if (p) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r * 1.8) {
      let h0 = plateauHeight.get(f);
      // Level with the slope at its downhill edge: cut into the hill behind, no drop-off in front.
      if (h0 === undefined) plateauHeight.set(f, (h0 = f.height(p.x, p.z + p.r * 0.9)));
      const t = Math.min(1, Math.max(0, (d - p.r) / (p.r * 0.8)));
      // Only cut into the hill, never build up: below the level the slope runs on untouched.
      if (h > h0) h = h0 + (h - h0) * t * t * (3 - 2 * t);
    }
  }
  return h;
}

/** The ground `base` worn down by a track `r` metres from its middle: the ruts, puddles and prints. */
export function laneSurface(f: Field, x: number, z: number, r: number, base: number): number {
  if (r === Infinity) return base;
  return base - (laneDip(r, x, z) + puddleDip(f, x, z) + f.sinkAt(x, z)) * f.laneEndFade(x, z);
}

/** The rectangle the terrain covers: the village and a margin round it (field coordinates). */
function terrainRect(f: Field): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return { minX: f.map.minX - MARGIN, maxX: f.streamX(0) + MARGIN, minZ: f.map.minZ - MARGIN, maxZ: f.map.maxZ + MARGIN };
}

function terrain(f: Field, cut: THREE.Texture, lane: LaneView): THREE.Mesh {
  const r = terrainRect(f);
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const g = new THREE.PlaneGeometry(w, d, Math.round(w / 2), Math.round(d / 2));
  g.rotateX(-Math.PI / 2);
  g.translate((r.minX + r.maxX) / 2, 0, (r.minZ + r.maxZ) / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, worldHeight(f, p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  // Pushed back in depth: the fine rutted tracks and the stream bed laid on it (a few centimetres lower
  // where its 2 m triangles cut across their ruts and banks) must not be covered by it.
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: 8, polygonOffsetUnits: 600 });
  const tex = groundTextures();
  // The coarse terrain is not drawn under the lane's middle: the fine rutted ribbon is the ground there.
  // Made once (not in onBeforeCompile, which runs for every program), freed with the material.
  const laneMask = lane.mask();
  if (laneMask) mat.addEventListener('dispose', () => laneMask.tex.dispose());
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCut = { value: cut };
    sh.uniforms.uGrass = { value: tex?.grass ?? null };
    sh.uniforms.uSoil = { value: tex?.soil ?? null };
    sh.uniforms.uField = { value: new THREE.Vector4(-f.width / 2, -f.depth / 2, 1 / f.width, 1 / f.depth) };
    sh.uniforms.uLaneMask = { value: laneMask?.tex ?? null };
    sh.uniforms.uLaneBox = { value: laneMask?.box ?? new THREE.Vector4(0, 0, 0, 0) };
    sh.uniforms.uStream = { value: new THREE.Vector3(f.origin.x, f.origin.z, STREAM.width * 0.62 + 0.4) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', (PAINTED_GROUND ? MEADOW_PATCHES : '') + '#include <common>\nvarying vec2 vWXZ;\nuniform sampler2D uCut;\nuniform vec4 uField;\nuniform sampler2D uGrass;\nuniform sampler2D uSoil;\nuniform sampler2D uLaneMask;\nuniform vec4 uLaneBox;\nuniform vec3 uStream;')
      // Not drawn under the tracks' middles, nor under the stream's water (the coarse triangles cut
      // across its carved bank and would cover the bed; the line is villageStreamX's).
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nvec2 luv = (vWXZ - uLaneBox.xy) * uLaneBox.zw;\nif (uLaneBox.z > 0.0 && luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0 && texture2D(uLaneMask, luv).r > 0.5) discard;\nfloat sz = uStream.y + vWXZ.y;\nif (abs(vWXZ.x - (40.0 + sin(sz * 0.09 + 1.0) * 2.2 + sin(sz * 0.23) * 0.7 - uStream.x)) < uStream.z) discard;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec2 cuv = (vWXZ - uField.xy) * uField.zw;
        float inside = step(0.0, cuv.x) * step(cuv.x, 1.0) * step(0.0, cuv.y) * step(cuv.y, 1.0);
        float h = texture2D(uCut, clamp(cuv, 0.0, 1.0)).r * 3.0;
        // Photo textures tiled in world space, two scales mixed so the repeat doesn't show,
        // and a broad colour drift across the ground.
        vec3 grassT = texture2D(uGrass, vWXZ / ${PAINTED_GROUND ? '2.8' : '2.6'}).rgb * 0.6 + texture2D(uGrass, vWXZ / ${PAINTED_GROUND ? '3.7' : '9.0'} + 0.37).rgb * 0.4;
        vec3 soilT = texture2D(uSoil, vWXZ / ${PAINTED_GROUND ? '2.4' : '2.2'}).rgb * 0.65 + texture2D(uSoil, vWXZ / ${PAINTED_GROUND ? '3.3' : '7.0'} + 0.61).rgb * 0.35;
        // The painted textures, a touch calmer than drawn (the blades and the light do the rest).
        ${PAINTED_GROUND ? 'grassT = mix(grassT, vec3(dot(grassT, vec3(0.3, 0.59, 0.11))), 0.25) * vec3(0.52, 0.64, 0.48); soilT = mix(soilT, vec3(dot(soilT, vec3(0.3, 0.59, 0.11))), 0.3) * vec3(0.84, 0.74, 0.64);' : ''}
        float drift = sin(vWXZ.x * 0.11 + sin(vWXZ.y * 0.07) * 2.0) * 0.5 + 0.5;
        vec3 soil = soilT * vec3(1.0, 0.95, 0.9);
        vec3 stubble = mix(grassT * vec3(1.15, 1.12, 0.78), soilT, 0.25);
        vec3 under = grassT * vec3(0.55, 0.62, 0.5);
        vec3 wild = grassT * mix(vec3(0.9, 0.95, 0.75), vec3(0.75, 0.85, 0.65), drift)${PAINTED_GROUND ? ' * 0.85 * meadowPatches(vWXZ)' : ''};
        vec3 c = mix(soil, stubble, smoothstep(0.03, 0.1, h));
        c = mix(c, under, smoothstep(0.18, 0.45, h));
        // A worn earth path just outside the field edge, then rough meadow.
        vec2 edge = max(abs(vWXZ) - vec2(1.0 / uField.z, 1.0 / uField.w) * 0.5, 0.0);
        float out_ = length(edge);
        vec3 outside = ${PAINTED_GROUND ? 'mix(mix(soilT, grassT, 0.6), wild, smoothstep(0.25, 1.3, out_))' : 'mix(mix(soilT, grassT, 0.35) * 1.05, wild, smoothstep(0.6, 2.5, out_))'};
        c = mix(outside, c, inside);
        diffuseColor.rgb *= c * 1.15;`,
      );
  };
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/** The refill kit: the jerrycan (artist model) and the spool of line (model, or the drawn one) side by side. */
function depotModels(models: Models): THREE.Group {
  const g = new THREE.Group();
  if (models.fuelcan?.[0]) {
    const can = fitted(models.fuelcan[0].scene, 0.45);
    can.position.set(-0.2, 0, 0);
    g.add(can);
  }
  const spool = models.spool?.[0] ? fitted(models.spool[0].scene, 0.25) : spoolGroup();
  spool.position.set(0.5, 0, 0.12);
  g.add(spool);
  return g;
}

/** Everything static around one field. */
export class WorldView {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly depotRing: THREE.Mesh;
  private readonly sunDir: THREE.Vector3;
  /** The trimmer lying in the pat pat's trailer (menu, the start of the very first job, driving). */
  trailerTrimmer: THREE.Object3D | null = null;
  /** The pat pat (it moves when driven): the trailer and the head, their wheels and the steering wheel. */
  /** The pat pat as drawn (its head carries the engine the exhaust smoke comes from). */
  patRig: PatpatRig | null = null;

  /** A field opened (bought): its chain and padlock come off, its board loses the KİLİTLİ band. */
  unlockField(id: number, name: string): void {
    for (const o of this.group.getObjectsByProperty('name', `lock-${id}`)) o.visible = false;
    const old = this.group.getObjectByName(`board-${id}`);
    if (!old?.parent) return;
    const board = nameBoard(name, `${id}. iş`, false);
    board.position.copy(old.position);
    board.rotation.copy(old.rotation);
    board.name = old.name;
    old.parent.add(board);
    old.removeFromParent();
  }

  /** A new paint on the pat pat standing in the scene. */
  repaintPatpat(hue: number | null): void {
    this.patRig?.setPaint(hue);
  }
  /** The lane ribbon: its vertices follow the ruts the wheels press into it. */
  readonly lane: LaneView;
  /** The yard's sliding gate leaf (it moves with the field's gateOpen). */
  private gate: THREE.Object3D[] | null = null;
  /** Which way the leaf slides open: towards the gap's b end (else past a). */
  private gateToB = true;
  /** The height of the gate's rail (the gap's): it runs level, not up and down the ground beside it. */
  private gateY = 0;

  /** Where the driver's hands hold the steering wheel: [right, left], world space. */
  /** The driver's eyes on the pat pat's seat, and the way the pat pat faces (pitched with it), world space. */
  driverView(eye: THREE.Vector3, ahead: THREE.Vector3): boolean {
    const r = this.patRig;
    if (!r) return false;
    r.kasa.updateMatrixWorld(true);
    eye.set(0, r.seatY + 0.82, PATPAT.seat - 0.05).applyMatrix4(r.kasa.matrixWorld);
    ahead.set(0, 0, 1).transformDirection(r.kasa.matrixWorld);
    return true;
  }

  /** The pat pat's chassis object (null without the model). */
  get chassis(): THREE.Object3D | null {
    return this.patRig?.kasa ?? null;
  }

  steeringGrips(): [THREE.Vector3, THREE.Vector3] | null {
    const r = this.patRig;
    if (!r) return null;
    return [r.grips[0].getWorldPosition(new THREE.Vector3()), r.grips[1].getWorldPosition(new THREE.Vector3())];
  }
  readonly bushes: THREE.Object3D[] = [];
  private readonly stream: StreamView | null = null;
  /** The highest level id the player may take on (for the padlocks on the other fields' boards). */
  static unlockedUpTo = 99;
  /** The pat pat's paint (hue 0..1, null = its own blue) and the yard decorations bought. */
  static paintHue: number | null = null;
  /** The back-pack machine is the one in use: it rides in the trailer with the trimmer. */
  static backpack = false;
  static decor: string[] = [];
  /** Per level: the line under its name on the board ("Hazır", or how long until it has grown back). */
  static waitText: Record<number, string> = {};
  /** One object per bramble patch (shrinks as it is cut down). */
  private readonly brambles: THREE.Object3D[] = [];
  /** Materials of each bush (cloned per bush) so a bush hiding the worker can be faded. */
  private readonly bushMats: THREE.Material[][] = [];
  private readonly fade: number[] = [];
  private readonly bushShake: { obj: THREE.Object3D; t: number; base: THREE.Euler }[] = [];

  /** `trees`: how many broadleaf trees to scatter round the field. */
  constructor(readonly field: Field, cutTexture: THREE.Texture, models: Models, shadows: boolean, shadowSize: number, trees = 14, trimmerInTrailer = false, shoots = 11) {
    const f = field;
    const g = this.group;
    const look = WEATHER[f.level.weather];
    this.sunDir = look.sunDir;
    // The painted sky (sunny and clear) only on a fine day; rain and fog keep the drawn grey sky.
    const panorama = f.level.weather === 'sunny' ? models.panorama : undefined;
    g.add(skyDome(panorama, ((models.panoramaTurn ?? 0) * Math.PI) / 180, { top: look.skyTop, haze: look.haze, sun: look.sunDir, glow: look.glow }));
    // The hills start inside the terrain's edge and rise from its height there, clamped to the terrain;
    // round its middle, an ellipse as long as the village.
    const tr = terrainRect(f);
    const cx = (tr.minX + tr.maxX) / 2;
    const cz = (tr.minZ + tr.maxZ) / 2;
    const edge = (x: number, z: number) => f.height(Math.max(tr.minX, Math.min(tr.maxX, x + cx)), Math.max(tr.minZ, Math.min(tr.maxZ, z + cz)));
    const hillRing = hills(f.level.seed + 77, (tr.maxX - tr.minX) / 2 - 8, !!panorama, edge, (tr.maxZ - tr.minZ) / 2 - 8);
    hillRing.position.set(cx, 0, cz);
    g.add(hillRing);
    this.lane = new LaneView(f, { height: (x, z) => worldHeight(f, x, z), base: (x, z) => groundHeight(f, x, z), surface: (x, z, r, b) => laneSurface(f, x, z, r, b) });
    g.add(terrain(f, cutTexture, this.lane));

    // Light by the weather (sunny: warm afternoon, golden sun from the west, cool sky fill, green bounce).
    this.hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemi);
    g.add(this.hemi);
    this.sun = new THREE.DirectionalLight(look.sunColor, look.sun);
    this.sun.position.copy(look.sunDir).multiplyScalar(30);
    this.sun.castShadow = shadows;
    if (shadows) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -16;
      c.right = c.top = 16;
      c.near = 1;
      c.far = 70;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.03;
      // Softer edges (PCF filtering radius).
      this.sun.shadow.radius = 3;
    }
    g.add(this.sun, this.sun.target);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    // Hazelnut bushes (other kinds get an empty stand-in so the indices match the field's bushes).
    const custom = models.bush;
    const shoot = models.shoot?.[0];
    const ocak = f.bushes.filter((b) => b.kind === 'ocak');
    if (ocak.length < f.bushes.length) {
      for (const b of f.bushes) {
        if (b.kind === 'ocak') continue;
        const o = new THREE.Group();
        o.position.set(b.x, f.height(b.x, b.z), b.z);
        this.addBush(o);
      }
      this.buildOthers(f, models, mat);
    } else if (shoot) {
      for (const b of f.bushes) {
        const o = shootBush(shoot, b.variant, shoots);
        o.position.set(b.x, f.height(b.x, b.z) - 0.05, b.z);
        o.rotation.y = b.rot;
        o.scale.setScalar(b.scale);
        g.add(o);
        this.addBush(o);
      }
    } else if (custom?.length) {
      for (const b of f.bushes) {
        const o = fitted(custom[b.variant % custom.length].scene, 3 * b.scale);
        o.position.set(b.x, f.height(b.x, b.z) - 0.05, b.z);
        o.rotation.y = b.rot;
        g.add(o);
        this.addBush(o);
      }
    } else {
      for (const b of f.bushes) {
        const m = hazelnutBush(b.variant);
        m.position.set(b.x, f.height(b.x, b.z) - 0.05, b.z);
        m.rotation.y = b.rot;
        m.scale.setScalar(b.scale);
        g.add(m);
        this.addBush(m);
      }
    }

    // Stones
    if (models.stone?.length) {
      for (const s of f.stones) {
        const o = fitted(models.stone[0].scene, s.r * 1.6);
        o.position.set(s.x, f.height(s.x, s.z) - s.r * 0.1, s.z);
        o.rotation.y = s.rot;
        g.add(o);
      }
    } else {
      // The painted look: rounded mossy boulders, smooth shaded.
      const sm = PAINTED_GROUND
        ? new THREE.InstancedMesh(paintedStoneGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), f.stones.length)
        : new THREE.InstancedMesh(stoneGeometry(), mat, f.stones.length);
      const o = new THREE.Object3D();
      f.stones.forEach((s, i) => {
        // Their tops stand clear of the thin grass round them.
        o.position.set(s.x, f.height(s.x, s.z) - s.r * 0.05, s.z);
        o.rotation.set(0, s.rot, 0);
        o.scale.set(s.r, s.r * 1.35, s.r);
        o.updateMatrix();
        sm.setMatrixAt(i, o.matrix);
      });
      sm.castShadow = true;
      g.add(sm);
    }

    // The village's stream (beside this field or further off).
    this.stream = PAINTED_GROUND
      ? new StreamView(f, (x, z) => worldHeight(f, x, z), look.sunDir, paintedStoneGeometry(9), new THREE.MeshLambertMaterial({ vertexColors: true }))
      : new StreamView(f, (x, z) => worldHeight(f, x, z), look.sunDir, stoneGeometry(), mat);
    g.add(this.stream.group);

    // Bramble patches
    f.brambles.forEach((b, i) => {
      const o = brambleObject(i, b.r);
      o.position.set(b.x, f.height(b.x, b.z) - 0.03, b.z);
      o.rotation.y = b.rot;
      o.userData.r = b.r;
      g.add(o);
      this.brambles.push(o);
    });

    // Wooden fence on three sides (the low side opens onto the village path). Where the stream runs
    // along the right side there is no fence there: the worker can go down to the water.
    const posts: THREE.Vector3[] = [];
    const fx = f.width / 2 + 2.9;
    const fzTop = -f.depth / 2 - 2.9;
    const fzBot = f.depth / 2 + 1.5;
    const theme = f.level.theme;
    const wall = theme === 'mezarlik';
    const rightFence = !f.hasStream && !wall;
    if (!wall) {
      for (let z = fzTop; z <= fzBot; z += 2.4) {
        posts.push(new THREE.Vector3(-fx, 0, z));
        if (rightFence) posts.push(new THREE.Vector3(fx, 0, z));
      }
      for (let x = -fx + 2.4; x < fx; x += 2.4) posts.push(new THREE.Vector3(x, 0, fzTop));
    } else {
      // Cami avlusu: a low stone wall round the yard, open at the bottom.
      const wx = f.wallX;
      const top = f.wallTop;
      const bot = f.wallBottom;
      const gate = f.wallGate;
      const pts = (xs: [number, number][]) => xs.map(([x, z]) => new THREE.Vector3(x, worldHeight(f, x, z), z));
      const side = (x0: number, z0: number, x1: number, z1: number) => {
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2));
        return pts(Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n] as [number, number]));
      };
      g.add(stoneWall([...side(-gate, bot, -wx, bot), ...side(-wx, bot, -wx, top).slice(1), ...side(-wx, top, wx, top).slice(1), ...side(wx, top, wx, bot).slice(1), ...side(wx, bot, gate, bot).slice(1)]));
    }
    const pm = new THREE.InstancedMesh(postGeometry(), mat, posts.length);
    const o = new THREE.Object3D();
    posts.forEach((p, i) => {
      p.y = worldHeight(f, p.x, p.z);
      o.position.copy(p);
      o.rotation.set((Math.sin(i * 7.1) * 0.06), 0, Math.cos(i * 3.3) * 0.06);
      o.updateMatrix();
      pm.setMatrixAt(i, o.matrix);
    });
    pm.castShadow = true;
    g.add(pm);
    const wire: number[] = [];
    const line = (a: THREE.Vector3, b: THREE.Vector3) => {
      for (const hgt of [0.55, 1.0]) wire.push(a.x, a.y + hgt, a.z, b.x, b.y + hgt, b.z);
    };
    const left = posts.filter((p) => p.x === -fx).sort((a, b) => a.z - b.z);
    const right = posts.filter((p) => p.x === fx).sort((a, b) => a.z - b.z);
    const top = posts.filter((p) => p.z === fzTop).sort((a, b) => a.x - b.x);
    for (const row of [left, right, top]) for (let i = 1; i < row.length; i++) line(row[i - 1], row[i]);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    g.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#8d8a80' })));

    // Depot: fuel can and spare line, with a ring on the ground showing where to stand.
    const depot = models.fuelcan?.length || models.spool?.length ? depotModels(models) : models.depot?.length ? fitted(models.depot[0].scene, 0.6) : depotGroup();
    const body = models.patpat?.[0];
    const teker = models.patpatTeker?.[0];
    if (body && teker) {
      const rig = new PatpatRig({ body, teker, direksiyon: models.patpatDireksiyon?.[0] }, WorldView.paintHue);
      this.patRig = rig;
      // The fuel can and the spare line ride in the trailer, behind the seat.
      depot.position.set(-0.3, rig.floorY, -0.5);
      depot.rotation.y = Math.PI / 2;
      depot.scale.setScalar(0.9);
      rig.kasa.add(depot);
      // The trimmer rides in the trailer whenever the worker hasn't got it (menu, first job, driving).
      if (models.trimmer?.[0]) {
        // Engine on the floor at the back, the shaft rising forward so the head stands up beside the seat.
        const from = new THREE.Vector3(0.3, rig.floorY, -1.15);
        const to = new THREE.Vector3(0.45, rig.floorY + 0.38, -0.05);
        // Without the baked line strands: it gets line only when the worker fits it.
        const t = cutTriangles(prepare(models.trimmer[0].scene), isBakedLine, true);
        // (Its box is still the whole model's, so cutting the engine off keeps it in place.)
        const tb = new THREE.Box3().setFromObject(t);
        if (WorldView.backpack) cutTriangles(t, isEngine);
        const tk = from.distanceTo(to) / (tb.max.x - tb.min.x);
        t.scale.setScalar(tk);
        // Model shaft runs along +X from the engine (-X) to the head (+X).
        t.position.set(-tb.min.x * tk, -((tb.min.y + tb.max.y) / 2) * tk, -((tb.min.z + tb.max.z) / 2) * tk);
        const lean = new THREE.Group();
        lean.add(t);
        lean.position.copy(from);
        lean.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), to.clone().sub(from).normalize());
        // Turn it on its axis so the guard faces outwards.
        lean.rotateX(Math.PI / 2);
        const load = new THREE.Group();
        load.add(lean);
        if (WorldView.backpack && models.backpack?.[0]) {
          // The pack stands at the back of the trailer, the shaft's end beside it.
          const pack = backpackPart(models.backpack[0], 0.5);
          pack.position.set(0.25, rig.floorY, -1.05);
          pack.rotation.y = Math.PI;
          load.add(pack);
        }
        rig.kasa.add(load);
        load.visible = trimmerInTrailer;
        this.trailerTrimmer = load;
      }
      g.add(rig.kasa, rig.head);
      rig.place(f, (x, z) => worldHeight(f, x, z));
    } else {
      depot.position.set(f.depot.x - 0.8, worldHeight(f, f.depot.x - 0.8, f.depot.z + 0.6), f.depot.z + 0.6);
      g.add(depot);
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 2.2, 40),
      new THREE.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.6, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(f.depot.x, f.height(f.depot.x, f.depot.z) + 0.06, f.depot.z);
    this.depotRing = ring;
    g.add(ring);

    // The village's buildings: the house, the mosque above the graveyard, the highland hut.
    const { x: hx, z: hz, rot } = f.house;
    const house = models.house?.length ? fitted(models.house[0].scene, 7) : houseGroup();
    house.position.set(hx, worldHeight(f, hx, hz) - 0.3, hz);
    house.rotation.y = rot;
    g.add(house);
    const mosque = models.mosque?.length ? fitted(models.mosque[0].scene, 12) : mosqueGroup();
    mosque.position.set(f.mosque.x, worldHeight(f, f.mosque.x, f.mosque.z) - 0.3, f.mosque.z);
    g.add(mosque);
    if (f.hut) {
      const hut = models.hut?.length ? fitted(models.hut[0].scene, 5) : yaylaHutGroup();
      hut.position.set(f.hut.x, worldHeight(f, f.hut.x, f.hut.z) - 0.2, f.hut.z);
      hut.rotation.y = 0.6;
      g.add(hut);
    }
    // The other fields, the cobbled road to the mosque, the village's name board.
    const at = (x: number, z: number) => worldHeight(f, x, z);
    // Low quality (fewest trees) draws the other fields without their bushes.
    g.add(otherFields(f, at, WorldView.unlockedUpTo, trees > 8, models.shoot?.[0], WorldView.waitText), cobbleRoads(f, at), villageBoard(f, at));
    // This job's name board by its way in.
    if (theme !== 'mezarlik') {
      const board = nameBoard(f.level.name, `${f.level.id}. iş`, false);
      const { x: bx, z: bz } = boardSpot(f, f.entryX, f.depth / 2 + 3.9);
      board.position.set(bx, at(bx, bz), bz);
      g.add(board);
    }
    // The muddy lane from the house down to the field, trees along both sides.
    g.add(this.lane.group, puddleMeshes(f, (x, z) => worldHeight(f, x, z)));
    const harman = harmanMesh(f, (x, z) => worldHeight(f, x, z));
    if (harman) g.add(harman);
    // The yard: a wire-mesh fence round the house and the harman with a sliding iron gate, haystacks
    // and a woodpile.
    // One fence per unbroken run of segments.
    let run: THREE.Vector3[] = [];
    f.yardWalls.forEach((w, i) => {
      const prev = f.yardWalls[i - 1];
      if (!prev || prev.bx !== w.ax || prev.bz !== w.az) {
        if (run.length > 1) g.add(wireFence(run));
        run = [new THREE.Vector3(w.ax, worldHeight(f, w.ax, w.az), w.az)];
      }
      run.push(new THREE.Vector3(w.bx, worldHeight(f, w.bx, w.bz), w.bz));
    });
    if (run.length > 1) g.add(wireFence(run));
    const yg = f.yardGate;
    if (yg) {
      // One leaf across the whole gap, sliding along the fence to the right as seen from the yard
      // (driving out of it), on a rail at the gap's height.
      const len = Math.hypot(yg.bx - yg.ax, yg.bz - yg.az);
      const leaf = slidingGate(len);
      leaf.rotation.y = -Math.atan2(yg.bz - yg.az, yg.bx - yg.ax);
      this.gate = [leaf];
      g.add(leaf);
      const mx = (yg.ax + yg.bx) / 2;
      const mz = (yg.az + yg.bz) / 2;
      const fx = f.harman.x - mx;
      const fz = f.harman.z - mz;
      // Facing (fx, fz), the right is (-fz, fx).
      // Facing out of the yard, (-fx, -fz): its right is (fz, -fx).
      this.gateToB = (yg.bx - mx) * fz + (yg.bz - mz) * -fx > 0;
      this.gateY = worldHeight(f, mx, mz);
      this.placeGate();
    }
    f.yardProps.forEach((y, i) => {
      const o = y.kind === 'hay' ? haystackGroup(y.r, f.level.seed + i) : y.kind === 'wood' ? woodpileGroup(y.r, f.level.seed + i) : oldPostGroup(f.level.seed + i);
      o.position.set(y.x, worldHeight(f, y.x, y.z) - 0.05, y.z);
      o.rotation.y = i * 1.7;
      g.add(o);
    });
    // The yard decorations bought: by the house, round the harman (clear of the gate and the haystacks).
    const yg2 = f.yardGate;
    if (yg2 && WorldView.decor.length) {
      const p = f.plateau;
      const gate = Math.atan2((yg2.az + yg2.bz) / 2 - p.z, (yg2.ax + yg2.bx) / 2 - p.x);
      const ring = (a: number, r: number) => ({ x: p.x + Math.cos(gate + a) * r, z: p.z + Math.sin(gate + a) * r });
      const put = (o: THREE.Object3D, at: { x: number; z: number }, rot: number) => {
        o.position.set(at.x, worldHeight(f, at.x, at.z) - 0.03, at.z);
        o.rotation.y = rot;
        g.add(o);
      };
      const toCentre = (at: { x: number; z: number }) => Math.atan2(p.x - at.x, p.z - at.z);
      if (WorldView.decor.includes('saksi')) put(flowerPots(3), { x: f.house.x + 3.4, z: f.house.z - 1.6 }, Math.PI / 2);
      if (WorldView.decor.includes('cardak')) {
        const at = ring(-2.1, p.r - 3);
        // The artist's gazebo (about 3 m to the roof top), or the drawn one.
        put(models.gazebo?.[0] ? fitted(models.gazebo[0].scene, 3) : gazebo(5), at, toCentre(at));
      }
      if (WorldView.decor.includes('kulube')) {
        const at = ring(-1.2, p.r - 1.8);
        // The artist's kennel (about 1.1 m to the roof ridge), or the drawn one.
        put(models.kennel?.[0] ? fitted(models.kennel[0].scene, 1.1) : kennel(7), at, toCentre(at));
      }
      if (WorldView.decor.includes('camasir')) {
        const at = ring(1.5, p.r - 2.2);
        put(clothesline(9), at, toCentre(at) + Math.PI / 2);
      }
    }
    // The neighbour's hose comes from a coil lying outside the left fence.
    if (f.hose.length > 1 && models.hose?.[0]) {
      const c = fitted(models.hose[0].scene, 0.35);
      const p = f.hose[0];
      c.position.set(p.x - 0.8, worldHeight(f, p.x - 0.8, p.z), p.z);
      g.add(c);
    }

    // Trees over the village and along its tracks.
    g.add(villageTrees(f, at, trees * 4));
  }

  /** Gravestones and boulders. */
  private buildOthers(f: Field, models: Models, mat: THREE.Material): void {
    const g = this.group;
    const o = new THREE.Object3D();
    const inst = (geo: THREE.BufferGeometry, items: { x: number; z: number; rot: number; sx: number; sy: number; sz: number; y?: number }[]) => {
      if (!items.length) return;
      const m = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => {
        o.position.set(it.x, (it.y ?? f.height(it.x, it.z)) - 0.04, it.z);
        o.rotation.set(0, it.rot, 0);
        o.scale.set(it.sx, it.sy, it.sz);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    };
    const graves = f.bushes.filter((b) => b.kind === 'mezar');
    if (graves.length) {
      const model = models.grave?.[0];
      if (model) {
        for (const b of graves) {
          const t = fitted(model.scene, 1.1 * b.scale);
          t.position.set(b.x, f.height(b.x, b.z) - 0.04, b.z);
          t.rotation.y = b.rot;
          g.add(t);
        }
      } else for (let v = 0; v < 3; v++) inst(graveGeometry(v), graves.filter((b) => b.variant === v).map((b) => ({ x: b.x, z: b.z, rot: b.rot, sx: b.scale, sy: b.scale, sz: b.scale })));
    }
    // Boulders: dark weathered rock with moss (the plain stone geometry reads as white in the sun).
    const rocks = f.bushes.filter((b) => b.kind === 'kaya');
    inst(boulderGeometry(), rocks.map((b) => ({ x: b.x, z: b.z, rot: b.rot, sx: 0.8 * b.scale, sy: 1.1 * b.scale, sz: 0.75 * b.scale, y: f.height(b.x, b.z) + 0.1 * b.scale })));
  }

  private addBush(o: THREE.Object3D): void {
    const mats: THREE.Material[] = [];
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const list = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => x.clone());
      m.material = Array.isArray(m.material) ? list : list[0];
      mats.push(...list);
    });
    this.bushes.push(o);
    this.bushMats.push(mats);
    this.fade.push(1);
  }

  /** Shake a bush the line just knocked. */
  shakeBush(index: number): void {
    const obj = this.bushes[index];
    if (!obj) return;
    const ex = this.bushShake.find((s) => s.obj === obj);
    if (ex) ex.t = 0;
    else this.bushShake.push({ obj, t: 0, base: obj.rotation.clone() });
  }

  update(dt: number, time: number, playerX: number, playerZ: number, camera: THREE.Vector3 | null, fpv = false): void {
    this.stream?.update(time);
    this.field.brambles.forEach((b, i) => {
      const o = this.brambles[i];
      // Cut down from the top and thinned out as the line chews through it.
      const k = b.r / 0.85;
      o.scale.set(k * (0.55 + 0.45 * b.hp), 1.2 * (0.2 + 0.8 * b.hp), k * (0.55 + 0.45 * b.hp));
      o.visible = b.hp > 0;
    });
    this.fadeOccluders(dt, playerX, playerZ, camera, fpv);
    // Keep the shadow camera on the worker.
    this.sun.position.copy(this.sunDir).multiplyScalar(28).add(new THREE.Vector3(playerX, this.field.height(playerX, playerZ), playerZ));
    this.sun.target.position.set(playerX, this.field.height(playerX, playerZ), playerZ);

    this.placeVehicle(dt, camera);
    const v = this.field.vehicle;
    this.patRig?.update(v.speed * dt, v.art);
    this.patRig?.kasa.updateMatrixWorld(true);
    for (let i = this.bushShake.length - 1; i >= 0; i--) {
      const s = this.bushShake[i];
      s.t += dt;
      const k = Math.exp(-s.t * 5) * Math.sin(s.t * 30) * 0.05;
      s.obj.rotation.set(s.base.x + k, s.base.y, s.base.z + k * 0.6);
      if (s.t > 1) {
        s.obj.rotation.copy(s.base);
        this.bushShake.splice(i, 1);
      }
    }
  }

  /** The gate slid along the fence line by how far it is open. */
  private placeGate(): void {
    const f = this.field;
    const g = f.yardGate;
    if (!g || !this.gate) return;
    // The leaf runs from a to b when shut; open, it has slid its whole length past one end post.
    const s = (this.gateToB ? 1 : -1) * f.gateOpen;
    const x = g.ax + (g.bx - g.ax) * s;
    const z = g.az + (g.bz - g.az) * s;
    this.gate[0].position.set(x, this.gateY, z);
  }

  /** The pat pat on the ground where it is: pitched and rolled to the terrain under its wheels. */
  private placeVehicle(dt: number, camera: THREE.Vector3 | null): void {
    const f = this.field;
    this.lane.update(dt, camera);
    this.placeGate();
    this.depotRing.position.set(f.depot.x, worldHeight(f, f.depot.x, f.depot.z) + 0.06, f.depot.z);
    this.patRig?.place(f, (x, z) => worldHeight(f, x, z));
  }

  /** Fade bushes that stand between the camera and the worker. */
  private fadeOccluders(dt: number, px: number, pz: number, cam: THREE.Vector3 | null, fpv: boolean): void {
    const f = this.field;
    const py = f.height(px, pz) + 1;
    for (let i = 0; i < this.bushes.length; i++) {
      const b = f.bushes[i];
      let want = 1;
      if (cam && fpv) {
        // First person: the crown right above the worker's head would fill the screen.
        if (Math.hypot(cam.x - b.x, cam.z - b.z) < 1.7 * b.scale) want = 0.35;
      } else if (cam) {
        // Distance from the bush crown to the camera→worker segment, in the ground plane plus height.
        const by = f.height(b.x, b.z) + 2.2 * b.scale;
        const dx = px - cam.x;
        const dy = py - cam.y;
        const dz = pz - cam.z;
        const len2 = dx * dx + dy * dy + dz * dz;
        const t = Math.max(0, Math.min(1, ((b.x - cam.x) * dx + (by - cam.y) * dy + (b.z - cam.z) * dz) / len2));
        const d = Math.hypot(cam.x + dx * t - b.x, cam.y + dy * t - by, cam.z + dz * t - b.z);
        if (t > 0.05 && t < 0.97 && d < 1.9 * b.scale) want = 0.3;
      }
      const cur = this.fade[i];
      if (Math.abs(cur - want) < 0.001) continue;
      const next = cur + (want - cur) * Math.min(1, dt * 8);
      this.fade[i] = Math.abs(next - want) < 0.01 ? want : next;
      for (const m of this.bushMats[i]) {
        m.transparent = this.fade[i] < 0.999;
        m.opacity = this.fade[i];
        m.depthWrite = this.fade[i] > 0.6;
        // Alpha-cut leaf cards: lower the cut-off with the opacity or the faded leaves vanish entirely.
        if (m.userData.alphaTest === undefined) m.userData.alphaTest = m.alphaTest;
        if (m.userData.alphaTest > 0) m.alphaTest = m.userData.alphaTest * this.fade[i];
      }
    }
  }
}

/** Haze colour (fog and background). */
export { HAZE as SKY_HORIZON } from './scenery';
