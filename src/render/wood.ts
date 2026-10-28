import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Field } from '../game/field';
import { FieldTree, LogPile, TREE, WOOD, WoodState, cutAt, logPlace, logSize, pileSpots, woodSpots } from '../game/wood';
import { spotMark } from './harvest';

/**
 * The storm's wood drawn (game/wood.ts): the fallen tree in the garden, cut back from its crown (a
 * clipping plane at the last cut, the trunk's sawn face on it, a yellow band where the next cut goes),
 * the logs fallen beside it; the logs piled by the gardens' gates with the yellow marks where the
 * vehicle's bed is brought; the load on the vehicle; the logs stacked by the yard's woodpile rack.
 */

/** A log (kutuk.glb, or drawn), lying along x, its bottom at y = 0, `len` long and `dia` across. */
function makeLog(model: GLTF | undefined, len: number, dia: number): THREE.Object3D {
  const g = new THREE.Group();
  if (model) {
    const s = model.scene.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    const across = (size.y + size.z) / 2;
    s.scale.set(len / size.x, dia / across, dia / across);
    s.position.set((-(box.min.x + box.max.x) / 2) * (len / size.x), -box.min.y * (dia / across), (-(box.min.z + box.max.z) / 2) * (dia / across));
    s.traverse((o) => (o.castShadow = o.receiveShadow = true));
    g.add(s);
    return g;
  }
  const m = new THREE.Mesh(new THREE.CylinderGeometry(dia / 2, dia / 2, len, 10), new THREE.MeshLambertMaterial({ color: '#7a5434' }));
  m.rotation.z = Math.PI / 2;
  m.position.y = dia / 2;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return g;
}

/** Logs heaped in a group: lying along x, side by side along z, four, three, two, one a layer. */
function fillHeap(g: THREE.Group, n: number, model: GLTF | undefined): void {
  g.clear();
  const rows = [4, 3, 2, 1];
  const d = 0.5;
  let left = n;
  for (let layer = 0; left > 0; layer++) {
    const m = Math.min(left, rows[Math.min(layer, rows.length - 1)]);
    for (let i = 0; i < m; i++) {
      const o = makeLog(model, 0.8, d);
      o.rotation.y = ((i * 31 + layer * 7) % 5) * 0.03 - 0.06;
      o.position.set(0, layer * d * 0.82, (i - (m - 1) / 2) * d * 1.02);
      g.add(o);
    }
    left -= m;
  }
}

/** A sawn face: pale wood, its rings, the bark round it. */
function sawnFace(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#5a3d24';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#e2b77c';
  x.beginPath();
  x.arc(64, 64, 56, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(150, 95, 45, 0.55)';
  x.lineWidth = 2;
  for (let r = 6; r < 54; r += 5 + (r % 3)) {
    x.beginPath();
    x.arc(64 + Math.sin(r) * 1.5, 64, r, 0, Math.PI * 2);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The middle of the trunk's section in the model (metres, the tree laid along x): height and side. */
const TRUNK = { y: 1.1, z: -0.3, r: 0.55 };
/** The most logs drawn stacked in the yard (more are counted, not drawn). */
const STACK_MAX = 10;

export class WoodView {
  readonly group = new THREE.Group();
  /** The tree laid along its local x (root to crown), on the ground. */
  private readonly tree = new THREE.Group();
  private readonly plane = new THREE.Plane();
  private readonly face: THREE.Mesh;
  /** A yellow band painted round the tree where the next cut goes. */
  private readonly mark: THREE.Mesh;
  private readonly logs: THREE.Object3D[] = [];
  private readonly piles: { heap: THREE.Group; mark: THREE.Group; n: number }[] = [];
  private readonly stack = new THREE.Group();
  private readonly cargo = new THREE.Group();
  private readonly unload: THREE.Group;
  private cutKey = -1;
  private cargoKey = '';
  private stackN = -1;
  private readonly logModel?: GLTF;

  constructor(f: Field, ground: (x: number, z: number) => number, tree: FieldTree | null, piles: LogPile[], models: { tree?: GLTF; log?: GLTF }) {
    this.logModel = models.log;
    this.face = new THREE.Mesh(new THREE.CircleGeometry(TRUNK.r, 18), new THREE.MeshLambertMaterial({ map: sawnFace() }));
    this.face.rotation.y = Math.PI / 2;
    this.face.visible = false;
    this.mark = new THREE.Mesh(new THREE.TorusGeometry(TRUNK.r + 0.03, 0.03, 5, 28), new THREE.MeshLambertMaterial({ color: '#ffcf2e', emissive: '#4a3a00' }));
    this.mark.rotation.y = Math.PI / 2;
    this.mark.visible = false;
    // The yard: where the load is brought, the stack by the rack.
    const sp = woodSpots(f);
    this.unload = spotMark(sp.unload, 'İSTİF', ground);
    this.unload.visible = false;
    this.stack.position.set(sp.pile.x, ground(sp.pile.x, sp.pile.z) - 0.03, sp.pile.z);
    this.group.add(this.unload, this.stack);
    // The piles by the gates.
    for (const p of piles) {
      const s = pileSpots(f, p);
      const heap = new THREE.Group();
      heap.position.set(s.pile.x, ground(s.pile.x, s.pile.z) - 0.03, s.pile.z);
      // (The logs' ends to the track.)
      heap.rotation.y = s.pile.yaw + Math.PI / 2;
      const mark = spotMark(s.load, 'KÜTÜK YÜKLE', ground);
      this.piles.push({ heap, mark, n: -1 });
      this.group.add(heap, mark);
    }
    if (!tree) return;
    // The tree, tipped to the slope between its two ends, the root plate a little sunk in.
    const yaw = tree.yaw - Math.PI / 2;
    const fx = Math.sin(tree.yaw);
    const fz = Math.cos(tree.yaw);
    const gr = ground(tree.x + fx * TREE.root, tree.z + fz * TREE.root);
    const gc = ground(tree.x + fx * TREE.tip, tree.z + fz * TREE.tip);
    this.tree.position.set(tree.x, Math.min(ground(tree.x, tree.z), (gr + gc) / 2) - 0.2, tree.z);
    this.tree.rotation.set(0, yaw, Math.atan2(gc - gr, TREE.tip - TREE.root), 'YZX');
    if (models.tree) {
      const s = models.tree.scene.clone(true);
      const box = new THREE.Box3().setFromObject(s);
      const k = TREE.len / (box.max.x - box.min.x);
      s.scale.setScalar(k);
      s.position.set(0, -box.min.y * k, 0);
      // Its own materials: the cut moves on them.
      s.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = (m.material as THREE.Material).clone();
        (m.material as THREE.Material).clippingPlanes = [this.plane];
        (m.material as THREE.Material).side = THREE.DoubleSide;
        m.castShadow = m.receiveShadow = true;
      });
      this.tree.add(s);
    }
    this.tree.add(this.face, this.mark);
    this.group.add(this.tree);
    for (let i = 0; i < WOOD.pieces; i++) {
      const sz = logSize(i);
      const o = makeLog(models.log, sz.len, sz.dia);
      const p = logPlace(tree, i);
      o.position.set(p.x, ground(p.x, p.z) - 0.04, p.z);
      o.rotation.y = yaw + ((i * 53) % 7) * 0.07 - 0.2;
      o.visible = false;
      this.logs.push(o);
      this.group.add(o);
    }
  }

  /**
   * Every frame: the tree cut back to `cut` cuts and its logs on the ground; the piles by the gates, the
   * load on the vehicle (in `bed`: its object, floor, the bed from `z0` to `z1`, `width` across) and the
   * stack in the yard, from the state.
   */
  update(cut: number, w: WoodState | null, bed: { obj: THREE.Object3D; floorY: number; z0: number; z1: number; width: number } | null): void {
    if (cut !== this.cutKey) {
      this.cutKey = cut;
      // The plane at the last cut, facing the root: what is past it (towards the crown) is gone.
      const at = cut > 0 ? cutAt(cut - 1) : TREE.tip + 5;
      this.tree.updateMatrixWorld(true);
      const p0 = this.tree.localToWorld(new THREE.Vector3(at, 0, 0));
      const p1 = this.tree.localToWorld(new THREE.Vector3(at - 1, 0, 0));
      this.plane.setFromNormalAndCoplanarPoint(p1.clone().sub(p0).normalize(), p0);
      this.face.visible = cut > 0 && at < 0.4;
      this.face.position.set(at + 0.01, TRUNK.y, TRUNK.z);
      this.mark.visible = cut < WOOD.pieces;
      this.mark.position.set(cutAt(cut) + 0.05, TRUNK.y, TRUNK.z);
      this.logs.forEach((o, i) => (o.visible = i < cut));
    }
    this.piles.forEach((p, i) => {
      const n = Math.max(0, w?.piles[i]?.n ?? 0);
      if (n === p.n) return;
      p.n = n;
      fillHeap(p.heap, n, this.logModel);
      p.mark.visible = n > 0;
    });
    const load = w?.load ?? 0;
    this.unload.visible = load > 0;
    // The load: rebuilt when it or the bed changes.
    const ck = `${load}:${bed?.obj.uuid ?? ''}`;
    if (ck !== this.cargoKey) {
      this.cargoKey = ck;
      this.cargo.removeFromParent();
      this.cargo.clear();
      if (bed && load > 0) {
        const d = 0.42;
        const len = Math.abs(bed.z1 - bed.z0);
        const cols = Math.max(1, Math.floor(bed.width / 0.8));
        // (As many rows as nearly fit: round logs pressed together.)
        const rows = Math.max(1, Math.ceil(len / (d + 0.02) - 0.2));
        const step = rows > 1 ? (len - d) / (rows - 1) : 0;
        for (let i = 0; i < load; i++) {
          const layer = Math.floor(i / (cols * rows));
          const n = i % (cols * rows);
          const o = makeLog(this.logModel, 0.8, d);
          // Across the bed (along its x), side by side along it, layer on layer.
          o.position.set(((n % cols) - (cols - 1) / 2) * 0.82, bed.floorY + layer * d * 0.92, Math.min(bed.z0, bed.z1) + d / 2 + Math.floor(n / cols) * step);
          this.cargo.add(o);
        }
        bed.obj.add(this.cargo);
      }
    }
    const st = Math.min(STACK_MAX, w?.stock ?? 0);
    if (st !== this.stackN) {
      this.stackN = st;
      fillHeap(this.stack, st, this.logModel);
    }
  }
}
