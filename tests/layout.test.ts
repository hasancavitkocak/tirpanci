import { describe, expect, test } from 'vitest';
import { REGIONS, fieldRect, regionLevels, village } from '../src/game/village';

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

/** A field with its fence round it (2.9 m out at its sides and top, 1.5 m below), and a lane's room. */
const fenced = (f: Rect, m = 2): Rect => ({ minX: f.minX - 2.9 - m, maxX: f.maxX + 2.9 + m, minZ: f.minZ - 2.9 - m, maxZ: f.maxZ + 1.5 + m });
const overlap = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const nearRect = (p: { x: number; z: number }, r: Rect, d: number) => {
  const dx = Math.max(r.minX - p.x, 0, p.x - r.maxX);
  const dz = Math.max(r.minZ - p.z, 0, p.z - r.maxZ);
  return Math.hypot(dx, dz) < d;
};

describe('a village laid out', () => {
  test.each(REGIONS.map((r) => [r.name, r] as const))('its fields, yard, mosque, barn and mill apart: %s', (_, r) => {
    // (Built first: it sets the mill on the stream's bank.)
    const v = village(r);
    const fields = regionLevels(r).map((lv) => ({ name: lv.name, f: fieldRect(lv), yard: lv.theme === 'mezarlik' }));
    for (let i = 0; i < fields.length; i++) {
      for (let j = i + 1; j < fields.length; j++) {
        expect(overlap(fenced(fields[i].f, 0), fenced(fields[j].f, 0)), `${fields[i].name} / ${fields[j].name}`).toBe(false);
      }
      const f = fields[i].f;
      expect(nearRect(r.plateau, f, r.plateau.r + 4), `${fields[i].name} in the yard`).toBe(false);
      // (Its own walled yard, the graveyard, lies against it.)
      if (!fields[i].yard) expect(nearRect(r.mosque, f, 12), `${fields[i].name} at the mosque`).toBe(false);
      if (r.look?.barn) expect(nearRect(r.look.barn, f, 9), `${fields[i].name} at the barn`).toBe(false);
      if (r.mill) expect(nearRect(r.mill, f, 6), `${fields[i].name} at the mill`).toBe(false);
    }
    expect(Math.hypot(r.mosque.x - r.plateau.x, r.mosque.z - r.plateau.z), 'the mosque off the yard').toBeGreaterThan(r.plateau.r + 10);
    // Every job has its way there.
    for (const lv of regionLevels(r).filter((l) => l.id < 100)) expect(v.routes[lv.id]?.length, `${lv.name}: its way`).toBeGreaterThan(3);
  });
});
