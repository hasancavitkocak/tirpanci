/**
 * The motor çapa (tiller): from job TILL.from on, now and then a garden's owner asks for some tilling on
 * top of the mowing: the bostan in a corner of the garden (a bare plot of hard ground), or round the
 * foot of some of the ocaks. The tiller (bought once TILL.needs is open) rides in the pat pat's box; taken
 * out (the trimmer put away), started on its cord, it is walked over the ground on the throttle: its tines
 * turn the soil over, a cell at a time, and the soil rises loose. Done (TILL.done of its cells) when the
 * job ends, the owner pays TILL.pay on top.
 */

import type { Field } from './field';

export const TILL = {
  /** The job it is on sale from, the first job a garden may want tilling, and how often. */
  needs: 12,
  from: 12,
  chance: 0.4,
  /** The tiller in the shop. */
  tool: { id: 'capa', name: 'Motor Çapa', desc: 'Bostanı ve ocak diplerini çapalar; toprak kabarır. Patpatın kasasında taşınır.', price: 9000 },
  /** A cell of ground (m), and how much of the plot must be tilled for the pay. */
  cell: 0.5,
  done: 0.9,
  /** What the owner pays on top: the bostan; each ocak's foot. */
  pay: { bostan: 700, ocak: 90 },
  /** The bostan's size (m), and how many ocaks' feet; the ring round each ocak (m from its middle). */
  bostan: { w: 7, d: 5 },
  ocaks: 6,
  ring: { in: 0.7, out: 1.9 },
  /** How long the tines take over a cell at full throttle (s), and how far either side of the tines' middle they reach (m). */
  pace: 0.25,
  half: 0.3,
};

/** This job's tilling: what, where (field coordinates) and its cells (how far each is tilled, 0..1). */
export interface TillTask {
  kind: 'bostan' | 'ocak';
  /** The bostan's middle and size; or the ocaks (their middles). */
  rect?: { x: number; z: number; w: number; d: number };
  ocaks?: { x: number; z: number }[];
  cells: { x: number; z: number; t: number }[];
}

/** How much of the task is done (0..1). */
export const tilled = (t: TillTask): number => (t.cells.length ? t.cells.filter((c) => c.t >= 1).length / t.cells.length : 1);

/** What the owner pays for it as it stands (nothing short of TILL.done). */
export function tillPay(t: TillTask): number {
  if (tilled(t) < TILL.done) return 0;
  return t.kind === 'bostan' ? TILL.pay.bostan : (t.ocaks?.length ?? 0) * TILL.pay.ocak;
}

/**
 * A task for this garden (null: none fits): the bostan in a lower corner (no ocak there: layBostan), or
 * the feet of some ocaks near the lower side.
 */
export function pickTillTask(f: Field, kind: 'bostan' | 'ocak', rnd: () => number): TillTask | null {
  const C = TILL.cell;
  if (kind === 'bostan') {
    const { w, d } = TILL.bostan;
    for (let k = 0; k < 30; k++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * (f.width / 2 - w / 2 - 1.2 - rnd() * 4);
      const z = f.depth / 2 - d / 2 - 1.2 - rnd() * 6;
      if (Math.abs(x - f.entryX) < w / 2 + 2.5) continue;
      // (Its ground clear of stones, hives, the hose, the water; the ocaks there are taken out: layBostan.)
      let ok = true;
      const free = (px: number, pz: number) =>
        Math.abs(px) < f.width / 2 - 0.3 && Math.abs(pz) < f.depth / 2 - 0.3 && !f.inWater(px, pz) && !f.stones.some((s) => Math.hypot(s.x - px, s.z - pz) < s.r + 0.3) && !f.hives.some((h) => Math.hypot(h.x - px, h.z - pz) < 2) && (!f.hose.length || f.hoseDistance(px, pz) > 1) && !f.nearDepot(px, pz, 2);
      for (let u = -w / 2; u <= w / 2 && ok; u += 1) for (let v = -d / 2; v <= d / 2 && ok; v += 1) if (!free(x + u, z + v)) ok = false;
      if (!ok) continue;
      const cells: TillTask['cells'] = [];
      for (let u = -w / 2 + C / 2; u < w / 2; u += C) for (let v = -d / 2 + C / 2; v < d / 2; v += C) cells.push({ x: x + u, z: z + v, t: 0 });
      return { kind, rect: { x, z, w, d }, cells };
    }
    return null;
  }
  // The ocaks nearest the lower side (where the worker comes in), with ground round them to till.
  const near = f.bushes.filter((b) => b.kind === 'ocak' && f.inField(b.x, b.z)).sort((a, b) => b.z - a.z || a.x - b.x);
  const ocaks: { x: number; z: number }[] = [];
  for (const b of near) {
    if (ocaks.length >= TILL.ocaks) break;
    if (rnd() < 0.25) continue;
    ocaks.push({ x: b.x, z: b.z });
  }
  if (ocaks.length < 3) return null;
  const cells: TillTask['cells'] = [];
  for (const o of ocaks) {
    for (let u = -TILL.ring.out; u <= TILL.ring.out; u += C) {
      for (let v = -TILL.ring.out; v <= TILL.ring.out; v += C) {
        const r = Math.hypot(u, v);
        const x = o.x + u;
        const z = o.z + v;
        if (r < TILL.ring.in || r > TILL.ring.out || !f.inField(x, z) || f.inWater(x, z)) continue;
        if (cells.some((c) => Math.abs(c.x - x) < 0.01 && Math.abs(c.z - z) < 0.01)) continue;
        cells.push({ x, z, t: 0 });
      }
    }
  }
  return { kind, ocaks, cells };
}

/** The bostan laid out: the ocaks in its corner gone, no grass on it (bare ground, out of the mowing). */
export function layBostan(f: Field, t: TillTask): void {
  const r = t.rect;
  if (!r) return;
  for (let i = f.bushes.length - 1; i >= 0; i--) {
    const b = f.bushes[i];
    if (Math.abs(b.x - r.x) < r.w / 2 + 1.3 && Math.abs(b.z - r.z) < r.d / 2 + 1.3) f.bushes.splice(i, 1);
  }
  f.maskOut((x, z) => Math.abs(x - r.x) < r.w / 2 + 0.15 && Math.abs(z - r.z) < r.d / 2 + 0.15);
}

/**
 * The tines over the ground a moment (their middle at (x, z), across the heading `yaw`), at `throttle`:
 * the cells under them turned over that much more. Returns the cells finished just now.
 */
export function tillAt(t: TillTask, x: number, z: number, yaw: number, throttle: number, dt: number): number {
  if (throttle < 0.2) return 0;
  const ax = Math.cos(yaw);
  const az = -Math.sin(yaw);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  let done = 0;
  for (const c of t.cells) {
    if (c.t >= 1) continue;
    const dx = c.x - x;
    const dz = c.z - z;
    if (Math.abs(dx * ax + dz * az) > TILL.half + TILL.cell / 2 || Math.abs(dx * fx + dz * fz) > TILL.cell * 0.7) continue;
    c.t = Math.min(1, c.t + (dt / TILL.pace) * throttle);
    if (c.t >= 1) done++;
  }
  return done;
}
