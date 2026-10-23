import { BRAMBLE, BUSH_KINDS, BushKind, CELL, CUT_HEIGHT, HIVE, HOSE, LevelDef, MOWN_AT, PATPAT, SLOPE } from './config';
import { makeNoise, makeRng } from './rng';
import { ASPHALT_X, Pt, Region, RoadKind, entryX, fieldRect, placement, regionLevels, regionOf, streamX as villageStreamX, village } from './village';

export interface Bush {
  kind: BushKind;
  x: number;
  z: number;
  /** Visual variant and size, chosen deterministically. */
  variant: number;
  scale: number;
  rot: number;
  /** Seconds until this bush can register another knock. */
  cooldown: number;
  knocks: number;
}

/** How far round a stone the grass grows thin and short, metres. */
export const STONE_RING = 0.45;

export interface Stone {
  x: number;
  z: number;
  r: number;
  rot: number;
  cooldown: number;
  /** Time until the next near-miss warning; hit at least once (then marked for the rest of the job). */
  warn?: number;
  hit?: boolean;
}

/** A bramble patch: cut down by the line (hp 1 → 0), wraps the line while being cut. */
export interface Bramble {
  x: number;
  z: number;
  r: number;
  rot: number;
  /** Remaining 0..1; 0 = cleared. */
  hp: number;
}

export interface Hive {
  x: number;
  z: number;
  rot: number;
  /** 0..1; at 1 the bees swarm out. */
  anger: number;
  /** Swarm position and time left chasing (0 = at home). */
  sx: number;
  sz: number;
  swarm: number;
  stingT: number;
  /** Stings given by the current swarm, and quiet time left after one. */
  stung: number;
  rest: number;
}

export interface Snake {
  x: number;
  z: number;
  yaw: number;
  state: 'hidden' | 'flee' | 'gone';
  t: number;
}

export interface Hen {
  x: number;
  z: number;
  yaw: number;
  /** Where it is walking to, and for how long it pecks there. */
  tx: number;
  tz: number;
  t: number;
  speed: number;
  state: 'wander' | 'panic' | 'gone';
}

/** Changed region of the grass grid since the last `takeDirty()`, in cell indices (inclusive). */
export interface DirtyRect {
  i0: number;
  j0: number;
  i1: number;
  j1: number;
}

/** Bush size: a quarter young and small, most mature, a few old big ones. */
function bushScale(r: number): number {
  if (r < 0.25) return 0.72 + r * 0.8;
  if (r < 0.9) return 0.95 + (r - 0.25) * 0.4;
  return 1.25 + (r - 0.9) * 1.5;
}

/** Tallest grass relative to the normal sward (tall weed patches), and giant weeds (dev ot). */
export const TALL_GRASS = 2;
export const GIANT_GRASS = 2.4;
/** The grass texture stores height / GRASS_RANGE in 0..255. */
export const GRASS_RANGE = 3;

/** The stream: width of the water, depth of the bed below the banks, water surface below the banks. */
export const STREAM = { width: 1.5, depth: 0.6, water: 0.38 };

/** Distance from a point to a segment. */
/** Grid cell of the lane's sink map, metres; how deep the wheels can press the soft earth, and how far out from the lane's middle. */
const SINK_CELL = 0.1;
/** Road lookup grid cell, metres; distances to roads are exact up to ROAD_GRID (two cells round). */
const ROAD_CELL = 4;
const ROAD_GRID = ROAD_CELL * 2;
/** Cells per side of a tile of the sink map (tiles are made where the wheels go). */
const SINK_TILE = 40;
const SINK_MAX = 0.14;
const LANE_SOFT = 1.9;
/** Half the width of a tyre's print, and of the lip of mud it squeezes up beside it, metres. */
const PRINT = 0.15;
const LIP = 0.13;

function smooth01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Distance from a point to a polyline. */
function polyDist(x: number, z: number, pts: Pt[]): number {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(x, z, pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z));
  return d;
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

/**
 * A field to mow: terrain height, grass grid, what stands in it (hazelnut ocaks, tea rows, graves,
 * boulders), stones, brambles and the living things (hives, snakes, hens), and the hose.
 * Field is centred at the origin: x in [-width/2, width/2], z in [-depth/2, depth/2]; it climbs towards -z.
 */
export class Field {
  readonly width: number;
  readonly depth: number;
  readonly gw: number;
  readonly gd: number;
  /** Grass height per cell, ~1 = normal sward (up to TALL_GRASS in weed patches), CUT_HEIGHT = mown. 0 where nothing grows. */
  readonly grass: Float32Array;
  /** 1 where grass grows. */
  readonly mask: Uint8Array;
  readonly bushes: Bush[] = [];
  readonly stones: Stone[] = [];
  readonly brambles: Bramble[] = [];
  readonly hives: Hive[] = [];
  readonly snakes: Snake[] = [];
  readonly hens: Hen[] = [];
  /** Garden hose lying across the field (polyline), and where it was cut. */
  readonly hose: { x: number; z: number }[] = [];
  hoseCut: { x: number; z: number } | null = null;
  /** The village's stream runs right beside this field (its right side). */
  readonly hasStream: boolean;
  /** Where this field's centre lies in the village. */
  readonly origin: Pt;
  /** Yol kenarı: centre line of the road beside the field (x), else null. */
  readonly roadX: number | null;
  /** The village's asphalt road (x of its centre line, field coordinates). */
  readonly asphaltX: number;
  /** The village's ends and west edge, field coordinates. */
  readonly map: { minX: number; minZ: number; maxZ: number };
  /** The other fields of the village (closed: fenced, their gates shut), field coordinates. */
  readonly others: { level: LevelDef; minX: number; maxX: number; minZ: number; maxZ: number; entryX: number }[] = [];
  private roadGrid: Map<number, number[]> | null = null;
  private blockedCache: { minX: number; maxX: number; minZ: number; maxZ: number }[] | null = null;
  /** The village's roads (dirt tracks and the cobbled road), with their bounding boxes. */
  readonly roads: { kind: RoadKind; pts: Pt[]; box: { minX: number; maxX: number; minZ: number; maxZ: number } }[] = [];
  /** Loose ends of the roads (where the ruts fade out). */
  readonly roadEnds: Pt[] = [];
  /** Both ends of every road: loose ends and where roads meet. */
  readonly roadJoints: Pt[] = [];
  /** This field's fence (the low side open), as segments. */
  readonly fences: { ax: number; az: number; bx: number; bz: number }[] = [];
  /** The village this field is in. */
  readonly region: Region;
  /** The mosque above its graveyard and the highland hut if there is one (solid), field coordinates. */
  readonly mosque: Pt;
  readonly hut: Pt | null;
  /** Sum of the heights of the cells cut by the last cutSegment call (thick grass loads the engine more). */
  lastCutWeight = 0;
  /** Where the fuel can and spare line are kept (just below the field). */
  readonly depot: { x: number; z: number };
  /**
   * Cami avlusu: the low stone wall round the yard (outline x ±wallX, z from wallTop to wallBottom,
   * open at the bottom for |x| < wallGate), as segments the worker cannot walk through.
   */
  readonly walls: { ax: number; az: number; bx: number; bz: number }[] = [];
  readonly wallX: number;
  readonly wallTop: number;
  readonly wallBottom: number;
  readonly wallGate = 2.2;
  /** The house, and the yard in front of it where the hens peck. */
  readonly house: { x: number; z: number; rot: number };
  readonly yard: { x: number; z: number; r: number };
  /** The way (polyline) from the harman along the roads to this field's way in. */
  readonly lane: Pt[] = [];
  /** The threshing floor (harman) in front of the house, where the pat pat waits. */
  readonly harman: { x: number; z: number; r: number };
  /**
   * The yard round the house and the harman: a wire-mesh fence (segments, with a gap where the lane
   * goes out), haystacks and a woodpile (solid circles).
   */
  readonly yardWalls: { ax: number; az: number; bx: number; bz: number }[] = [];
  /** The sliding iron gate across the fence's gap (two leaves, parting from the middle), and how far it is open 0..1. */
  yardGate: { ax: number; az: number; bx: number; bz: number } | null = null;
  gateOpen = 0;
  readonly yardProps: { x: number; z: number; r: number; kind: 'hay' | 'wood' | 'post' }[] = [];
  /** Where the way comes up to the field (x of the way in, at its bottom edge). */
  readonly entryX: number;
  /** Puddles standing in the lane's wheel ruts: centre, radius, the lane's direction there. */
  readonly puddles: { x: number; z: number; r: number; dir: number }[] = [];
  /** The level ground the house and the harman stand on (the slope is levelled there). */
  readonly plateau: { x: number; z: number; r: number };
  /**
   * How far the soft earth of the tracks has been pressed down by the wheels, metres, on a grid of
   * SINK_CELL in tiles; `sinkDirty` is the area changed since the renderer last looked.
   */
  private readonly sinkTiles = new Map<number, Float32Array>();
  sinkDirty: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  /** The pat pat: centre, heading (yaw, model +Z forward), size, speed (m/s, + forward), steering -1..1. Solid for the worker. */
  readonly vehicle: { x: number; z: number; yaw: number; length: number; width: number; speed: number; steer: number; art: number };
  readonly total: number;
  private mownCount = 0;
  private dirty: DirtyRect | null = null;
  private readonly noise: (x: number, y: number) => number;
  private readonly bumps: number;
  /** z of each steep bank's middle. */
  private readonly banks: number[] = [];

  /**
   * `layoutOnly`: just where things stand (for drawing a field from afar), no grass grid.
   * `openLevel`: another field left open (the one just mown: the worker may still be in it).
   */
  constructor(readonly level: LevelDef, layoutOnly = false, readonly openLevel: number | null = null) {
    this.width = level.width;
    this.depth = level.depth;
    this.bumps = level.bumps;
    this.hasStream = !!level.stream;
    this.origin = placement(level);
    const O = this.origin;
    const local = (p: Pt): Pt => ({ x: p.x - O.x, z: p.z - O.z });
    // The village has no asphalt road any more: the roadside job is a long strip of meadow.
    this.roadX = null;
    this.asphaltX = ASPHALT_X - O.x;
    this.region = regionOf(level);
    const R = this.region;
    this.map = { minX: R.map.minX - O.x, minZ: R.map.minZ - O.z, maxZ: R.map.maxZ - O.z };
    this.noise = makeNoise(level.seed * 7 + 1);
    const nb = level.banks ?? 0;
    for (let i = 1; i <= nb; i++) this.banks.push(-this.depth / 2 + (this.depth * i) / (nb + 1) + ((i * 37) % 5) - 2);
    this.gw = Math.round(level.width / CELL);
    this.gd = Math.round(level.depth / CELL);
    this.grass = new Float32Array(this.gw * this.gd);
    this.mask = new Uint8Array(this.gw * this.gd);
    this.depot = { x: -level.width / 2 + 1.5, z: level.depth / 2 + 2.2 };
    // The pat pat (small tractor with a trailer) is parked along the path just below the refill spot,
    // facing +x; the fuel can and line are in its trailer.
    this.vehicle = { x: this.depot.x + 0.4, z: this.depot.z + 2.1, yaw: Math.PI / 2, length: 2.52, width: 1.6, speed: 0, steer: 0, art: 0 };
    // The village round the field: the house and its yard, the mosque, the hut, the roads, the other fields.
    const V = village(R);
    this.house = { ...local(R.house), rot: R.house.rot };
    this.harman = { ...local(R.harman), r: R.harman.r };
    this.plateau = { ...local(R.plateau), r: R.plateau.r };
    this.mosque = local(R.mosque);
    this.hut = R.hut ? local(R.hut) : null;
    this.lane.push(...V.routes[level.id].map(local));
    for (const r of V.roads) {
      const pts = r.pts.map(local);
      const xs = pts.map((p) => p.x);
      const zs = pts.map((p) => p.z);
      this.roads.push({ kind: r.kind, pts, box: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) } });
    }
    // Where a road ends on its own (not running into another), the ruts fade out there.
    for (const r of this.roads) this.roadJoints.push(r.pts[0], r.pts[r.pts.length - 1]);
    for (const r of this.roads) {
      for (const e of [r.pts[0], r.pts[r.pts.length - 1]]) if (!this.roads.some((o) => o !== r && polyDist(e.x, e.z, o.pts) < 1.5)) this.roadEnds.push(e);
    }
    this.entryX = entryX(level) - O.x;
    for (const lv of regionLevels(R)) {
      if (lv.id === level.id) continue;
      const r = fieldRect(lv);
      this.others.push({ level: lv, minX: r.minX - O.x, maxX: r.maxX - O.x, minZ: r.minZ - O.z, maxZ: r.maxZ - O.z, entryX: entryX(lv) - O.x });
    }
    // The fence round this field on three sides (the low side is open onto the path); none on the
    // right where the stream runs close.
    if (level.theme !== 'mezarlik') {
      const fx = this.width / 2 + 2.9;
      const top = -this.depth / 2 - 2.9;
      const bot = this.depth / 2 + 1.5;
      this.fences.push({ ax: -fx, az: bot, bx: -fx, bz: top }, { ax: -fx, az: top, bx: fx, bz: top });
      if (!this.hasStream) this.fences.push({ ax: fx, az: top, bx: fx, bz: bot });
    }
    this.buildYard();
    this.placePuddles(makeRng(level.seed * 13 + 7));
    this.wallX = level.width / 2 + 1.6;
    this.wallTop = -level.depth / 2 - 1.6;
    this.wallBottom = level.depth / 2 + 1.2;
    if (level.theme === 'mezarlik') {
      const [x, t, b, g] = [this.wallX, this.wallTop, this.wallBottom, this.wallGate];
      this.walls.push({ ax: -g, az: b, bx: -x, bz: b }, { ax: -x, az: b, bx: -x, bz: t }, { ax: -x, az: t, bx: x, bz: t }, { ax: x, az: t, bx: x, bz: b }, { ax: x, az: b, bx: g, bz: b });
    }
    // The yard in front of the house, where the hens peck: the harman.
    this.yard = { x: this.harman.x - 1, z: this.harman.z + 0.5, r: 3 };

    const rnd = makeRng(level.seed);
    switch (level.theme) {
      case 'mezarlik':
        this.placeGraves(rnd);
        break;
      case 'yayla':
      case 'yol':
        this.placeBoulders(rnd, level.theme === 'yol' ? 2 : Math.round((level.width * level.depth) / 140));
        break;
      default:
        this.placeBushes(rnd);
    }
    this.placeBrambles(rnd);
    this.placeStones(rnd);
    // Living things and the hose use their own random stream, so adding them keeps the layout above.
    const rnd2 = makeRng(level.seed * 31 + 5);
    this.placeHives(rnd2, level.hives ?? 0);
    this.placeSnakes(rnd2, level.snakes ?? 0);
    this.placeHens(rnd2, level.chickens ?? 0);
    if (level.hose) this.placeHose(rnd2);

    let total = 0;
    for (let j = 0; j < (layoutOnly ? 0 : this.gd); j++) {
      for (let i = 0; i < this.gw; i++) {
        const x = this.cellX(i);
        const z = this.cellZ(j);
        let grows = true;
        for (const b of this.bushes) {
          const r = BUSH_KINDS[b.kind].trunk * (b.kind === 'ocak' ? 1 : b.scale);
          if ((x - b.x) ** 2 + (z - b.z) ** 2 < r * r) grows = false;
        }
        // Round a stone the grass is thin and short (a careful eye spots the bare ring and the stone).
        let byStone = 1;
        for (const s of this.stones) {
          const d = Math.hypot(x - s.x, z - s.z);
          if (d < s.r * 0.78) grows = false;
          else if (d < s.r + STONE_RING) {
            const t = (d - s.r) / STONE_RING;
            byStone = Math.min(byStone, 0.3 + 0.7 * Math.max(0, t));
            if (this.noise(x * 9 + 13, z * 9 - 7) > 0.15 + 0.6 * t) grows = false;
          }
        }
        for (const b of this.brambles) if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r * 0.7) grows = false;
        for (const h of this.hives) if ((x - h.x) ** 2 + (z - h.z) ** 2 < 0.5 * 0.5) grows = false;
        if (this.hose.length && this.hoseDistance(x, z) < HOSE.bare) grows = false;
        const k = j * this.gw + i;
        if (grows) {
          this.mask[k] = 1;
          // Uneven sward: lusher patches, and patches of tall weeds (more where the bushes shade less).
          const base = 0.85 + 0.15 * (0.5 + 0.5 * this.noise(x * 0.6 + 40, z * 0.6));
          const weeds = this.noise(x * 0.22 + 90, z * 0.22 - 30) * 0.8 + this.noise(x * 0.7, z * 0.7 + 60) * 0.2;
          // Highland meadows grow tall all over.
          const lush = level.theme === 'yayla' ? 0.25 : 0;
          const tall = Math.min(1, Math.max(0, (weeds - 0.12 + lush) / 0.35));
          let h = base * (1 + (TALL_GRASS - 1) * tall * tall * (3 - 2 * tall));
          if (level.giant) {
            // Dev ot: thick clumps of giant weeds, taller than a man's waist.
            const g = Math.min(1, Math.max(0, (this.noise(x * 0.3 + 200, z * 0.3 - 80) - 0.32) / 0.2));
            h = Math.max(h, base * (1 + (GIANT_GRASS - 1) * g * g * (3 - 2 * g)));
          }
          this.grass[k] = h * byStone;
          total++;
        }
      }
    }
    this.total = total;
  }

  cellX(i: number): number {
    return -this.width / 2 + (i + 0.5) * CELL;
  }

  cellZ(j: number): number {
    return -this.depth / 2 + (j + 0.5) * CELL;
  }

  /**
   * Terrain height at any point: the village's hill (village.ground) with this field's own lumps and
   * steep banks (fading out round it) and the stream bed carved in.
   */
  height(x: number, z: number): number {
    const O = this.origin;
    let h = this.region.ground(O.x + x, O.z + z) - this.streamCarve(x, z);
    // Lumps and banks belong to the field and its surroundings, not to the whole village.
    const out = Math.hypot(Math.max(0, Math.abs(x) - this.width / 2), Math.max(0, Math.abs(z) - this.depth / 2));
    if (out < 12) {
      const k = 1 - smooth01(out / 12);
      const n = this.noise(x * 0.12, z * 0.12) * 0.7 + this.noise(x * 0.31 + 17, z * 0.31) * 0.3;
      h += n * this.bumps * k;
      // Steep banks across the slope: a step up (towards -z) over about a metre, wavy along x.
      const kx = 1 - smooth01(Math.max(0, Math.abs(x) - this.width / 2 - 2) / 6);
      for (const b of this.banks) h += (SLOPE.bankRise / (1 + Math.exp((z - b - Math.sin(x * 0.21 + b) * 1.4) / SLOPE.bankWidth)) - SLOPE.bankRise * 0.5) * kx;
    }
    return h;
  }

  /** Steepness (rise per metre) and the downhill direction at a point. */
  grade(x: number, z: number): { g: number; dx: number; dz: number } {
    const e = 0.35;
    const gx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const gz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    const g = Math.hypot(gx, gz);
    return { g, dx: g > 1e-6 ? -gx / g : 0, dz: g > 1e-6 ? -gz / g : 0 };
  }

  /** x of the stream centre at z (the village's stream, down the east side). */
  streamX(z: number): number {
    return villageStreamX(this.origin.z + z) - this.origin.x;
  }

  /** Distance from a point to the stream centre line (rough). */
  streamDistance(x: number, z: number): number {
    return Math.abs(x - this.streamX(z));
  }

  /** Standing in the water. */
  inWater(x: number, z: number): boolean {
    return this.streamDistance(x, z) < STREAM.width / 2;
  }

  /** How much the terrain is lowered at (x, z) for the stream bed (0 away from it). */
  streamCarve(x: number, z: number): number {
    const d = Math.abs(x - this.streamX(z));
    const half = STREAM.width / 2 + 0.5;
    if (d > half + 0.6) return 0;
    // Flat bottom, sloping banks.
    const t = Math.min(1, Math.max(0, (half + 0.6 - d) / 1.1));
    return STREAM.depth * t * t * (3 - 2 * t);
  }

  /** How far the worker may go: the village's ends, its west edge and the stream's far bank. */
  bounds(z: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
    return { minX: this.map.minX, maxX: this.streamX(z) + 1.6, minZ: this.map.minZ, maxZ: this.map.maxZ };
  }

  /** Distance from a point to the middle of the nearest dirt track (Infinity far from them all). */
  laneDistance(x: number, z: number): number {
    return this.roadDist(x, z, 'dirt');
  }

  /** Distance from a point to the middle of the nearest road of any kind (dirt or cobbled). */
  roadDistance(x: number, z: number): number {
    return this.roadDist(x, z, null);
  }

  /**
   * Distance to the nearest road segment of a kind, exact up to ROAD_GRID metres (Infinity beyond):
   * only the segments listed in the grid cells round the point are looked at.
   */
  private roadDist(x: number, z: number, kind: RoadKind | null): number {
    const grid = (this.roadGrid ??= this.buildRoadGrid());
    const ci = Math.floor(x / ROAD_CELL);
    const cj = Math.floor(z / ROAD_CELL);
    // The cells next to it first (exact up to one cell); the ring round them only if nothing is that close.
    let d = Infinity;
    for (let ring = 1; ring <= 2; ring++) {
      for (let j = cj - ring; j <= cj + ring; j++) {
        for (let i = ci - ring; i <= ci + ring; i++) {
          if (ring === 2 && Math.abs(i - ci) < 2 && Math.abs(j - cj) < 2) continue;
          const list = grid.get(i * 65536 + j);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 4) {
            if (kind && this.roads[list[k]].kind !== kind) continue;
            const ax = list[k + 1];
            const az = list[k + 2];
            const r = this.roads[list[k]].pts;
            const b = r[list[k + 3] + 1];
            d = Math.min(d, segDist(x, z, ax, az, b.x, b.z));
          }
        }
      }
      if (d <= ROAD_CELL * ring) return d;
    }
    return d <= ROAD_GRID ? d : Infinity;
  }

  /** Every road segment listed in each grid cell it passes through (road, start x, start z, segment). */
  private buildRoadGrid(): Map<number, number[]> {
    const grid = new Map<number, number[]>();
    this.roads.forEach((r, ri) => {
      for (let si = 0; si + 1 < r.pts.length; si++) {
        const a = r.pts[si];
        const b = r.pts[si + 1];
        for (let j = Math.floor(Math.min(a.z, b.z) / ROAD_CELL); j <= Math.floor(Math.max(a.z, b.z) / ROAD_CELL); j++) {
          for (let i = Math.floor(Math.min(a.x, b.x) / ROAD_CELL); i <= Math.floor(Math.max(a.x, b.x) / ROAD_CELL); i++) {
            const k = i * 65536 + j;
            let list = grid.get(k);
            if (!list) grid.set(k, (list = []));
            list.push(ri, a.x, a.z, si);
          }
        }
      }
    });
    return grid;
  }

  /**
   * Where the pat pat waits at the start of a job: on the harman, on its far side from the gate,
   * facing the gate (so the gate stays shut until it drives up to it).
   */
  get laneStart(): { x: number; z: number; yaw: number } | null {
    const h = this.harman;
    const g = this.yardGate;
    if (this.lane.length < 2 || !g) return null;
    const gx = (g.ax + g.bx) / 2;
    const gz = (g.az + g.bz) / 2;
    const d = Math.hypot(gx - h.x, gz - h.z) || 1;
    const x = h.x - ((gx - h.x) / d) * 2.2;
    const z = h.z - ((gz - h.z) / d) * 2.2;
    return { x, z, yaw: Math.atan2(gx - x, gz - z) };
  }

  /** The fence round the yard with its gate where the trunk leaves, the haystacks and the woodpile. */
  private buildYard(): void {
    const p = this.plateau;
    const R = p.r - 0.4;
    // The gate: where the way out crosses the fence's circle.
    const out = this.lane.find((q) => Math.hypot(q.x - p.x, q.z - p.z) >= R) ?? this.lane[0];
    const gate = Math.atan2(out.z - p.z, out.x - p.x);
    // A 6 m gap: the pat pat swings through it at an angle.
    const half = 3.2 / R;
    const steps = Math.ceil(((Math.PI * 2 - half * 2) * R) / 2);
    let prev: Pt | null = null;
    for (let i = 0; i <= steps; i++) {
      const a = gate + half + ((Math.PI * 2 - half * 2) * i) / steps;
      // Put up by hand: the line wanders in and out a little.
      const rr = R * (1 + 0.06 * Math.sin(a * 3 + 1.7) + 0.03 * Math.sin(a * 7 + 1));
      const q = { x: p.x + Math.cos(a) * rr, z: p.z + Math.sin(a) * rr };
      if (prev) this.yardWalls.push({ ax: prev.x, az: prev.z, bx: q.x, bz: q.z });
      prev = q;
    }
    // Wherever a road runs close by, the fence was never put up (it would be in the way).
    for (let i = this.yardWalls.length - 1; i >= 0; i--) {
      const w = this.yardWalls[i];
      if (this.roadDistance((w.ax + w.bx) / 2, (w.az + w.bz) / 2) < LANE_SOFT + 0.2) this.yardWalls.splice(i, 1);
    }
    // The gate spans the gap, from the fence's last post round to its first (so it also closes any
    // stretch left out beside it).
    const first = this.yardWalls[0];
    const last = this.yardWalls[this.yardWalls.length - 1];
    this.yardGate = { ax: last.bx, az: last.bz, bx: first.ax, bz: first.az };
    // Haystacks across the yard from the gate, the woodpile against the house's side.
    for (const [da, r] of [[2.5, 1.15], [2.9, 1.0]] as const) {
      const a = gate + da;
      this.yardProps.push({ x: p.x + Math.cos(a) * (R - 2.2), z: p.z + Math.sin(a) * (R - 2.2), r, kind: 'hay' });
    }
    this.yardProps.push({ x: this.house.x + 0.6, z: this.house.z + 3.7, r: 0.8, kind: 'wood' });
    // Two old posts either side of the way into this field.
    if (this.level.theme !== 'mezarlik') for (const s of [-1, 1]) this.yardProps.push({ x: this.entryX + s * 2.6, z: this.depth / 2 + 1.2, r: 0.12, kind: 'post' });
  }

  /**
   * Every ten metres or so along the dirt tracks a puddle in one of the ruts, where the track runs level
   * enough to hold water (not on the harman, not in a field); now and then a big one across half the track.
   */
  private placePuddles(rnd: () => number): void {
    for (const road of this.roads) {
      if (road.kind !== 'dirt') continue;
      const l = road.pts;
      let next = 8;
      let run = 0;
      for (let i = 1; i < l.length; i++) {
        const a = l[i - 1];
        const b = l[i];
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        run += len;
        if (run < next) continue;
        next = run + 8 + rnd() * 9;
        const big = rnd() < 0.35;
        const off = (rnd() < 0.5 ? -1 : 1) * (big ? 0.45 : PATPAT.track);
        const x = b.x - ((b.z - a.z) / len) * off;
        const z = b.z + ((b.x - a.x) / len) * off;
        if (Math.hypot(x - this.harman.x, z - this.harman.z) < this.harman.r + 3) continue;
        if (this.inField(x, z) || this.others.some((o) => x > o.minX - 3 && x < o.maxX + 3 && z > o.minZ - 3 && z < o.maxZ + 3)) continue;
        if (this.roadJoints.some((e) => Math.hypot(e.x - x, e.z - z) < 7)) continue;
        if (this.grade(x, z).g > 0.12) continue;
        this.puddles.push({ x, z, r: big ? 0.85 + rnd() * 0.3 : 0.4 + rnd() * 0.25, dir: Math.atan2(b.x - a.x, b.z - a.z) });
      }
    }
  }

  /** Distance from a point to the yard wall's middle line (Infinity without one). */
  yardWallDistance(x: number, z: number): number {
    let d = Infinity;
    for (const w of this.yardWalls) d = Math.min(d, segDist(x, z, w.ax, w.az, w.bx, w.bz));
    return d;
  }

  /**
   * 0 at a track's loose ends rising to 1 a few metres along: where it fades into the harman and the
   * fields the ground under it is not dug in (the ruts are drawn there, not pressed).
   */
  laneEndFade(x: number, z: number): number {
    let d2 = Infinity;
    for (const e of this.roadEnds) d2 = Math.min(d2, (x - e.x) ** 2 + (z - e.z) ** 2);
    if (d2 >= 3.5 * 3.5) return 1;
    const t = Math.sqrt(d2) / 3.5;
    return t * t * (3 - 2 * t);
  }

  /** The puddle at a point, if any. */
  puddleAt(x: number, z: number): { x: number; z: number; r: number; dir: number } | null {
    for (const p of this.puddles) if (Math.abs(p.x - x) < p.r * 1.6 && Math.abs(p.z - z) < p.r * 1.6 && this.inPuddle(p, x, z) < 1) return p;
    return null;
  }

  /** Where a point lies in a puddle's ellipse (stretched 1.6× along the lane): < 1 inside. */
  inPuddle(p: { x: number; z: number; r: number; dir: number }, x: number, z: number): number {
    const dx = x - p.x;
    const dz = z - p.z;
    const along = dx * Math.sin(p.dir) + dz * Math.cos(p.dir);
    const across = dx * Math.cos(p.dir) - dz * Math.sin(p.dir);
    return Math.hypot(along / 1.6, across) / p.r;
  }

  /** The sink map cell (integer grid of SINK_CELL), stored in tiles made as the wheels reach them. */
  private sinkCell(i: number, j: number, make = false): { t: Float32Array; k: number } | null {
    const ti = Math.floor(i / SINK_TILE);
    const tj = Math.floor(j / SINK_TILE);
    const key = ti * 100003 + tj;
    let t = this.sinkTiles.get(key);
    if (!t) {
      if (!make) return null;
      t = new Float32Array(SINK_TILE * SINK_TILE);
      this.sinkTiles.set(key, t);
    }
    return { t, k: (j - tj * SINK_TILE) * SINK_TILE + (i - ti * SINK_TILE) };
  }

  private sinkValue(i: number, j: number): number {
    const c = this.sinkCell(i, j);
    return c ? c.t[c.k] : 0;
  }

  /** How far the wheels have pressed the tracks' soft earth down here, metres. */
  sinkAt(x: number, z: number): number {
    if (!this.sinkTiles.size) return 0;
    const fx = x / SINK_CELL - 0.5;
    const fz = z / SINK_CELL - 0.5;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const a = this.sinkValue(i, j) + (this.sinkValue(i + 1, j) - this.sinkValue(i, j)) * tx;
    const b = this.sinkValue(i, j + 1) + (this.sinkValue(i + 1, j + 1) - this.sinkValue(i, j + 1)) * tx;
    return a + (b - a) * tz;
  }

  /** A wheel rolls `travel` metres over (x, z): on a dirt track the soft earth gives under it. */
  press(x: number, z: number, travel: number): void {
    if (this.laneDistance(x, z) > LANE_SOFT) return;
    const r = PRINT + LIP;
    const ci = Math.round(x / SINK_CELL - 0.5);
    const cj = Math.round(z / SINK_CELL - 0.5);
    const n = Math.ceil(r / SINK_CELL);
    // The first pass sinks a little over half way, each later one deeper.
    const k = Math.min(1, travel * 3);
    for (let j = cj - n; j <= cj + n; j++) {
      for (let i = ci - n; i <= ci + n; i++) {
        const d = Math.hypot((i + 0.5) * SINK_CELL - x, (j + 0.5) * SINK_CELL - z);
        if (d > r) continue;
        const c = this.sinkCell(i, j, true)!;
        const s = c.t;
        if (d <= PRINT) {
          // Under the tyre: a flat-bottomed print.
          const max = SINK_MAX * (1 - (d / PRINT) ** 4);
          s[c.k] += Math.max(0, max - s[c.k]) * k;
        } else if (s[c.k] < 0.02) {
          // Beside it the mud squeezes up into a lip (negative sink), unless a tyre pressed it before.
          const lip = -0.035 * Math.sin(((d - PRINT) / LIP) * Math.PI);
          if (s[c.k] > lip) s[c.k] += (lip - s[c.k]) * k;
        }
      }
    }
    const b = this.sinkDirty;
    this.sinkDirty = b ? { minX: Math.min(b.minX, x - r), maxX: Math.max(b.maxX, x + r), minZ: Math.min(b.minZ, z - r), maxZ: Math.max(b.maxZ, z + r) } : { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
  }

  /**
   * Keep a point where the worker can be: inside the village (its ends, its west edge, the stream's
   * far bank) and out of the other fields (fenced off; their gates shut).
   */
  clampWalk(x: number, z: number): { x: number; z: number } {
    const b = this.bounds(z);
    x = Math.max(b.minX, Math.min(b.maxX, x));
    z = Math.max(b.minZ, Math.min(b.maxZ, z));
    for (const o of this.blocked) {
      if (x <= o.minX || x >= o.maxX || z <= o.minZ || z >= o.maxZ) continue;
      // Out by the nearest side.
      const d = [x - o.minX, o.maxX - x, z - o.minZ, o.maxZ - z];
      const m = Math.min(...d);
      if (m === d[0]) x = o.minX;
      else if (m === d[1]) x = o.maxX;
      else if (m === d[2]) z = o.minZ;
      else z = o.maxZ;
    }
    return { x, z };
  }

  /** The areas closed to the worker: the other fields within their fences (or walls), but the one left open. */
  private get blocked(): { minX: number; maxX: number; minZ: number; maxZ: number }[] {
    return (this.blockedCache ??= this.others.filter((o) => o.level.id !== this.openLevel).map((o) => {
      const wall = o.level.theme === 'mezarlik';
      const m = wall ? 1.8 : 3.1;
      // Stream-side fields: closed right down to the stream.
      return { minX: o.minX - m, maxX: o.level.stream ? o.maxX + 20 : o.maxX + m, minZ: o.minZ - m, maxZ: o.maxZ + (wall ? 1.4 : 1.7) };
    }));
  }

  /** The fuel and line ride in the pat pat's trailer: the refill spot is beside it, wherever it is parked. */
  placeDepot(): void {
    const v = this.vehicle;
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    // Right of the heading is (-fz, fx); the spot is on the left, a little behind the middle.
    this.depot.x = v.x - fx * 0.4 + fz * 2.1;
    this.depot.z = v.z - fz * 0.4 - fx * 2.1;
  }

  /**
   * The head of the pat pat for a trailer at (x, z, yaw) with the head turned by `art`: its axle centre
   * and heading, and the hitch pin.
   */
  head(x: number, z: number, yaw: number, art: number): { x: number; z: number; yaw: number; jx: number; jz: number } {
    const jx = x + Math.sin(yaw) * PATPAT.joint;
    const jz = z + Math.cos(yaw) * PATPAT.joint;
    const hy = yaw + art;
    return { x: jx + Math.sin(hy) * PATPAT.headAxle, z: jz + Math.cos(hy) * PATPAT.headAxle, yaw: hy, jx, jz };
  }

  /** Where the pat pat's four wheels touch the ground (the head's two first). */
  patpatWheels(): { x: number; z: number; head: boolean }[] {
    const v = this.vehicle;
    const h = this.head(v.x, v.z, v.yaw, v.art);
    const out: { x: number; z: number; head: boolean }[] = [];
    const ax = v.x - Math.sin(v.yaw) * PATPAT.rearAxle;
    const az = v.z - Math.cos(v.yaw) * PATPAT.rearAxle;
    for (const s of [-1, 1]) out.push({ x: h.x + Math.cos(h.yaw) * s * PATPAT.headTrack, z: h.z - Math.sin(h.yaw) * s * PATPAT.headTrack, head: true });
    for (const s of [-1, 1]) out.push({ x: ax + Math.cos(v.yaw) * s * PATPAT.kasaTrack, z: az - Math.sin(v.yaw) * s * PATPAT.kasaTrack, head: false });
    return out;
  }

  /**
   * Can the pat pat stand here (trailer centre and heading, the head turned by `art`)? Anywhere the
   * worker can walk, the field too, but not through bushes, boulders, gravestones, hives, the house
   * or into the walled mosque yard.
   */
  vehicleFits(x: number, z: number, yaw: number, art = this.vehicle.art): boolean {
    const v = this.vehicle;
    const h = this.head(x, z, yaw, art);
    // The trailer, and the head from its pin to its nose (centred a little ahead of its axle).
    const hl = PATPAT.headAxle + PATPAT.headFront;
    const hc = PATPAT.headFront - hl / 2;
    const bodies = [
      { x, z, yaw, length: v.length, width: v.width },
      { x: h.x + Math.sin(h.yaw) * hc, z: h.z + Math.cos(h.yaw) * hc, yaw: h.yaw, length: hl, width: 1.4 },
    ];
    for (const b of bodies) {
      const fx = Math.sin(b.yaw);
      const fz = Math.cos(b.yaw);
      for (const t of [-0.5, -0.25, 0, 0.25, 0.5]) {
        for (const s of [-0.5, 0, 0.5]) {
          if (!this.pointFree(b.x + fx * b.length * t - fz * b.width * s, b.z + fz * b.length * t + fx * b.width * s)) return false;
        }
      }
    }
    return true;
  }

  /** A point of the pat pat may be here. */
  private pointFree(px: number, pz: number): boolean {
    if (this.bushes.some((b) => Math.hypot(b.x - px, b.z - pz) < BUSH_KINDS[b.kind].block * (b.kind === 'ocak' ? 0.8 : b.scale))) return false;
    if (this.hives.some((h) => Math.hypot(h.x - px, h.z - pz) < HIVE.block)) return false;
    const c = this.clampWalk(px, pz);
    if (Math.hypot(c.x - px, c.z - pz) > 0.01) return false;
    if (Math.hypot(px - this.house.x, pz - this.house.z) < 3.4) return false;
    if (Math.hypot(px - this.mosque.x, pz - this.mosque.z) < 6.5 || (this.hut && Math.hypot(px - this.hut.x, pz - this.hut.z) < 3)) return false;
    if (this.fences.some((w) => segDist(px, pz, w.ax, w.az, w.bx, w.bz) < 0.3)) return false;
    if (this.yardWalls.length && this.yardWallDistance(px, pz) < 0.35) return false;
    const g = this.yardGate;
    if (g && this.gateOpen < 0.95 && segDist(px, pz, g.ax, g.az, g.bx, g.bz) < 0.35) return false;
    // The thin posts at a field's way in don't stop the pat pat (it brushes past them).
    if (this.yardProps.some((y) => y.kind !== 'post' && Math.hypot(y.x - px, y.z - pz) < y.r + 0.1)) return false;
    // Not into the walled mosque yard (it stays outside, at the gate).
    return !(this.walls.length && Math.abs(px) < this.wallX + 0.3 && pz > this.wallTop - 0.3 && pz < this.wallBottom + 0.3);
  }

  /** Where the worker comes out of the house at the start of the very first job. */
  get doorstep(): { x: number; z: number } {
    // In front of the door (the model's +z).
    return { x: this.house.x + Math.sin(this.house.rot) * 4.2, z: this.house.z + Math.cos(this.house.rot) * 4.2 };
  }

  /** Distance from a point to the hose (Infinity without one). */
  hoseDistance(x: number, z: number): number {
    let d = Infinity;
    for (let i = 1; i < this.hose.length; i++) d = Math.min(d, segDist(x, z, this.hose[i - 1].x, this.hose[i - 1].z, this.hose[i].x, this.hose[i].z));
    return d;
  }

  /** Fraction of the grass that has been mown, 0..1. */
  get coverage(): number {
    return this.total ? this.mownCount / this.total : 1;
  }

  get mown(): number {
    return this.mownCount;
  }

  inField(x: number, z: number): boolean {
    return Math.abs(x) <= this.width / 2 && Math.abs(z) <= this.depth / 2;
  }

  /**
   * Cut all grass within `r` of the segment a→b (the path the line swept this step).
   * Returns the number of cells the line went through that still had grass on them.
   */
  cutSegment(ax: number, az: number, bx: number, bz: number, r: number): number {
    const minX = Math.min(ax, bx) - r;
    const maxX = Math.max(ax, bx) + r;
    const minZ = Math.min(az, bz) - r;
    const maxZ = Math.max(az, bz) + r;
    const i0 = Math.max(0, Math.floor((minX + this.width / 2) / CELL));
    const i1 = Math.min(this.gw - 1, Math.floor((maxX + this.width / 2) / CELL));
    const j0 = Math.max(0, Math.floor((minZ + this.depth / 2) / CELL));
    const j1 = Math.min(this.gd - 1, Math.floor((maxZ + this.depth / 2) / CELL));
    if (i0 > i1 || j0 > j1) return 0;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const r2 = r * r;
    let cut = 0;
    let weight = 0;
    for (let j = j0; j <= j1; j++) {
      const z = this.cellZ(j);
      for (let i = i0; i <= i1; i++) {
        const k = j * this.gw + i;
        if (!this.mask[k] || this.grass[k] <= CUT_HEIGHT) continue;
        const x = this.cellX(i);
        let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + dx * t - x;
        const ez = az + dz * t - z;
        if (ex * ex + ez * ez > r2) continue;
        if (this.grass[k] > MOWN_AT) this.mownCount++;
        weight += 0.55 + 0.45 * this.grass[k];
        this.grass[k] = CUT_HEIGHT;
        cut++;
      }
    }
    if (cut) this.markDirty(i0, j0, i1, j1);
    this.lastCutWeight = weight;
    return cut;
  }

  /** Wheels roll the grass flat within `r` of (x, z): shorter, but not mown. */
  crush(x: number, z: number, r: number, to: number): void {
    const i0 = Math.max(0, Math.floor((x - r + this.width / 2) / CELL));
    const i1 = Math.min(this.gw - 1, Math.floor((x + r + this.width / 2) / CELL));
    const j0 = Math.max(0, Math.floor((z - r + this.depth / 2) / CELL));
    const j1 = Math.min(this.gd - 1, Math.floor((z + r + this.depth / 2) / CELL));
    if (i0 > i1 || j0 > j1) return;
    let changed = false;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * this.gw + i;
        if (this.grass[k] <= to || (this.cellX(i) - x) ** 2 + (this.cellZ(j) - z) ** 2 > r * r) continue;
        this.grass[k] = to;
        changed = true;
      }
    }
    if (changed) this.markDirty(i0, j0, i1, j1);
  }

  /** Changed cells since the last call (for uploading to the GPU), or null if nothing changed. */
  takeDirty(): DirtyRect | null {
    const d = this.dirty;
    this.dirty = null;
    return d;
  }

  /** Grass height at a world point (0 outside the field or where nothing grows). */
  grassAt(x: number, z: number): number {
    const i = Math.floor((x + this.width / 2) / CELL);
    const j = Math.floor((z + this.depth / 2) / CELL);
    if (i < 0 || j < 0 || i >= this.gw || j >= this.gd) return 0;
    return this.grass[j * this.gw + i];
  }

  private markDirty(i0: number, j0: number, i1: number, j1: number): void {
    const d = this.dirty;
    if (!d) this.dirty = { i0, j0, i1, j1 };
    else {
      d.i0 = Math.min(d.i0, i0);
      d.j0 = Math.min(d.j0, j0);
      d.i1 = Math.max(d.i1, i1);
      d.j1 = Math.max(d.j1, j1);
    }
  }

  private nearDepot(x: number, z: number, r: number): boolean {
    return Math.hypot(x - this.depot.x, z - this.depot.z) < r;
  }

  /** Free of everything standing in the field, by at least `gap` metres. */
  private clear(x: number, z: number, gap: number): boolean {
    return (
      !this.bushes.some((b) => Math.hypot(b.x - x, b.z - z) < BUSH_KINDS[b.kind].block * b.scale + gap) &&
      !this.brambles.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + gap) &&
      !this.hives.some((h) => Math.hypot(h.x - x, h.z - z) < 0.6 + gap)
    );
  }

  /**
   * Hazelnut ocaks in rows across the slope (along x), evenly spaced with a little jitter;
   * now and then a bush is missing from a row, as in real gardens.
   */
  private placeBushes(rnd: () => number): void {
    const margin = 2.2;
    const w = this.width - margin * 2;
    const d = this.depth - margin * 2;
    const lv = this.level;
    const cols = Math.max(1, Math.floor(w / lv.plantGap) + 1);
    const rows = Math.max(1, Math.floor(d / lv.rowGap) + 1);
    const x0 = -((cols - 1) * lv.plantGap) / 2;
    const z0 = -((rows - 1) * lv.rowGap) / 2;
    for (let r = 0; r < rows; r++) {
      // Rows follow the contour: a slight bend so they don't look ruled.
      const bend = (rnd() - 0.5) * 0.5;
      for (let c = 0; c < cols; c++) {
        if (rnd() < 0.1) continue;
        const u = cols > 1 ? c / (cols - 1) - 0.5 : 0;
        const x = x0 + c * lv.plantGap + (rnd() - 0.5) * 0.25;
        const z = z0 + r * lv.rowGap + bend * (1 - 4 * u * u) + (rnd() - 0.5) * 0.25;
        if (this.nearDepot(x, z, 4)) continue;
        this.bushes.push({ kind: 'ocak', x, z, variant: Math.floor(rnd() * 3), scale: bushScale(rnd()), rot: rnd() * Math.PI * 2, cooldown: 0, knocks: 0 });
      }
    }
  }

  /** Graves in rows facing the same way (towards the qibla), the lower part of the yard left open. */
  private placeGraves(rnd: () => number): void {
    const lv = this.level;
    const top = -this.depth / 2 + 1.5;
    const bottom = this.depth / 2 - this.depth * 0.35;
    for (let z = top; z < bottom; z += lv.rowGap) {
      for (let x = -this.width / 2 + 1.4; x < this.width / 2 - 1; x += lv.plantGap) {
        // A path up the middle, and some empty plots.
        if (Math.abs(x) < 1.4 || rnd() < 0.18) continue;
        this.bushes.push({ kind: 'mezar', x: x + (rnd() - 0.5) * 0.3, z: z + (rnd() - 0.5) * 0.3, variant: Math.floor(rnd() * 3), scale: 0.85 + rnd() * 0.3, rot: (rnd() - 0.5) * 0.15, cooldown: 0, knocks: 0 });
      }
    }
  }

  /** Big rocks sticking out of the meadow. */
  private placeBoulders(rnd: () => number, n: number): void {
    let tries = 0;
    while (this.bushes.length < n && tries++ < 500) {
      const x = (rnd() - 0.5) * (this.width - 3);
      const z = (rnd() - 0.5) * (this.depth - 3);
      const scale = 0.7 + rnd() * 0.7;
      if (this.nearDepot(x, z, 5) || !this.clear(x, z, 2.5 + scale)) continue;
      this.bushes.push({ kind: 'kaya', x, z, variant: Math.floor(rnd() * 3), scale, rot: rnd() * Math.PI * 2, cooldown: 0, knocks: 0 });
    }
  }

  /** Brambles creep in between the rows and along the edges. */
  private placeBrambles(rnd: () => number): void {
    let tries = 0;
    while (this.brambles.length < (this.level.brambles ?? 0) && tries++ < 600) {
      const x = (rnd() - 0.5) * (this.width - 2);
      const z = (rnd() - 0.5) * (this.depth - 2);
      const r = BRAMBLE.rMin + rnd() * (BRAMBLE.rMax - BRAMBLE.rMin);
      // Between hazelnut ocaks they keep clear of the stems; tea hedges and graves they creep right up to.
      if (this.bushes.some((b) => Math.hypot(b.x - x, b.z - z) < (b.kind === 'ocak' ? r + 1.4 : r * 0.6 + BUSH_KINDS[b.kind].block * b.scale))) continue;
      if (this.brambles.some((b) => Math.hypot(b.x - x, b.z - z) < r + b.r + 2)) continue;
      if (this.nearDepot(x, z, 5)) continue;
      this.brambles.push({ x, z, r, rot: rnd() * Math.PI * 2, hp: 1 });
    }
  }

  private placeStones(rnd: () => number): void {
    let tries = 0;
    while (this.stones.length < this.level.stones && tries++ < 500) {
      const x = (rnd() - 0.5) * (this.width - 1.5);
      const z = (rnd() - 0.5) * (this.depth - 1.5);
      if (this.bushes.some((b) => Math.hypot(b.x - x, b.z - z) < (b.kind === 'ocak' ? 1.2 : BUSH_KINDS[b.kind].block * b.scale + 0.3))) continue;
      if (this.stones.some((s) => Math.hypot(s.x - x, s.z - z) < 1.5)) continue;
      if (this.brambles.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + 0.6)) continue;
      if (Math.abs(z - this.depth / 2) < 2.5 && Math.abs(x - this.depot.x) < 3) continue;
      this.stones.push({ x, z, r: 0.12 + rnd() * 0.12, rot: rnd() * Math.PI * 2, cooldown: 0 });
    }
  }

  /**
   * Beehives stand side by side in one row across the slope, as a beekeeper sets them out, in a clear
   * spot in the upper half of the field, all facing downhill.
   */
  private placeHives(rnd: () => number, n: number): void {
    if (!n) return;
    const gap = 1.3;
    const perRow = n;
    const rows = Math.ceil(n / perRow);
    const spots = (x0: number, z0: number) =>
      Array.from({ length: n }, (_, i) => ({ x: x0 + ((i % perRow) - (perRow - 1) / 2) * gap, z: z0 + Math.floor(i / perRow) * 1.6 }));
    for (let tries = 0; tries < 400; tries++) {
      const x0 = (rnd() - 0.5) * (this.width - perRow * gap - 3);
      const z0 = -this.depth / 2 + 2 + rnd() * Math.max(0.5, this.depth * 0.5 - rows * 1.6);
      const s = spots(x0, z0);
      if (!s.every((p) => this.clear(p.x, p.z, 1) && Math.abs(p.x) < this.width / 2 - 1 && Math.abs(p.z) < this.depth / 2 - 1)) continue;
      for (const p of s) this.hives.push({ x: p.x, z: p.z, rot: (rnd() - 0.5) * 0.08, anger: 0, sx: p.x, sz: p.z, swarm: 0, stingT: 0, stung: 0, rest: 0 });
      return;
    }
  }

  private placeSnakes(rnd: () => number, n: number): void {
    let tries = 0;
    while (this.snakes.length < n && tries++ < 400) {
      const x = (rnd() - 0.5) * (this.width - 3);
      const z = (rnd() - 0.5) * (this.depth - 3);
      if (this.nearDepot(x, z, 8) || !this.clear(x, z, 1) || this.snakes.some((s) => Math.hypot(s.x - x, s.z - z) < 7)) continue;
      this.snakes.push({ x, z, yaw: rnd() * Math.PI * 2, state: 'hidden', t: 0 });
    }
  }

  /** Hens peck about the yard in front of the house; they don't go into the field. */
  private placeHens(rnd: () => number, n: number): void {
    const y = this.yard;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const x = y.x + Math.cos(a) * y.r * rnd();
      const z = y.z + Math.sin(a) * y.r * rnd();
      this.hens.push({ x, z, yaw: rnd() * Math.PI * 2, tx: x, tz: z, t: rnd() * 3, speed: 0, state: 'wander' });
    }
  }

  /** The neighbour's hose comes in over the left fence and snakes across to the middle of the field. */
  private placeHose(rnd: () => number): void {
    let x = -this.width / 2 - 2;
    let z = -this.depth / 4 + (rnd() - 0.5) * 4;
    let a = 0;
    this.hose.push({ x, z });
    for (let i = 0; i < 40; i++) {
      a += (rnd() - 0.5) * 0.7;
      a = Math.max(-0.8, Math.min(0.8, a));
      const nx = x + Math.cos(a) * 0.8;
      const nz = z + Math.sin(a) * 0.8;
      // Lie round the bushes, not through them.
      if (this.bushes.some((b) => Math.hypot(b.x - nx, b.z - nz) < 1.2)) {
        a += a > 0 ? -0.9 : 0.9;
        continue;
      }
      x = nx;
      z = nz;
      this.hose.push({ x, z });
      if (x > this.width * 0.15) break;
    }
  }
}
