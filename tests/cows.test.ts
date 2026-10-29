import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Field } from '../src/game/field';
import { Cow } from '../src/render/cows';

const gltf = { scene: new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 2))), animations: [] } as unknown as GLTF;
const flat = () => 0;

/** A cow walked towards (tx, tz) round what `blocked` says is in the way: where it is after `secs`. */
function walk(blocked: (x: number, z: number) => boolean, from: [number, number], to: [number, number], secs: number): Cow {
  const f = { pointFree: (x: number, z: number) => !blocked(x, z) } as unknown as Field;
  const cow = new Cow(gltf, false, from[0], from[1], Math.atan2(to[0] - from[0], to[1] - from[1]));
  for (let t = 0; t < secs; t += 1 / 30) cow.step(1 / 30, f, { x: to[0], z: to[1] }, 0.8, flat);
  return cow;
}

describe('a cow in the way of something', () => {
  // (It turned a little and back each frame, standing against a wall or a tree for good.)
  it('goes round a wall across its way', () => {
    const wall = (x: number, z: number) => Math.abs(x) < 0.4 && Math.abs(z) < 4;
    const cow = walk(wall, [-5, 0.3], [5, 0], 60);
    expect(Math.hypot(cow.x - 5, cow.z)).toBeLessThan(1);
  });
  it('goes round a tree', () => {
    const tree = (x: number, z: number) => Math.hypot(x, z) < 1.2;
    const cow = walk(tree, [-5, 0], [5, 0], 40);
    expect(Math.hypot(cow.x - 5, cow.z)).toBeLessThan(1);
  });
  it('slides along a long wall towards a target past its end', () => {
    // (A garden wall along z = 0 from x -20 to 6; the target beyond it, behind its end.)
    const wall = (x: number, z: number) => Math.abs(z) < 0.4 && x > -20 && x < 6;
    const cow = walk(wall, [0, -3], [3, 4], 90);
    expect(Math.hypot(cow.x - 3, cow.z - 4)).toBeLessThan(1);
  });
});
