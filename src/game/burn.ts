/**
 * The cut grass blown together and burned: from job BURN.from on, now and then a garden's owner wants
 * the mown grass cleared away too. Where the grass is mown its clippings lie in tufts; with the backpack
 * blower (bought once BURN.needs is open, carried in the pat pat's box; started on its cord, worked on the
 * trimmer's trigger) they are blown along, the more throttle the harder and further, to the heap's
 * marked place in the middle of the garden. Most of them there (BURN.done), the heap is set alight and
 * burns down; the owner pays BURN.pay at the end.
 */

import { CUT_HEIGHT } from './config';
import type { Field } from './field';

export const BURN = {
  /** The job the blower is on sale from, the first job the owner may want the grass burned, and how often. */
  needs: 8,
  from: 8,
  chance: 0.35,
  /** The blower in the shop. */
  tool: { id: 'ufleyici', name: 'Üfleme Makinesi', desc: 'Sırt tipi. Biçilen otu üfleyip bir yere toplar; sonra yakarsın. Aracın bagajında taşınır.', price: 6000 },
  /** Tufts of clippings over the garden (one every so many square metres, at most so many). */
  every: 2.2,
  most: 420,
  /** The heap's place (its radius, m); how much of the grass must be in it to burn it; the pay. */
  heapR: 2.2,
  done: 0.85,
  pay: 450,
  /** The air from the tube: how far it reaches (m), how wide (half the angle, radians), how hard it pushes (m/s² at full throttle). */
  reach: 5,
  spread: 0.42,
  push: 14,
  /** How long the heap burns (s). */
  burns: 18,
};

/** A tuft of clippings: where it lies, how fast it is blowing along, whether its grass is mown yet (shown), in the heap. */
export interface Tuft {
  x: number;
  z: number;
  vx: number;
  vz: number;
  shown: boolean;
  heaped: boolean;
}

/** This job's burning: the heap's place (field coordinates), the tufts, the fire (seconds burnt, once lit). */
export interface BurnTask {
  heap: { x: number; z: number };
  tufts: Tuft[];
  lit?: number;
}

/**
 * How much of the grass is in the heap (0..1), of what there is to gather: the tufts showing (the grass
 * mown), and never less than most of all of them (a few left unmown not to count against it).
 */
export function heaped(t: BurnTask): number {
  const shown = t.tufts.filter((q) => q.shown).length;
  const n = Math.max(shown, t.tufts.length * 0.75, 1);
  return Math.min(1, t.tufts.filter((q) => q.heaped).length / n);
}

/** The pay as it stands: burned (lit), or nothing. */
export const burnPay = (t: BurnTask): number => (t.lit !== undefined ? BURN.pay : 0);

/**
 * A task for this garden: the heap in a clear spot near the middle (no ocak, stone or hive on it), the tufts
 * scattered over the grass, each to show once the grass under it is mown. Null if there is no room.
 */
export function pickBurnTask(f: Field, rnd: () => number): BurnTask | null {
  let heap: { x: number; z: number } | null = null;
  for (let k = 0; k < 60 && !heap; k++) {
    const x = (rnd() - 0.5) * f.width * 0.5;
    const z = (rnd() - 0.5) * f.depth * 0.5;
    let ok = true;
    for (let a = 0; a < 8 && ok; a++) {
      const px = x + Math.cos((a / 8) * Math.PI * 2) * BURN.heapR;
      const pz = z + Math.sin((a / 8) * Math.PI * 2) * BURN.heapR;
      if (!f.pointFree(px, pz) || f.inWater(px, pz)) ok = false;
    }
    if (ok && f.pointFree(x, z)) heap = { x, z };
  }
  if (!heap) return null;
  const tufts: Tuft[] = [];
  const area = f.width * f.depth;
  const n = Math.min(BURN.most, Math.round(area / BURN.every));
  for (let k = 0; tufts.length < n && k < n * 6; k++) {
    const x = (rnd() - 0.5) * (f.width - 1);
    const z = (rnd() - 0.5) * (f.depth - 1);
    if (f.grassAt(x, z) <= 0 || Math.hypot(x - heap.x, z - heap.z) < BURN.heapR + 0.5) continue;
    tufts.push({ x, z, vx: 0, vz: 0, shown: false, heaped: false });
  }
  return { heap, tufts };
}

/** The grass mown where tufts lie: they show (a few a call, to spread the work). */
export function revealTufts(t: BurnTask, f: Field, from: number, count: number): number {
  for (let i = 0; i < count; i++) {
    const q = t.tufts[(from + i) % t.tufts.length];
    if (!q.shown && f.grassAt(q.x, q.z) <= CUT_HEIGHT + 0.01) q.shown = true;
  }
  return (from + count) % Math.max(1, t.tufts.length);
}

/**
 * A moment of the blower: the tube's mouth at (x, z) pointing along `yaw`, at `throttle`: the tufts in
 * its air pushed along it (harder near the mouth), all of them sliding on and slowing in the grass, those
 * that come to the heap's place staying in it, those against the fence stopping there.
 */
export function blow(t: BurnTask, f: Field, x: number, z: number, yaw: number, throttle: number, dt: number): void {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  for (const q of t.tufts) {
    if (!q.shown || q.heaped) continue;
    if (throttle > 0.05) {
      const dx = q.x - x;
      const dz = q.z - z;
      const along = dx * fx + dz * fz;
      const reach = BURN.reach * (0.45 + 0.55 * throttle);
      if (along > 0 && along < reach) {
        const across = Math.abs(dx * fz - dz * fx);
        if (across < along * Math.tan(BURN.spread) + 0.4) {
          const k = BURN.push * throttle * (1 - along / reach);
          q.vx += fx * k * dt;
          q.vz += fz * k * dt;
        }
      }
    }
    if (q.vx || q.vz) {
      q.x += q.vx * dt;
      q.z += q.vz * dt;
      // Slowed by the grass and the ground.
      const slow = Math.exp(-dt * 3.2);
      q.vx *= slow;
      q.vz *= slow;
      if (Math.hypot(q.vx, q.vz) < 0.05) q.vx = q.vz = 0;
      // (Held at the fence.)
      const mx = f.width / 2 - 0.3;
      const mz = f.depth / 2 - 0.3;
      if (Math.abs(q.x) > mx || Math.abs(q.z) > mz) {
        q.x = Math.max(-mx, Math.min(mx, q.x));
        q.z = Math.max(-mz, Math.min(mz, q.z));
        q.vx = q.vz = 0;
      }
      if (Math.hypot(q.x - t.heap.x, q.z - t.heap.z) < BURN.heapR) {
        q.heaped = true;
        q.vx = q.vz = 0;
      }
    }
  }
}
