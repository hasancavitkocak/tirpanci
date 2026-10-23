/**
 * Village soundscape, synthesised like the rest (no audio files): the call to prayer from the village
 * mosque, dogs, footsteps (grass, tall grass, soil, water), rain, bees, hens, a snake, a cut hose
 * spraying and passing cars.
 */

export interface Kit {
  ctx: AudioContext;
  /** Effects bus (the engine is not on it). */
  out: AudioNode;
  noise: (rate?: number) => AudioBufferSourceNode;
}

// ------------------------------------------------------------------ helpers

function env(g: GainNode, t: number, vol: number, attack: number, hold: number, release: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function burst(k: Kit, t: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number, attack: number, decay: number, dest: AudioNode = k.out): void {
  const n = k.noise(0.8 + Math.random() * 0.4);
  const f = k.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
  f.Q.value = q;
  const g = k.ctx.createGain();
  env(g, t, vol, attack, 0, decay);
  n.connect(f).connect(g).connect(dest);
  n.start(t);
  n.stop(t + attack + decay + 0.05);
}

function blip(k: Kit, t: number, type: OscillatorType, f0: number, f1: number, vol: number, attack: number, decay: number, dest: AudioNode = k.out): void {
  const o = k.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
  const g = k.ctx.createGain();
  env(g, t, vol, attack, 0, decay);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

/** Far away: muffled, with a slap-back echo off the valley side. */
function distance(k: Kit, cutoff: number, echo: number, feedback: number): GainNode {
  const ctx = k.ctx;
  const input = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = echo;
  const fb = ctx.createGain();
  fb.gain.value = feedback;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  input.connect(lp);
  lp.connect(k.out);
  lp.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(k.out);
  return input;
}

// ------------------------------------------------------------------ ezan

/**
 * The call to prayer from the village mosque's loudspeaker across the valley: a voice-like tone
 * (vowel formants) singing long melismatic phrases in Hicaz, with the echo off the hills. Returns
 * its length in seconds.
 */
export function ezan(k: Kit, volume: number): number {
  const ctx = k.ctx;
  const out = ctx.createGain();
  out.gain.value = volume * 0.09;
  // Loudspeaker: narrow band, then far away with a long echo.
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1100;
  bp.Q.value = 0.5;
  out.connect(bp).connect(distance(k, 2400, 0.42, 0.45));
  // Hicaz on D: D Eb F# G A Bb C D.
  const D = 294;
  const st = (n: number) => D * Math.pow(2, n / 12);
  // Phrases: [semitone, seconds] contours, with slides between the notes.
  const phrases: [number, number][][] = [
    [[0, 1.4], [5, 0.5], [7, 1.6], [8, 0.3], [7, 0.3], [5, 0.4], [4, 0.4], [5, 1.8]],
    [[0, 1.2], [5, 0.6], [7, 0.8], [10, 1.2], [8, 0.4], [7, 0.4], [5, 0.5], [7, 2]],
    [[7, 1], [8, 0.4], [10, 1.4], [12, 1.2], [10, 0.4], [8, 0.4], [7, 0.6], [5, 0.5], [4, 0.6], [5, 2.2]],
    [[5, 0.8], [7, 0.6], [5, 0.5], [4, 0.5], [1, 0.8], [0, 2.6]],
  ];
  let t = ctx.currentTime + 0.2;
  for (const p of phrases) {
    const dur = p.reduce((a, [, d]) => a + d, 0);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    let tt = t;
    o.frequency.setValueAtTime(st(p[0][0]), tt);
    for (const [n, d] of p) {
      o.frequency.linearRampToValueAtTime(st(n), tt + Math.min(0.18, d * 0.4));
      tt += d;
      o.frequency.setValueAtTime(st(n), tt - 0.02);
    }
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vd = ctx.createGain();
    vd.gain.value = 3;
    vib.connect(vd).connect(o.frequency);
    // Vowel "a": formants at ~750 and ~1200 Hz.
    const g = ctx.createGain();
    env(g, t, 1, 0.25, dur - 0.6, 0.35);
    const sum = ctx.createGain();
    for (const [f, q, v] of [[750, 6, 1], [1200, 7, 0.6], [2600, 8, 0.25]]) {
      const ff = ctx.createBiquadFilter();
      ff.type = 'bandpass';
      ff.frequency.value = f;
      ff.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = v * 3;
      o.connect(ff).connect(fg).connect(sum);
    }
    sum.connect(g).connect(out);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.1);
    vib.stop(t + dur + 0.1);
    t += dur + 1.8;
  }
  const length = t - ctx.currentTime;
  setTimeout(() => out.disconnect(), (length + 4) * 1000);
  return length;
}

// ------------------------------------------------------------------ one-shots

/** A shared "far away" bus for the village sounds (made once). */
export function farBus(k: Kit): GainNode {
  return distance(k, 2200, 0.25, 0.25);
}

/** A village dog somewhere: a few barks, panned and sent to the far bus. */
export function dog(k: Kit, volume: number, far: AudioNode): void {
  const ctx = k.ctx;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  const g = ctx.createGain();
  g.gain.value = volume * (0.25 + Math.random() * 0.25);
  g.connect(pan).connect(far);
  setTimeout(() => g.disconnect(), 3000);
  const kk = { ...k, out: g };
  const n = 2 + Math.floor(Math.random() * 3);
  const base = 380 + Math.random() * 180;
  let t = ctx.currentTime + 0.05;
  for (let i = 0; i < n; i++) {
    blip(kk, t, 'sawtooth', base * 1.3, base * 0.75, 0.25, 0.01, 0.11);
    burst(kk, t, 'bandpass', 1100, 700, 2, 0.4, 0.005, 0.1);
    t += 0.22 + Math.random() * 0.25;
  }
}

export type Surface = 'grass' | 'tall' | 'soil' | 'water' | 'road';

/** One footstep. */
export function step(k: Kit, surface: Surface, volume: number): void {
  const t = k.ctx.currentTime;
  const v = volume * (0.7 + Math.random() * 0.3);
  switch (surface) {
    case 'water':
      // Splash: a wet slap, a sweep of spray and a couple of bubbles.
      burst(k, t, 'lowpass', 900, 300, 0.7, 0.35 * v, 0.004, 0.12);
      burst(k, t + 0.02, 'bandpass', 2600, 900, 0.9, 0.3 * v, 0.01, 0.28);
      for (let i = 0; i < 3; i++) blip(k, t + 0.05 + Math.random() * 0.15, 'sine', 500 + Math.random() * 600, 1400 + Math.random() * 600, 0.05 * v, 0.003, 0.04);
      break;
    case 'tall':
      burst(k, t, 'bandpass', 1900, 1200, 0.7, 0.16 * v, 0.02, 0.18);
      blip(k, t, 'sine', 110, 60, 0.12 * v, 0.003, 0.06);
      break;
    case 'grass':
      burst(k, t, 'bandpass', 2600, 1500, 0.9, 0.09 * v, 0.006, 0.08);
      blip(k, t, 'sine', 120, 60, 0.12 * v, 0.003, 0.05);
      break;
    case 'road':
      burst(k, t, 'highpass', 2500, 2000, 0.7, 0.12 * v, 0.002, 0.05);
      blip(k, t, 'sine', 140, 70, 0.14 * v, 0.002, 0.04);
      break;
    default:
      burst(k, t, 'lowpass', 700, 300, 0.7, 0.16 * v, 0.003, 0.07);
      blip(k, t, 'sine', 100, 55, 0.12 * v, 0.003, 0.06);
  }
}

/** Water thrown up when walking into the stream. */
export function splash(k: Kit, volume: number): void {
  const t = k.ctx.currentTime;
  burst(k, t, 'bandpass', 1800, 500, 0.6, 0.5 * volume, 0.005, 0.45);
  burst(k, t, 'lowpass', 500, 150, 0.7, 0.35 * volume, 0.003, 0.2);
}

export function cluck(k: Kit, panic: boolean, volume: number): void {
  const t = k.ctx.currentTime;
  const n = panic ? 5 : 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const at = t + i * (panic ? 0.09 : 0.16);
    const f = (panic ? 900 : 620) + Math.random() * 200;
    blip(k, at, 'square', f, f * (panic ? 1.5 : 0.8), (panic ? 0.08 : 0.05) * volume, 0.005, panic ? 0.08 : 0.05);
    burst(k, at, 'bandpass', f * 2, f * 1.5, 3, 0.05 * volume, 0.003, 0.05);
  }
}

export function snakeHiss(k: Kit, volume: number): void {
  const t = k.ctx.currentTime;
  burst(k, t, 'highpass', 4500, 6000, 0.6, 0.25 * volume, 0.05, 0.9);
}

/** A sting: a sharp buzz right at the ear and a slap. */
export function sting(k: Kit, volume: number): void {
  const t = k.ctx.currentTime;
  blip(k, t, 'sawtooth', 320, 520, 0.18 * volume, 0.005, 0.18);
  burst(k, t + 0.12, 'lowpass', 1200, 400, 0.7, 0.4 * volume, 0.002, 0.08);
}

export function hoseCut(k: Kit, volume: number): void {
  const t = k.ctx.currentTime;
  blip(k, t, 'square', 900, 300, 0.12 * volume, 0.001, 0.06);
  burst(k, t, 'highpass', 3000, 2500, 0.6, 0.3 * volume, 0.01, 0.6);
}

export function thunder(k: Kit, volume: number): void {
  const t = k.ctx.currentTime;
  burst(k, t, 'lowpass', 300, 60, 0.5, 0.6 * volume, 0.3, 3.5);
  burst(k, t + 0.4, 'lowpass', 200, 50, 0.5, 0.4 * volume, 0.4, 2.5);
}

// ------------------------------------------------------------------ loops

/** A looping noise bed whose level is set every frame (rain, bees, spraying hose, traffic). */
export class Bed {
  private readonly gain: GainNode;

  constructor(
    private readonly k: Kit,
    build: (src: AudioBufferSourceNode, out: GainNode) => void,
    rate = 1,
  ) {
    this.gain = k.ctx.createGain();
    this.gain.gain.value = 0;
    const src = k.noise(rate);
    build(src, this.gain);
    this.gain.connect(k.out);
    src.start();
  }

  set(level: number): void {
    this.gain.gain.setTargetAtTime(level, this.k.ctx.currentTime, 0.15);
  }
}

export function rainBed(k: Kit): Bed {
  return new Bed(k, (src, out) => {
    const hp = k.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = k.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    src.connect(hp).connect(lp).connect(out);
  });
}

export function beeBed(k: Kit): Bed {
  return new Bed(k, (src, out) => {
    // Many wings: a buzz (two detuned saws) amplitude-wobbled by noise.
    const ctx = k.ctx;
    const mix = ctx.createGain();
    for (const f of [218, 226, 233]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(mix);
      o.start();
    }
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.8;
    const am = ctx.createGain();
    am.gain.value = 0.15;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 12;
    const depth = ctx.createGain();
    depth.gain.value = 0.6;
    src.connect(lp).connect(depth).connect(am.gain);
    mix.connect(bp).connect(am).connect(out);
  }, 0.02);
}

export function sprayBed(k: Kit): Bed {
  return new Bed(k, (src, out) => {
    const bp = k.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.7;
    src.connect(bp).connect(out);
  });
}

export function trafficBed(k: Kit): Bed {
  return new Bed(k, (src, out) => {
    const lp = k.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    src.connect(lp).connect(out);
  }, 0.6);
}

// ------------------------------------------------------------------ the pat pat

/**
 * The pat pat's single-cylinder diesel (tırtır): one fat thump per firing (about 7 a second at idle,
 * 19 flat out), an exhaust bark and the diesel knock on each, all keyed by one narrow pulse wave.
 */
export class Tractor {
  private nodes: { osc: OscillatorNode; out: GainNode; body: BiquadFilterNode; stop: () => void } | null = null;
  private rpm = 0;

  constructor(private readonly k: Kit) {}

  get running(): boolean {
    return !!this.nodes;
  }

  start(): void {
    if (this.nodes) return;
    const ctx = this.k.ctx;
    const t = ctx.currentTime;
    // Starter motor: a whine while the engine turns over against compression (a chug per stroke,
    // speeding up), then it catches with a couple of hard first beats.
    const catchAt = 1.05;
    burst(this.k, t, 'bandpass', 280, 520, 4, 0.2, 0.06, catchAt);
    blip(this.k, t, 'sawtooth', 70, 110, 0.05, 0.1, catchAt - 0.1);
    let at = t + 0.1;
    for (let i = 0; i < 6; i++) {
      blip(this.k, at, 'sine', 95, 50, 0.35, 0.004, 0.09);
      burst(this.k, at, 'lowpass', 500, 180, 0.8, 0.22, 0.003, 0.1);
      at += 0.19 - i * 0.015;
    }
    for (let i = 0; i < 2; i++) {
      blip(this.k, t + catchAt + i * 0.13, 'sine', 120, 45, 0.6, 0.003, 0.16);
      burst(this.k, t + catchAt + i * 0.13, 'bandpass', 700, 300, 1, 0.45, 0.002, 0.12);
    }
    const N = 32;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    for (let n = 1; n < N; n++) imag[n] = (Math.sin(Math.PI * n * 0.12) / n) * Math.exp(-n / 14);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    osc.frequency.value = 7;
    // Thump: the pulse itself, low-passed.
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 160;
    body.Q.value = 2;
    const thump = ctx.createGain();
    thump.gain.value = 2.2;
    // Bark and knock: noise opened by the pulse.
    const bark = this.k.noise(0.8);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 520;
    bf.Q.value = 1.4;
    const barkGate = ctx.createGain();
    barkGate.gain.value = 0;
    osc.connect(barkGate.gain);
    const knock = this.k.noise(1.2);
    const kf = ctx.createBiquadFilter();
    kf.type = 'highpass';
    kf.frequency.value = 2600;
    const knockGate = ctx.createGain();
    knockGate.gain.value = 0;
    osc.connect(knockGate.gain);
    const knockLevel = ctx.createGain();
    knockLevel.gain.value = 0.25;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t + catchAt);
    out.gain.linearRampToValueAtTime(0.3, t + catchAt + 0.5);
    osc.connect(body).connect(thump).connect(out);
    bark.connect(bf).connect(barkGate).connect(out);
    knock.connect(kf).connect(knockGate).connect(knockLevel).connect(out);
    out.connect(this.k.out);
    const srcs = [osc, bark, knock];
    for (const src of srcs) src.start(t + catchAt + 0.25);
    this.nodes = { osc, out, body, stop: () => srcs.forEach((s) => s.stop()) };
    this.rpm = 0;
  }

  /** Engine speed 0 (idle) .. 1 (flat out). */
  set(rpm: number): void {
    const n = this.nodes;
    if (!n) return;
    const t = this.k.ctx.currentTime;
    this.rpm += (rpm - this.rpm) * 0.08;
    n.osc.frequency.setTargetAtTime(7 + this.rpm * 12, t, 0.08);
    n.body.frequency.setTargetAtTime(150 + this.rpm * 120, t, 0.1);
    n.out.gain.setTargetAtTime(0.26 + this.rpm * 0.22, t, 0.1);
  }

  stop(): void {
    const n = this.nodes;
    if (!n) return;
    this.nodes = null;
    const t = this.k.ctx.currentTime;
    // Diesel run-down: the beats slow and fade.
    n.osc.frequency.cancelScheduledValues(t);
    n.osc.frequency.setValueAtTime(n.osc.frequency.value, t);
    n.osc.frequency.linearRampToValueAtTime(3, t + 1.2);
    n.out.gain.cancelScheduledValues(t);
    n.out.gain.setValueAtTime(n.out.gain.value, t);
    n.out.gain.linearRampToValueAtTime(0, t + 1.3);
    setTimeout(() => n.stop(), 1500);
  }
}
