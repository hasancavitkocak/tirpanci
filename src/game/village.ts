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
}

/** The stream's centre line: it runs north to south down the east of every village. */
/** (Also written out in the terrain shader, world.ts: keep the two the same.) */
export function streamX(z: number): number {
  return 40 + Math.sin(z * 0.09 + 1) * 2.2 + Math.sin(z * 0.23) * 0.7;
}
/** Gap between a stream-side field's right edge and the stream's middle (before the meander). */
const STREAM_GAP = 7.5;

/** The asphalt road there once was along the west of the first village (x of its centre line). */
export const ASPHALT_X = -90;

const noise1 = makeNoise(4242);
const noise2 = makeNoise(977);

function home(hx: number, hz: number): Pick<Region, 'house' | 'harman' | 'plateau'> {
  const house = { x: hx, z: hz, rot: Math.PI / 2 };
  const harman = { x: hx + 9.5, z: hz, r: 4.6 };
  // (Wide enough for the garage behind, between the house and the harman.)
  return { house, harman, plateau: { x: (house.x + harman.x) / 2, z: hz, r: 15 } };
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
    place: { 1: { z: -110 }, 2: { z: -80 }, 3: { z: -45 }, 4: { z: 0 }, 5: { z: -195 }, 6: { x: -50, z: -60 }, 7: { x: ASPHALT_X - 11.9, z: 0 }, 8: { z: -240 } },
    slots: [
      { id: 101, x: -24, z: -100, w: 16, d: 18, theme: 'findik' },
      { id: 102, x: -29, z: 5, w: 20, d: 22, theme: 'findik' },
      { id: 103, x: -62, z: 10, w: 22, d: 24, theme: 'findik' },
      { id: 104, x: -45, z: -200, w: 22, d: 24, theme: 'yayla' },
    ],
    north: true,
    trunkEnd: 48,
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
    ...home(-14, -140),
    mosque: { x: -62, z: -82 },
    hut: null,
    map: { minX: -125, minZ: -190, maxZ: 70 },
    place: { 9: { z: -95 }, 10: { z: -45 }, 11: { x: -52, z: -60 }, 12: { x: -100, z: 5 }, 13: { z: 12 } },
    slots: [],
    north: false,
    trunkEnd: 52,
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
  return { x: p.x ?? 40 - STREAM_GAP - lv.width / 2, z: p.z };
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
  const nearestOnRoads = (t: Pt) => {
    let best = { road: trunk, i: 0, d: Infinity };
    for (const rd of roads) {
      if (rd.kind !== 'dirt') continue;
      rd.pts.forEach((p, i) => {
        const d = Math.hypot(p.x - t.x, p.z - t.z);
        if (d < best.d) best = { road: rd.pts, i, d };
      });
    }
    return best;
  };
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
      from = nearestOnRoads({ x: ex, z: fr.maxZ + 7.5 });
      const t = from.road[from.i];
      const side = Math.sign(ex - t.x) || 1;
      const n = Math.max(24, Math.round(Math.hypot(ex - t.x, end.z - t.z) * 1.3));
      branch = [t, ...bezier(t, { x: t.x + side * 6, z: t.z }, { x: ex, z: fr.maxZ + 7.5 }, end, n, 0.25, seed)];
    }
    addRoad('dirt', from.road, from.i, branch);
    routes[lv.id] = [...routeTo(from.road, from.i), ...branch.slice(1)];
  }
  const v = { roads, routes };
  built.set(r.id, v);
  return v;
}
