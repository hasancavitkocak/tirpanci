// The simplifier three ships with (no types of its own): only what shootBush.ts uses.
declare module 'three/examples/jsm/libs/meshopt_simplifier.module.js' {
  export const MeshoptSimplifier: {
    ready: Promise<void>;
    simplifySloppy(indices: Uint32Array, positions: Float32Array, stride: number, locks: null, targetIndexCount: number, targetError: number): [Uint32Array, number];
  };
}
