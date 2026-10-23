/**
 * The pat pat's engine from a real recording (public/audio, cut by scripts/cut-patpat-audio.mjs): the
 * start, then an idle loop and a revving loop crossfaded and pitched with the engine speed; the gear's
 * clunk and a blip of throttle as it goes in.
 */
const FILES = { start: 'patpat_start.wav', idle: 'patpat_idle.wav', rev: 'patpat_rev.wav', gear: 'patpat_gear.wav' };

export class PatpatEngine {
  private buffers: { start: AudioBuffer; idle: AudioBuffer; rev: AudioBuffer; gear: AudioBuffer } | null = null;
  /** A blip of throttle as the gear goes in (ara gaz) lasts until this time. */
  private blipUntil = 0;
  private nodes: { idle: AudioBufferSourceNode; rev: AudioBufferSourceNode; gIdle: GainNode; gRev: GainNode; out: GainNode } | null = null;
  private rpm = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly dest: AudioNode,
  ) {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const get = async (f: string) => this.ctx.decodeAudioData(await (await fetch(`./audio/${f}`)).arrayBuffer());
      const [start, idle, rev, gear] = await Promise.all([get(FILES.start), get(FILES.idle), get(FILES.rev), get(FILES.gear)]);
      this.buffers = { start, idle, rev, gear };
    } catch (e) {
      console.warn('pat pat sounds could not be loaded', e);
    }
  }

  /** The recordings are in (until then the synthesised engine stands in). */
  get ready(): boolean {
    return !!this.buffers;
  }

  get running(): boolean {
    return !!this.nodes;
  }

  start(): void {
    const b = this.buffers;
    if (!b || this.nodes) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(this.dest);
    // The starter and the first beats, then the loops take over as it settles.
    const st = ctx.createBufferSource();
    st.buffer = b.start;
    st.connect(out);
    st.start(t);
    const loopAt = t + b.start.duration - 0.25;
    const loop = (buf: AudioBuffer, g: GainNode) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(g).connect(out);
      s.start(loopAt);
      return s;
    };
    const gIdle = ctx.createGain();
    const gRev = ctx.createGain();
    gIdle.gain.setValueAtTime(0, t);
    gIdle.gain.linearRampToValueAtTime(1, loopAt + 0.25);
    gRev.gain.value = 0;
    this.nodes = { idle: loop(b.idle, gIdle), rev: loop(b.rev, gRev), gIdle, gRev, out };
    this.rpm = 0;
  }

  /** Engine speed 0 (idle) .. 1 (flat out). */
  set(rpm: number): void {
    const n = this.nodes;
    if (!n) return;
    const t = this.ctx.currentTime;
    if (t < this.blipUntil) rpm = Math.max(rpm, 0.65);
    this.rpm += (rpm - this.rpm) * 0.08;
    const r = this.rpm;
    // Equal-power crossfade from the idle loop to the revving one; both speed up with the revs.
    n.gIdle.gain.setTargetAtTime(Math.cos((r * Math.PI) / 2), t, 0.08);
    n.gRev.gain.setTargetAtTime(Math.sin((r * Math.PI) / 2), t, 0.08);
    n.idle.playbackRate.setTargetAtTime(1 + r * 0.4, t, 0.1);
    n.rev.playbackRate.setTargetAtTime(0.85 + r * 0.35, t, 0.1);
    n.out.gain.setTargetAtTime(0.45 + r * 0.2, t, 0.1);
  }

  /** The gear lever thrown (into gear, or from forward to reverse): its clunk and a blip of throttle (ara gaz). */
  gear(): void {
    const b = this.buffers;
    if (!b || !this.nodes) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = b.gear;
    const g = this.ctx.createGain();
    g.gain.value = 0.4;
    s.connect(g).connect(this.dest);
    s.start(t);
    this.blipUntil = t + 0.35;
  }

  stop(): void {
    const n = this.nodes;
    if (!n) return;
    this.nodes = null;
    const t = this.ctx.currentTime;
    // Run-down: the beats slow and fade.
    for (const s of [n.idle, n.rev]) {
      s.playbackRate.cancelScheduledValues(t);
      s.playbackRate.setValueAtTime(s.playbackRate.value, t);
      s.playbackRate.linearRampToValueAtTime(0.55, t + 1.2);
      s.stop(t + 1.4);
    }
    n.out.gain.cancelScheduledValues(t);
    n.out.gain.setValueAtTime(n.out.gain.value, t);
    n.out.gain.linearRampToValueAtTime(0, t + 1.3);
  }
}
