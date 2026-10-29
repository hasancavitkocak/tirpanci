import { LEVELS, LevelDef, Theme } from './config';
import { makeNoise } from './rng';

/**
 * The villages the jobs are in (regions): Yeşilyamaç, where it all starts, and Karadere beyond it.
 * Each is its own map. Village coordinates, metres: +x east, +z south (downhill). The house and its
 * yard stand up the hill; a dirt track (the trunk) runs south from it past the gardens beside the
 * stream; branches lead off to each field's way in. A cobbled road goes to the mosque.
 *
 * A `Field` sits with its centre at the origin of its own coordinates; `placement(level)` is where that
 * centre is in its village, so village point P is field point P - placement.
 */

export type RoadKind = 'dirt' | 'cobble';
export interface Pt {
  x: number;
  z: number;
}
export interface Road {
  kind: RoadKind;
  pts: Pt[];
}

/** A neighbour's garden (for the coffee-house jobs): a fixed plot in the village. */
export interface Slot {
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  theme: Theme;
}

/**
 * A bridge where a track crosses the stream: its middle, heading (0: across, east-west), the length and
 * width of its walkway, how high its level middle stands over its ends and the ramp up to it at each
 * end (m): see deckRise.
 */
export interface Bridge extends Pt {
  rot: number;
  len: number;
  width: number;
  hump: number;
  ramp: number;
}

/** How far a bridge's walkway stands over its ends at `u` from its middle (along it): up its end ramps, level between. */
export function deckRise(b: Bridge, u: number): number {
  const fromEnd = b.len / 2 - Math.abs(u);
  return b.hump * Math.max(0, Math.min(1, fromEnd / b.ramp));
}

export interface Region {
  id: number;
  name: string;
  /** The house (it faces east, onto its harman), the harman, the level ground they stand on. */
  house: Pt & { rot: number };
  harman: Pt & { r: number };
  plateau: Pt & { r: number };
  /** The mosque above its graveyard, and the highland hut (if any). */
  mosque: Pt;
  hut: Pt | null;
  /** Map limits: the west edge, the north and south ends (the east one is the stream's far bank). */
  map: { minX: number; minZ: number; maxZ: number };
  /** Where each level's field lies (its centre; beside the stream unless x is given). */
  place: Record<number, { z: number; x?: number }>;
  /** The neighbours' gardens. */
  slots: Slot[];
  /** A road climbs north from the trunk below the yard (to the highland meadows). */
  north: boolean;
  /** How far south the trunk runs. */
  trunkEnd: number;
  /** The lie of the land. */
  ground: (x: number, z: number) => number;
  /**
   * The stream's course, north to south (village coordinates): unset, down the east edge (streamX's
   * own line); else through these points (Yeşilyamaç's runs down the west, past the gardens beyond it).
   */
  stream?: Pt[];
  /** The bridge over it, and the mill on its west bank by it (its wheel on its own +x side; x is set from the stream). */
  bridge?: Bridge;
  mill?: Pt & { rot: number };
  /**
   * What sets the village apart to look at: its tracks paved with setts, dry-stone walls along its trunk,
   * the share of spruces among its trees, the meadow's tint (multiplied in), its own meadow and sett
   * pictures (public/textures; the setts' picture covering `cobbleSize` metres).
   */
  look?: {
    paved?: boolean;
    walls?: boolean;
    spruce?: number;
    tint?: [number, number, number];
    grass?: string;
    cobble?: string;
    cobbleSize?: number;
    /** Its own house model (manifest key), how tall it stands, and how far round it is solid (m). */
    house?: { model: string; height: number; r: number };
    /** The serender (the granary on stilts) in the yard, village coordinates. */
    serender?: Pt;
    /** The barn (its door towards the yard), hay bales stacked beside it, village coordinates. */
    barn?: Pt;
    /** Its own sky panorama (public/textures), laid out as gokyuzu.jpg. */
    sky?: string;
    /** The stone arch with its name board over the trunk just inside the way out. */
    arch?: boolean;
    /** The yard the old way: its harman paved with stones (the setts' picture) and a dry-stone wall round it. */
    stoneYard?: boolean;
    /** Its broadleaf trees' bark and leaves tinted (walnuts and chestnuts: dark bark, deeper leaves). */
    treeTint?: { bark: string; leaf: string };
    /** Clumps of bracken (eğrelti) along its tracks, walls and woods: how many for each tree. */
    ferns?: number;
    /** A woodpile rack in the yard east of the harman (where Odun İşi's logs are stacked). */
    woodRack?: boolean;
  };
}

/**
 * The stream's centre line at z in a village: down the east edge (x 40, meandering), or through its own
 * points (Region.stream), smoothly, with the same small meander.
 */
export function streamX(z: number, r: Region = REGIONS[0]): number {
  const wiggle = Math.sin(z * 0.23) * 0.7;
  if (!r.stream) return EAST_LINE + Math.sin(z * 0.09 + 1) * 2.2 + wiggle;
  const t = (courses.get(r.id) ?? courses.set(r.id, course(r.stream)).get(r.id))!;
  const i = Math.max(0, Math.min(t.xs.length - 2, Math.floor((z - t.z0) / COURSE_STEP)));
  const u = Math.max(0, Math.min(1, (z - t.z0) / COURSE_STEP - i));
  return t.xs[i] + (t.xs[i + 1] - t.xs[i]) * u + wiggle;
}

/** A stream's course through its points (Catmull-Rom), tabled every COURSE_STEP metres down z. */
const COURSE_STEP = 0.5;
const courses = new Map<number, { z0: number; xs: number[] }>();
function course(pts: Pt[]): { z0: number; xs: number[] } {
  const xs: number[] = [];
  const z0 = pts[0].z;
  const z1 = pts[pts.length - 1].z;
  for (let z = z0; z <= z1 + COURSE_STEP; z += COURSE_STEP) {
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1].z < z) i++;
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = Math.max(0, Math.min(1, (z - p1.z) / (p2.z - p1.z)));
    const t2 = t * t;
    xs.push(0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2 * t));
  }
  return { z0, xs };
}

/**
 * How far west of the stream's middle the mill stands: turned (rot) so its long wall with the wheel faces
 * the stream, the wheel (2.75 m out from its middle) turning in the water near the bank, the chute's open
 * end upstream.
 */
const MILL_WHEEL = 4.3;

/** The east line: the stream there in a village where it runs down the east; the stream-side fields line up against it. */
const EAST_LINE = 40;
/** Where a village whose stream runs elsewhere ends to the east (the worker's limit). */
export const EAST_EDGE = 46;
/** Gap between a stream-side field's right edge and the east line. */
const STREAM_GAP = 7.5;

/** The asphalt road there once was along the west of the first village (x of its centre line). */
export const ASPHALT_X = -90;

const noise1 = makeNoise(4242);
const noise2 = makeNoise(977);

/** The house and its yard; `wide`: metres more between the house and the harman, and on the yard's radius (a bigger house). */
function home(hx: number, hz: number, wide = 0): Pick<Region, 'house' | 'harman' | 'plateau'> {
  const house = { x: hx, z: hz, rot: Math.PI / 2 };
  const harman = { x: hx + 9.5 + wide, z: hz, r: 4.6 };
  // (Wide enough for the garage behind, between the house and the harman.)
  return { house, harman, plateau: { x: (house.x + harman.x) / 2, z: hz, r: 15 + wide } };
}

export const REGIONS: Region[] = [
  {
    id: 1,
    name: 'Yeşilyamaç',
    ...home(-14, -150),
    mosque: { x: -60, z: -82 },
    hut: { x: -20, z: -232 },
    map: { minX: -125, minZ: -280, maxZ: 60 },
    // Gardens beside the stream south of the house, highland meadows north of it; the mosque yard
    // and the roadside field to the west.
    place: { 1: { z: -110 }, 2: { z: -80 }, 3: { z: -45 }, 4: { z: 0 }, 5: { z: -195 }, 6: { x: -50, z: -60 }, 7: { x: ASPHALT_X - 11.9, z: 0 }, 8: { z: -240 }, 9: { x: -99, z: -182 }, 10: { x: -100, z: -136 } },
    slots: [
      { id: 101, x: -24, z: -100, w: 16, d: 18, theme: 'findik' },
      { id: 102, x: -29, z: 5, w: 20, d: 22, theme: 'findik' },
      { id: 103, x: -62, z: 10, w: 22, d: 24, theme: 'findik' },
      { id: 104, x: -45, z: -200, w: 22, d: 24, theme: 'yayla' },
    ],
    north: true,
    trunkEnd: 48,
    // The stream down the empty ground west of the house, past the mosque, between the neighbour's
    // garden and the roadside field; the track to Dere Yanı and Değirmen Önü crosses it on the stone
    // bridge, the mill stands on its far bank.
    stream: [{ x: -64, z: -340 }, { x: -67, z: -285 }, { x: -63, z: -248 }, { x: -68, z: -215 }, { x: -66, z: -188 }, { x: -69, z: -160 }, { x: -68, z: -132 }, { x: -72, z: -105 }, { x: -77, z: -70 }, { x: -82, z: -35 }, { x: -84, z: -5 }, { x: -84, z: 30 }, { x: -81, z: 70 }, { x: -79, z: 120 }],
    bridge: { x: -69, z: -160, rot: 0, len: 11.6, width: 3.2, hump: 0.45, ramp: 2.2 },
    mill: { x: -76, z: -117, rot: Math.PI / 2 },
    // The hill rises to the north, ever steeper (a few percent at the bottom, near 30 % up by the
    // meadows), gently to the west, with long low swells.
    ground: (x, z) => {
      const u = Math.max(0, 60 - z);
      return 0.02 * u + 0.0004 * u * u + 0.035 * (40 - x) + noise1(x * 0.018, z * 0.018) * 2 + noise1(x * 0.05 + 9, z * 0.05) * 0.6;
    },
  },
  {
    id: 2,
    name: 'Karadere',
    // (A bigger stone house: a wider yard.) Laid out unlike Yeşilyamaç (whose yard is up the middle,
    // its mosque in the middle of the village): the yard down at the village's foot by the way in, the
    // mosque and its graveyard beside it, Uzun Tarla off to the south-west; up the valley the stream's
    // gardens along the east, the others in two rows west of the track.
    ...home(-14, 30, 3),
    mosque: { x: -52, z: 33 },
    hut: null,
    map: { minX: -125, minZ: -190, maxZ: 110 },
    place: { 11: { z: -140 }, 12: { z: -75 }, 13: { x: -45, z: 55 }, 14: { x: -100, z: 40 }, 15: { z: -20 }, 16: { x: -28, z: -170 }, 17: { x: -80, z: -160 }, 18: { x: -75, z: -110 }, 19: { x: -28, z: -100 }, 20: { x: -31, z: -40 } },
    slots: [],
    north: true,
    trunkEnd: 92,
    look: { paved: true, walls: true, spruce: 0.6, tint: [0.97, 1, 0.95], grass: 'zemin-cim-karadere.webp', cobble: 'kaldirim-karadere.webp', cobbleSize: 2.6, house: { model: 'houseKaradere', height: 7.6, r: 4.6 }, serender: { x: -17, z: 42.5 }, barn: { x: 25, z: 32 }, sky: 'gokyuzu-karadere.jpg', arch: true, stoneYard: true, treeTint: { bark: '#7a5a40', leaf: '#b9cfa2' }, ferns: 3, woodRack: true },
    // The stone bridge over the stream below Köprübaşı (turned: the village on its west), the mill on
    // the near bank between Köprübaşı and Değirmen Bahçesi.
    bridge: { x: 0, z: -50, rot: Math.PI, len: 11.6, width: 3.2, hump: 0.45, ramp: 2.2 },
    mill: { x: 0, z: -108, rot: Math.PI / 2 },
    // A broad valley: gentler than Yeşilyamaç, rolling more.
    ground: (x, z) => {
      const u = Math.max(0, 60 - z);
      return 0.015 * u + 0.0003 * u * u + 0.03 * (40 - x) + noise2(x * 0.02, z * 0.02) * 2.6 + noise2(x * 0.06 + 4, z * 0.06) * 0.7;
    },
  },
];

/** The village a level is in. */
export function regionOf(lv: LevelDef): Region {
  return REGIONS.find((r) => r.id === (lv.region ?? 1)) ?? REGIONS[0];
}

/** The coffee-house jobs posted now (one per neighbour's garden at most), set by the game. */
let posted: LevelDef[] = [];
export function setPosted(defs: LevelDef[]): void {
  posted = defs;
}

/** A neighbour's garden with no job posted: just its hazelnut rows, its gate shut. */
function slotIdle(s: Slot, r: Region): LevelDef {
  return {
    id: s.id, name: 'Komşu Bahçesi', place: r.name, theme: s.theme, weather: 'sunny', grass: 'taze', width: s.w, depth: s.d, rowGap: 6.5, plantGap: 5.6,
    stones: 0, slope: 0, bumps: 0.3, pay: 0, parTime: 0, seed: s.id * 7, region: r.id,
    client: { name: '', face: '', call: '', request: 'none', tip: 0 },
  };
}

/** Every field of a village: its jobs, and its neighbours' gardens (with the job posted there, if any). */
export function regionLevels(r: Region): LevelDef[] {
  const own = LEVELS.filter((l) => (l.region ?? 1) === r.id);
  const slots = r.slots.map((s) => posted.find((p) => p.id === s.id) ?? slotIdle(s, r));
  return [...own, ...slots];
}

/** Where a level's field lies (its centre), in its village. */
export function placement(lv: LevelDef): Pt {
  const r = regionOf(lv);
  const s = r.slots.find((q) => q.id === lv.id);
  if (s) return { x: s.x, z: s.z };
  const p = r.place[lv.id] ?? { z: 0 };
  // Beside the stream unless placed elsewhere: its right edge STREAM_GAP short of the stream's line.
  return { x: p.x ?? EAST_LINE - STREAM_GAP - lv.width / 2, z: p.z };
}

/** The lie of the land in a level's village. */
export function groundOf(lv: LevelDef): (x: number, z: number) => number {
  return regionOf(lv).ground;
}

/** A field's rectangle in village coordinates. */
export function fieldRect(lv: LevelDef): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const p = placement(lv);
  return { minX: p.x - lv.width / 2, maxX: p.x + lv.width / 2, minZ: p.z - lv.depth / 2, maxZ: p.z + lv.depth / 2 };
}

/** x of the way into a level's field (at its bottom edge), village coordinates. */
export function entryX(lv: LevelDef): number {
  const r = fieldRect(lv);
  // A neighbour's garden keeps its way in whatever job is posted there (its track is laid once).
  if (regionOf(lv).slots.some((s) => s.id === lv.id)) return r.minX + 3.2;
  return r.minX + 2.6 + ((lv.seed * 0.618) % 1) * 1.2;
}

/** Points along a cubic Bézier, `n` steps (the first point left out). */
function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number, sway = 0, seed = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    const s = Math.sin(t * Math.PI * 3 + seed) * sway * Math.sin(t * Math.PI);
    out.push({ x: k[0] * p0.x + k[1] * p1.x + k[2] * p2.x + k[3] * p3.x + s, z: k[0] * p0.z + k[1] * p1.z + k[2] * p2.z + k[3] * p3.z });
  }
  return out;
}

/** Points along x = f(z) from z0 to z1, about 0.8 m apart. */
/**
 * A field's wooden fence, out from its rectangle (as the village draws it, VillageView): this far at its
 * sides and top, this far below (its gate side).
 */
const FENCE_OUT = { side: 2.9, front: 1.5 };
/** A track's middle at least this far from a fence (m): the lane is 1.9 either side of it. */
const FENCE_CLEAR = 2.6;

/**
 * A track coming a long way to a field's gate runs flat along the front before turning in (Değirmen
 * Önü's, right on its fence line: the posts and wires down the middle of the lane). Pushed out from the
 * fence to FENCE_CLEAR (outside it), but for its last metres into the gate (blended in from 3 to 6 m off it).
 */
function keepOffFence(pts: Pt[], r: { minX: number; maxX: number; minZ: number; maxZ: number }, gate: Pt): void {
  const x0 = r.minX - FENCE_OUT.side;
  const x1 = r.maxX + FENCE_OUT.side;
  const top = r.minZ - FENCE_OUT.side;
  const bot = r.maxZ + FENCE_OUT.front;
  // Its runs (the gate's gap, 2 m either side of it, left out), each with the way out from it.
  const runs = [
    { ax: x0, az: bot, bx: x0, bz: top, ox: -1, oz: 0 },
    { ax: x0, az: top, bx: x1, bz: top, ox: 0, oz: -1 },
    { ax: x1, az: top, bx: x1, bz: bot, ox: 1, oz: 0 },
    { ax: x1, az: bot, bx: gate.x + 2, bz: bot, ox: 0, oz: 1 },
    { ax: gate.x - 2, az: bot, bx: x0, bz: bot, ox: 0, oz: 1 },
  ];
  // (Not its first point: the track it leaves.)
  for (const p of pts.slice(1)) {
    let best = { d: Infinity, qx: 0, qz: 0, ox: 0, oz: 1 };
    for (const w of runs) {
      const vx = w.bx - w.ax;
      const vz = w.bz - w.az;
      const t = Math.max(0, Math.min(1, ((p.x - w.ax) * vx + (p.z - w.az) * vz) / (vx * vx + vz * vz || 1)));
      const qx = w.ax + vx * t;
      const qz = w.az + vz * t;
      const d = Math.hypot(p.x - qx, p.z - qz);
      if (d < best.d) best = { d, qx, qz, ox: w.ox, oz: w.oz };
    }
    if (best.d >= FENCE_CLEAR) continue;
    const s = Math.min(1, Math.max(0, (Math.hypot(p.x - gate.x, p.z - gate.z) - 3) / 3));
    if (!s) continue;
    // Out to FENCE_CLEAR on the outside of the fence (a point on the line, or a hair inside it: out).
    const ux = best.d > 0.05 ? (p.x - best.qx) / best.d : best.ox;
    const uz = best.d > 0.05 ? (p.z - best.qz) / best.d : best.oz;
    const out = ux * best.ox + uz * best.oz >= 0;
    const k = s * s * (3 - 2 * s);
    const tx = best.qx + (out ? ux : best.ox) * FENCE_CLEAR;
    const tz = best.qz + (out ? uz : best.oz) * FENCE_CLEAR;
    p.x += (tx - p.x) * k;
    p.z += (tz - p.z) * k;
  }
}

function along(f: (z: number) => number, z0: number, z1: number): Pt[] {
  const out: Pt[] = [];
  const dir = Math.sign(z1 - z0);
  for (let z = z0; dir > 0 ? z <= z1 : z >= z1; ) {
    out.push({ x: f(z), z });
    const slope = (f(z + 0.05) - f(z)) / 0.05;
    z += (dir * 0.8) / Math.hypot(1, slope);
  }
  return out;
}

export interface Village {
  roads: Road[];
  /** The way from the harman to each field (jobs and neighbours' gardens), as one polyline. */
  routes: Record<number, Pt[]>;
  /** How far in from the trunk's end its arch stands (Region.look.arch), clear of the tracks leaving it. */
  archBack?: number;
}

/** The arch's pillars' middles out from the road's line (m), and how near a track may come to one. */
export const ARCH_PILLAR = 3.58;
const ARCH_CLEAR = 4.5;

/** The point `d` metres along a polyline, and its heading there (yaw: atan2(dx, dz)). */
export function alongLine(t: Pt[], d: number): { x: number; z: number; yaw: number } {
  let along = 0;
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1];
    const b = t[i];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    if (along + l >= d || i === t.length - 1) {
      const u = Math.min(1, Math.max(0, (d - along) / l));
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    along += l;
  }
  return { x: t[0].x, z: t[0].z, yaw: 0 };
}

/** A polyline's length (m). */
export function lineLength(t: Pt[]): number {
  let total = 0;
  for (let i = 1; i < t.length; i++) total += Math.hypot(t[i].x - t[i - 1].x, t[i].z - t[i - 1].z);
  return total;
}

const built = new Map<number, Village>();

/** A village's roads and each field's route (built once; the gardens' plots never move). */
export function village(r: Region = REGIONS[0]): Village {
  const done = built.get(r.id);
  if (done) return done;
  const hz = r.house.z;
  // The trunk: easy S-bends below the house, then a gently wandering straight.
  const trunkX = (z: number) => {
    const e = Math.min(1, Math.max(0, (z - (hz + 22)) / 20));
    const k = e * e * (3 - 2 * e);
    return -5 + Math.sin(((z - hz) * 2 * Math.PI) / 32) * 5 * (1 - k) + Math.sin(z * 0.13) * 0.6 * k;
  };
  const trunk = [{ x: r.harman.x + 1, z: r.harman.z + 2 }, ...along(trunkX, r.harman.z + 5, r.trunkEnd)];
  const roads: Road[] = [{ kind: 'dirt', pts: trunk }];
  const routes: Record<number, Pt[]> = {};
  // The way to a road's point `i`: the route to that road, then along it.
  const ways = new Map<Pt[], { via: Pt[]; at: number }>();
  ways.set(trunk, { via: [], at: 0 });
  const routeTo = (road: Pt[], i: number): Pt[] => {
    const w = ways.get(road)!;
    return [...w.via, ...road.slice(0, i + 1)];
  };
  const addRoad = (kind: RoadKind, from: Pt[], i: number, pts: Pt[]) => {
    roads.push({ kind, pts });
    ways.set(pts, { via: routeTo(from, i).slice(0, -1), at: i });
  };
  if (r.north) {
    // Round the west of the yard, north past it, back to the line up to the meadows.
    const iJ = trunk.findIndex((p) => p.z >= hz + 22);
    const j = trunk[iJ];
    const w = (a: number, b: number, t: number) => {
      const s = Math.min(1, Math.max(0, t));
      return a + (b - a) * s * s * (3 - 2 * s);
    };
    const northX = (z: number) => {
      if (z > hz + 10) return w(j.x, -25, (j.z - z) / 12);
      if (z > hz - 15) return -25;
      return w(-25, -5, (hz - 15 - z) / 13) + Math.sin(z * 0.11) * 0.5 * Math.min(1, (hz - 15 - z) / 13);
    };
    addRoad('dirt', trunk, iJ, [j, ...along(northX, j.z - 0.8, r.map.minZ + 28)]);
  }
  // The nearest point to a target on any dirt track built so far.
  // (`clear`: only from where the way straight to the target keeps off the fields, their fences and the
  // yard; failing that, the nearest anyway.)
  const keepOff = [...regionLevels(r).map(fieldRect), ...r.slots.map((s) => ({ minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2 }))];
  const clearTo = (a: Pt, t: Pt) => {
    const n = Math.ceil(Math.hypot(t.x - a.x, t.z - a.z) / 1.5);
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((t.x - a.x) * k) / n;
      const z = a.z + ((t.z - a.z) * k) / n;
      if (keepOff.some((f) => x > f.minX - 3.5 && x < f.maxX + 3.5 && z > f.minZ - 3.5 && z < f.maxZ + 3.5)) return false;
      if (Math.hypot(x - r.plateau.x, z - r.plateau.z) < r.plateau.r + 1) return false;
    }
    return true;
  };
  const nearestOnRoads = (t: Pt, clear = false): { road: Pt[]; i: number; d: number } => {
    let best = { road: trunk, i: 0, d: Infinity };
    for (const rd of roads) {
      if (rd.kind !== 'dirt') continue;
      rd.pts.forEach((p, i) => {
        const d = Math.hypot(p.x - t.x, p.z - t.z);
        if (d < best.d && (!clear || clearTo(p, t))) best = { road: rd.pts, i, d };
      });
    }
    return clear && best.d === Infinity ? nearestOnRoads(t) : best;
  };
  if (r.bridge) {
    // Over the stream: off the nearest track east of the bridge, across it, and on west a little to
    // where the ways to the gardens beyond branch off. (No dirt ribbon on the bridge itself: its
    // stones are the road there; the routes still run over it.)
    const b = r.bridge;
    // (On the stream's line where it crosses.)
    b.x = streamX(b.z, r);
    // The mill on the west bank.
    if (r.mill) r.mill.x = streamX(r.mill.z, r) - MILL_WHEEL;
    const ax = Math.cos(b.rot);
    const az = -Math.sin(b.rot);
    const east = { x: b.x + (ax * b.len) / 2, z: b.z + (az * b.len) / 2 };
    const west = { x: b.x - (ax * b.len) / 2, z: b.z - (az * b.len) / 2 };
    const from = nearestOnRoads({ x: east.x + 20 * ax, z: east.z + 20 * az });
    const t = from.road[from.i];
    const n = Math.max(24, Math.round(Math.hypot(east.x - t.x, east.z - t.z) * 1.3));
    const approach = [t, ...bezier(t, { x: t.x - 10 * ax, z: t.z - 10 * az }, { x: east.x + 9 * ax, z: east.z + 9 * az }, east, n, 0.3, 5)];
    addRoad('dirt', from.road, from.i, approach);
    const deck: Pt[] = [];
    for (let k = 1; k < Math.round(b.len / 0.8); k++) {
      const u = k / Math.round(b.len / 0.8);
      deck.push({ x: east.x + (west.x - east.x) * u, z: east.z + (west.z - east.z) * u });
    }
    const beyond = [west, ...bezier(west, { x: west.x - 6 * ax, z: west.z - 6 * az }, { x: west.x - 12 * ax, z: west.z + 1 }, { x: west.x - 17 * ax, z: west.z + 2 }, 24, 0.2, 9)];
    roads.push({ kind: 'dirt', pts: beyond });
    ways.set(beyond, { via: [...routeTo(approach, approach.length - 1), ...deck], at: 0 });
  }
  if (r.hut) {
    // Up to the front of the highland hut, off the nearest track.
    const front = { x: r.hut.x + 6, z: r.hut.z + 1 };
    const from = nearestOnRoads(front);
    const t = from.road[from.i];
    addRoad('dirt', from.road, from.i, [t, ...bezier(t, { x: t.x - 4, z: t.z }, { x: front.x + 4, z: front.z }, front, 20, 0.2, 3)]);
  }
  for (const lv of regionLevels(r)) {
    const fr = fieldRect(lv);
    const ex = entryX(lv);
    const seed = lv.seed;
    if (lv.theme === 'mezarlik' && !r.slots.some((s) => s.id === lv.id)) {
      // The cobbled road: off the trunk, west below the yard wall, up to its gate.
      const gate = { x: (fr.minX + fr.maxX) / 2, z: fr.maxZ + 1.2 };
      const i = trunk.reduce((b, p, k) => (Math.abs(p.z - (gate.z + 9)) < Math.abs(trunk[b].z - (gate.z + 9)) ? k : b), 0);
      const t = trunk[i];
      const road = [t, ...bezier(t, { x: t.x - 12, z: t.z }, { x: gate.x, z: t.z }, { x: gate.x, z: gate.z + 0.3 }, 60)];
      roads.push({ kind: 'cobble', pts: road });
      routes[lv.id] = [...routeTo(trunk, i), ...road.slice(1)];
      continue;
    }
    let from: { road: Pt[]; i: number };
    let branch: Pt[];
    const end = { x: ex, z: fr.maxZ + 0.4 };
    if (lv.theme === 'yol') {
      // A long track west from the trunk's end to the roadside field's way in.
      from = { road: trunk, i: trunk.length - 1 };
      const t = trunk[from.i];
      branch = [t, ...bezier(t, { x: t.x - 30, z: t.z + 2 }, { x: ex, z: fr.maxZ + 14 }, end, 120, 0.6, seed)];
    } else {
      // Off the nearest track below the field, round and up to its way in.
      from = nearestOnRoads({ x: ex, z: fr.maxZ + 7.5 }, true);
      const t = from.road[from.i];
      const side = Math.sign(ex - t.x) || 1;
      const n = Math.max(24, Math.round(Math.hypot(ex - t.x, end.z - t.z) * 1.3));
      branch = [t, ...bezier(t, { x: t.x + side * 6, z: t.z }, { x: ex, z: fr.maxZ + 7.5 }, end, n, 0.25, seed)];
      keepOffFence(branch, fr, end);
      // (And off the other gardens' fences it passes by.)
      for (const o of regionLevels(r)) if (o.id !== lv.id && o.theme !== 'mezarlik') keepOffFence(branch, fieldRect(o), { x: entryX(o), z: fieldRect(o).maxZ + 0.4 });
    }
    addRoad('dirt', from.road, from.i, branch);
    routes[lv.id] = [...routeTo(from.road, from.i), ...branch.slice(1)];
  }
  // The arch: some way in from the way out, where neither pillar stands by a track leaving the trunk.
  let archBack: number | undefined;
  if (r.look?.arch) {
    const total = lineLength(trunk);
    archBack = [14, 12, 16, 10, 18, 20, 9].find((b) => {
      const p = alongLine(trunk, total - b);
      return [-1, 1].every((s) => {
        const x = p.x + Math.cos(p.yaw) * s * ARCH_PILLAR;
        const z = p.z - Math.sin(p.yaw) * s * ARCH_PILLAR;
        return roads.slice(1).every((rd) => rd.pts.every((q) => Math.hypot(q.x - x, q.z - z) > ARCH_CLEAR));
      });
    });
  }
  const v = { roads, routes, archBack };
  built.set(r.id, v);
  return v;
}
