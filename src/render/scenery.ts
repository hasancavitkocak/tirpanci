import * as THREE from 'three';
import { makeNoise, makeRng } from '../game/rng';

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
  const orchard = new THREE.Color('#5d8a3a');
  const wood = new THREE.Color('#2f5a2c');
  const meadow = new THREE.Color('#86a64e');
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
  grp.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));

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
let groundTex: { grass: THREE.Texture; soil: THREE.Texture } | null = null;

/** Tiling ground photos (ambientCG, CC0). */
export async function preloadGround(): Promise<void> {
  const [grass, soil] = await Promise.all([texLoader.loadAsync('./textures/zemin-cim.jpg'), texLoader.loadAsync('./textures/zemin-toprak.jpg')]);
  for (const t of [grass, soil]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
  }
  groundTex = { grass, soil };
}

export function groundTextures(): { grass: THREE.Texture; soil: THREE.Texture } | null {
  return groundTex;
}
