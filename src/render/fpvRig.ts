import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TRIMMER_RIG as R, cutTriangles, prepare, vec } from './trimmerRig';

/**
 * First-person view model, as in FPS games: the gloves are fixed in front of the camera exactly as in
 * the source picture (forearms leave the screen at the bottom corners). The handlebar, with its own grips
 * cut off, hangs below the gloves' grips, and the trimmer shaft runs from its clamp to the cutting head.
 */
export class FpvRig {
  /** Child of the camera. */
  readonly root = new THREE.Group();
  /** The clamp hole of the handlebar (where the shaft passes), for placing the body. */
  readonly clamp = new THREE.Object3D();
  private readonly hands: THREE.Object3D;
  private readonly bar: THREE.Object3D;
  private readonly hl: THREE.Vector3;
  private readonly hr: THREE.Vector3;
  private readonly hk: number;
  private readonly sway = new THREE.Group();
  private readonly m = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();

  constructor(handsModel: GLTF, barModel: GLTF) {
    this.root.add(this.sway);
    // Gloves: midpoint between the two grips at R.fpvHands, scaled to R.fpvGripSpan.
    const gripMid = (s: { bottom: readonly number[]; top: readonly number[] }) => vec(s.bottom).add(vec(s.top)).multiplyScalar(0.5);
    const l = gripMid(R.hands.left);
    const r = gripMid(R.hands.right);
    this.hk = R.fpvGripSpan / l.distanceTo(r);
    this.hands = prepare(handsModel.scene, false);
    this.hands.scale.setScalar(this.hk);
    this.hands.position.copy(vec(R.fpvHands).sub(l.clone().add(r).multiplyScalar(0.5 * this.hk)));
    this.sway.add(this.hands);
    // Bottom ends of the glove grips in camera space: the handlebar tube continues from there.
    this.hl = vec(R.hands.left.bottom).multiplyScalar(this.hk).add(this.hands.position);
    this.hr = vec(R.hands.right.bottom).multiplyScalar(this.hk).add(this.hands.position);

    this.bar = cutTriangles(prepare(barModel.scene, false), (c) => Math.abs(c.x) > R.bar.gripX && c.y > R.bar.gripCutY);
    this.bar.matrixAutoUpdate = false;
    this.bar.add(this.clamp);
    this.clamp.position.copy(vec(R.bar.hole));
    this.sway.add(this.bar);
    this.root.traverse((o) => (o.frustumCulled = false));
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  /**
   * Place the handlebar so its tube ends meet the glove grips and its clamp axis points along the shaft,
   * towards the cutting head. `headCam` is the cutting head in camera space; `headAngle` the head's
   * side angle (radians, + = right) so the hands follow the swing a little.
   */
  update(headCam: THREE.Vector3, headAngle: number): void {
    this.sway.rotation.y = -headAngle * 0.45;
    this.sway.updateMatrix();
    // Work in the sway group's space.
    const head = this.tmp.copy(headCam).applyMatrix4(this.m.copy(this.sway.matrix).invert());
    const bl = vec(R.bar.left.bottom);
    const br = vec(R.bar.right.bottom);
    const scale = this.hl.distanceTo(this.hr) / bl.distanceTo(br);
    const mid = this.hl.clone().add(this.hr).multiplyScalar(0.5);
    // Clamp roughly below the grips' midpoint; the shaft goes from there to the head.
    const clampGuess = mid.clone().add(new THREE.Vector3(0, -0.2, 0));
    const forward = head.clone().sub(clampGuess).normalize();
    // Bar basis: X along the grips, -Z along the shaft (model -Z = towards the head), Y up the U.
    const z = forward.clone().negate();
    const x = this.hr.clone().sub(this.hl);
    x.addScaledVector(z, -x.dot(z)).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    this.m.makeBasis(x, y, z).scale(new THREE.Vector3(scale, scale, scale));
    // Translate so the model's tube-end midpoint lands on the gloves' grip-end midpoint.
    const modelMid = bl.add(br).multiplyScalar(0.5).applyMatrix4(this.m);
    this.m.setPosition(mid.sub(modelMid));
    this.bar.matrix.copy(this.m);
    this.bar.matrixWorldNeedsUpdate = true;
  }
}
