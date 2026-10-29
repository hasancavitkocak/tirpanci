import { describe, expect, test } from 'vitest';
import { Field } from '../src/game/field';
import { LEVELS } from '../src/game/config';

describe('the ground round a garden', () => {
  // (Its banks were cut off 12 m out where its lumps faded: the ground dropped up to two metres in a
  // step, and the way into Taşlı Yamaç ran in a ditch.)
  test.each(LEVELS.map((lv) => [lv.name, lv] as const))('has no sudden steps: %s', (_, lv) => {
    const f = new Field(lv);
    const deck = (x: number, z: number) => (f as unknown as { bridgeDeck(x: number, z: number): number | null }).bridgeDeck(x, z) !== null;
    let worst = { d: 0, at: '' };
    for (let x = -f.width / 2 - 20; x < f.width / 2 + 20; x += 1) {
      for (let z = -f.depth / 2 - 20; z < f.depth / 2 + 20; z += 0.25) {
        const out = Math.hypot(Math.max(0, Math.abs(x) - f.width / 2), Math.max(0, Math.abs(z) - f.depth / 2));
        // (Not the garden's own banks, the stream's or the bridge's ends.)
        if (out < 1 || deck(x, z) || deck(x, z + 0.25) || Math.abs(x - f.streamX(z)) < 7) continue;
        const d = Math.abs(f.height(x, z + 0.25) - f.height(x, z));
        if (d > worst.d) worst = { d, at: `${x}, ${z}` };
      }
    }
    expect(worst.d, `at ${worst.at}`).toBeLessThan(0.3);
  });
});
