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
   * towards the cutting head. `headCam` is the cutting head in camera space; `restCam` where it is held
   * at rest (on level ground, straight ahead). The gloves, the bar and the shaft turn together, as one,
   * about the middle of the grips, from there towards the head (the worker swinging the machine): the
   * shaft always leaves the bar straight between the hands, never bent off to a side or under a glove.
   */
  update(headCam: THREE.Vector3, restCam: THREE.Vector3): void {
    // (Turned about the middle of the two grips, so the gloves stay where they are on screen.)
    const pivot = this.hl.clone().add(this.hr).multiplyScalar(0.5);
    // Round to the side with the head; up and down only half as far, and not much (the gloves tipped
    // right over, the head high up a bank).
    const rd = this.tmp.copy(restCam).sub(pivot);
    const hd = headCam.clone().sub(pivot);
    const yaw = (v: THREE.Vector3) => Math.atan2(-v.x, -v.z);
    const pitch = (v: THREE.Vector3) => Math.atan2(v.y, Math.hypot(v.x, v.z));
    const dp = Math.max(-0.3, Math.min(0.3, (pitch(hd) - pitch(rd)) * 0.5));
    // (The gloves turned no more than 23 degrees: further, a glove swung round to face the eyes.)
    const dy = Math.max(-0.4, Math.min(0.4, yaw(hd) - yaw(rd)));
    this.sway.rotation.set(dp, dy, 0, 'YXZ');
    this.sway.position.copy(pivot).sub(pivot.clone().applyQuaternion(this.sway.quaternion));
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
