import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/game/config';
import { Field } from '../src/game/field';
import { TREE, WOOD, cutAt, cutStand, gatePile, layTree, loadLog, logPlace, logsWaiting, newWood, pickFieldTree, pileSpots, sellStock, stackLog, treePoint, underTree, woodCapacity, woodSpots } from '../src/game/wood';

/** The Karadere gardens a storm's tree may come down in. */
const gardens = LEVELS.filter((l) => l.region === WOOD.region && l.id >= WOOD.from);
const seeded = (seed: number) => {
  let s = seed * 7919;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

describe('the storm’s wood', () => {
  it('logs go from the piles onto the vehicle, into the yard, and are sold from there', () => {
    const w = newWood();
    w.piles.push({ x: 0, z: 0, yaw: 0, side: 1, n: 8 }, { x: 9, z: 0, yaw: 0, side: 1, n: 3 });
    const cap = woodCapacity(false, false);
    while (loadLog(w, 0, cap));
    expect(w.load).toBe(cap);
    expect(w.piles[0].n).toBe(8 - cap);
    while (stackLog(w));
    expect(w.stock).toBe(cap);
    while (loadLog(w, 0, cap) || loadLog(w, 1, cap));
    while (stackLog(w));
    while (loadLog(w, 1, cap));
    while (stackLog(w));
    expect(logsWaiting(w)).toBe(0);
    expect(w.stock).toBe(11);
    expect(sellStock(w)).toBe(11 * WOOD.pricePerLog);
    expect(w.stock).toBe(0);
    expect(loadLog(w, 0, cap)).toBe(false);
  });

  it('the tractor carries logs only with its trailer', () => {
    expect(woodCapacity(true, false)).toBe(0);
    expect(woodCapacity(true, true)).toBe(WOOD.capacity.trailer);
    expect(woodCapacity(false, false)).toBe(WOOD.capacity.patpat);
  });

  it('a tree comes down in every garden it may, across a row of ocaks, in the fence, its logs and the worker’s places free', () => {
    for (const lv of gardens) {
      if (lv.theme !== 'findik' && lv.theme !== 'yayla') continue;
      for (let seed = 1; seed <= 8; seed++) {
        const f = new Field(lv);
        const t = pickFieldTree(f, seeded(seed));
        expect(t, `job ${lv.id} seed ${seed}`).not.toBeNull();
        if (!t) continue;
        const bushes = f.bushes.length;
        const total = f.total;
        layTree(f, t);
        // The ocaks under it gone; no grass under its root plate.
        expect(f.bushes.length).toBeLessThanOrEqual(bushes);
        expect(f.total).toBeLessThan(total);
        for (let a = TREE.root; a <= TREE.tip; a += 1) {
          const q = treePoint(t, a);
          expect(f.inField(q.x, q.z), `job ${lv.id}: the tree at ${a} m in the garden`).toBe(true);
          expect(f.bushes.some((b) => b.kind === 'ocak' && Math.hypot(b.x - q.x, b.z - q.z) < 1), `job ${lv.id}: no ocak under it`).toBe(false);
        }
        expect(f.pointFree(t.x, t.z), 'in the way').toBe(false);
        for (let i = 0; i < WOOD.pieces; i++) {
          const l = logPlace(t, i);
          expect(f.pointFree(l.x, l.z), `job ${lv.id}: log ${i}`).toBe(true);
          const st = treePoint(t, cutAt(i), cutStand(i));
          expect(f.pointFree(st.x, st.z), `job ${lv.id}: standing to cut ${i}`).toBe(true);
        }
      }
    }
  });

  it('the grass under the tree is mown only once it is cut', () => {
    const lv = gardens.find((l) => l.theme === 'findik')!;
    const f = new Field(lv);
    const t = pickFieldTree(f, seeded(3))!;
    layTree(f, t);
    // Out in the crown: the line across it cuts nothing there.
    const a = treePoint(t, 3, -1.5);
    const b = treePoint(t, 3, 1.5);
    expect(underTree(t, 0)(treePoint(t, 3).x, treePoint(t, 3).z)).toBe(true);
    const before = f.mown;
    f.cutSegment(a.x, a.z, b.x, b.z, 0.2);
    const blocked = f.mown - before;
    // Cut back past it: now it is mown.
    f.shade = underTree(t, 3);
    f.cutSegment(a.x, a.z, b.x, b.z, 0.2);
    expect(f.mown - before - blocked).toBeGreaterThan(5);
    // (The ends of the line past the crown's edge are mown either way.)
    expect(blocked).toBeLessThan(6);
  });

  it('the logs are piled by the track outside each garden’s gate, the vehicle beside them', () => {
    for (const lv of LEVELS.filter((l) => l.region === WOOD.region)) {
      const f = new Field(lv);
      const p = gatePile(f);
      expect(p, `job ${lv.id}`).not.toBeNull();
      if (!p) continue;
      const sp = pileSpots(f, { ...p, n: 8 });
      expect(f.pointFree(sp.pile.x, sp.pile.z), `job ${lv.id}: the pile`).toBe(true);
      expect(f.inField(sp.pile.x, sp.pile.z), `job ${lv.id}: outside the garden`).toBe(false);
      expect(f.vehicleFits(sp.load.x, sp.load.z, sp.load.yaw, 0), `job ${lv.id}: the vehicle beside it`).toBe(true);
    }
  });

  it('has its unload place in the yard free for the vehicle, the stack beside the rack', () => {
    for (const lv of LEVELS.filter((l) => l.region === WOOD.region)) {
      const f = new Field(lv);
      const sp = woodSpots(f);
      for (const dz of [-1.6, 0, 1.6]) expect(f.vehicleFits(sp.unload.x, sp.unload.z + dz, 0, 0), `job ${lv.id}`).toBe(true);
      expect(f.pointFree(sp.pile.x, sp.pile.z)).toBe(true);
      expect(f.yardProps.filter((y) => y.kind === 'rack').length).toBe(2);
      expect(Math.hypot(sp.rack.x - f.plateau.x, sp.rack.z - f.plateau.z)).toBeLessThan(f.plateau.r - 1);
    }
    expect(new Field(LEVELS[0]).yardProps.some((y) => y.kind === 'rack')).toBe(false);
  });
});
