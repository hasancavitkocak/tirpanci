import * as THREE from 'three';
import { Weather } from '../game/config';

/** Light, sky and haze for each kind of weather. */
export interface WeatherLook {
  skyTop: string;
  haze: string;
  sunColor: string;
  sun: number;
  /** Direction towards the sun. */
  sunDir: THREE.Vector3;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
  /** Sun glow in the sky (0 = hidden behind cloud). */
  glow: number;
}

export const WEATHER: Record<Weather, WeatherLook> = {
  sunny: {
    skyTop: '#6fa7dc', haze: '#d9dfd6', sunColor: '#ffe0b0', sun: 2.6, sunDir: new THREE.Vector3(-0.55, 0.62, 0.35).normalize(),
    hemiSky: '#cfe0f5', hemiGround: '#5b6b35', hemi: 1.25, fogNear: 40, fogFar: 260, exposure: 1.12, glow: 1,
  },
  // Black Sea drizzle: flat grey light, the far hills lost in the cloud.
  rain: {
    skyTop: '#7d8890', haze: '#a9b1b2', sunColor: '#dfe4e8', sun: 0.9, sunDir: new THREE.Vector3(-0.3, 0.9, 0.3).normalize(),
    hemiSky: '#c4ccd2', hemiGround: '#4a5a33', hemi: 1.6, fogNear: 14, fogFar: 120, exposure: 1.05, glow: 0,
  },
  // Highland fog (sis): the world ends a few rows away.
  fog: {
    skyTop: '#c3c9c8', haze: '#c9cfcd', sunColor: '#f1efe6', sun: 1.1, sunDir: new THREE.Vector3(-0.4, 0.8, 0.3).normalize(),
    hemiSky: '#e0e5e4', hemiGround: '#56653a', hemi: 1.55, fogNear: 4, fogFar: 46, exposure: 1.08, glow: 0.15,
  },
  // Late afternoon (akşamüstü): low orange sun, long shadows, warm haze.
  evening: {
    skyTop: '#5a7fb0', haze: '#f0c79a', sunColor: '#ffb070', sun: 2.4, sunDir: new THREE.Vector3(-0.8, 0.25, 0.4).normalize(),
    hemiSky: '#b9b6d0', hemiGround: '#5a4a30', hemi: 0.95, fogNear: 30, fogFar: 220, exposure: 1.18, glow: 1.4,
  },
};

const DROPS = 1400;
/** Box round the camera the rain falls in, metres. */
const BOX = 14;

/** Rain streaks falling round the camera: line segments moved in the vertex shader, so no per-frame upload. */
export class Rain {
  readonly lines: THREE.LineSegments;
  private readonly mat: THREE.ShaderMaterial;

  constructor() {
    const pos = new Float32Array(DROPS * 6);
    const seed = new Float32Array(DROPS * 2);
    for (let i = 0; i < DROPS; i++) {
      const x = Math.random() * BOX;
      const y = Math.random() * BOX;
      const z = Math.random() * BOX;
      pos.set([x, y, z, x, y, z], i * 6);
      // Bottom end (0) and top end (1) of each streak.
      seed[i * 2] = 0;
      seed[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('end', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `
        attribute float end;
        uniform float uTime;
        uniform vec3 uCam;
        varying float vA;
        void main() {
          // Each drop falls through the box and wraps round; the box follows the camera. The drop is
          // wrapped as one point and its two ends added after, so a streak never has one end on each
          // side of the box (that drew long lines right across the view).
          vec3 p = position;
          p.y -= uTime * 9.0;
          p.x += uTime * 0.6;
          vec3 base = uCam - vec3(${(BOX / 2).toFixed(1)});
          vec3 w = base + mod(p - base, vec3(${BOX.toFixed(1)}));
          w.x -= end * 0.04;
          w.y += end * 0.35;
          // Drops right by the camera would be long smears: they fade out.
          float near = smoothstep(0.6, 2.2, distance(w, uCam));
          vA = 0.26 * (0.35 + 0.65 * end) * near;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { gl_FragColor = vec4(0.78, 0.82, 0.86, vA); }`,
    });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 2;
  }

  update(time: number, cam: THREE.Vector3): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uCam.value.copy(cam);
  }
}
