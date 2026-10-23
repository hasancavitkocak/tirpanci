import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PATPAT } from '../game/config';
import type { Field } from '../game/field';

/**
 * The pat pat from its artist model (patpat_tum, one mesh, front towards -X, wheels left off), cut
 * in two at the hitch pin: the head (engine, front axle) turns about the pin in front of the chassis
 * (seat, steering column, cargo box, rear axle). Measured from the model (model units):
 */
const BODY = {
  /** Overall length in metres (the model is scaled to it). */
  length: 3.34,
  /** The hitch pin: the head is everything ahead of it. */
  pinX: -0.25,
  /** The axle hubs' height. */
  hubY: 0.038,
  /** The point of the chassis that is the vehicle's position (half way from the pin to the tail). */
  refX: 0.1205,
  seatY: 0.21,
  /** The cargo box's floor. */
  floorY: 0.165,
  /**
   * The model's own steering column and mirror stand off to the left (z > 0); everything inside this
   * box is cut away and a column is put on the centre line instead.
   */
  columnCut: { minX: -0.25, maxX: -0.12, minY: 0.205, minZ: 0.02, maxZ: 0.145 },
  /** Front of the driver's floor, where the new column stands. */
  columnX: -0.2,
};
/** Wheel diameter (the same tyre all round), steering wheel diameter, metres. */
const WHEEL = 0.62;
const STEERING_WHEEL = 0.42;

/**
 * Repaint a part: its blue paint (strongly blue texels) turned to another hue, the light and shade of
 * the paint kept. On its own copies of the materials.
 */
type PaintUniforms = { uHue: { value: number }; uOn: { value: number } };

function repaint(root: THREE.Object3D, u: PaintUniforms): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => {
      const c = x.clone();
      c.onBeforeCompile = (sh) => {
        sh.uniforms.uHue = u.uHue;
        sh.uniforms.uOn = u.uOn;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uHue;\nuniform float uOn;').replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            vec3 c = diffuseColor.rgb;
            float mx = max(c.r, max(c.g, c.b));
            float mn = min(c.r, min(c.g, c.b));
            if (uOn > 0.5 && c.b >= mx && mx - mn > 0.06 && c.b > c.r * 1.25) {
              float sat = (mx - mn) / max(mx, 1e-4);
              vec3 target = clamp(abs(mod(uHue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
              diffuseColor.rgb = mx * mix(vec3(1.0), target, sat);
            }
          }`,
        );
      };
      c.customProgramCacheKey = () => 'patpat-paint';
      return c;
    });
    m.material = Array.isArray(m.material) ? mats : mats[0];
  });
}

/**
 * A copy of the model with its own geometry: the old field's scene is disposed when a new one is
 * built, and a geometry shared with it would be disposed under the new pat pat.
 */
function prepared(gltf: GLTF): THREE.Object3D {
  const m = gltf.scene.clone(true);
  m.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    mesh.castShadow = mesh.receiveShadow = true;
  });
  return m;
}

/** One wheel of the given diameter: `outer` sits at the axle end, `spin` rolls about its X axis. */
function wheel(gltf: GLTF, diameter: number, side: number): { outer: THREE.Object3D; spin: THREE.Object3D } {
  const m = prepared(gltf);
  const box = new THREE.Box3().setFromObject(m);
  const c = box.getCenter(new THREE.Vector3());
  const k = diameter / Math.max(box.max.y - box.min.y, box.max.z - box.min.z);
  m.scale.setScalar(k);
  m.position.copy(c).multiplyScalar(-k);
  const spin = new THREE.Object3D();
  spin.add(m);
  const outer = new THREE.Object3D();
  // The same model on both sides: turned round on the right so the rim faces out there too.
  if (side < 0) outer.rotation.y = Math.PI;
  outer.add(spin);
  return { outer, spin };
}

export class PatpatRig {
  /** The chassis with the cargo box, origin on the ground under the vehicle's position, +Z forward. */
  readonly kasa = new THREE.Group();
  /** The head, origin on the ground under the hitch pin, +Z forward. */
  readonly head = new THREE.Group();
  /** Where the hands hold the steering wheel (10 and 2 o'clock): [driver's right, driver's left]. */
  readonly grips: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  /** Height of the seat cushion above the ground under it. */
  readonly seatY: number;
  /** Height of the trailer floor above the ground (for loading it). */
  readonly floorY: number;
  private readonly wheels: { spin: THREE.Object3D; r: number; dir: number }[] = [];
  private readonly steering = new THREE.Object3D();
  /** The paint, shared by every repainted material (so it can be changed on the spot). */
  private readonly paintU: PaintUniforms = { uHue: { value: 0 }, uOn: { value: 0 } };
  private readonly columnMat = new THREE.MeshLambertMaterial({ color: '#1f4fa8' });

  /** `paintHue`: the pat pat repainted (its blue parts turned to this hue, 0..1), or null as it came. */
  constructor(parts: { body: GLTF; teker: GLTF; direksiyon?: GLTF }, paintHue: number | null = null) {
    this.setPaint(paintHue);
    const src = prepared(parts.body);
    const box = new THREE.Box3().setFromObject(src);
    const k = BODY.length / (box.max.x - box.min.x);
    const r = WHEEL / 2;
    const yOff = r - BODY.hubY * k;
    this.seatY = BODY.seatY * k + yOff;
    this.floorY = BODY.floorY * k + yOff;
    // Cut the mesh at the pin: each triangle goes to the part its middle lies in.
    const head = src.clone(true);
    const chassis = src;
    const split = (root: THREE.Object3D, ahead: boolean) =>
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.geometry.index) return;
        const g = m.geometry.clone();
        m.geometry = g;
        const pos = g.getAttribute('position');
        const idx = g.index!.array;
        const keep: number[] = [];
        const cut = BODY.columnCut;
        for (let t = 0; t < idx.length; t += 3) {
          const x = (pos.getX(idx[t]) + pos.getX(idx[t + 1]) + pos.getX(idx[t + 2])) / 3;
          const y = (pos.getY(idx[t]) + pos.getY(idx[t + 1]) + pos.getY(idx[t + 2])) / 3;
          const z = (pos.getZ(idx[t]) + pos.getZ(idx[t + 1]) + pos.getZ(idx[t + 2])) / 3;
          if (x > cut.minX && x < cut.maxX && y > cut.minY && z > cut.minZ && z < cut.maxZ) continue;
          if (x < BODY.pinX === ahead) keep.push(idx[t], idx[t + 1], idx[t + 2]);
        }
        g.setIndex(keep);
      });
    split(head, true);
    split(chassis, false);
    // Turned so the model's front (-X) points +Z: model (x, y, z) lands at (z, y, -x) × k, plus the
    // part's origin (the pin for the head, the reference point for the chassis).
    const place = (m: THREE.Object3D, originX: number) => {
      m.scale.setScalar(k);
      m.rotation.y = Math.PI / 2;
      m.position.set(0, yOff, originX * k);
    };
    place(head, BODY.pinX);
    place(chassis, BODY.refX);
    this.head.add(head);
    this.kasa.add(chassis);
    for (const part of [head, chassis]) repaint(part, this.paintU);
    for (const s of [-1, 1]) {
      const w = wheel(parts.teker, WHEEL, s);
      w.outer.position.set(s * PATPAT.headTrack, r, PATPAT.headAxle);
      this.head.add(w.outer);
      this.wheels.push({ spin: w.spin, r, dir: s < 0 ? -1 : 1 });
    }
    for (const s of [-1, 1]) {
      const w = wheel(parts.teker, WHEEL, s);
      w.outer.position.set(s * PATPAT.kasaTrack, r, -PATPAT.rearAxle);
      this.kasa.add(w.outer);
      this.wheels.push({ spin: w.spin, r, dir: s < 0 ? -1 : 1 });
    }

    // The steering column on the centre line: from the front of the floor up and back towards the
    // seat, the wheel on top where the seated driver's hands reach it.
    const base = new THREE.Vector3(0, this.floorY, (BODY.refX - BODY.columnX) * k);
    const top = new THREE.Vector3(0, this.seatY + 0.42, PATPAT.seat + 0.42);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, top.distanceTo(base), 10), this.columnMat);
    col.position.copy(top).add(base).multiplyScalar(0.5);
    col.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(base).normalize());
    col.castShadow = true;
    this.kasa.add(col);
    const mount = new THREE.Object3D();
    mount.position.copy(top);
    // The rim plane tilted 30° back from level, towards the driver.
    mount.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, Math.cos(0.52), -Math.sin(0.52)));
    mount.add(this.steering);
    this.kasa.add(mount);
    const rim = STEERING_WHEEL / 2;
    if (parts.direksiyon) {
      const wheel = this.levelWheel(prepared(parts.direksiyon));
      repaint(wheel, this.paintU);
      this.steering.add(wheel);
    }
    else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rim, 0.018, 8, 32), new THREE.MeshLambertMaterial({ color: '#1d1d1f' }));
      ring.rotation.x = Math.PI / 2;
      this.steering.add(ring);
    }
    // In the mount the rim lies in the XZ plane; +Z is the far side (12 o'clock), +X the driver's left.
    const at = (a: number) => new THREE.Vector3(Math.sin(a) * rim, 0, Math.cos(a) * rim);
    this.grips[0].position.copy(at(-Math.PI / 3));
    this.grips[1].position.copy(at(Math.PI / 3));
    this.steering.add(this.grips[0], this.grips[1]);
  }

  /** Repaint it (hue 0..1), or back to its own blue (null). */
  setPaint(hue: number | null): void {
    this.paintU.uOn.value = hue === null ? 0 : 1;
    this.paintU.uHue.value = hue ?? 0;
    this.columnMat.color.set(hue === null ? '#1f4fa8' : new THREE.Color().setHSL(hue, 0.62, 0.4));
  }

  /** The steering wheel model laid flat (its rim in the XZ plane), centred and sized. */
  private levelWheel(m: THREE.Object3D): THREE.Object3D {
    m.updateMatrixWorld(true);
    const pts: THREE.Vector3[] = [];
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const p = mesh.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i += 3) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
    });
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts.length));
    // The rim's normal: the direction the points spread least along.
    let best = new THREE.Vector3(0, 1, 0);
    let low = Infinity;
    const d = new THREE.Vector3();
    for (let i = 0; i < 600; i++) {
      const u = (i + 0.5) / 600;
      const y = u;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.399963;
      d.set(Math.cos(a) * r, y, Math.sin(a) * r);
      let v = 0;
      for (const p of pts) {
        const t = (p.x - c.x) * d.x + (p.y - c.y) * d.y + (p.z - c.z) * d.z;
        v += t * t;
      }
      if (v < low) {
        low = v;
        best = d.clone();
      }
    }
    const q = new THREE.Quaternion().setFromUnitVectors(best, new THREE.Vector3(0, 1, 0));
    let rad = 0;
    for (const p of pts) {
      const l = p.clone().sub(c).applyQuaternion(q);
      rad = Math.max(rad, Math.hypot(l.x, l.z));
    }
    const k = STEERING_WHEEL / 2 / Math.max(1e-6, rad);
    const inner = new THREE.Group();
    m.position.copy(c).multiplyScalar(-1);
    inner.add(m);
    const outer = new THREE.Group();
    outer.quaternion.copy(q);
    outer.add(inner);
    const holder = new THREE.Group();
    holder.scale.setScalar(k);
    holder.add(outer);
    return holder;
  }

  /** Roll the wheels by `distance` metres; the steering wheel follows the head's angle. */
  update(distance: number, art: number): void {
    for (const w of this.wheels) w.spin.rotation.x += (distance / w.r) * w.dir;
    this.steering.rotation.y = (art / PATPAT.maxArt) * 2.4;
  }

  /** Stand both parts on the ground: each pitched and rolled to the terrain under its wheels and the pin. */
  place(f: Field, ground: (x: number, z: number) => number): void {
    const v = f.vehicle;
    const h = f.head(v.x, v.z, v.yaw, v.art);
    const w = f.patpatWheels();
    const g = w.map((p) => ground(p.x, p.z));
    const hj = ground(h.jx, h.jz);
    // Wheels: [head right, head left, trailer right, trailer left] (side -1 is the right).
    const hr = (g[2] + g[3]) / 2;
    const span = PATPAT.joint + PATPAT.rearAxle;
    this.kasa.position.set(v.x, hr + ((hj - hr) * PATPAT.rearAxle) / span, v.z);
    // Tilts held to what a real one takes: a wheel over a rut, a post or a bank's edge would otherwise
    // stand the short head up on its nose.
    const lim = (a: number, m: number) => Math.max(-m, Math.min(m, a));
    this.kasa.rotation.set(lim(Math.atan2(hr - hj, span), 0.35), v.yaw, lim(Math.atan2(g[3] - g[2], PATPAT.kasaTrack * 2), 0.3), 'YXZ');
    const ha = (g[0] + g[1]) / 2;
    this.head.position.set(h.jx, hj, h.jz);
    this.head.rotation.set(lim(Math.atan2(hj - ha, PATPAT.headAxle), 0.3), h.yaw, lim(Math.atan2(g[1] - g[0], PATPAT.headTrack * 2), 0.3), 'YXZ');
  }
}
