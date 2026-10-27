import * as THREE from 'three';
import { Field, STREAM } from '../game/field';
import { PAINTED_GROUND } from './scenery';

/**
 * The village's mountain stream (dere) running down the hill along its east side.
 * Its course and bed live in `Field` (streamX, streamCarve); the worker can wade into it.
 */
const WIDTH = STREAM.width;
const DEPTH = STREAM.depth;
const WATER = STREAM.water;

/** Distance from a point to the stream centre line (Infinity without a stream). */
export function streamDistance(f: Field, x: number, z: number): number {
  return f.streamDistance(x, z);
}

const vertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSun;
  varying vec2 vUv;
  varying vec3 vW;
  #include <fog_pars_fragment>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    // v runs downstream (metres); the ripples move with the flow, faster in the middle.
    float across = vUv.x * 2.0 - 1.0;
    float speed = 1.2 * (1.0 - across * across * 0.6);
    vec2 p = vec2(vUv.x * 3.0, vUv.y * 1.4 - uTime * speed);
    float n = noise(p * 2.0) * 0.6 + noise(p * 5.0 + 3.0) * 0.4;
    float n2 = noise(vec2(vUv.x * 9.0, vUv.y * 4.0 - uTime * speed * 1.6));
    // Linear colours (the colorspace include turns them into sRGB): dark teal in the middle, greener by the banks.
    // (Painted look: clear water, a light green-brown tint, the pebbled bed showing through.)
    vec3 deep = ${PAINTED_GROUND ? 'vec3(0.03, 0.07, 0.05)' : 'vec3(0.012, 0.05, 0.055)'};
    vec3 shallow = ${PAINTED_GROUND ? 'vec3(0.1, 0.14, 0.08)' : 'vec3(0.045, 0.12, 0.09)'};
    vec3 col = mix(deep, shallow, abs(across) * 0.8 + n * 0.25);
    // Sky reflection and sun glints on the ripples.
    vec3 vdir = normalize(cameraPosition - vW);
    vec3 nrm = normalize(vec3((n - 0.5) * 0.5, 1.0, (n2 - 0.5) * 0.5));
    float fres = min(pow(1.0 - max(dot(vdir, nrm), 0.0), 3.0), 0.7);
    col = mix(col, vec3(0.16, 0.3, 0.42), fres * 0.4);
    float spec = pow(max(dot(reflect(-normalize(uSun), nrm), vdir), 0.0), 60.0);
    col += vec3(1.0, 0.95, 0.85) * spec * 0.6;
    // Foam where the water runs over stones / along the banks.
    float foam = smoothstep(0.72, 0.9, n2) * (0.35 + 0.65 * smoothstep(0.6, 1.0, abs(across)));
    col = mix(col, ${PAINTED_GROUND ? 'vec3(0.85, 0.93, 0.95), foam * 0.6' : 'vec3(0.6, 0.68, 0.66), foam * 0.3'});
    // (Painted look, clear: little of the tint in the middle, more by the banks and where the sky
    // shows in it; white water opaque.)
    ${PAINTED_GROUND ? 'float alpha = 0.5 - 0.18 * abs(across) + n * 0.12 + fres * 0.35 + spec * 0.5 + foam * 0.55;' : 'float alpha = 0.88 + fres * 0.1;'}
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export class StreamView {
  readonly group = new THREE.Group();
  private readonly mat: THREE.ShaderMaterial;

  constructor(f: Field, heightAt: (x: number, z: number) => number, sun: THREE.Vector3, stoneGeo: THREE.BufferGeometry, stoneMat: THREE.Material) {
    // The village's whole stream, end to end.
    const z0 = f.map.minZ - 40;
    const z1 = f.map.maxZ + 40;
    const step = 0.8;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let v = 0;
    let prev: THREE.Vector3 | null = null;
    for (let z = z0; z <= z1; z += step) {
      const cx = f.streamX(z);
      // Water level from the banks' height (the bed is carved below it).
      // Water stands a little above the carved bed (WATER below the banks).
      const y = heightAt(cx, z) + DEPTH - WATER;
      const c = new THREE.Vector3(cx, y, z);
      if (prev) v += c.distanceTo(prev);
      prev = c;
      const dx = f.streamX(z + 0.1) - cx;
      const side = new THREE.Vector3(1, 0, -dx / 0.1).normalize();
      for (const s of [-1, 1]) {
        pos.push(cx + side.x * s * WIDTH * 0.62, y, z + side.z * s * WIDTH * 0.62);
        uv.push(s < 0 ? 0 : 1, v);
      }
    }
    const rows = pos.length / 6;
    for (let r = 0; r < rows - 1; r++) {
      const a = r * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      fog: true,
      depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSun: { value: sun.clone() } }]),
    });
    const water = new THREE.Mesh(g, this.mat);
    water.renderOrder = 1;
    this.group.add(water);
    // The painted look: the stream's pebbled bed under the clear water, out to the foot of the banks.
    if (PAINTED_GROUND) this.group.add(streamBed(f, heightAt, z0, z1));

    // Stones in and along the bed.
    // (Where they lie is the field's: the big boulders stop the pat pat.)
    const stones = f.streamStones.map((st) => new THREE.Matrix4().compose(new THREE.Vector3(st.x, heightAt(st.x, st.z) + st.s * 0.1, st.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.rot), new THREE.Vector3(st.s * 1.3, st.s, st.s)));
    const sm = new THREE.InstancedMesh(stoneGeo, stoneMat, stones.length);
    stones.forEach((m, i) => sm.setMatrixAt(i, m));
    sm.castShadow = true;
    sm.receiveShadow = true;
    this.group.add(sm);
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time;
  }
}

/**
 * The stream bed: a ribbon on the carved ground, the artist's pebble picture (textures/zemin-dere-boya.jpg)
 * or, until there is one, pebbles drawn here; fading out up the banks.
 */
function streamBed(f: Field, heightAt: (x: number, z: number) => number, z0: number, z1: number): THREE.Mesh {
  // As wide as the water (WIDTH * 0.62 each side) and a little up the banks.
  const water = WIDTH * 0.62;
  const half = water + 0.8;
  // Solid out to past where the ground is cut away for the water (world.ts: water + 0.4), then fading up
  // the banks: across, nine steps over the solid middle and one more out to each faded edge (with the
  // steps even, the edge's fade began inside the cut and the sky showed through along the banks).
  const solid = water + 0.5;
  const offsets = [-half, ...Array.from({ length: 9 }, (_, k) => -solid + (2 * solid * k) / 8), half];
  const across = offsets.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let row = 0;
  for (let z = z0; z <= z1; z += 0.8, row++) {
    const cx = f.streamX(z);
    for (let k = 0; k < across; k++) {
      const s = offsets[k];
      const x = cx + s;
      // Up the banks a little under the ground (drawn over it all the same: polygonOffset), so its edge is
      // never a lip over the coarse ground the eye passes under into the ground cut away for the water.
      const up = Math.max(0, Math.min(1, (Math.abs(s) - water) / (solid - water)));
      pos.push(x, heightAt(x, z) + 0.03 - 0.15 * up, z);
      uv.push(x / 2.4, z / 2.4);
      const edge = Math.abs(s) <= solid + 1e-6 ? 1 : 0;
      col.push(1, 1, 1, edge * edge * (3 - 2 * edge));
    }
    if (z + 0.8 <= z1) for (let k = 0; k < across - 1; k++) {
      const q = row * across + k;
      idx.push(q, q + across, q + 1, q + 1, q + across, q + across + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  const map = new THREE.TextureLoader().load('./textures/zemin-dere-boya.jpg', undefined, undefined, () => {
    m.material.map = pebbleTexture();
    m.material.needsUpdate = true;
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -200 }));
  m.receiveShadow = true;
  m.renderOrder = 0;
  return m;
}

/** Pebbles drawn on a canvas (warm browns, greys, rust), wrapping round its edges so it tiles. */
function pebbleTexture(): THREE.CanvasTexture {
  const n = 512;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#9b8466';
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 520; i++) {
    const x = rnd() * n;
    const y = rnd() * n;
    const r = 6 + rnd() * rnd() * 30;
    const hue = [28, 35, 20, 40, 15][Math.floor(rnd() * 5)];
    const sat = rnd() < 0.3 ? 8 : 22 + rnd() * 25;
    const light = 30 + rnd() * 30;
    const a = rnd() * Math.PI;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      if (x + ox < -40 || x + ox > n + 40 || y + oy < -40 || y + oy > n + 40) continue;
      g.fillStyle = 'rgba(40, 28, 16, 0.45)';
      g.beginPath();
      g.ellipse(x + ox + r * 0.12, y + oy + r * 0.15, r, r * 0.72, a, 0, Math.PI * 2);
      g.fill();
      const grad = g.createRadialGradient(x + ox - r * 0.3, y + oy - r * 0.3, r * 0.1, x + ox, y + oy, r);
      grad.addColorStop(0, `hsl(${hue}, ${sat}%, ${light + 14}%)`);
      grad.addColorStop(1, `hsl(${hue}, ${sat}%, ${light - 6}%)`);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x + ox, y + oy, r, r * 0.72, a, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
