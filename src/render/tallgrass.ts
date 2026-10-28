import * as THREE from 'three';
import { CELL, CUT_HEIGHT } from '../game/config';
import type { Field } from '../game/field';

/**
 * Boy boyu ot: in the gardens with giant weeds (LevelDef.giant), clumps as tall as a man standing in the
 * thickest of them: the artist's four clumps (boy-ot.webp, side by side on one picture, their red fringe
 * cleaned off: scripts/clean-sprite.mjs) each on two upright planes crossed, so they look full from
 * anywhere. One goes as soon as the grass under it is mown (or flattened by a wheel).
 */

/** Where a clump stands (the grass that tall), how far apart at least, how many at most, how tall (m). */
const TALL = { at: 1.9, apart: 1.6, most: 160, height: [1.75, 2.25] as const, width: 1.35 };

export class TallGrassView {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly clumps: { x: number; z: number; mesh: number; i: number; m: THREE.Matrix4; up: boolean }[] = [];
  private next = 0;
  private readonly hide = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private readonly f: Field, ground: (x: number, z: number) => number, seed: number) {
    // The clumps' places: the tallest grass, on a loose grid, a little shaken.
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const spots: { x: number; z: number }[] = [];
    for (let z = -f.depth / 2 + 0.8; z < f.depth / 2 - 0.8 && spots.length < TALL.most; z += TALL.apart) {
      for (let x = -f.width / 2 + 0.8; x < f.width / 2 - 0.8 && spots.length < TALL.most; x += TALL.apart) {
        const px = x + (rnd() - 0.5) * TALL.apart * 0.8;
        const pz = z + (rnd() - 0.5) * TALL.apart * 0.8;
        if (f.grassAt(px, pz) < TALL.at || !f.pointFree(px, pz)) continue;
        spots.push({ x: px, z: pz });
      }
    }
    const tex = new THREE.TextureLoader().load('./textures/boy-ot.webp');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide });
    // One mesh for each of the four clumps (each its quarter of the picture), as many as it stands.
    const per = [0, 0, 0, 0];
    const pick = spots.map(() => Math.floor(rnd() * 4));
    for (const k of pick) per[k]++;
    for (let k = 0; k < 4; k++) {
      const g = crossed(TALL.width, 1, k);
      const m = new THREE.InstancedMesh(g, mat, Math.max(1, per[k]));
      m.count = per[k];
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.meshes.push(m);
      this.group.add(m);
    }
    const used = [0, 0, 0, 0];
    const o = new THREE.Object3D();
    spots.forEach((p, n) => {
      const k = pick[n];
      const h = TALL.height[0] + rnd() * (TALL.height[1] - TALL.height[0]);
      o.position.set(p.x, ground(p.x, p.z) - 0.05, p.z);
      o.rotation.set(0, rnd() * Math.PI, (rnd() - 0.5) * 0.08);
      o.scale.set(0.85 + rnd() * 0.3, h, 0.85 + rnd() * 0.3);
      o.updateMatrix();
      const i = used[k]++;
      this.meshes[k].setMatrixAt(i, o.matrix);
      this.clumps.push({ x: p.x, z: p.z, mesh: k, i, m: o.matrix.clone(), up: true });
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  /** How many clumps still stand (for the tests). */
  get standing(): number {
    return this.clumps.filter((c) => c.up).length;
  }

  /** Now and then: the clumps whose grass is mown (or flattened) go (a few looked at each frame). */
  update(): void {
    const n = Math.min(this.clumps.length, 24);
    for (let k = 0; k < n; k++) {
      const c = this.clumps[this.next];
      this.next = (this.next + 1) % this.clumps.length;
      if (!c.up) continue;
      // (The cell round its foot: mown through, or rolled flat.)
      const g = Math.max(this.f.grassAt(c.x, c.z), this.f.grassAt(c.x + CELL, c.z), this.f.grassAt(c.x, c.z + CELL));
      if (g > Math.max(CUT_HEIGHT + 0.05, 0.6)) continue;
      c.up = false;
      this.meshes[c.mesh].setMatrixAt(c.i, this.hide);
      this.meshes[c.mesh].instanceMatrix.needsUpdate = true;
    }
  }
}

/** Two upright planes crossed (a unit tall, `w` wide, foot at y = 0), showing clump `k` of the four side by side. */
function crossed(w: number, h: number, k: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(w, h);
  a.translate(0, h / 2, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const g = new THREE.BufferGeometry();
  const pos = [...(a.getAttribute('position').array as Float32Array), ...(b.getAttribute('position').array as Float32Array)];
  const nor = [...(a.getAttribute('normal').array as Float32Array), ...(b.getAttribute('normal').array as Float32Array)];
  const uvA = a.getAttribute('uv').array as Float32Array;
  const uv: number[] = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < uvA.length; i += 2) uv.push((k + uvA[i]) / 4, uvA[i + 1]);
  const idx = a.getIndex()!.array as Uint16Array;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([...idx, ...Array.from(idx, (v) => v + 4)]);
  return g;
}
