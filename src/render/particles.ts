import * as THREE from 'three';

const MAX = 3200;

export type ParticleKind = 'grass' | 'clip' | 'spark' | 'leaf' | 'dust' | 'smoke' | 'water' | 'feather' | 'mud';

/** Pooled point particles: grass clippings, stone sparks, knocked leaves, dust and exhaust smoke. */
export class Particles {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly alpha = new Float32Array(MAX);
  private readonly seed = new Float32Array(MAX);
  private readonly size0 = new Float32Array(MAX);
  private readonly alpha0 = new Float32Array(MAX);
  private readonly grow = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly drag = new Float32Array(MAX);
  private readonly gravity = new Float32Array(MAX);
  /** Clippings lie on the ground and fade out over their last second. */
  private readonly fadeOut = new Uint8Array(MAX);
  /** 1 = drawn as a thin bit of grass blade (clippings, leaves), 0 = a round dot. */
  private readonly shape = new Float32Array(MAX);
  private next = 0;
  private readonly c = new THREE.Color();
  /** Light breeze that carries smoke and leaves. */
  wind = new THREE.Vector3(0.35, 0, 0.15);

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('shape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i < MAX; i++) this.seed[i] = Math.random();
    g.setAttribute('seed', new THREE.BufferAttribute(this.seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float alpha;
        attribute float seed;
        attribute float shape;
        attribute vec3 color;
        varying float vS;
        varying float vShape;
        uniform float uScale;
        varying vec3 vC;
        varying float vA;
        void main() {
          vC = color;
          vA = alpha;
          vS = seed;
          vShape = shape;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(size * uScale / -mv.z, uScale * (alpha < 0.99 ? 0.08 : 0.012));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC;
        varying float vA;
        varying float vS;
        varying float vShape;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          if (vShape > 0.5) {
            // A short cut bit of blade, at its own angle, tapering at the ends.
            float a = vS * 6.2832;
            vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * d;
            float w = (vShape > 1.5 ? 0.16 : 0.07) * (1.0 - smoothstep(0.25, 0.5, abs(q.x)));
            if (abs(q.y) > w) discard;
          }
          float r = vShape > 0.5 ? 0.0 : dot(d, d);
          if (r > 0.25) discard;
          float a = 1.0;
          if (vA < 0.99) {
            // Smoke: a soft falloff broken up by two octaves of noise, different for every puff.
            vec2 q = gl_PointCoord * 3.0 + vS * 17.0;
            float n = noise(q) * 0.65 + noise(q * 2.3 + 5.0) * 0.35;
            a = vA * smoothstep(0.25, 0.0, r) * smoothstep(0.25, 0.75, n + 0.25 - r);
          }
          gl_FragColor = vec4(vC, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  setViewport(height: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = height * 0.9;
  }

  /**
   * Cut grass thrown off the spinning line: from points on the cutting circle, flung along the
   * line's direction of travel (tangent, spin `dir` = +1 anticlockwise seen from above), up and out.
   */
  emitClippings(cx: number, cy: number, cz: number, radius: number, n: number, dir: number, dry: number): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const ox = Math.cos(a);
      const oz = Math.sin(a);
      this.pos[i * 3] = cx + ox * radius * (0.6 + Math.random() * 0.4);
      this.pos[i * 3 + 1] = cy + 0.03 + Math.random() * 0.12;
      this.pos[i * 3 + 2] = cz + oz * radius * (0.6 + Math.random() * 0.4);
      const sp = 2 + Math.random() * 2.5;
      // Tangent of an anticlockwise turn at angle a (x right, z towards the viewer) is (-sin, cos).
      this.vel[i * 3] = -oz * dir * sp + ox * 0.6;
      // A share of the bits fly high: the satisfying spray (and what dirties the face shield).
      this.vel[i * 3 + 1] = Math.random() < 0.35 ? 2 + Math.random() * 2.2 : 0.7 + Math.random() * 1.6;
      this.vel[i * 3 + 2] = ox * dir * sp + oz * 0.6;
      this.c.setHSL(0.21 + Math.random() * 0.07 - dry * 0.07, 0.5 - dry * 0.15, 0.3 + Math.random() * 0.22 + dry * 0.1);
      this.col[i * 3] = this.c.r;
      this.col[i * 3 + 1] = this.c.g;
      this.col[i * 3 + 2] = this.c.b;
      this.size0[i] = this.size[i] = 0.05 + Math.random() * 0.04;
      this.shape[i] = 1;
      this.alpha0[i] = this.alpha[i] = 1;
      this.grow[i] = 0;
      this.maxLife[i] = this.life[i] = 3 + Math.random() * 2.5;
      this.drag[i] = 1.6;
      this.gravity[i] = 1;
      this.fadeOut[i] = 1;
    }
  }

  emit(x: number, y: number, z: number, n: number, kind: ParticleKind, dirX = 0, dirZ = 0, shade = 0): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const smoke = kind === 'smoke';
      const mud = kind === 'mud';
      const water = kind === 'water' || mud;
      const feather = kind === 'feather';
      const sp = kind === 'spark' ? 2 + Math.random() * 3 : kind === 'leaf' || feather ? 0.6 + Math.random() : smoke ? 0.15 + Math.random() * 0.2 : water ? 0.4 + Math.random() * 0.9 : 1 + Math.random() * 2.2;
      this.pos[i * 3] = x + (Math.random() - 0.5) * (smoke ? 0.04 : 0.15);
      this.pos[i * 3 + 1] = y + Math.random() * (smoke ? 0.03 : 0.15);
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * (smoke ? 0.04 : 0.15);
      this.vel[i * 3] = Math.cos(a) * sp + dirX * (smoke ? 1 : 2.5);
      this.vel[i * 3 + 1] = kind === 'leaf' || feather ? 0.5 + Math.random() : smoke ? 0.25 + Math.random() * 0.25 : water ? 1.5 + Math.random() * 2.5 : 1.2 + Math.random() * 2.2;
      this.vel[i * 3 + 2] = Math.sin(a) * sp + dirZ * (smoke ? 1 : 2.5);
      if (kind === 'grass') this.c.setHSL(0.22 + Math.random() * 0.06, 0.55, 0.32 + Math.random() * 0.2);
      else if (kind === 'spark') this.c.setHSL(0.09 + Math.random() * 0.04, 1, 0.6 + Math.random() * 0.3);
      else if (kind === 'leaf') this.c.setHSL(0.25 + Math.random() * 0.05, 0.5, 0.3 + Math.random() * 0.15);
      else if (smoke) this.c.setRGB(0.74 - shade * 0.45, 0.78 - shade * 0.47, 0.88 - shade * 0.5);
      else if (mud) this.c.setHSL(0.07, 0.45, 0.13 + Math.random() * 0.08);
      else if (water) this.c.setRGB(0.75 + Math.random() * 0.2, 0.85 + Math.random() * 0.1, 0.95);
      else if (feather) this.c.setHSL(0.08, 0.35, 0.45 + Math.random() * 0.4);
      else this.c.setHSL(0.1, 0.25, 0.45 + Math.random() * 0.1);
      this.col[i * 3] = this.c.r;
      this.col[i * 3 + 1] = this.c.g;
      this.col[i * 3 + 2] = this.c.b;
      this.size0[i] = this.size[i] = kind === 'spark' ? 0.025 : kind === 'leaf' || feather ? 0.08 : kind === 'dust' ? 0.08 : smoke ? 0.035 + Math.random() * 0.025 : water ? 0.025 + Math.random() * 0.02 : 0.04 + Math.random() * 0.03;
      // Grass bits are thin blades, leaves and feathers wider ones; the rest round.
      this.shape[i] = kind === 'grass' ? 1 : kind === 'leaf' || feather ? 2 : 0;
      this.alpha0[i] = this.alpha[i] = smoke ? 0.16 + shade * 0.3 : 1;
      this.grow[i] = smoke ? 7 + Math.random() * 5 : 0;
      this.maxLife[i] = this.life[i] = kind === 'spark' ? 0.35 : kind === 'leaf' || feather ? 1.6 : smoke ? 0.9 + Math.random() * 0.9 : water ? 0.5 + Math.random() * 0.4 : 0.6 + Math.random() * 0.5;
      this.drag[i] = kind === 'leaf' || feather ? 3 : kind === 'dust' ? 4 : smoke ? 1.2 : water ? 0.6 : 1.5;
      this.gravity[i] = kind === 'leaf' || feather ? 0.15 : smoke ? -0.05 : 1;
      this.fadeOut[i] = kind === 'leaf' || feather ? 1 : 0;
    }
  }

  update(dt: number, groundAt: (x: number, z: number) => number): void {
    const w = this.wind;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      const k = Math.exp(-this.drag[i] * dt);
      const airborne = this.gravity[i] < 0.5;
      this.vel[i * 3] = this.vel[i * 3] * k + (airborne ? w.x * (1 - k) : 0);
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * k + (airborne ? w.z * (1 - k) : 0);
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - 9.8 * dt * this.gravity[i];
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.grow[i] > 0) {
        this.size[i] = this.size0[i] * (1 + this.grow[i] * t);
        this.alpha[i] = this.alpha0[i] * (1 - t) * Math.min(1, t * 8);
      } else if (this.fadeOut[i] && this.life[i] < 1) this.alpha[i] = Math.max(0.02, this.life[i] * 0.98);
      const gy = groundAt(this.pos[i * 3], this.pos[i * 3 + 2]) + 0.02;
      if (this.pos[i * 3 + 1] < gy) {
        this.pos[i * 3 + 1] = gy;
        this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0;
      }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
    g.attributes.shape.needsUpdate = true;
  }
}
