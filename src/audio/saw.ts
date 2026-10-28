import type { Kit } from './village';

/**
 * The chainsaw: two recordings of a real one (public/audio/testere_rolanti.wav idling and
 * testere_kesim.wav at full revs, seamless loops cut from the same take), both running all the time and
 * crossfaded with the throttle (the revs climbing in a moment and dropping back a little slower), each
 * pitched up a little as the revs rise and the full one pulled down a touch in the wood; quiet when it
 * is put away.
 */
export class SawSound {
  private readonly idle: GainNode;
  private readonly full: GainNode;
  private readonly srcs: { idle?: AudioBufferSourceNode; full?: AudioBufferSourceNode } = {};
  private on = 0;
  private rev = 0;

  constructor(
    private readonly k: Kit,
    files: [string, string] = ['testere_rolanti.wav', 'testere_kesim.wav'],
  ) {
    const { ctx, out } = k;
    this.idle = ctx.createGain();
    this.full = ctx.createGain();
    this.idle.gain.value = this.full.gain.value = 0;
    this.idle.connect(out);
    this.full.connect(out);
    for (const [file, gain, key] of [
      [files[0], this.idle, 'idle'],
      [files[1], this.full, 'full'],
    ] as const)
      void fetch(`./audio/${file}`)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => {
          const s = ctx.createBufferSource();
          s.buffer = buf;
          s.loop = true;
          s.connect(gain);
          s.start();
          this.srcs[key] = s;
        })
        .catch(() => undefined);
  }

  /** Quiet at once (the job left). */
  silence(): void {
    this.on = this.rev = 0;
    const t = this.k.ctx.currentTime;
    this.idle.gain.setTargetAtTime(0, t, 0.05);
    this.full.gain.setTargetAtTime(0, t, 0.05);
  }

  /** `inHand`: the saw held (running), `throttle` 0..1, `cutting`: in the wood; called every frame with dt. */
  set(inHand: boolean, throttle: number, cutting: boolean, dt: number): void {
    const t = this.k.ctx.currentTime;
    this.on += ((inHand ? 1 : 0) - this.on) * Math.min(1, dt * 3);
    const want = inHand ? throttle : 0;
    this.rev += (want - this.rev) * Math.min(1, dt * (want > this.rev ? 6 : 2.5));
    this.srcs.idle?.playbackRate.setTargetAtTime(1 + this.rev * 0.25, t, 0.05);
    this.srcs.full?.playbackRate.setTargetAtTime(0.82 + this.rev * 0.18 - (cutting ? 0.05 : 0), t, 0.05);
    // Equal power between the two, the whole as loud as the saw is "on".
    this.idle.gain.setTargetAtTime(this.on * Math.cos((this.rev * Math.PI) / 2) * 0.55, t, 0.04);
    this.full.gain.setTargetAtTime(this.on * Math.sin((this.rev * Math.PI) / 2) * 0.5, t, 0.04);
  }
}
