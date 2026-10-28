import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/game/config';
import { Field } from '../src/game/field';

describe('the way to each job', () => {
  it('can be driven: no other field, fence or wall across it (out of the yard and up to its gate)', () => {
    const bad: string[] = [];
    for (const lv of LEVELS) {
      const f = new Field(lv);
      // (Its first metres wind out of the yard through its gate, shut till opened; its last ones come up to the walled graveyard's gate.)
      f.lane.slice(0, -6).forEach((p) => {
        if (Math.hypot(p.x - f.plateau.x, p.z - f.plateau.z) < f.plateau.r + 2) return;
        if (!f.vehicleFits(p.x, p.z, 0)) bad.push(`${lv.id} (${(p.x + f.origin.x).toFixed(0)}, ${(p.z + f.origin.z).toFixed(0)})`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('keeps off the dry-stone walls', () => {
    const bad: string[] = [];
    for (const lv of LEVELS) {
      const f = new Field(lv);
      if (f.lane.some((p) => f.roadWallDistance(p.x, p.z) < 1.8)) bad.push(String(lv.id));
    }
    expect(bad).toEqual([]);
  });
});
