/**
 * The pat pat's engine from a real recording (public/audio, cut by scripts/cut-patpat-audio.mjs): the
 * start, then an idle loop and a revving loop crossfaded and pitched with the engine speed; the gear's
 * clunk and a blip of throttle as it goes in.
 */
/**
 * The recordings: the start, the idle and revving loops (and a loop between them), the gear's clunk and
 * the stopping. `hz`: each loop's firing rate as recorded (idle, [mid,] rev): given, the engine's speed
 * is a firing rate and each loop is played at its own rate's pitch, the two nearest crossfaded (none is
 * stretched far); without, the idle and rev loops crossfade and both speed up. `blend`: how long the
 * start's end and the idle overlap (seconds; the start fades out over it in its file).
 */
export type EngineFiles = { start: string; idle: string; rev: string; mid?: string; hz?: number[]; gear?: string; stop?: string; blend?: number };
const FILES: EngineFiles = { start: 'patpat_start.wav', idle: 'patpat_idle.wav', rev: 'patpat_rev.wav', gear: 'patpat_gear.wav' };
/**
 * The tractor's (a diesel tractor, cut by assets-src/audio/cut-traktor2.py): its start, idle, middle and
 * high revs; no gear clunk (the pat pat's would give it away).
 */
export const TRACTOR_FILES: EngineFiles = { start: 'traktor_start.wav', idle: 'traktor_idle.wav', mid: 'traktor_mid.wav', rev: 'traktor_rev.wav', hz: [21.2, 29.8, 41.2], blend: 1.2 };

export class PatpatEngine {
  private buffers: { start: AudioBuffer; loops: AudioBuffer[]; gear: AudioBuffer | null; stop: AudioBuffer | null } | null = null;
  /** A blip of throttle as the gear goes in (ara gaz) lasts until this time. */
  private blipUntil = 0;
  /** The loops playing (idle first, rev last) and their gains. */
  private nodes: { loops: AudioBufferSourceNode[]; gains: GainNode[]; out: GainNode } | null = null;
  /** A bigger engine of the same kind: the recording played this much slower (lower, heavier), this much louder. */
  pitch = 1;
  loud = 1;
  private rpm = 0;
  /** The idle's rise under the start runs until this time (its gain is not to be touched before). */
  private blendUntil = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly dest: AudioNode,
    private readonly files: EngineFiles = FILES,
  ) {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const get = async (f: string) => this.ctx.decodeAudioData(await (await fetch(`./audio/${f}`)).arrayBuffer());
      const F = this.files;
      const names = F.mid ? [F.idle, F.mid, F.rev] : [F.idle, F.rev];
      const [start, gear, stop, ...loops] = await Promise.all([get(F.start), F.gear ? get(F.gear) : null, F.stop ? get(F.stop) : null, ...names.map(get)]);
      this.buffers = { start: start!, loops: loops as AudioBuffer[], gear, stop };
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
    const blend = this.files.blend ?? 0.25;
    const loopAt = t + b.start.duration - blend;
    const gains = b.loops.map(() => ctx.createGain());
    const loops = b.loops.map((buf, i) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(gains[i]).connect(out);
      s.start(loopAt);
      return s;
    });
    // The idle comes in under the start's last beats (rising as the start fades: equal power); the
    // others wait for the revs.
    const rise = new Float32Array(32).map((_, i) => Math.sin(((i / 31) * Math.PI) / 2));
    gains[0].gain.setValueAtTime(0, t);
    gains[0].gain.setValueCurveAtTime(rise, loopAt, blend);
    this.blendUntil = loopAt + blend;
    for (const g of gains.slice(1)) g.gain.value = 0;
    this.nodes = { loops, gains, out };
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
    // A running engine never holds quite the same speed: a slow drift of a percent or two, so the loops
    // do not repeat note for note.
    const drift = (1 + 0.012 * Math.sin(t * 0.9) + 0.008 * Math.sin(t * 2.3 + 1)) * this.pitch;
    this.nodes?.out.gain.setTargetAtTime(0.5 * this.loud, t, 0.2);
    // (Still starting: the loops' levels are the start's own; a change now would cut across the idle's
    // rise, which the browser refuses.)
    if (t < this.blendUntil + 0.01) return;
    const hz = this.files.hz;
    if (hz) {
      // The firing rate, idle to a little past the highest loop's; each loop pitched to it, the two
      // recorded nearest it heard (equal-power), the rest silent.
      const top = hz[hz.length - 1] * 1.08;
      const f = hz[0] + r * (top - hz[0]);
      let i = 0;
      while (i < hz.length - 2 && f > hz[i + 1]) i++;
      const x = Math.max(0, Math.min(1, (f - hz[i]) / (hz[i + 1] - hz[i])));
      n.loops.forEach((l, k) => {
        const w = k === i ? Math.cos((x * Math.PI) / 2) : k === i + 1 ? Math.sin((x * Math.PI) / 2) : 0;
        n.gains[k].gain.setTargetAtTime(w, t, 0.08);
        l.playbackRate.setTargetAtTime((f / hz[k]) * drift, t, 0.1);
      });
    } else {
      // Equal-power crossfade from the idle loop to the revving one; both speed up with the revs.
      const [idle, rev] = n.loops;
      n.gains[0].gain.setTargetAtTime(Math.cos((r * Math.PI) / 2), t, 0.08);
      n.gains[1].gain.setTargetAtTime(Math.sin((r * Math.PI) / 2), t, 0.08);
      idle.playbackRate.setTargetAtTime((1 + r * 0.4) * drift, t, 0.1);
      rev.playbackRate.setTargetAtTime((0.85 + r * 0.35) * drift, t, 0.1);
    }
    n.out.gain.setTargetAtTime(0.45 + r * 0.2, t, 0.1);
  }

  /** The gear lever thrown (into gear, or from forward to reverse): its clunk and a blip of throttle (ara gaz). */
  gear(): void {
    const b = this.buffers;
    if (!b?.gear || !this.nodes) return;
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
    const stop = this.buffers?.stop;
    if (stop) {
      // Its own recording of stopping, the loops let go under it.
      const s = this.ctx.createBufferSource();
      s.buffer = stop;
      const g = this.ctx.createGain();
      g.gain.value = n.out.gain.value;
      s.connect(g).connect(this.dest);
      s.start(t);
      for (const l of n.loops) l.stop(t + 0.35);
      n.out.gain.cancelScheduledValues(t);
      n.out.gain.setValueAtTime(n.out.gain.value, t);
      n.out.gain.linearRampToValueAtTime(0, t + 0.3);
      return;
    }
    // Run-down: the beats slow and fade.
    for (const s of n.loops) {
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
