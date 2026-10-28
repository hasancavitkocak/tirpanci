/**
 * Odun: in Karadere, from job WOOD.from on, a storm now and then has brought a tree down in the garden
 * being worked, across a row of ocaks (crushed under it). The grass under it cannot be mown till it is
 * cut. With the chainsaw (bought once WOOD.needs is open; the trimmer put in the vehicle first) it is cut
 * from its crown to its root plate, a held KES a piece; each piece falls as a log beside it.
 *
 * The logs are the player's: when the job is done the garden's owner piles them by the track outside its
 * gate (WoodState.piles, kept till fetched). From there, on the pat pat or the tractor's trailer, they are
 * brought home and stacked by the woodpile rack in the yard (WoodState.stock), sold there when the
 * player likes.
 */

import type { Field } from './field';

export const WOOD = {
  /** The village (Karadere), the job the chainsaw is on sale from, and the first job a tree may be down in. */
  region: 2,
  needs: 14,
  from: 15,
  /** The chainsaw in the shop. */
  saw: { id: 'testere', name: 'Motorlu Testere', desc: 'Fırtınada bahçeye devrilen ağaçları keser; kütükler senin olur.', price: 15000 },
  /** How often a tree is down in a job (in rain more often). */
  chance: 0.4,
  rainChance: 0.7,
  /** Cuts (each gives a log), crown first. */
  pieces: 8,
  /** Logs each vehicle carries (the tractor only with its trailer). */
  capacity: { patpat: 4, trailer: 8 } as const,
  /** What a log sells for from the woodpile. */
  pricePerLog: 350,
};

/**
 * The fallen tree (devrik-agac.glb laid along its x, 10 m from root to crown), metres along it from its
 * middle: the root plate's far end, where the plate gives way to the trunk, the crown's tip.
 */
export const TREE = { len: 10, root: -5, trunk: -2, tip: 4.9 };

/** A piece's length along the tree. */
export const PIECE = (TREE.tip - TREE.trunk) / WOOD.pieces;

/** A tree down in the garden being worked (field coordinates): its middle, its heading from root to crown, and the side its logs fall to (+1: right of the heading). */
export interface FieldTree {
  x: number;
  z: number;
  yaw: number;
  side: number;
}

/** Logs piled by a garden's gate (village coordinates): the track's point beside them, its heading, the side of it they are on (+1 right), and how many are left. */
export interface LogPile {
  x: number;
  z: number;
  yaw: number;
  side: number;
  n: number;
}

/** The player's wood, kept in the save. */
export interface WoodState {
  /** Logs waiting by the gardens' gates. */
  piles: LogPile[];
  /** Logs on the vehicle now, and stacked in the yard. */
  load: number;
  stock: number;
  /** The first tree has come down (the first job it can be in always has one). */
  intro?: boolean;
}

export const newWood = (): WoodState => ({ piles: [], load: 0, stock: 0 });

/** How many logs a vehicle carries: the pat pat; the tractor only with its trailer. */
export function woodCapacity(tractor: boolean, trailer: boolean): number {
  return tractor ? (trailer ? WOOD.capacity.trailer : 0) : WOOD.capacity.patpat;
}

/** A log from a pile onto the vehicle. */
export function loadLog(w: WoodState, pile: number, capacity: number): boolean {
  const p = w.piles[pile];
  if (!p || p.n <= 0 || w.load >= capacity) return false;
  p.n--;
  w.load++;
  return true;
}

/** A log off the vehicle onto the woodpile. */
export function stackLog(w: WoodState): boolean {
  if (w.load <= 0) return false;
  w.load--;
  w.stock++;
  return true;
}

/** The woodpile sold: its pay. */
export function sellStock(w: WoodState): number {
  const pay = w.stock * WOOD.pricePerLog;
  w.stock = 0;
  return pay;
}

/** Logs still waiting by the gates. */
export const logsWaiting = (w: WoodState): number => w.piles.reduce((a, p) => a + Math.max(0, p.n), 0);

/** Where cut `i` is made (0: the crown's first), metres along the tree. */
export const cutAt = (i: number): number => TREE.tip - (i + 1) * PIECE;

/** Piece `i` is out in the crown's branches (thin, leafy) rather than the trunk. */
export const inCrown = (i: number): boolean => TREE.tip - (i + 0.5) * PIECE > 0.3;

/** A point on the tree (field coordinates): `along` metres from its middle towards the crown, `out` metres to the side its logs fall to. */
export function treePoint(t: FieldTree, along: number, out = 0): { x: number; z: number } {
  const fx = Math.sin(t.yaw);
  const fz = Math.cos(t.yaw);
  return { x: t.x + fx * along + Math.cos(t.yaw) * t.side * out, z: t.z + fz * along - Math.sin(t.yaw) * t.side * out };
}

/** Where log `i` lies (fallen from piece i), beside the trunk. */
export function logPlace(t: FieldTree, i: number): { x: number; z: number } {
  return treePoint(t, TREE.tip - (i + 0.5) * PIECE, 1.9 + ((i * 37) % 5) * 0.12);
}

/** Where the worker stands to make cut `i`: beside it on the logs' side, out of the crown's branches for its pieces (m from the axis). */
export const cutStand = (i: number): number => (inCrown(i) ? 3.4 : 1.6);

/** A log's size: the crown's branches thinner than the trunk. */
export const logSize = (i: number): { len: number; dia: number } => (inCrown(i) ? { len: 0.8, dia: 0.42 } : { len: 0.8, dia: 0.68 });

/** The tree's along and across (from its axis) for a point. */
function local(t: FieldTree, x: number, z: number): { along: number; across: number } {
  const dx = x - t.x;
  const dz = z - t.z;
  return { along: dx * Math.sin(t.yaw) + dz * Math.cos(t.yaw), across: Math.abs(dx * Math.cos(t.yaw) - dz * Math.sin(t.yaw)) };
}

/** How wide what lies at `along` is (half, m): the crown's branches, the trunk, the root plate. */
const halfWidth = (along: number): number => (along > 0.3 ? 2.3 : along > TREE.trunk ? 0.9 : 1.6);

/** What of the tree still lies there after `cut` cuts: whether a point is under it (its grass cannot be mown). */
export function underTree(t: FieldTree, cut: number): (x: number, z: number) => boolean {
  const end = cut > 0 ? cutAt(cut - 1) : TREE.tip;
  return (x, z) => {
    const l = local(t, x, z);
    return l.along >= TREE.root && l.along <= end && l.across < halfWidth(l.along);
  };
}

/** What of the tree stands in the way (circles): the root plate, and the pieces not cut yet. */
export function treeBlocks(t: FieldTree, cut: number): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (let a = TREE.root + 1.2; a < TREE.trunk; a += 1.2) out.push({ ...treePoint(t, a), r: 1.4 });
  const end = cut > 0 ? cutAt(cut - 1) : TREE.tip;
  for (let a = TREE.trunk + 0.4; a < end - 0.2; a += 0.9) out.push({ ...treePoint(t, a), r: a > 0.3 ? 1.1 : 0.7 });
  return out;
}

/**
 * Where a storm's tree lies in this garden (null: none fits, or not this kind of garden): along a row of
 * ocaks, its root plate and crown inside the fence, clear of stones, hives, the hose, the stream and the
 * depot; its logs and where the worker stands to cut it on free ground once the ocaks under it are gone.
 */
export function pickFieldTree(f: Field, rnd: () => number): FieldTree | null {
  const lv = f.level;
  if ((lv.theme !== 'findik' && lv.theme !== 'yayla') || f.width < 20 || f.depth < 16) return null;
  const free = (x: number, z: number, m: number) =>
    Math.abs(x) < f.width / 2 - m &&
    Math.abs(z) < f.depth / 2 - m &&
    !f.inWater(x, z) &&
    !f.stones.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 0.4) &&
    !f.hives.some((h) => Math.hypot(h.x - x, h.z - z) < 2.5) &&
    !f.brambles.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + 0.3) &&
    (!f.hose.length || f.hoseDistance(x, z) > 1.5) &&
    !f.nearDepot(x, z, 3);
  // The rows of ocaks (along x), as they were planted.
  const rows: number[] = [];
  const d = f.depth - 4.4;
  const n = Math.max(1, Math.floor(d / lv.rowGap) + 1);
  for (let r = 0; r < n; r++) rows.push(-((n - 1) * lv.rowGap) / 2 + r * lv.rowGap);
  for (let tries = 0; tries < 40; tries++) {
    const t: FieldTree = {
      x: (rnd() - 0.5) * Math.max(0, f.width - 14),
      z: rows[Math.floor(rnd() * rows.length)] + (rnd() - 0.5) * 0.6,
      yaw: (rnd() < 0.5 ? 1 : -1) * Math.PI / 2 + (rnd() - 0.5) * 0.3,
      side: rnd() < 0.5 ? 1 : -1,
    };
    let ok = true;
    for (let a = TREE.root; a <= TREE.tip && ok; a += 1) for (const out of [-1.4, 0, 1.4]) if (!free(treePoint(t, a, out).x, treePoint(t, a, out).z, 0.8)) ok = false;
    for (let i = 0; i < WOOD.pieces && ok; i++) {
      const l = logPlace(t, i);
      const s = treePoint(t, cutAt(i), cutStand(i));
      if (!free(l.x, l.z, 0.6) || !free(s.x, s.z, 0.6)) ok = false;
    }
    if (ok) return t;
  }
  return null;
}

/**
 * The tree laid in the garden: the ocaks under it crushed (gone), no grass under its root plate (it
 * stays), the grass under the rest not to be mown till it is cut, the tree in the way.
 */
export function layTree(f: Field, t: FieldTree): void {
  for (let i = f.bushes.length - 1; i >= 0; i--) {
    const b = f.bushes[i];
    const l = local(t, b.x, b.z);
    if (b.kind === 'ocak' && l.along > TREE.root - 1 && l.along < TREE.tip + 1 && l.across < 2.8) f.bushes.splice(i, 1);
  }
  f.maskOut((x, z) => {
    const l = local(t, x, z);
    return l.along >= TREE.root && l.along < TREE.trunk && l.across < halfWidth(l.along);
  });
  f.shade = underTree(t, 0);
  f.blocks = treeBlocks(t, 0);
}

/** How far a pile stands from the middle of its track (m). */
const PILE_OFF = 3.4;

/** Where a pile waits (field coordinates), and where the vehicle's bed is brought beside it on the track. */
export function pileSpots(f: Field, p: LogPile): { pile: { x: number; z: number; yaw: number }; load: { x: number; z: number; yaw: number; w: number; d: number } } {
  const x = p.x - f.origin.x;
  const z = p.z - f.origin.z;
  return { pile: { x: x + Math.cos(p.yaw) * PILE_OFF * p.side, z: z - Math.sin(p.yaw) * PILE_OFF * p.side, yaw: p.yaw }, load: { x, z, yaw: p.yaw, w: 2.8, d: 4.2 } };
}

/**
 * A place for this garden's logs by the track outside its gate (village coordinates, without a count):
 * some metres back along the way in, where it runs straight, the side of it clear (no field, wall or
 * water). Null if none fits.
 */
export function gatePile(f: Field): LogPile | null {
  const pts = f.lane;
  if (pts.length < 8) return null;
  const rects = [...f.others, { minX: -f.width / 2, maxX: f.width / 2, minZ: -f.depth / 2, maxZ: f.depth / 2 }];
  const ok = (x: number, z: number) =>
    f.pointFree(x, z) && !f.inWater(x, z) && f.roadWallDistance(x, z) > 1 && !rects.some((r) => x > r.minX - 1.5 && x < r.maxX + 1.5 && z > r.minZ - 1.5 && z < r.maxZ + 1.5);
  // From the gate back along the lane.
  let dist = 0;
  for (let i = pts.length - 2; i >= 2; i--) {
    dist += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    if (dist < 8) continue;
    if (dist > 45) break;
    const a = pts[Math.max(0, i - 2)];
    const b = pts[Math.min(pts.length - 1, i + 2)];
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const p = pts[i];
    if (!f.vehicleFits(p.x, p.z, yaw, 0)) continue;
    for (const side of [1, -1]) {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const px = p.x + Math.cos(yaw) * PILE_OFF * side;
      const pz = p.z - Math.sin(yaw) * PILE_OFF * side;
      if ([-1.1, 0, 1.1].every((s) => ok(px + fx * s, pz + fz * s)) && ok(px + Math.cos(yaw) * side * 0.8, pz - Math.sin(yaw) * side * 0.8)) return { x: p.x + f.origin.x, z: p.z + f.origin.z, yaw, side, n: 0 };
    }
  }
  return null;
}

/** The yard's places (field coordinates): where the vehicle's bed is brought to unload, the woodpile rack beside it, and where the logs are stacked. */
export function woodSpots(f: Field): { unload: { x: number; z: number; yaw: number; w: number; d: number }; rack: { x: number; z: number; yaw: number }; pile: { x: number; z: number } } {
  const h = f.harman;
  return {
    unload: { x: h.x + h.r + 2.4, z: h.z + 0.5, yaw: 0, w: 3, d: 4.4 },
    // Its long side along z, its face towards the harman.
    rack: { x: h.x + h.r + 5.6, z: h.z + 0.5, yaw: -Math.PI / 2 },
    pile: { x: h.x + h.r + 5.3, z: h.z - 2.1 },
  };
}
