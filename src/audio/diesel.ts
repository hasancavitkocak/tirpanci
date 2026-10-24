import type { Kit } from './village';

/**
 * The tractor's engine, drawn (no recording, so nothing loops): an old three-cylinder diesel. Four-stroke,
 * three cylinders: 1.5 firings a revolution, about 19 a second at idle (760 rpm) and 46 flat out
 * (1850 rpm). Each firing is a thump through the exhaust (the pulse wave low-passed), a bark (the
 * exhaust pipe rung by it) and the diesel's knock (a metallic tick rung by a sharper pulse): all tonal,
 * no noise (that hissed). The three
 * cylinders never fire quite alike: a slow sway at a third of the firing rate; nor does the speed hold
 * still: a little wander, like a governor hunting. Moving, the gearbox whines faintly.
 */
const IDLE = 19;
const FULL = 46;

/**
 * A pulse train (duty: the share of the cycle the pulse is up; `soft`: how fast its harmonics roll off;
 * N harmonics: enough to reach the knock's ring at 19 Hz).
 */
function pulse(ctx: AudioContext, duty: number, soft: number, N = 48): PeriodicWave {
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let n = 1; n < N; n++) imag[n] = (Math.sin(Math.PI * n * duty) / n) * Math.exp(-n / soft);
  return ctx.createPeriodicWave(real, imag);
}

/** Soft clipping: the old exhaust's grit when it is pushed. */
function grit(ctx: AudioContext): WaveShaperNode {
  const w = ctx.createWaveShaper();
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 1.8) / Math.tanh(1.8);
  }
  w.curve = c;
  return w;
}

type Nodes = {
  fire: OscillatorNode;
  knock: OscillatorNode;
  sway: OscillatorNode;
  whine: OscillatorNode;
  thumpLp: BiquadFilterNode;
  barkLevel: GainNode;
  knockLevel: GainNode;
  jitter: GainNode;
  whineLevel: GainNode;
  out: GainNode;
  sources: AudioScheduledSourceNode[];
};

export class DieselEngine {
  private nodes: Nodes | null = null;
  private rpm = 0;
  /** The governor's wander (a fraction of the speed), drifting. */
  private wander = 0;
  /** Running at speed from this time (before it: starting, the speed is the starter's). */
  private caughtAt = 0;

  constructor(private readonly k: Kit) {}

  /** Nothing to load. */
  get ready(): boolean {
    return true;
  }

  get running(): boolean {
    return !!this.nodes;
  }

  start(): void {
    if (this.nodes) return;
    const ctx = this.k.ctx;
    const t = ctx.currentTime;
    const catchAt = t + 1.25;
    this.starter(t, catchAt);

    const fire = ctx.createOscillator();
    fire.setPeriodicWave(pulse(ctx, 0.2, 16));
    const knock = ctx.createOscillator();
    knock.setPeriodicWave(pulse(ctx, 0.012, 400, 400));
    const sway = ctx.createOscillator();
    sway.type = 'sine';
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    // Caught: a flare of revs, then down to idle (loud as it flares, settling quiet).
    for (const [o, k] of [[fire, 1], [knock, 1], [sway, 1 / 3]] as const) {
      o.frequency.setValueAtTime(14 * k, catchAt);
      o.frequency.linearRampToValueAtTime(30 * k, catchAt + 0.35);
      o.frequency.setTargetAtTime(IDLE * k, catchAt + 0.5, 0.35);
    }
    whine.frequency.value = 300;

    // The level every layer goes through, swayed by the uneven cylinders.
    const level = ctx.createGain();
    level.gain.value = 1;
    const swayDepth = ctx.createGain();
    swayDepth.gain.value = 0.22;
    sway.connect(swayDepth).connect(level.gain);
    // And no two firings alike: a slow random unevenness in their strength.
    const rough = this.k.noise(0.01);
    const roughLp = ctx.createBiquadFilter();
    roughLp.type = 'lowpass';
    roughLp.frequency.value = 7;
    const roughDepth = ctx.createGain();
    roughDepth.gain.value = 2.2;
    rough.connect(roughLp).connect(roughDepth).connect(level.gain);

    // Thump: the pulse itself, low-passed.
    const thumpLp = ctx.createBiquadFilter();
    thumpLp.type = 'lowpass';
    thumpLp.frequency.value = 110;
    thumpLp.Q.value = 1.1;
    const thump = ctx.createGain();
    thump.gain.value = 2.4;
    fire.connect(thumpLp).connect(thump).connect(level);

    // Bark: each firing rings the exhaust pipe (its two resonances): tonal, no hiss.
    const barkLevel = ctx.createGain();
    barkLevel.gain.value = 0.55;
    for (const [f, q, g] of [[190, 3, 1], [330, 4, 0.45]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const bg = ctx.createGain();
      bg.gain.value = g;
      fire.connect(bp).connect(bg).connect(barkLevel);
    }
    barkLevel.connect(level);

    // Knock: the diesel's clatter, a short metallic tick rung by a sharp pulse on each firing.
    const kf = ctx.createBiquadFilter();
    kf.type = 'bandpass';
    kf.frequency.value = 1500;
    kf.Q.value = 5;
    const knockLevel = ctx.createGain();
    knockLevel.gain.value = 1.6;
    knock.connect(kf).connect(knockLevel).connect(level);
    // (And the valve gear's higher tick.)
    const kf2 = ctx.createBiquadFilter();
    kf2.type = 'bandpass';
    kf2.frequency.value = 2700;
    kf2.Q.value = 8;
    const tick = ctx.createGain();
    tick.gain.value = 0.7;
    knock.connect(kf2).connect(tick).connect(knockLevel);

    // No two firings quite on time: the firing rate jittered by a few percent, firing to firing (a
    // perfectly even engine buzzes like a synthesiser).
    const jit = this.k.noise(0.05);
    const jitLp = ctx.createBiquadFilter();
    jitLp.type = 'lowpass';
    jitLp.frequency.value = 30;
    const jitter = ctx.createGain();
    jitter.gain.value = IDLE * 0.4;
    jit.connect(jitLp).connect(jitter);
    jitter.connect(fire.frequency);
    jitter.connect(knock.frequency);

    // The gearbox's whine, only when moving.
    const whineLevel = ctx.createGain();
    whineLevel.gain.value = 0;
    whine.connect(whineLevel).connect(level);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, catchAt);
    out.gain.linearRampToValueAtTime(0.3, catchAt + 0.12);
    level.connect(grit(ctx)).connect(out).connect(this.k.out);

    const sources: AudioScheduledSourceNode[] = [fire, knock, sway, whine, rough, jit];
    for (const s of sources) s.start(catchAt);
    this.nodes = { fire, knock, sway, whine, thumpLp, barkLevel, knockLevel, jitter, whineLevel, out, sources };
    this.rpm = 0;
    this.caughtAt = catchAt + 1.2;
  }

  /** The starter motor turning it over: its whine, and a chug on each compression, speeding up. */
  private starter(t: number, until: number): void {
    const ctx = this.k.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.3;
    out.connect(this.k.out);
    const whine = ctx.createOscillator();
    whine.type = 'sawtooth';
    whine.frequency.setValueAtTime(70, t);
    whine.frequency.linearRampToValueAtTime(115, until);
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 600;
    wf.Q.value = 1.5;
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0, t);
    wg.gain.linearRampToValueAtTime(0.18, t + 0.08);
    wg.gain.setValueAtTime(0.18, until - 0.05);
    wg.gain.linearRampToValueAtTime(0, until + 0.1);
    whine.connect(wf).connect(wg).connect(out);
    whine.start(t);
    whine.stop(until + 0.2);
    // Compressions: about 5 a second, quickening.
    let at = t + 0.12;
    for (let i = 0; at < until - 0.05; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(85, at);
      o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.7, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + 0.16);
      at += Math.max(0.12, 0.21 - i * 0.012);
    }
  }

  /** Engine speed 0 (idle) .. 1 (flat out); `moving`: road speed 0..1 (the gearbox's whine). */
  set(rpm: number, moving = rpm): void {
    const n = this.nodes;
    if (!n) return;
    const t = this.k.ctx.currentTime;
    // The revs follow the throttle with the engine's weight; the governor wanders a little.
    this.rpm += (rpm - this.rpm) * 0.05;
    this.wander += (Math.random() - 0.5) * 0.004 - this.wander * 0.02;
    if (t < this.caughtAt) return;
    const r = this.rpm;
    const f = (IDLE + (FULL - IDLE) * r) * (1 + this.wander);
    n.fire.frequency.setTargetAtTime(f, t, 0.06);
    n.knock.frequency.setTargetAtTime(f, t, 0.06);
    n.sway.frequency.setTargetAtTime(f / 3, t, 0.06);
    n.jitter.gain.setTargetAtTime(f * 0.4, t, 0.1);
    // Opened up it barks, its exhaust brighter; the knock stays (it is a diesel).
    n.thumpLp.frequency.setTargetAtTime(100 + r * 160, t, 0.1);
    n.barkLevel.gain.setTargetAtTime(0.5 + r * 0.6, t, 0.1);
    n.knockLevel.gain.setTargetAtTime(1.6 + r * 0.6, t, 0.1);
    n.whine.frequency.setTargetAtTime(260 + moving * 520, t, 0.15);
    n.whineLevel.gain.setTargetAtTime(Math.min(1, moving * 3) * 0.01, t, 0.2);
    // Idling it is quiet (a third of flat out, as recorded); opened up it roars.
    n.out.gain.setTargetAtTime(0.17 + r * 0.38, t, 0.12);
  }

  /** No gear clunk on the tractor. */
  gear(): void {}

  stop(): void {
    const n = this.nodes;
    if (!n) return;
    this.nodes = null;
    const t = this.k.ctx.currentTime;
    // Fuel off: the firings slow and die, a last shudder.
    for (const o of [n.fire, n.knock, n.sway]) {
      const k = o === n.sway ? 1 / 3 : 1;
      o.frequency.cancelScheduledValues(t);
      o.frequency.setValueAtTime(o.frequency.value, t);
      o.frequency.linearRampToValueAtTime(6 * k, t + 1.1);
    }
    n.out.gain.cancelScheduledValues(t);
    n.out.gain.setValueAtTime(n.out.gain.value, t);
    n.out.gain.linearRampToValueAtTime(n.out.gain.value * 1.2, t + 0.8);
    n.out.gain.linearRampToValueAtTime(0, t + 1.2);
    for (const s of n.sources) s.stop(t + 1.3);
  }
}
