import * as THREE from 'three';

const MAX = 900;
/** One mark: as long as the spacing between marks so the tread runs on unbroken. */
export const MARK_LENGTH = 0.45;
const MARK_WIDTH = 0.3;

/** Tractor-tyre tread printed in the ground: chevron lugs (pointing the way the wheel rolls) on a faint rut. */
function treadTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 96;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  // Faint pressed rut under the lugs.
  g.fillStyle = 'rgba(52, 40, 26, 0.28)';
  g.fillRect(4, 0, w - 8, h);
  // Three chevrons per mark; the canvas top is the front of the mark.
  g.fillStyle = 'rgba(40, 30, 18, 0.85)';
  for (let i = 0; i < 3; i++) {
    const y = i * (h / 3) + 6;
    for (const side of [-1, 1]) {
      g.beginPath();
      const cx = w / 2;
      g.moveTo(cx, y);
      g.lineTo(cx + side * (w / 2 - 4), y + 14);
      g.lineTo(cx + side * (w / 2 - 4), y + 24);
      g.lineTo(cx, y + 10);
      g.closePath();
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tyre marks the pat pat leaves on the ground (tread pattern), the oldest reused first. */
export class TrackView {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private readonly o = new THREE.Object3D();

  constructor() {
    const g = new THREE.PlaneGeometry(MARK_WIDTH, MARK_LENGTH);
    // Flat on the ground, the texture's top towards +Z (the way the pat pat drives).
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.PI);
    const mat = new THREE.MeshBasicMaterial({ map: treadTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.InstancedMesh(g, mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** A mark at (x, y, z), lengthwise along heading `yaw`. */
  add(x: number, y: number, z: number, yaw: number): void {
    this.o.position.set(x, y + 0.03, z);
    this.o.rotation.set(0, yaw, 0);
    this.o.updateMatrix();
    this.mesh.setMatrixAt(this.next, this.o.matrix);
    this.next = (this.next + 1) % MAX;
    this.mesh.count = Math.max(this.mesh.count, this.next === 0 ? MAX : this.next);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const m = this.mesh.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  }
}
