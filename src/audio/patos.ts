import type { Kit } from './village';

/**
 * The patos (hazelnut thresher): a recording of one running (public/audio/patos.wav, a seamless 10 s
 * loop), wound up from slow as its drum gets going off the tractor's shaft, and a little lower and louder
 * while its hose sucks nuts (the drum under load).
 */
export class PatosSound {
  private readonly gain: GainNode;
  private src: AudioBufferSourceNode | null = null;
  private on = 0;
  private sucking = 0;

  constructor(private readonly k: Kit) {
    const { ctx, out } = k;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
    void fetch('./audio/patos.wav')
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        const s = ctx.createBufferSource();
        s.buffer = buf;
        s.loop = true;
        s.connect(this.gain);
        s.start();
        this.src = s;
      })
      .catch(() => undefined);
  }

  /** Silent at once (the job left). */
  silence(): void {
    this.on = this.sucking = 0;
    this.gain.gain.setTargetAtTime(0, this.k.ctx.currentTime, 0.05);
  }

  /** `running` 0..1 (the drum), `sucking` 0..1 (the hose taking nuts); called every frame with dt. */
  set(running: number, sucking: number, dt: number): void {
    const t = this.k.ctx.currentTime;
    // The drum takes a couple of seconds to wind up, and runs down a little quicker.
    this.on += (running - this.on) * Math.min(1, dt * (running > this.on ? 0.8 : 1.5));
    this.sucking += (sucking - this.sucking) * Math.min(1, dt * 4);
    this.gain.gain.setTargetAtTime(this.on * (0.4 + this.sucking * 0.08), t, 0.05);
    this.src?.playbackRate.setTargetAtTime(0.55 + this.on * 0.45 - this.sucking * 0.04, t, 0.08);
  }
}
