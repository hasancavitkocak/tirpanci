import * as THREE from 'three';
import type { Field } from '../game/field';
import type { Session } from '../game/session';

/**
 * Evening falling over the village (the akşam's cows): from the late afternoon's low sun to dusk, the sky,
 * the haze and the light going dark and blue; and the lights coming on as it does: the worker's head
 * torch (a spot ahead of his eyes, a little lamp on his forehead from behind), the vehicle's headlights,
 * the porch lamp by the house door, the barn's lamp, and lamps on concrete posts along the tracks near
 * the yard (drawn here: a few dozen triangles each), each with a warm pool of light on the ground under
 * it (painted, not lit: only the head torch and the headlights light the scene). Once it is dark,
 * fireflies drift low over the grass round the worker, each glowing green and going out in its own time.
 */

/** Fireflies: how many, in how big a box round the worker (m), how high over the ground. */
const FLIES = { n: 46, box: 28, low: 0.3, high: 1.6 };

/** What the dark comes to, fully fallen. */
const NIGHT = { sky: '#0c1531', haze: '#262c45', fog: '#161d2c', hemiSky: '#3a4566', hemiGround: '#141a10', hemi: 0.22, sun: '#8a97c4', sunK: 0.08, exposure: 0.85 };

/** A warm pool of light painted on the ground (a radial glow, added on). */
function poolTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 210, 140, 0.85)');
  g.addColorStop(0.45, 'rgba(255, 180, 100, 0.35)');
  g.addColorStop(1, 'rgba(255, 160, 80, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A glow round a bulb (a sprite, added on). */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255, 240, 200, 1)');
  g.addColorStop(0.25, 'rgba(255, 200, 120, 0.6)');
  g.addColorStop(1, 'rgba(255, 170, 80, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Dusk {
  readonly group = new THREE.Group();
  private readonly head: THREE.SpotLight;
  private readonly cars: THREE.SpotLight;
  /** The lamps' bulbs, glows and pools (shown as the dark comes). */
  private readonly bulbs: THREE.Mesh[] = [];
  private readonly glows: THREE.Sprite[] = [];
  private readonly pools: THREE.Mesh[] = [];
  /** The little lamp on the worker's forehead (from behind). */
  readonly forehead: THREE.Object3D;
  /** The fireflies: their points (positions relative to the worker's box), drift, blink. */
  private readonly flies: THREE.Points;
  private readonly flyMat: THREE.ShaderMaterial;
  private readonly flyVel: Float32Array;
  private readonly base: { exposure: number; hemi: number; sun: number; hemiSky: THREE.Color; hemiGround: THREE.Color; sunColor: THREE.Color; fog: THREE.Color; top?: THREE.Color; haze?: THREE.Color; glow?: number };

  constructor(
    private readonly f: Field,
    ground: (x: number, z: number) => number,
    private readonly lights: { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; sky: THREE.Object3D | null; fog: THREE.Fog; background: THREE.Color; exposure: number },
  ) {
    const u = (lights.sky as THREE.Mesh | null)?.material as THREE.ShaderMaterial | undefined;
    this.base = {
      exposure: lights.exposure,
      hemi: lights.hemi.intensity,
      sun: lights.sun.intensity,
      hemiSky: lights.hemi.color.clone(),
      hemiGround: lights.hemi.groundColor.clone(),
      sunColor: lights.sun.color.clone(),
      fog: lights.fog.color.clone(),
      top: u?.uniforms?.uTop?.value?.clone(),
      haze: u?.uniforms?.uHaze?.value?.clone(),
      glow: u?.uniforms?.uGlow?.value,
    };
    // The head torch and the headlights: always there (their number of lights never changes: no
    // shaders made again), dark till wanted.
    this.head = new THREE.SpotLight('#fff1d8', 0, 26, 0.42, 0.55, 1);
    this.cars = new THREE.SpotLight('#fff6e0', 0, 40, 0.5, 0.45, 1);
    this.group.add(this.head, this.head.target, this.cars, this.cars.target);
    // The head torch from behind: a little black lamp, its lens lit.
    const fh = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.04), new THREE.MeshLambertMaterial({ color: '#202020' }));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), new THREE.MeshBasicMaterial({ color: '#fff4cc' }));
    lens.position.z = 0.021;
    fh.add(box, lens);
    fh.visible = false;
    this.forehead = fh;
    // The fireflies: points blinking in the shader (each its own phase), drifting in the box round the worker.
    const fp = new Float32Array(FLIES.n * 3);
    const ph = new Float32Array(FLIES.n);
    this.flyVel = new Float32Array(FLIES.n * 3);
    for (let i = 0; i < FLIES.n; i++) {
      fp.set([(Math.random() - 0.5) * FLIES.box, FLIES.low + Math.random() * (FLIES.high - FLIES.low), (Math.random() - 0.5) * FLIES.box], i * 3);
      ph[i] = Math.random() * 100;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    this.flyMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        attribute float phase; uniform float uTime; uniform float uScale; varying float vA;
        void main() {
          // A slow glow, then dark a while: each in its own time.
          float t = fract(uTime * (0.18 + fract(phase) * 0.12) + phase);
          vA = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.3, 0.55, t));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uScale * 0.16 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOn; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float core = smoothstep(0.18, 0.0, d);
          float a = (smoothstep(0.5, 0.0, d) * 0.6 + core) * vA * uOn;
          gl_FragColor = vec4(vec3(0.75, 1.0, 0.35) * a * 1.6, a);
        }`,
    });
    this.flies = new THREE.Points(fg, this.flyMat);
    this.flies.frustumCulled = false;
    this.flies.visible = false;
    this.group.add(this.flies);
    const pool = poolTexture();
    const glow = glowTexture();
    // (A post's arm reaches out over the track: towards (ax, az).)
    const lamp = (x: number, z: number, height: number, post: boolean, poolR: number, ax = 0, az = 1) => {
      const y = ground(x, z);
      if (post) {
        // A tapering concrete post, a short arm out over the track, the lamp's head under its end.
        const mat = new THREE.MeshLambertMaterial({ color: '#8d8b86', flatShading: true });
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, height, 6), mat);
        p.position.set(x, y + height / 2, z);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.1), new THREE.MeshLambertMaterial({ color: '#4a4a4a' }));
        arm.position.set(x + ax * 0.5, y + height - 0.12, z + az * 0.5);
        arm.rotation.y = Math.atan2(ax, az);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 6), new THREE.MeshLambertMaterial({ color: '#3c3c3c' }));
        shade.position.set(x + ax, y + height - 0.2, z + az);
        p.castShadow = true;
        this.group.add(p, arm, shade);
      }
      const bx = post ? x + ax : x;
      const bz = post ? z + az : z;
      const by = y + (post ? height - 0.3 : height);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(post ? 0.09 : 0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#5a5040' }));
      bulb.position.set(bx, by, bz);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      halo.position.copy(bulb.position);
      halo.scale.setScalar(post ? 1.6 : 1.1);
      const pm = new THREE.Mesh(new THREE.CircleGeometry(poolR, 24), new THREE.MeshBasicMaterial({ map: pool, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      pm.rotation.x = -Math.PI / 2;
      pm.position.set(bx, ground(bx, bz) + 0.06, bz);
      pm.renderOrder = 2;
      this.bulbs.push(bulb);
      this.glows.push(halo);
      this.pools.push(pm);
      this.group.add(bulb, halo, pm);
    };
    // The porch lamp by the house door (towards the yard), and the barn's over its door.
    const p = f.plateau;
    const hd = Math.atan2(p.x - f.house.x, p.z - f.house.z);
    lamp(f.house.x + Math.sin(hd) * (f.houseR + 0.15), f.house.z + Math.cos(hd) * (f.houseR + 0.15), 2.5, false, 3.2);
    const barn = f.yardProps.find((y) => y.kind === 'barn');
    if (barn) {
      const bd = Math.atan2(p.x - barn.x, p.z - barn.z);
      lamp(barn.x + Math.sin(bd) * 4.7, barn.z + Math.cos(bd) * 4.7, 3.4, false, 4);
    }
    // Lamps on posts along the tracks near the yard, every so often, beside them.
    const posts: { x: number; z: number }[] = [];
    for (const r of f.roads) {
      let acc = 0;
      for (let i = 1; i < r.pts.length && posts.length < 14; i++) {
        const a = r.pts[i - 1];
        const b = r.pts[i];
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        acc += l;
        if (acc < 34) continue;
        acc = 0;
        const nx = (b.z - a.z) / l;
        const nz = -(b.x - a.x) / l;
        const x = b.x + nx * 3.3;
        const z = b.z + nz * 3.3;
        const dp = Math.hypot(x - p.x, z - p.z);
        if (dp < p.r + 3 || dp > 140 || !f.pointFree(x, z) || f.inField(x, z) || posts.some((q) => Math.hypot(q.x - x, q.z - z) < 25)) continue;
        posts.push({ x, z });
        lamp(x, z, 5.2, true, 5, -nx, -nz);
      }
    }
  }

  /** Every frame: `d` of the dark fallen (0 the late afternoon, 1 night); the lights it calls for. */
  update(d: number, s: Session, camera: THREE.Camera, renderer: THREE.WebGLRenderer, fpv: boolean): void {
    const L = this.lights;
    const b = this.base;
    const night = (a: THREE.Color, to: string) => a.clone().lerp(new THREE.Color(to), d);
    L.hemi.intensity = b.hemi + (NIGHT.hemi - b.hemi) * d;
    L.hemi.color.copy(night(b.hemiSky, NIGHT.hemiSky));
    L.hemi.groundColor.copy(night(b.hemiGround, NIGHT.hemiGround));
    L.sun.intensity = b.sun * (1 - d * (1 - NIGHT.sunK));
    L.sun.color.copy(night(b.sunColor, NIGHT.sun));
    L.fog.color.copy(night(b.fog, NIGHT.fog));
    L.background.copy(L.fog.color);
    renderer.toneMappingExposure = b.exposure + (NIGHT.exposure - b.exposure) * d;
    const u = (L.sky as THREE.Mesh | null)?.material as THREE.ShaderMaterial | undefined;
    if (u?.uniforms?.uTop && b.top && b.haze) {
      u.uniforms.uTop.value.copy(night(b.top, NIGHT.sky));
      u.uniforms.uHaze.value.copy(night(b.haze, NIGHT.haze));
      u.uniforms.uGlow.value = (b.glow ?? 1) * (1 - d);
    }
    // The lamps come on as it gets dark (from a third of the way).
    const on = Math.max(0, Math.min(1, (d - 0.3) / 0.3));
    for (const m of this.bulbs) (m.material as THREE.MeshBasicMaterial).color.set('#5a5040').lerp(new THREE.Color('#fff2c4'), on);
    for (const g of this.glows) g.material.opacity = on;
    for (const p of this.pools) (p.material as THREE.MeshBasicMaterial).opacity = on * 0.9;
    // The fireflies once it is dark, round the worker, drifting.
    const flies = Math.max(0, Math.min(1, (d - 0.45) / 0.3));
    this.flies.visible = flies > 0;
    if (flies > 0) {
      this.flyMat.uniforms.uTime.value = performance.now() / 1000;
      this.flyMat.uniforms.uOn.value = flies;
      this.flyMat.uniforms.uScale.value = renderer.domElement.height;
      const p = this.flies.geometry.getAttribute('position') as THREE.BufferAttribute;
      const v = this.flyVel;
      const half = FLIES.box / 2;
      for (let i = 0; i < FLIES.n; i++) {
        // Wandering: a nudge this way or that, slowed; kept low over the ground; round the worker.
        v[i * 3] = v[i * 3] * 0.97 + (Math.random() - 0.5) * 0.02;
        v[i * 3 + 1] = v[i * 3 + 1] * 0.95 + (Math.random() - 0.5) * 0.01;
        v[i * 3 + 2] = v[i * 3 + 2] * 0.97 + (Math.random() - 0.5) * 0.02;
        let x = p.getX(i) + v[i * 3];
        let y = p.getY(i) + v[i * 3 + 1];
        let z = p.getZ(i) + v[i * 3 + 2];
        if (x - s.x > half) x -= FLIES.box;
        if (x - s.x < -half) x += FLIES.box;
        if (z - s.z > half) z -= FLIES.box;
        if (z - s.z < -half) z += FLIES.box;
        const g = this.f.height(x, z);
        y = Math.max(g + FLIES.low, Math.min(g + FLIES.high, y));
        p.setXYZ(i, x, y, z);
      }
      p.needsUpdate = true;
    }
    // The head torch on foot: from the eyes, where they look; the headlights driving.
    const head = s.driving ? 0 : on;
    this.head.intensity = head * 9;
    if (head > 0) {
      camera.getWorldPosition(this.head.position);
      const dir = camera.getWorldDirection(new THREE.Vector3());
      this.head.position.y -= fpv ? 0.05 : 0;
      this.head.target.position.copy(this.head.position).addScaledVector(dir, 8);
      this.head.target.updateMatrixWorld();
    }
    this.forehead.visible = on > 0.05 && !fpv && !s.driving;
    const car = s.driving ? on : 0;
    this.cars.intensity = car * 14;
    if (car > 0) {
      const v = this.f.vehicle;
      const fx = Math.sin(v.yaw);
      const fz = Math.cos(v.yaw);
      this.cars.position.set(v.x + fx * 1.4, this.f.height(v.x, v.z) + 1.0, v.z + fz * 1.4);
      this.cars.target.position.set(v.x + fx * 14, this.f.height(v.x + fx * 14, v.z + fz * 14), v.z + fz * 14);
      this.cars.target.updateMatrixWorld();
    }
  }
}
