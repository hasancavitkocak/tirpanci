import * as THREE from 'three';
import { PATPAT } from '../game/config';
import { Models, fitted } from './models';
import { PatpatRig } from './patpat';
import { clothesline, flowerPots, gazebo, kennel } from './props';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * The shop's turntable: the pat pat in a paint, or a yard decoration, turning slowly on a patch of
 * grass, so the player sees it before buying. Its own small renderer on its own canvas (kept between
 * shop visits; the canvas is moved into the list each time it is drawn).
 */
export class ShopPreview {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 2, 0.05, 60);
  private readonly turntable = new THREE.Group();
  private rig: PatpatRig | null = null;
  private shown = '';
  private frame = 0;
  private last = 0;
  private angle = 0.6;
  private radius = 5;
  private lookY = 0.5;

  constructor(private readonly models: Models) {
    this.canvas.className = 'shop-preview-canvas';
    this.scene.add(new THREE.HemisphereLight('#fff6e0', '#4a5a30', 1.6));
    const sun = new THREE.DirectionalLight('#fff1d6', 1.8);
    sun.position.set(3, 6, 4);
    this.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#6f9a3e' }));
    ground.position.y = -0.01;
    this.scene.add(ground, this.turntable);
  }

  /** The pat pat in a paint (hue 0..1, null = its own blue). */
  showPatpat(hue: number | null): void {
    const body = this.models.patpat?.[0];
    const teker = this.models.patpatTeker?.[0];
    if (!body || !teker) return;
    if (!this.rig) {
      this.rig = new PatpatRig({ body, teker, direksiyon: this.models.patpatDireksiyon?.[0] }, hue);
      // Standing straight: trailer centre at the origin, the head ahead on the hitch.
      this.rig.head.position.set(0, 0, PATPAT.joint);
    }
    this.rig.setPaint(hue);
    this.put('patpat', () => {
      const g = new THREE.Group();
      g.add(this.rig!.kasa, this.rig!.head);
      g.position.z = -0.4;
      return g;
    });
  }

  /** A yard decoration by its id (saksi, cardak, kulube, camasir). */
  showDecor(id: string): void {
    const make: Record<string, () => THREE.Object3D> = { saksi: () => flowerPots(3), cardak: () => (this.models.gazebo?.[0] ? fitted(this.models.gazebo[0].scene, 3) : gazebo(5)), kulube: () => (this.models.kennel?.[0] ? fitted(this.models.kennel[0].scene, 1.1) : kennel(7)), camasir: () => clothesline(9), kopek: () => this.dog() };
    if (make[id]) this.put(`decor-${id}`, make[id]);
  }

  /** Karabaş standing (his rigged model cloned with its bones), 0.95 m to the top of his head. */
  private dog(): THREE.Object3D {
    const src = this.models.dog?.[0]?.scene;
    const g = new THREE.Group();
    if (!src) return g;
    const m = SkeletonUtils.clone(src);
    const box = new THREE.Box3().setFromObject(m);
    const k = 0.95 / Math.max(1e-6, box.max.y - box.min.y);
    m.scale.multiplyScalar(k);
    m.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
    m.traverse((o) => (o.frustumCulled = false));
    g.add(m);
    return g;
  }

  /** Into a list: the canvas goes into `parent` and starts turning. */
  attach(parent: HTMLElement): void {
    parent.appendChild(this.canvas);
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    if (!this.frame) {
      this.last = performance.now();
      const tick = (t: number) => {
        // Stops by itself once the canvas has left the page (the shop closed or another tab).
        if (!this.canvas.isConnected) {
          this.frame = 0;
          return;
        }
        // (30 frames a second are plenty for a slow turn: at the screen's own 60 or 120 it heated the phone.)
        if (t - this.last >= 1000 / 30 - 2) {
          this.draw((t - this.last) / 1000);
          this.last = t;
        }
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    }
  }

  /** Let go of the GPU (the shop is left for good, e.g. a job starts). */
  dispose(): void {
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }

  private put(key: string, make: () => THREE.Object3D): void {
    if (this.shown === key) return;
    this.shown = key;
    this.turntable.clear();
    const o = make();
    // Centred on the turntable, the camera back far enough to see all of it.
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    o.position.x -= c.x;
    o.position.z -= c.z;
    const size = box.getSize(new THREE.Vector3());
    this.radius = Math.max(1.6, Math.max(size.x, size.z, size.y * 1.4) * 1.55);
    this.lookY = size.y * 0.42;
    this.turntable.add(o);
  }

  private draw(dt: number): void {
    const r = this.renderer;
    if (!r) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * r.getPixelRatio()) || this.canvas.height !== Math.round(h * r.getPixelRatio())) {
      r.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.angle += Math.min(0.1, dt) * 0.5;
    this.turntable.rotation.y = this.angle;
    // (Framed for a wide strip: a squarer box, the phone held sideways, needs the camera further back to keep its width in view.)
    const back = this.radius * Math.max(1, 1.9 / this.camera.aspect);
    this.camera.position.set(0, this.lookY + back * 0.38, back);
    this.camera.lookAt(0, this.lookY, 0);
    r.render(this.scene, this.camera);
  }
}
