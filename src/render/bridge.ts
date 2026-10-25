import * as THREE from 'three';
import { Field } from '../game/field';
import { deckRise } from '../game/village';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Where a track crosses the village's stream: the wooden bridge (public/models/kopru.glb, fitted to the
 * walkway Field.bridgeDeck gives; a wooden one without the model) and the mill on its bank (a simple
 * stone one until there is a model).
 */

/**
 * The bridge model's own measures (kopru.glb as made, about a unit long; scripts/glb-deck.mjs): its length
 * along x, its walkway's width across z (between the handrails), and the walkway's height at its ends
 * (the tips of its ramps) and along its level middle. Its ramps are a fifth of its length, as the
 * bridge's (Bridge.ramp).
 */
const MODEL = { len: 0.98, walk: 0.266, endY: 0.146, midY: 0.204 };

export function bridgeGroup(f: Field, bridgeModel?: GLTF, millModel?: GLTF): THREE.Group | null {
  if (!f.bridge) return null;
  const g = new THREE.Group();
  g.add(bridgeModel ? modelBridge(f, bridgeModel) : bridge(f));
  if (f.mill) {
    const m = mill(f, millModel);
    g.add(m);
    g.userData.wheel = m.userData.wheel;
  }
  return g;
}

/** The bridge's frame: from bank to bank along its heading, tipped so each end sits on its bank. */
function bridgeFrame(f: Field): THREE.Group {
  const b = f.bridge!;
  const [w, e] = f.bridgeEnds();
  const o = new THREE.Group();
  o.position.set(b.x, (w + e) / 2, b.z);
  o.rotation.order = 'YXZ';
  o.rotation.y = b.rot;
  o.rotation.z = Math.atan2(e - w, b.len);
  return o;
}

/** The bridge model, scaled so its walkway is the bridge's: its length, width and height. */
function modelBridge(f: Field, model: GLTF): THREE.Object3D {
  const b = f.bridge!;
  const o = bridgeFrame(f);
  const m = model.scene.clone(true);
  const sy = b.hump / (MODEL.midY - MODEL.endY);
  m.scale.set(b.len / MODEL.len, sy, b.width / MODEL.walk);
  m.position.y = -MODEL.endY * sy;
  m.traverse((x) => {
    if ((x as THREE.Mesh).isMesh) x.castShadow = x.receiveShadow = true;
  });
  o.add(m);
  return o;
}

/**
 * The wooden bridge, its walkway on Field.bridgeDeck (from bank to bank, humped a little in the
 * middle): planks across two beams, on piles in the stream, a post-and-rail handrail each side.
 */
function bridge(f: Field): THREE.Object3D {
  const b = f.bridge!;
  const o = bridgeFrame(f);
  const plank = new THREE.MeshLambertMaterial({ color: '#8a6240' });
  const dark = new THREE.MeshLambertMaterial({ color: '#5e4027' });
  const deckY = (u: number) => deckRise(b, u);
  const slope = (u: number) => (deckRise(b, u + 0.05) - deckRise(b, u - 0.05)) / 0.1;
  // The planks across, a finger's gap between them, a little uneven.
  const n = Math.round(b.len / 0.34);
  const plankGeo = new THREE.BoxGeometry(0.3, 0.08, b.width + 0.5);
  for (let k = 0; k < n; k++) {
    const u = -b.len / 2 + (k + 0.5) * (b.len / n);
    const m = new THREE.Mesh(plankGeo, plank);
    m.position.set(u, deckY(u) - 0.04 - (k % 3) * 0.008, ((k * 37) % 7) * 0.01 - 0.03);
    m.rotation.z = Math.atan(slope(u));
    o.add(m);
  }
  // Two beams under them and the rails, in short straight pieces along the hump.
  const along = (y: number, z: number, h: number, d: number, mat: THREE.Material) => {
    const parts = 8;
    for (let k = 0; k < parts; k++) {
      const u0 = -b.len / 2 + (k * b.len) / parts;
      const u1 = u0 + b.len / parts;
      const y0 = deckY(u0) + y;
      const y1 = deckY(u1) + y;
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(u1 - u0, y1 - y0) + 0.02, h, d), mat);
      m.position.set((u0 + u1) / 2, (y0 + y1) / 2, z);
      m.rotation.z = Math.atan2(y1 - y0, u1 - u0);
      o.add(m);
    }
  };
  for (const s of [-1, 1]) {
    along(-0.2, s * (b.width / 2 - 0.3), 0.24, 0.22, dark);
    along(0.95, s * (b.width / 2 + 0.12), 0.1, 0.12, plank);
    along(0.5, s * (b.width / 2 + 0.12), 0.07, 0.08, plank);
    // Posts every metre and a half.
    const posts = Math.round(b.len / 1.5);
    for (let k = 0; k <= posts; k++) {
      const u = -b.len / 2 + (k * b.len) / posts;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), dark);
      m.position.set(u, deckY(u) + 0.45, s * (b.width / 2 + 0.12));
      o.add(m);
    }
  }
  // Piles down into the stream bed, a pair either side of the water.
  for (const u of [-1.6, 1.6]) {
    for (const z of [-b.width / 2 + 0.3, b.width / 2 - 0.3]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.4, 8), dark);
      m.position.set(u, deckY(u) - 1.3, z);
      o.add(m);
    }
  }
  o.traverse((x) => {
    if ((x as THREE.Mesh).isMesh) x.castShadow = x.receiveShadow = true;
  });
  return o;
}

/**
 * The mill house model (degirmen.glb as made, 0.655 high): the axle stub out of its long +z wall (its
 * wheel's middle: x, y, and z half way out from the wall), the wheel's radius (up to just under the chute
 * along that wall) and how far out from the wall it reaches.
 */
const MILL = { h: 0.655, axle: { x: -0.035, y: 0.112, z: 0.36 }, radius: 0.22, thick: 0.09 };
/** The wheel's turn, radians a second (the water falls on its upstream side, which goes down). */
const WHEEL_SPIN = -0.7;

/** The mill's wheel (in bridgeGroup's userData.wheel): turned with the time. */
export function turnMillWheel(g: THREE.Object3D | null, time: number): void {
  const w = g?.userData.wheel as THREE.Object3D | undefined;
  if (w) w.rotation.z = time * WHEEL_SPIN;
}

/**
 * A wooden water wheel `r` across its middle, `t` thick, in its own xy plane (it turns about z): two
 * rims, eight spokes, a hub, and paddles all round between the rims.
 */
function waterWheel(r: number, t: number): THREE.Group {
  const w = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: '#5f4129' });
  const dark = new THREE.MeshLambertMaterial({ color: '#3d2a1a' });
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.94, r * 0.05, 6, 32), wood);
    rim.position.z = (s * t) / 2;
    w.add(rim);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.9, r * 0.06, r * 0.06), wood);
      spoke.rotation.z = (i * Math.PI) / 4;
      spoke.position.z = (s * t) / 2;
      w.add(spoke);
    }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.12, t * 1.3, 12), dark);
  hub.rotation.x = Math.PI / 2;
  w.add(hub);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(r * 0.26, r * 0.04, t * 1.05), wood);
    paddle.position.set(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, 0);
    paddle.rotation.z = a;
    w.add(paddle);
  }
  w.traverse((x) => {
    if ((x as THREE.Mesh).isMesh) x.castShadow = x.receiveShadow = true;
  });
  return w;
}

/** The mill on the stream's bank (public/models/degirmen.glb; until there is one, a stone house with a water wheel). */
function mill(f: Field, model?: GLTF): THREE.Object3D {
  const m = f.mill!;
  const o = new THREE.Group();
  // On the bank (the ground under its landward half: its stream side stands over the bank's slope).
  const y = Math.min(...[-3, -1.5, 0].flatMap((dx) => [-2.5, 0, 2.5].map((dz) => f.height(m.x + dx, m.z + dz))));
  o.position.set(m.x, y - 0.2, m.z);
  o.rotation.y = m.rot;
  if (model) {
    const s = model.scene.clone(true);
    const k = 5 / MILL.h;
    s.scale.setScalar(k);
    s.traverse((x) => {
      if ((x as THREE.Mesh).isMesh) x.castShadow = x.receiveShadow = true;
    });
    o.add(s);
    // Its wheel on the axle stub, in the stream, turning (see turnMillWheel).
    const wheel = waterWheel(MILL.radius * k, MILL.thick * k);
    wheel.position.set(MILL.axle.x * k, MILL.axle.y * k, MILL.axle.z * k);
    o.add(wheel);
    o.userData.wheel = wheel;
    return o;
  }
  const stone = new THREE.MeshLambertMaterial({ color: '#9a9184' });
  const wood = new THREE.MeshLambertMaterial({ color: '#6b4a2b' });
  const roof = new THREE.MeshLambertMaterial({ color: '#a6452f' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3, 4), stone);
  body.position.y = 1.5;
  const top = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.8, 4), roof);
  top.position.y = 3.9;
  top.rotation.y = Math.PI / 4;
  // The wheel on the pond side (+x of the mill's own frame).
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.5, 16), wood);
  // (Its axle out of the wall, along x.)
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(2.6, 1.3, 0);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.9, 1.1), wood);
  door.position.set(-2.27, 0.95, 0);
  o.add(body, top, wheel, door);
  o.traverse((x) => {
    if ((x as THREE.Mesh).isMesh) x.castShadow = x.receiveShadow = true;
  });
  return o;
}
