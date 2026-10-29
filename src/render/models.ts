import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Optional artist models. `public/models/models.json` lists which files exist, e.g.
 *   { "worker": "worker.glb", "trimmer": "trimmer.glb", "bush": ["ocak1.glb", "ocak2.glb"] }
 * Anything not listed falls back to the procedural placeholder. See docs/MODELS.md.
 */
export type ModelKey =
  | 'worker' | 'hands' | 'trimmer' | 'handlebar' | 'bush' | 'stone' | 'depot' | 'house' | 'shoot'
  | 'patpat' | 'patpatTeker' | 'patpatDireksiyon' | 'tractor' | 'tractorRear' | 'tractorFront' | 'trailer'
  | 'hive' | 'hen' | 'snake' | 'hose' | 'grave' | 'mosque' | 'hut' | 'car' | 'backpack' | 'earmuffs' | 'fuelcan' | 'spool' | 'gazebo' | 'kennel' | 'garage' | 'bridge' | 'mill' | 'sack' | 'patos' | 'freshNuts' | 'houseKaradere' | 'serender' | 'arch' | 'barn' | 'bale' | 'chainsaw' | 'fallenTree' | 'log' | 'woodRack' | 'dog' | 'stoneWall' | 'cow' | 'tiller' | 'blower' | 'bigTractor' | 'bigTractorRear' | 'bigTractorFront';

export type Models = Partial<Record<ModelKey, GLTF[]>> & {
  /** Equirectangular sky panorama (manifest key "panorama", file in public/textures), and its turn in degrees. */
  panorama?: THREE.Texture;
  panoramaTurn?: number;
};

export async function loadModels(onProgress?: (p: number) => void): Promise<Models> {
  let manifest: Partial<Record<ModelKey | 'panorama' | 'panoramaTurn', string | string[]>> = {};
  try {
    const res = await fetch('./models/models.json', { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch {
    /* no manifest: everything procedural */
  }
  const loader = new GLTFLoader();
  // Models optimised with `gltf-transform optimize --compress meshopt` (docs/MODELS.md).
  loader.setMeshoptDecoder(MeshoptDecoder);
  const out: Models = {};
  const { panorama, panoramaTurn, ...glbs } = manifest;
  if (typeof panorama === 'string') {
    try {
      out.panorama = await new THREE.TextureLoader().loadAsync(`./textures/${panorama}`);
      out.panoramaTurn = Number(panoramaTurn ?? 0);
    } catch (e) {
      console.warn(`panorama ${panorama} could not be loaded`, e);
    }
  }
  const jobs: [ModelKey, string][] = [];
  for (const [k, v] of Object.entries(glbs) as [ModelKey, string | string[]][]) {
    for (const file of Array.isArray(v) ? v : [v]) jobs.push([k, file]);
  }
  let done = 0;
  await Promise.all(
    jobs.map(async ([k, file]) => {
      try {
        const gltf = await loader.loadAsync(`./models/${file}`);
        solidWhereOpaque(gltf.scene);
        (out[k] ??= []).push(gltf);
      } catch (e) {
        console.warn(`model ${file} could not be loaded, using placeholder`, e);
      }
      onProgress?.(++done / jobs.length);
    }),
  );
  return out;
}

/**
 * The artist's models come with their materials blended (glTF alphaMode BLEND), their pictures opaque
 * or not: three draws every blended double-sided mesh twice, its back then its front, checking its
 * shader again each time (a phone's frames went on it). Opaque where its picture is (the same look,
 * drawn once); where the picture has see-through parts (leaves), cut out at half instead of blended.
 */
const seeThrough = new WeakMap<object, boolean>();
function hasAlpha(image: CanvasImageSource & { width: number; height: number }): boolean {
  const known = seeThrough.get(image);
  if (known !== undefined) return known;
  let any = false;
  try {
    // (A small copy is enough to tell: 64 by 64.)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(image, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 250) {
        any = true;
        break;
      }
    }
  } catch {
    any = true;
  }
  seeThrough.set(image, any);
  return any;
}

function solidWhereOpaque(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of (Array.isArray(m) ? m : [m]) as THREE.MeshStandardMaterial[]) {
      if (!mat.transparent || mat.opacity < 1) continue;
      const img = mat.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
      mat.transparent = false;
      mat.depthWrite = true;
      if (!img || !hasAlpha(img)) continue;
      mat.alphaTest = 0.5;
    }
  });
}

/** Scale an object so its height is `height` and its base sits on y = 0, centred in x/z. */
export function fitHeight(obj: THREE.Object3D, height: number): void {
  const box = new THREE.Box3().setFromObject(obj);
  const s = height / Math.max(1e-6, box.max.y - box.min.y);
  obj.scale.multiplyScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
}

/** Wrap a model so its root can be positioned freely while the fitted transform stays inside. */
export function fitted(src: THREE.Object3D, height: number): THREE.Group {
  const g = new THREE.Group();
  const m = src.clone(true);
  fitHeight(m, height);
  m.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  g.add(m);
  return g;
}
