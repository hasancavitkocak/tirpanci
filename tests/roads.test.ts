import { describe, expect, test } from 'vitest';
import { REGIONS, entryX, fieldRect, regionLevels, village } from '../src/game/village';

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

/** How far a point is from a field's wooden fence (as VillageView draws it: 2.9 m out at its sides and top, 1.5 m below, a 2 m gap either side of its gate). */
function fromFence(p: { x: number; z: number }, f: Rect, gate: number): number {
  const F = { minX: f.minX - 2.9, maxX: f.maxX + 2.9, minZ: f.minZ - 2.9, maxZ: f.maxZ + 1.5 };
  const runs = [
    [F.minX, F.maxZ, F.minX, F.minZ],
    [F.minX, F.minZ, F.maxX, F.minZ],
    [F.maxX, F.minZ, F.maxX, F.maxZ],
    [F.maxX, F.maxZ, gate + 2, F.maxZ],
    [gate - 2, F.maxZ, F.minX, F.maxZ],
  ];
  let m = Infinity;
  for (const [ax, az, bx, bz] of runs) {
    const vx = bx - ax;
    const vz = bz - az;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.z - az) * vz) / (vx * vx + vz * vz || 1)));
    m = Math.min(m, Math.hypot(p.x - ax - vx * t, p.z - az - vz * t));
  }
  return m;
}

describe('the village tracks', () => {
  // (Değirmen Önü's ran right along its fence line: the posts and wires down the middle of the lane.)
  test.each(REGIONS.map((r) => [r.name, r] as const))('keep their lane off the fences: %s', (_, r) => {
    const v = village(r);
    const fields = regionLevels(r).filter((l) => l.theme !== 'mezarlik');
    for (const rd of v.roads) {
      const end = rd.pts[rd.pts.length - 1];
      for (const lv of fields) {
        const f = fieldRect(lv);
        const gate = entryX(lv);
        // (Its own way in, through the gap: not counted.)
        const own = Math.hypot(end.x - gate, end.z - f.maxZ - 0.4) < 0.5;
        for (const p of rd.pts) {
          if (own && Math.hypot(p.x - end.x, p.z - end.z) < 6) continue;
          expect(fromFence(p, f, gate), `${lv.name} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toBeGreaterThan(2.1);
        }
      }
    }
  });
});
