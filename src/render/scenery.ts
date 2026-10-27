import * as THREE from 'three';
import { makeNoise, makeRng } from '../game/rng';
import { MOBILE } from '../platform/device';

/**
 * Western Black Sea coast scenery (Düzce, Akçakoca): rolling hills covered in hazelnut orchards and
 * woods, mountains inland (uphill, -z), the sea below (downhill, +z), soft afternoon haze.
 */

export const HAZE = new THREE.Color('#d9dfd6');
const SKY_TOP = new THREE.Color('#6fa7dc');
/** Afternoon sun, from the west and fairly low. */
export const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.35).normalize();

/** Sky dome: an artist panorama when there is one, otherwise a gradient with a sun glow and haze. */
export function skyDome(panorama?: THREE.Texture, turn = 0, look?: { top: string; haze: string; sun: THREE.Vector3; glow: number }): THREE.Mesh {
  const g = new THREE.SphereGeometry(650, 48, 24);
  let mat: THREE.Material;
  if (panorama) {
    panorama.colorSpace = THREE.SRGBColorSpace;
    panorama.mapping = THREE.UVMapping;
    mat = new THREE.MeshBasicMaterial({ map: panorama, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false });
  } else {
    mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: look ? new THREE.Color(look.top) : SKY_TOP },
        uHaze: { value: look ? new THREE.Color(look.haze) : HAZE },
        uSun: { value: look?.sun ?? SUN_DIR },
        uGlow: { value: look?.glow ?? 1 },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHaze; uniform vec3 uSun; uniform float uGlow; varying vec3 vP;
        void main() {
          float t = smoothstep(-0.02, 0.45, vP.y);
          vec3 c = mix(uHaze, uTop, t);
          float s = max(dot(vP, uSun), 0.0);
          c += vec3(1.0, 0.85, 0.6) * (pow(s, 8.0) * 0.25 + pow(s, 300.0) * 1.5) * uGlow;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
  }
  const m = new THREE.Mesh(g, mat);
  m.rotation.y = turn;
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

/**
 * The sun in the sky (the painted sky has none): a bright disc in a warm glow, a sprite out on the sky
 * dome where the light comes from (`dir`, world), the dome turned by `turn`. Added to the dome.
 */
export function sunSprite(dir: THREE.Vector3, turn: number, glow = 1): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255, 255, 250, 1)');
  g.addColorStop(0.09, 'rgba(255, 252, 235, 1)');
  g.addColorStop(0.13, 'rgba(255, 236, 180, 0.75)');
  g.addColorStop(0.3, 'rgba(255, 214, 140, 0.25)');
  g.addColorStop(0.6, 'rgba(255, 200, 120, 0.07)');
  g.addColorStop(1, 'rgba(255, 200, 120, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending, opacity: Math.min(1, glow) }));
  // On the dome (r 650), a little inside it; its glow some 18 degrees across.
  s.position.copy(dir).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn).multiplyScalar(600);
  s.scale.setScalar(190);
  s.renderOrder = -1;
  return s;
}

/**
 * Rolling hills around the valley, out to the horizon: higher and wooded inland (-z), falling to
 * the coast (+z) where the sea starts. Vertex colours: orchard greens with darker wood patches; the
 * fog fades them into the haze. `base` is the ground height they rise from (the terrain's edge), so
 * no gap opens between the terrain and the hills where the valley falls away.
 */
export function hills(seed: number, inner: number, panorama: boolean, base: (x: number, z: number) => number = () => 0, innerZ = inner): THREE.Group {
  const grp = new THREE.Group();
  const noise = makeNoise(seed);
  const outer = panorama ? 190 : 380;
  // Coarse: far off and in the haze, the hills need few triangles.
  const rings = 16;
  const segs = 56;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  // With the painted ground: the deep greens of the painted sky's forests.
  const orchard = new THREE.Color(PAINTED_GROUND ? '#4a7a2a' : '#5d8a3a');
  const wood = new THREE.Color(PAINTED_GROUND ? '#2c5622' : '#2f5a2c');
  const meadow = new THREE.Color(PAINTED_GROUND ? '#6a9636' : '#86a64e');
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      // The terrain is longer north to south (`innerZ`): the hills start round an ellipse.
      const in0 = 1 / Math.hypot(Math.cos(a) / inner, Math.sin(a) / innerZ);
      const rad = in0 + (outer - in0) * t * t;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      // Inland (z < 0) rises into mountains; the coast side (z > 0) drops towards the sea.
      const inland = Math.max(0, -z / rad);
      const coast = Math.max(0, z / rad);
      const n = noise(x * 0.012, z * 0.012) * 0.6 + noise(x * 0.035 + 7, z * 0.035) * 0.3 + noise(x * 0.1, z * 0.1 + 3) * 0.1;
      const rise = Math.min(1, (rad - in0) / 60);
      let y = rise * (12 + n * 22 + inland * rad * 0.22 - coast * Math.max(0, rad - 120) * 0.35);
      y -= coast * rise * 6;
      y += base(x, z) - 0.6;
      pos.push(x, y, z);
      const w = Math.max(0, noise(x * 0.05 + 50, z * 0.05) * 1.3);
      c.copy(orchard).lerp(wood, Math.min(1, w + inland * 0.35)).lerp(meadow, Math.max(0, -n) * 0.6);
      // Speckle of orchard rows.
      const k = 0.88 + 0.24 * (noise(x * 0.6, z * 0.6) * 0.5 + 0.5);
      col.push(c.r * k, c.g * k, c.b * k);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s;
      const b = a + segs + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const hillMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const grassTex = PAINTED_GROUND ? groundTex?.grass : undefined;
  if (grassTex) {
    // The painted grass on the hills too, tiled larger than in the field and toned by the hill colours.
    hillMat.onBeforeCompile = (sh) => {
      sh.uniforms.uGrass = { value: grassTex };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vHXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vHXZ;\nuniform sampler2D uGrass;\n' + MEADOW_PATCHES)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec3 t = texture2D(uGrass, vHXZ / 5.0).rgb * 0.6 + texture2D(uGrass, vHXZ / 13.0 + 0.4).rgb * 0.4;
          diffuseColor.rgb *= t / vec3(0.36, 0.62, 0.2) * 0.82 * meadowPatches(vHXZ * 0.35);`,
        );
    };
  }
  grp.add(new THREE.Mesh(g, hillMat));

  if (!panorama) {
    // The Black Sea below the coast, and a blue-grey mountain line far inland.
    const sea = new THREE.Mesh(
      new THREE.CircleGeometry(900, 48, -Math.PI * 0.1, Math.PI * 1.2).rotateX(-Math.PI / 2),
      // Not fogged: the sea should read as blue even at the horizon (a little haze is in the colour).
      new THREE.MeshBasicMaterial({ color: '#7fa3b6', fog: false }),
    );
    sea.position.y = -32;
    grp.add(sea);
    const rnd = makeRng(seed + 3);
    const pts: number[] = [];
    const segM = 80;
    for (let i = 0; i < segM; i++) {
      const a0 = Math.PI + (i / segM) * Math.PI;
      const a1 = Math.PI + ((i + 1) / segM) * Math.PI;
      const h0 = 70 + 50 * Math.abs(Math.sin(a0 * 5.3)) + rnd() * 10;
      const h1 = 70 + 50 * Math.abs(Math.sin(a1 * 5.3)) + rnd() * 10;
      const R = 560;
      pts.push(Math.cos(a0) * R, -20, Math.sin(a0) * R, Math.cos(a1) * R, -20, Math.sin(a1) * R, Math.cos(a1) * R, h1, Math.sin(a1) * R);
      pts.push(Math.cos(a0) * R, -20, Math.sin(a0) * R, Math.cos(a1) * R, h1, Math.sin(a1) * R, Math.cos(a0) * R, h0, Math.sin(a0) * R);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    grp.add(new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: '#8fa6a6', side: THREE.DoubleSide, fog: true })));
  }
  return grp;
}

const texLoader = new THREE.TextureLoader();
let groundTex: { grass: THREE.Texture; soil: THREE.Texture; concrete?: THREE.Texture } | null = null;

/**
 * The ground: hand-painted grass and earth in the style of the job maps (zemin-*-boya.jpg), or with
 * PAINTED_GROUND off the tiling photos (ambientCG, CC0).
 */
export const PAINTED_GROUND = true;

/**
 * GLSL: broad patches of lighter, yellower meadow and darker grass over the painted ground (metres),
 * as in the painted maps; far off the small grass texture alone averages to one flat green.
 */
export const MEADOW_PATCHES = /* glsl */ `
  vec3 meadowPatches(vec2 p) {
    float a = sin(p.x * 0.21 + sin(p.y * 0.17) * 1.7) * sin(p.y * 0.19 + sin(p.x * 0.11) * 2.1);
    float b = sin(p.x * 0.047 - p.y * 0.031 + sin(p.y * 0.05) * 2.0);
    float c = sin(p.x * 0.6 + sin(p.y * 0.45) * 2.3) * sin(p.y * 0.55 - p.x * 0.2);
    float t = smoothstep(-0.7, 0.7, a * 0.55 + b * 0.5 + c * 0.2);
    // Dark, lush hollows; middling green; sunny, yellower meadow on the rises.
    vec3 lo = mix(vec3(0.62, 0.76, 0.6), vec3(0.98, 1.0, 0.92), smoothstep(0.0, 0.45, t));
    return mix(lo, vec3(1.32, 1.24, 0.8), smoothstep(0.55, 1.0, t));
  }
`;

export async function preloadGround(): Promise<void> {
  const k = PAINTED_GROUND ? '-boya' : '';
  const [grass, soil] = await Promise.all([texLoader.loadAsync(`./textures/zemin-cim${k}.jpg`), texLoader.loadAsync(`./textures/zemin-toprak${k}.jpg`)]);
  for (const t of [grass, soil]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    // (Each step of anisotropy is more texture reads for every pixel of the ground: two on a phone.)
    t.anisotropy = MOBILE ? 2 : 4;
  }
  // The harman's old village concrete (the painted look only).
  const concrete = PAINTED_GROUND ? await texLoader.loadAsync('./textures/zemin-beton-boya.jpg').catch(() => undefined) : undefined;
  groundTex = { grass, soil, concrete };
}

export function groundTextures(): { grass: THREE.Texture; soil: THREE.Texture; concrete?: THREE.Texture } | null {
  return groundTex;
}
