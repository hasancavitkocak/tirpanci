import * as THREE from 'three';
import { Field, STREAM } from '../game/field';

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
    vec3 deep = vec3(0.012, 0.05, 0.055);
    vec3 shallow = vec3(0.045, 0.12, 0.09);
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
    col = mix(col, vec3(0.6, 0.68, 0.66), foam * 0.3);
    float alpha = 0.88 + fres * 0.1;
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

    // Stones in and along the bed.
    const stones: THREE.Matrix4[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let z = z0 + 2; z < z1; z += 1.1 + rnd() * 1.8) {
      const cx = f.streamX(z) + (rnd() - 0.5) * WIDTH * 1.6;
      const s = 0.12 + rnd() * 0.25;
      stones.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, heightAt(cx, z) + s * 0.1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6), new THREE.Vector3(s * 1.3, s, s)));
    }
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
