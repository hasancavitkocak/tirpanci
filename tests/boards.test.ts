import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/game/config';
import { Field } from '../src/game/field';
import { boardSpot } from '../src/render/villageView';

describe('name boards', () => {
  it('stand off the roads and tracks, by every field of every village', () => {
    const bad: string[] = [];
    for (const lv of LEVELS) {
      const f = new Field(lv, true);
      const own = boardSpot(f, f.entryX, f.depth / 2 + 3.9);
      if (lv.theme !== 'mezarlik' && f.roadDistance(own.x, own.z) < 2.2) bad.push(`${lv.id} own ${f.roadDistance(own.x, own.z).toFixed(2)}`);
      for (const o of f.others) {
        const wall = o.level.theme === 'mezarlik';
        const gx = wall ? (o.minX + o.maxX) / 2 : o.entryX;
        const gz = wall ? o.maxZ + 1.2 : o.maxZ + 1.5;
        const p = boardSpot(f, gx, gz);
        if (f.roadDistance(p.x, p.z) < 2.2) bad.push(`${lv.id}: ${o.level.id} ${f.roadDistance(p.x, p.z).toFixed(2)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
