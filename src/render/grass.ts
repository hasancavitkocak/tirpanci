import * as THREE from 'three';
import { LANE_HALF } from './lane';
import { PAINTED_GROUND } from './scenery';
import { CLUMP, GrassStyle } from '../game/config';
import { Field, GRASS_RANGE } from '../game/field';
import { makeRng } from '../game/rng';

/** Side length of one grass tile (a separate draw call, so off-screen tiles are culled). */
const TILE = 6;
/** Full grass height, metres. */
export const GRASS_HEIGHT = 0.42;

/**
 * One clump of `blades` tapered blades. Vertex y runs 0..1 (scaled by the grass height in the shader).
 * Each blade: 2 segments + tip = 5 vertices, 3 triangles.
 */
function clumpGeometry(blades: number, simple = false): THREE.BufferGeometry {
  const rnd = makeRng(7);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rnd() * 0.8;
    const r = 0.02 + rnd() * 0.11;
    const ox = Math.cos(a) * r;
    const oz = Math.sin(a) * r;
    const facing = rnd() * Math.PI;
    const w = 0.009 + rnd() * 0.006;
    const lean = 0.06 + rnd() * 0.1;
    const lx = Math.cos(a) * lean;
    const lz = Math.sin(a) * lean;
    const h = 0.7 + rnd() * 0.3;
    const cx = Math.cos(facing) * w;
    const cz = Math.sin(facing) * w;
    const base = pos.length / 3;
    const ring = (t: number, s: number) => {
      const bend = t * t;
      pos.push(ox - cx * s + lx * bend, t * h, oz - cz * s + lz * bend, ox + cx * s + lx * bend, t * h, oz + cz * s + lz * bend);
    };
    ring(0, 1);
    if (simple) {
      // Low quality: one triangle per blade.
      pos.push(ox + lx, h, oz + lz);
      idx.push(base, base + 1, base + 2);
      continue;
    }
    ring(0.5, 0.75);
    pos.push(ox + lx, h, oz + lz);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const vertex = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 aParams; // rotation, scale, colour variation
  uniform sampler2D uCut;
  uniform vec4 uField; // minX, minZ, 1/width, 1/depth
  uniform float uTime;
  uniform float uHeight;
  uniform vec3 uHead;   // trimmer head xz + spin (0..1) in z
  varying float vY;
  varying float vH;
  varying float vVar;
  #include <fog_pars_vertex>
  void main() {
    vec2 uv = (aPos.xz - uField.xy) * uField.zw;
    // The texture stores height / 3 (tall weeds grow to twice the normal sward, giant ones to ~3x).
    float h = texture2D(uCut, uv).r * 3.0;
    // Outside the field: wild meadow grass that is never mown.
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) h = 0.75 + aParams.z * 0.45;
    float c = cos(aParams.x);
    float s = sin(aParams.x);
    vec3 p = position;
    p.xz = mat2(c, -s, s, c) * p.xz;
    float y = position.y;
    p.y *= uHeight * aParams.y * h;
    // Taller grass is also thicker: giant weeds are broad and coarse.
    p.xz *= mix(0.7, 1.0, h) * (1.0 + max(0.0, h - 2.0) * 0.35);
    float bend = y * y * h;
    float w = sin(uTime * 1.6 + aPos.x * 0.55 + aPos.z * 0.35) * 0.07 + sin(uTime * 3.3 + aPos.x * 2.1) * 0.02;
    p.x += w * bend;
    p.z += w * 0.4 * bend;
    // Air wash from the spinning head: the grass round it pushed outwards and shaking, already at a
    // little throttle (too slow to cut, the line still stirs it), more and further out at full.
    vec2 d = aPos.xz - uHead.xy;
    float dist = length(d);
    float spin = sqrt(uHead.z);
    float near = smoothstep(0.6 + 0.5 * spin, 0.15, dist);
    float push = spin * near * bend * 0.25;
    vec2 out_ = normalize(d + vec2(0.0001));
    float shake = sin(uTime * 34.0 + aPos.x * 17.0 + aPos.z * 11.0) * spin * near * bend * 0.09;
    p.xz += out_ * push + vec2(-out_.y, out_.x) * shake;
    vec4 mvPosition = viewMatrix * vec4(aPos + p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vY = y;
    vH = h;
    vVar = aParams.z;
    #include <fog_vertex>
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uDry;
  uniform vec3 uLight;
  varying float vY;
  varying float vH;
  varying float vVar;
  #include <fog_pars_fragment>
  void main() {
    vec3 tip = mix(uTip, uDry, vVar * 0.6);
    vec3 col = mix(uBase, tip, smoothstep(0.0, 1.0, vY));
    // Freshly cut stubble shows the paler inner stems.
    col = mix(col, mix(uTip, uDry, 0.5), smoothstep(0.35, 0.12, vH) * 0.5);
    // Tall weeds: paler, seeding tops; giant weeds darker and coarse.
    col = mix(col, uDry * (0.9 + 0.2 * vVar), smoothstep(1.25, 1.9, vH) * smoothstep(0.55, 1.0, vY) * 0.7);
    col = mix(col, uBase * 1.25, smoothstep(2.05, 2.4, vH) * 0.45);
    col *= uLight * (0.75 + 0.35 * vY);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** Flower kinds in the atlas: daisy, buttercup, bellflower, poppy. */
const DAISY = 0;
const BUTTERCUP = 1;
const BELL = 2;
const POPPY = 3;

/** Grass colours (base, tip, dry seed heads) and wild flowers (per square metre, which kinds) for each sward. */
const PHOTO_STYLES: Record<GrassStyle, { base: string; tip: string; dry: string; flowers: number; kinds: number[] }> = {
  taze: { base: '#2f5a1c', tip: '#8fc44a', dry: '#c9c26a', flowers: 0.3, kinds: [DAISY, DAISY, BUTTERCUP] },
  cayir: { base: '#2b5a26', tip: '#7fc25e', dry: '#d4cf86', flowers: 0.8, kinds: [DAISY, BUTTERCUP, BELL, POPPY, BELL] },
  kuru: { base: '#4d5a26', tip: '#b3ad58', dry: '#dcc77a', flowers: 0.12, kinds: [BUTTERCUP, POPPY] },
  koyu: { base: '#203f17', tip: '#5f9a36', dry: '#a9a253', flowers: 0.15, kinds: [DAISY, BELL] },
};

/** On the painted ground: the bright, warm greens of the job maps (dark only right at the root). */
const PAINTED_STYLES: typeof PHOTO_STYLES = {
  taze: { base: '#1c4e0e', tip: '#64a024', dry: '#a8b250', flowers: 0.3, kinds: [DAISY, DAISY, BUTTERCUP] },
  cayir: { base: '#1a4a12', tip: '#5e9a2e', dry: '#b0ae62', flowers: 0.8, kinds: [DAISY, BUTTERCUP, BELL, POPPY, BELL] },
  kuru: { base: '#4a5e1a', tip: '#a29e46', dry: '#ccb666', flowers: 0.12, kinds: [BUTTERCUP, POPPY] },
  koyu: { base: '#143e0c', tip: '#4e8820', dry: '#949444', flowers: 0.15, kinds: [DAISY, BELL] },
};

const STYLES = PAINTED_GROUND ? PAINTED_STYLES : PHOTO_STYLES;

let atlas: THREE.CanvasTexture | null = null;

/** The four flower heads seen from above, drawn once into a 2x2 canvas atlas. */
function flowerAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S * 2;
  const g = cv.getContext('2d')!;
  const petals = (cx: number, cy: number, n: number, len: number, wid: number, color: string, edge: string, turn = 0) => {
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, edge);
      grad.addColorStop(0.35, color);
      grad.addColorStop(1, color);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(len * 0.55, 0, len * 0.5, wid, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  };
  const centre = (cx: number, cy: number, r: number, a: string, b: string) => {
    const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    grad.addColorStop(0, a);
    grad.addColorStop(1, b);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  };
  const h = S / 2;
  // Daisy (papatya): many thin white petals, yellow eye.
  petals(h, h, 16, 56, 7, '#ffffff', '#e8e4d0');
  centre(h, h, 14, '#ffe46a', '#e0a01a');
  // Buttercup (düğün çiçeği): five round glossy yellow petals.
  petals(S + h, h, 5, 52, 22, '#ffd92e', '#f0a818', 0.3);
  centre(S + h, h, 10, '#c9d24a', '#8a8f1c');
  // Bellflower (çan çiçeği): five pointed purple petals, pale throat.
  petals(h, S + h, 5, 56, 16, '#8a5fd0', '#d8c8f4', 0.6);
  centre(h, S + h, 9, '#f4eefc', '#b8a0e0');
  // Poppy (gelincik): four big red petals, black heart.
  petals(S + h, S + h, 4, 54, 28, '#e3311e', '#b01c10', 0.2);
  centre(S + h, S + h, 11, '#3a3a3a', '#111111');
  atlas = new THREE.CanvasTexture(cv);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

const flowerVertex = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 aInst; // kind, scale, turn
  attribute float part; // 0 stem, 1 head
  uniform sampler2D uCut;
  uniform vec4 uField;
  uniform float uTime;
  uniform float uHeight;
  varying vec2 vUv;
  varying float vPart;
  #include <fog_pars_vertex>
  void main() {
    vec2 fuv = (aPos.xz - uField.xy) * uField.zw;
    float h = texture2D(uCut, fuv).r * 3.0;
    if (fuv.x < 0.0 || fuv.x > 1.0 || fuv.y < 0.0 || fuv.y > 1.0) h = 1.0;
    // Mown: the flower is gone.
    float alive = step(0.45, h);
    float stem = uHeight * 1.3 * clamp(h, 0.8, 1.5);
    vec3 p = position * aInst.y * alive;
    // Head geometry sits at y = 0 round its centre; lift it to the top of the stem.
    p.y += part * stem * alive;
    if (part < 0.5) p.y *= stem;
    float c = cos(aInst.z);
    float s = sin(aInst.z);
    p.xz = mat2(c, -s, s, c) * p.xz;
    float sway = sin(uTime * 1.6 + aPos.x * 0.55 + aPos.z * 0.35) * 0.05 * (p.y / max(stem, 0.01));
    p.x += sway;
    vec4 mvPosition = viewMatrix * vec4(aPos + p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float k = aInst.x;
    vUv = uv * 0.5 + vec2(mod(k, 2.0), floor(k / 2.0)) * 0.5;
    vPart = part;
    #include <fog_vertex>
  }
`;

const flowerFragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uLight;
  varying vec2 vUv;
  varying float vPart;
  #include <fog_pars_fragment>
  void main() {
    vec4 col = vPart > 0.5 ? texture2D(uAtlas, vUv) : vec4(0.24, 0.44, 0.15, 1.0);
    if (col.a < 0.5) discard;
    gl_FragColor = vec4(col.rgb * uLight, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/**
 * One flower, 1 unit = 1 m: a thin stem (y 0..1, stretched to the stem height in the shader) and a
 * head of two quads round y = 0 (lifted onto the stem): one tilted up to the sky, one more upright so
 * it reads from the side too.
 */
function flowerGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const part: number[] = [];
  const s = 0.005;
  for (const [x0, x1] of [[-s, s]]) {
    pos.push(x0, 0, 0, x1, 0, 0, x1, 1, 0, x0, 0, 0, x1, 1, 0, x0, 1, 0);
    uv.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    part.push(0, 0, 0, 0, 0, 0);
  }
  const r = 0.075;
  const quad = (tilt: number, turn: number) => {
    const m = new THREE.Matrix4().makeRotationY(turn).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2 + tilt));
    const corners = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(m));
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(corners[i].x, corners[i].y, corners[i].z);
      uv.push(uvs[i][0], uvs[i][1]);
      part.push(1);
    }
  };
  quad(0.35, 0);
  quad(1.0, Math.PI / 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
  return g;
}

/** All grass of a field, drawn as instanced clumps whose height comes from the field's grass grid. */
export class GrassView {
  readonly group = new THREE.Group();
  readonly texture: THREE.DataTexture;
  readonly material: THREE.ShaderMaterial;
  private readonly data: Uint8Array;

  /**
   * @param wild width (m) of the meadow strip drawn round the field, at a lower density;
   * `heightAt` gives the terrain height there (the terrain outside the field is not `field.height`).
   */
  constructor(private readonly field: Field, blades: number, density = 1, wild = 0, heightAt?: (x: number, z: number) => number, simple = false) {
    const f = field;
    this.data = new Uint8Array(f.gw * f.gd);
    this.texture = new THREE.DataTexture(this.data, f.gw, f.gd, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.unpackAlignment = 1;
    this.upload(0, 0, f.gw - 1, f.gd - 1);

    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.DoubleSide,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uCut: { value: null },
          uField: { value: new THREE.Vector4(-f.width / 2, -f.depth / 2, 1 / f.width, 1 / f.depth) },
          uTime: { value: 0 },
          uHeight: { value: GRASS_HEIGHT },
          uHead: { value: new THREE.Vector3(0, 0, 0) },
          uBase: { value: new THREE.Color(STYLES[f.level.grass].base) },
          uTip: { value: new THREE.Color(STYLES[f.level.grass].tip) },
          uDry: { value: new THREE.Color(STYLES[f.level.grass].dry) },
          uLight: { value: new THREE.Color(1, 1, 1) },
        },
      ]),
    });
    this.material.uniforms.uCut.value = this.texture;

    const clump = clumpGeometry(blades, simple);
    const rnd = makeRng(f.level.seed + 99);
    const step = CLUMP / Math.sqrt(density);
    const hx = f.width / 2 + wild;
    const hzTop = f.depth / 2 + wild;
    // Below the field the village path and the depot: no meadow there, only the rough fringe along
    // the field's edge (not across the lane).
    const hzBottom = f.depth / 2 + 2;
    const tilesX = Math.ceil((hx * 2) / TILE);
    const tilesZ = Math.ceil((hzTop + hzBottom) / TILE);
    const ground = heightAt ?? ((x: number, z: number) => f.height(x, z));
    for (let tz = 0; tz < tilesZ; tz++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x0 = -hx + tx * TILE;
        const z0 = -hzTop + tz * TILE;
        const x1 = Math.min(x0 + TILE, hx);
        const z1 = Math.min(z0 + TILE, hzBottom);
        const pos: number[] = [];
        const par: number[] = [];
        let minY = Infinity;
        let maxY = -Infinity;
        for (let z = z0 + step / 2; z < z1; z += step) {
          for (let x = x0 + step / 2; x < x1; x += step) {
            const px = x + (rnd() - 0.5) * step * 0.9;
            const pz = z + (rnd() - 0.5) * step * 0.9;
            const inside = f.inField(px, pz);
            // Outside: a thin meadow, but along the field a thick fringe of rough grass reaching out
            // further here and less there, so the field has no ruled edge.
            const ex = Math.max(0, Math.abs(px) - f.width / 2);
            const ez = Math.max(0, Math.abs(pz) - f.depth / 2);
            const reach = 0.4 + 1.4 * (0.5 + 0.5 * Math.sin(px * 0.9 + pz * 0.7 + f.level.seed) * Math.sin(px * 0.37 - pz * 1.3));
            const fringe = !inside && Math.hypot(ex, ez) < reach;
            if (inside ? f.grassAt(px, pz) === 0 : rnd() > (fringe ? 0.9 : 0.3)) continue;
            if (pz > f.depth / 2 && (!fringe || f.laneDistance(px, pz) < LANE_HALF)) continue;
            const y = inside ? f.height(px, pz) : ground(px, pz);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            pos.push(px, y, pz);
            par.push(rnd() * Math.PI * 2, fringe ? 0.9 + rnd() * 0.7 : 0.75 + rnd() * 0.5, rnd());
          }
        }
        if (!pos.length) continue;
        const g = new THREE.InstancedBufferGeometry();
        g.index = clump.index;
        g.setAttribute('position', clump.getAttribute('position'));
        g.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
        g.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(par), 3));
        g.instanceCount = pos.length / 3;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const cy = (minY + maxY) / 2 + GRASS_HEIGHT / 2;
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.hypot(x1 - x0, z1 - z0, maxY - minY + 1) / 2 + 0.3);
        const mesh = new THREE.Mesh(g, this.material);
        mesh.frustumCulled = true;
        this.group.add(mesh);
      }
    }
    this.addFlowers(wild, ground);
    this.addLaneGrass(clump, density, ground);
  }

  /**
   * Grass along every road of the village: thick on both verges, growing a little way onto the earth
   * (or up to the cobbles), and short tufts on the hump between the wheel ruts of the dirt tracks. In
   * chunks along each road so the off-screen ones are culled.
   */
  private addLaneGrass(clump: THREE.BufferGeometry, density: number, ground: (x: number, z: number) => number): void {
    const f = this.field;
    const rnd = makeRng(f.level.seed + 41);
    const per = Math.round(16 * density);
    const h = f.harman;
    const chunk = 30;
    const inOther = (x: number, z: number) => f.others.some((o) => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ);
    for (const road of f.roads) {
      const l = road.pts;
      const cobble = road.kind === 'cobble';
      for (let c0 = 1; c0 < l.length; c0 += chunk) {
        const pos: number[] = [];
        const par: number[] = [];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (let i = c0; i < Math.min(l.length, c0 + chunk); i++) {
          const a = l[i - 1];
          const b = l[i];
          const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const nx = -(b.z - a.z) / len;
          const nz = (b.x - a.x) / len;
          for (let k = 0; k < per * len; k++) {
            const t = rnd();
            // Short tufts on the hump between the ruts (not on the cobbles).
            const hump = !cobble && rnd() < 0.12;
            // Verges: from a little inside the track's edge out into the meadow, thinning outwards.
            const side = rnd() < 0.5 ? -1 : 1;
            const off = hump ? (rnd() - 0.5) * 0.35 : side * ((cobble ? 1.45 : LANE_HALF - 0.7) + Math.pow(rnd(), 1.5) * 2.2);
            const px = a.x + (b.x - a.x) * t + nx * off;
            const pz = a.z + (b.z - a.z) * t + nz * off;
            if (h && Math.hypot(px - h.x, pz - h.z) < h.r) continue;
            // Not onto another stretch of the lane (inside a bend) or into the field.
            if (!hump && (f.laneDistance(px, pz) < LANE_HALF - 0.75 || f.roadDistance(px, pz) < (cobble ? 1.45 : 0))) continue;
            if (f.inField(px, pz) || inOther(px, pz)) continue;
            const y = ground(px, pz);
            pos.push(px, y, pz);
            par.push(rnd() * Math.PI * 2, hump ? 0.15 + rnd() * 0.15 : 0.7 + rnd() * 0.7, rnd());
            minX = Math.min(minX, px);
            maxX = Math.max(maxX, px);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, pz);
            maxZ = Math.max(maxZ, pz);
          }
        }
        if (!pos.length) continue;
        const g = new THREE.InstancedBufferGeometry();
        g.index = clump.index;
        g.setAttribute('position', clump.getAttribute('position'));
        g.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
        g.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(par), 3));
        g.instanceCount = pos.length / 3;
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2 + GRASS_HEIGHT, (minZ + maxZ) / 2), Math.hypot(maxX - minX, maxY - minY + 1, maxZ - minZ) / 2 + 0.5);
        const mesh = new THREE.Mesh(g, this.material);
        mesh.frustumCulled = true;
        this.group.add(mesh);
      }
    }
  }

  /** Wild flowers scattered in drifts in the sward (most in a highland meadow); cut along with the grass. */
  private addFlowers(wild: number, ground: (x: number, z: number) => number): void {
    const f = this.field;
    const st = STYLES[f.level.grass];
    const rnd = makeRng(f.level.seed + 404);
    const pos: number[] = [];
    const inst: number[] = [];
    const area = (f.width + wild * 2) * (f.depth + wild);
    const n = Math.round(area * st.flowers);
    for (let i = 0; i < n; i++) {
      const x = (rnd() - 0.5) * (f.width + wild * 2);
      const z = -f.depth / 2 - wild + rnd() * (f.depth + wild);
      // Flowers grow in drifts: keep more where a slow wave is high, and one kind per drift mostly.
      const drift = Math.sin(x * 0.4 + Math.sin(z * 0.3) * 2) * Math.cos(z * 0.35);
      if (drift < -0.2 && rnd() < 0.75) continue;
      const inside = f.inField(x, z);
      if (inside && f.grassAt(x, z) === 0) continue;
      pos.push(x, inside ? f.height(x, z) : ground(x, z), z);
      const pick = rnd() < 0.7 ? Math.floor((drift * 0.5 + 0.5) * st.kinds.length * 0.999) : Math.floor(rnd() * st.kinds.length);
      inst.push(st.kinds[Math.max(0, Math.min(st.kinds.length - 1, pick))], 0.8 + rnd() * 0.5, rnd() * Math.PI * 2);
    }
    if (!pos.length) return;
    const base = flowerGeometry();
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    g.setAttribute('part', base.getAttribute('part'));
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(inst), 3));
    g.instanceCount = pos.length / 3;
    const u = this.material.uniforms;
    const mat = new THREE.ShaderMaterial({
      vertexShader: flowerVertex,
      fragmentShader: flowerFragment,
      side: THREE.DoubleSide,
      fog: true,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uCut: u.uCut, uField: u.uField, uTime: u.uTime, uHeight: u.uHeight, uLight: u.uLight, uAtlas: { value: flowerAtlas() } },
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    this.group.add(m);
  }

  /** Copy changed grass cells to the GPU texture. */
  sync(time: number, headX: number, headZ: number, spin: number): void {
    const d = this.field.takeDirty();
    if (d) this.upload(d.i0, d.j0, d.i1, d.j1);
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uHead.value.set(headX, headZ, spin);
  }

  setLight(c: THREE.Color): void {
    this.material.uniforms.uLight.value.copy(c);
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && m !== this.material) m.dispose();
    });
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }

  private upload(i0: number, j0: number, i1: number, j1: number): void {
    const f = this.field;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * f.gw + i;
        this.data[k] = Math.round((Math.min(GRASS_RANGE, f.grass[k]) / GRASS_RANGE) * 255);
      }
    }
    this.texture.needsUpdate = true;
  }
}
