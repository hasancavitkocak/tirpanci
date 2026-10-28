import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/game/config';
import { Field } from '../src/game/field';
import { TILL, layBostan, pickTillTask, tillAt, tillPay, tilled } from '../src/game/tiller';

const gardens = LEVELS.filter((l) => l.id >= TILL.from && l.id < 100 && (l.theme === 'findik' || l.theme === 'yayla'));
const seeded = (seed: number) => {
  let s = seed * 7919;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

describe('the motor çapa', () => {
  it('finds a bostan or some ocaks to till in every garden it may be asked in', () => {
    for (const lv of gardens) {
      for (const kind of ['bostan', 'ocak'] as const) {
        const f = new Field(lv);
        const t = pickTillTask(f, kind, seeded(lv.id));
        // (A highland meadow has no ocaks: there it is the bostan.)
        if (kind === 'ocak' && f.bushes.filter((b) => b.kind === 'ocak').length < 3) {
          expect(t).toBeNull();
          continue;
        }
        expect(t, `job ${lv.id} ${kind}`).not.toBeNull();
        if (!t) continue;
        expect(t.cells.length).toBeGreaterThan(20);
        for (const c of t.cells) expect(f.inField(c.x, c.z), `job ${lv.id}: a cell in the garden`).toBe(true);
        if (t.rect) {
          // Laid out: the ocaks in its corner gone, no grass on it.
          const r = t.rect;
          const total = f.total;
          layBostan(f, t);
          expect(f.bushes.some((b) => Math.abs(b.x - r.x) < r.w / 2 + 1 && Math.abs(b.z - r.z) < r.d / 2 + 1)).toBe(false);
          expect(f.total).toBeLessThan(total);
        }
      }
    }
  });

  it('turns the soil over under its tines with the throttle; pays once it is nearly all done', () => {
    const f = new Field(gardens[0]);
    const t = pickTillTask(f, 'bostan', seeded(5))!;
    expect(tillPay(t)).toBe(0);
    // Ticking over: nothing.
    const c = t.cells[0];
    tillAt(t, c.x, c.z, 0, 0.1, 5);
    expect(c.t).toBe(0);
    // Full throttle over every cell, row by row (heading along z, the tines across x).
    const r = t.rect!;
    for (let x = r.x - r.w / 2; x <= r.x + r.w / 2; x += 0.5)
      for (let z = r.z - r.d / 2; z <= r.z + r.d / 2; z += 0.25) tillAt(t, x, z, 0, 1, 0.2);
    expect(tilled(t)).toBeGreaterThanOrEqual(TILL.done);
    expect(tillPay(t)).toBe(TILL.pay.bostan);
    // The ocaks' feet: paid by the ocak.
    const o = pickTillTask(new Field(gardens[0]), 'ocak', seeded(9))!;
    for (const c of o.cells) c.t = 1;
    expect(tillPay(o)).toBe((o.ocaks?.length ?? 0) * TILL.pay.ocak);
  });
});
