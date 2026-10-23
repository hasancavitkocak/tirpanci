import * as THREE from 'three';

/**
 * Analytic two-bone IK for an arm (upper arm, forearm, hand bones of a skinned model):
 * places the elbow with the law of cosines in the plane towards `pole`, then turns the upper arm
 * and forearm so the hand reaches `target`. Works on world positions; bone matrices must be current.
 */
export class ArmIk {
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly e = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly pd = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly v1 = new THREE.Vector3();
  private readonly ao = new THREE.Vector3();
  private readonly af = new THREE.Vector3();
  private readonly at = new THREE.Vector3();

  constructor(
    private readonly upper: THREE.Object3D,
    private readonly lower: THREE.Object3D,
    private readonly hand: THREE.Object3D,
  ) {}

  /** `pole`: world direction the elbow should point to (e.g. down and out). `weight` blends with the animation. */
  solve(target: THREE.Vector3, pole: THREE.Vector3, weight = 1): void {
    const { a, b, c, e, dir, pd } = this;
    this.upper.getWorldPosition(a);
    this.lower.getWorldPosition(b);
    this.hand.getWorldPosition(c);
    const lab = a.distanceTo(b);
    const lbc = b.distanceTo(c);
    dir.copy(target).sub(a);
    const d = Math.min(Math.max(dir.length(), 0.01), (lab + lbc) * 0.999);
    dir.normalize();
    // Elbow: x along shoulder→target, h out towards the pole.
    const x = (lab * lab - lbc * lbc + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, lab * lab - x * x));
    pd.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (pd.lengthSq() < 1e-8) pd.set(0, -1, 0);
    pd.normalize();
    e.copy(a).addScaledVector(dir, x).addScaledVector(pd, h);
    // Weighted target positions so the IK can fade in and out.
    e.lerpVectors(b, e, weight);
    this.aim(this.upper, a, b, e);
    this.lower.getWorldPosition(b);
    this.hand.getWorldPosition(c);
    const reach = this.v1.copy(a).addScaledVector(dir, d);
    reach.lerpVectors(c, reach, weight);
    this.aim(this.lower, b, c, reach);
  }

  /**
   * Turn `bone` (at world `origin`) so the point now at `from` moves to `to`. Worked out in the parent
   * bone's space, so scaled or oddly oriented rigs (FBX → glTF) don't matter.
   */
  private aim(bone: THREE.Object3D, origin: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3): void {
    const parent = bone.parent!;
    parent.updateWorldMatrix(true, false);
    // Own scratch vectors: the callers pass this.e / this.v1 in as `to`.
    const o = parent.worldToLocal(this.ao.copy(origin));
    const f = parent.worldToLocal(this.af.copy(from)).sub(o).normalize();
    const t = parent.worldToLocal(this.at.copy(to)).sub(o).normalize();
    this.q.setFromUnitVectors(f, t);
    bone.quaternion.premultiply(this.q);
    bone.updateMatrixWorld(true);
  }
}
