import { describe, expect, it } from 'vitest';
import { CUT_HEIGHT, LEVELS } from '../src/game/config';
import { Field } from '../src/game/field';
import { BURN, blow, burnPay, heaped, pickBurnTask, revealTufts } from '../src/game/burn';

const gardens = LEVELS.filter((l) => l.id >= BURN.from && l.id < 100 && (l.theme === 'findik' || l.theme === 'yayla'));
const seeded = (seed: number) => {
  let s = seed * 7919;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

describe('the cut grass blown together and burned', () => {
  it('finds the heap a clear place in every garden it may be asked in, the tufts over the grass', () => {
    for (const lv of gardens) {
      const f = new Field(lv);
      const t = pickBurnTask(f, seeded(lv.id));
      expect(t, `job ${lv.id}`).not.toBeNull();
      if (!t) continue;
      expect(f.pointFree(t.heap.x, t.heap.z)).toBe(true);
      expect(t.tufts.length).toBeGreaterThan(50);
      expect(t.tufts.every((q) => !q.shown && f.inField(q.x, q.z))).toBe(true);
    }
  });

  it('shows the tufts as the grass is mown; the air pushes them along; in the heap they stay; lit, it pays', () => {
    const f = new Field(gardens[0]);
    const t = pickBurnTask(f, seeded(3))!;
    // Mown everywhere: they all show.
    f.grass.fill(CUT_HEIGHT);
    let at = 0;
    for (let i = 0; i < t.tufts.length; i += 50) at = revealTufts(t, f, at, 50);
    expect(t.tufts.every((q) => q.shown)).toBe(true);
    // A tuft 2 m ahead of the tube, the heap 6 m on: blown there at full throttle.
    const q = t.tufts[0];
    q.x = t.heap.x;
    q.z = t.heap.z - 4;
    q.vx = q.vz = 0;
    for (let k = 0; k < 120; k++) blow(t, f, t.heap.x, q.heaped ? t.heap.z : t.heap.z - 6, 0, 1, 1 / 30);
    expect(q.heaped).toBe(true);
    // Ticking over the air hardly moves them.
    const r = t.tufts[1];
    const r0 = { x: r.x, z: r.z };
    blow(t, f, r.x, r.z - 1.5, 0, 0, 1);
    expect(Math.hypot(r.x - r0.x, r.z - r0.z)).toBeLessThan(0.01);
    // All in: ready, nothing paid till lit.
    for (const u of t.tufts) u.heaped = true;
    expect(heaped(t)).toBeGreaterThanOrEqual(BURN.done);
    expect(burnPay(t)).toBe(0);
    t.lit = 0;
    expect(burnPay(t)).toBe(BURN.pay);
  });
});
