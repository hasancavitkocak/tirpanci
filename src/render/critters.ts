import * as THREE from 'three';
import { Field } from '../game/field';
import { makeRng } from '../game/rng';
import { Models, fitted } from './models';
import { paint } from './props';
import { carGroup, hiveGeometry } from './landmarks';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** Plump brown village hen facing +z (~0.4 m); the head is a separate part so it can peck. */
function henParts(): { body: THREE.BufferGeometry; head: THREE.BufferGeometry } {
  const rnd = makeRng(91);
  const b = new THREE.SphereGeometry(0.15, 8, 6);
  b.scale(0.85, 0.8, 1.15);
  b.translate(0, 0.2, 0);
  const tail = new THREE.ConeGeometry(0.08, 0.16, 5);
  tail.rotateX(-0.9);
  tail.translate(0, 0.28, -0.16);
  const legs = [-0.05, 0.05].map((x) => {
    const l = new THREE.CylinderGeometry(0.012, 0.012, 0.1, 4);
    l.translate(x, 0.05, 0);
    return paint(l, '#d9a531', 0, rnd);
  });
  const body = mergeGeometries([paint(b, '#9a5a2a', 0.2, rnd), paint(tail, '#5e3518', 0.2, rnd), ...legs].map((g) => (g.index ? g.toNonIndexed() : g)));
  const h = new THREE.SphereGeometry(0.065, 7, 5);
  const comb = new THREE.BoxGeometry(0.02, 0.05, 0.07);
  comb.translate(0, 0.06, 0);
  const beak = new THREE.ConeGeometry(0.018, 0.05, 4);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, -0.005, 0.07);
  const head = mergeGeometries([paint(h, '#a3622f', 0.15, rnd), paint(comb, '#d42a1e', 0, rnd), paint(beak, '#e0b03a', 0, rnd)].map((g) => (g.index ? g.toNonIndexed() : g)));
  body.computeVertexNormals();
  head.computeVertexNormals();
  return { body, head };
}

interface HenObj {
  root: THREE.Group;
  head: THREE.Object3D | null;
  phase: number;
}

/**
 * Everything alive or loose in the field: hens, snakes, bee swarms, the hose and the beehives, and on
 * the road job the passing cars. Positions come from the session; this only draws and animates.
 */
export class CrittersView {
  readonly group = new THREE.Group();
  private readonly hens: HenObj[] = [];
  private readonly snakes: THREE.Group[] = [];
  private readonly bees: THREE.Points | null = null;
  private readonly beePos: Float32Array | null = null;
  private readonly cars: { obj: THREE.Group; z: number; speed: number; lane: number }[] = [];
  /** Distance from the worker to the nearest car (for the traffic sound). */
  nearestCar = Infinity;

  constructor(private readonly field: Field, models: Models, private readonly heightAt: (x: number, z: number) => number) {
    const f = field;
    const g = this.group;
    const { body, head } = henParts();
    for (let i = 0; i < f.hens.length; i++) {
      const root = new THREE.Group();
      let headObj: THREE.Object3D | null = null;
      if (models.hen?.[0]) root.add(fitted(models.hen[0].scene, 0.4));
      else {
        const bm = new THREE.Mesh(body, MAT);
        bm.castShadow = true;
        root.add(bm);
        headObj = new THREE.Mesh(head, MAT);
        headObj.position.set(0, 0.33, 0.13);
        root.add(headObj);
      }
      g.add(root);
      this.hens.push({ root, head: headObj, phase: Math.random() * 10 });
    }

    // Snakes: a chain of segments laid along a wave behind the head.
    const segGeo = paint(new THREE.SphereGeometry(0.035, 6, 4), '#4d5a2a', 0.2);
    segGeo.computeVertexNormals();
    for (let i = 0; i < f.snakes.length; i++) {
      const s = new THREE.Group();
      if (models.snake?.[0]) s.add(fitted(models.snake[0].scene, 0.12));
      else for (let k = 0; k < 16; k++) s.add(new THREE.Mesh(segGeo, MAT));
      s.visible = false;
      g.add(s);
      this.snakes.push(s);
    }

    // Beehives and their bees (a few always buzz round the entrance).
    if (f.hives.length) {
      const hg = hiveGeometry();
      for (const h of f.hives) {
        const o = models.hive?.[0] ? fitted(models.hive[0].scene, 0.75) : new THREE.Mesh(hg, MAT);
        o.position.set(h.x, heightAt(h.x, h.z) - 0.02, h.z);
        o.rotation.y = h.rot;
        o.traverse((c) => (c.castShadow = true));
        g.add(o);
      }
      const n = f.hives.length * 90;
      this.beePos = new Float32Array(n * 3);
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(this.beePos, 3).setUsage(THREE.DynamicDrawUsage));
      this.bees = new THREE.Points(bg, new THREE.PointsMaterial({ color: '#2b2412', size: 0.035, sizeAttenuation: true }));
      this.bees.frustumCulled = false;
      g.add(this.bees);
    }

    // The hose: a green tube lying in the grass.
    if (f.hose.length > 1) {
      const pts = f.hose.map((p) => new THREE.Vector3(p.x, heightAt(p.x, p.z) + 0.03, p.z));
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 4, 0.022, 5, false);
      const m = new THREE.Mesh(tube, new THREE.MeshLambertMaterial({ color: '#2f8a3a' }));
      m.castShadow = true;
      g.add(m);
    }

    // Traffic on the road job.
    if (f.roadX !== null) {
      const colors = ['#c8261e', '#e8e4d8', '#2f5f9a', '#3a3a3a', '#d9a531'];
      for (let i = 0; i < 4; i++) {
        const lane = i % 2 === 0 ? 1 : -1;
        const obj = models.car?.[0] ? fitted(models.car[0].scene, 1.45) : carGroup(colors[i % colors.length], 100 + i);
        if (lane < 0) obj.rotation.y = Math.PI;
        g.add(obj);
        this.cars.push({ obj, z: -120 + i * 70, speed: (11 + i * 1.7) * lane, lane });
      }
    }
  }

  update(dt: number, time: number, px: number, pz: number): void {
    const f = this.field;
    f.hens.forEach((h, i) => {
      const o = this.hens[i];
      const far = Math.abs(h.x) > f.width / 2 + 11 || Math.abs(h.z) > f.depth / 2 + 11;
      o.root.visible = !far;
      o.phase += dt * (h.speed > 0.5 ? 18 : 8);
      const hop = h.speed > 0.05 ? Math.abs(Math.sin(o.phase)) * (h.speed > 1 ? 0.08 : 0.02) : 0;
      o.root.position.set(h.x, this.heightAt(h.x, h.z) + hop, h.z);
      o.root.rotation.y = h.yaw;
      // Pecking while standing.
      if (o.head) o.head.position.set(0, h.speed < 0.05 && Math.sin(time * 3 + o.phase) > 0.6 ? 0.18 : 0.33, h.speed < 0.05 ? 0.16 : 0.13);
    });
    f.snakes.forEach((s, i) => {
      const o = this.snakes[i];
      o.visible = s.state === 'flee';
      if (!o.visible) return;
      if (o.children.length === 1) {
        o.position.set(s.x, this.heightAt(s.x, s.z) + 0.02, s.z);
        o.rotation.y = s.yaw;
        return;
      }
      const fx = Math.sin(s.yaw);
      const fz = Math.cos(s.yaw);
      o.children.forEach((c, k) => {
        const back = k * 0.065;
        const wave = Math.sin(time * 9 - k * 0.7) * 0.07 * Math.min(1, k / 3);
        const x = s.x - fx * back + fz * wave;
        const z = s.z - fz * back - fx * wave;
        c.position.set(x, this.heightAt(x, z) + 0.03 + (k === 0 ? 0.03 : 0), z);
        const sc = k === 0 ? 1.35 : 1 - k / 22;
        c.scale.set(sc, 0.8 * sc, sc);
      });
    });
    const bp = this.beePos;
    if (this.bees && bp) {
      f.hives.forEach((h, hi) => {
        const swarming = h.swarm > 0;
        const cy = this.heightAt(h.sx, h.sz) + (swarming ? 1.5 : 0.3);
        for (let k = 0; k < 90; k++) {
          const j = (hi * 90 + k) * 3;
          // Calm: a dozen bees round the entrance; the rest stay inside (parked under the hive).
          if (!swarming && k > 12) {
            bp[j] = h.x;
            bp[j + 1] = -50;
            bp[j + 2] = h.z;
            continue;
          }
          const r = swarming ? 0.35 + (k % 7) * 0.08 : 0.25 + (k % 5) * 0.05;
          const a = time * (3 + (k % 5)) + k * 2.4;
          bp[j] = h.sx + Math.cos(a) * r + Math.sin(time * 7 + k) * 0.05;
          bp[j + 1] = cy + Math.sin(a * 1.3 + k) * r * 0.6;
          bp[j + 2] = h.sz + Math.sin(a) * r + (swarming ? 0 : 0.25);
        }
      });
      this.bees.geometry.attributes.position.needsUpdate = true;
    }
    this.nearestCar = Infinity;
    if (f.roadX !== null) {
      for (const c of this.cars) {
        c.z += c.speed * dt;
        if (c.z > 140) c.z = -140;
        if (c.z < -140) c.z = 140;
        const x = f.roadX + c.lane * 1.4;
        c.obj.position.set(x, this.heightAt(x, c.z) + 0.05, c.z);
        this.nearestCar = Math.min(this.nearestCar, Math.hypot(x - px, c.z - pz));
      }
    }
  }
}
