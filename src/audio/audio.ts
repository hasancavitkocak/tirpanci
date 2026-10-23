/**
 * All sound is synthesised with Web Audio (no audio files).
 *
 * Engine model (two-stroke brush cutter): a narrow pulse wave at the firing frequency (one exhaust
 * pulse per revolution, ~46 Hz idle to ~158 Hz full throttle) plus combustion crackle (noise
 * amplitude-modulated by the same pulse), through an exhaust resonance that follows the rpm.
 * Idle lopes irregularly; load from cutting drags the rpm down; the spinning line adds an air whine.
 */
import { PatpatEngine } from './patpatEngine';
import { Bed, Kit, Surface, Tractor, beeBed, cluck, dog, ezan, farBus, hoseCut, rainBed, snakeHiss, splash, sprayBed, step, sting, thunder, trafficBed } from './village';

/** Loudness of the grass-cutting sounds (snaps and swish) relative to the engine. */
const CUT_VOLUME = 1.6;

/** What the place sounds like round a job. */
export interface Ambience {
  rain: boolean;
  /** The call to prayer: 'soon' (the mosque is right there), 'maybe' (far, now and then) or never. */
  ezan: 'soon' | 'maybe' | 'never';
  traffic: boolean;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private pulseWave: PeriodicWave | null = null;
  private engine: EngineNodes | null = null;
  private volume = 0.8;
  private birdsT = 3;
  /** Extra rpm (0..1) right after starting: the engine flares then settles to idle. */
  private flare = 0;
  private rpm = 0;
  /** Engine, line and cutting sounds go through here (ear muffs filter them). */
  private engineBus: GainNode | null = null;
  private engineLp: BiquadFilterNode | null = null;
  private earmuffs = false;
  private far: GainNode | null = null;
  private beds: { rain: Bed; bees: Bed; spray: Bed; traffic: Bed } | null = null;
  private amb: Ambience | null = null;
  private dogT = 20;
  private ezanT = Infinity;
  private ezanUntil = 0;
  private thunderT = 25;
  private stepDist = 0;
  private wasWading = false;

  /** Must be called from a user gesture (browsers block audio before one). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.engineBus = ctx.createGain();
    this.engineLp = ctx.createBiquadFilter();
    this.engineLp.type = 'lowpass';
    this.engineLp.frequency.value = 20000;
    this.engineBus.connect(this.engineLp).connect(this.master);
    this.applyEarmuffs();
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Exhaust pulse: narrow (18 % duty) pulse with softened high harmonics.
    const N = 48;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    for (let n = 1; n < N; n++) imag[n] = (Math.sin(Math.PI * n * 0.18) / n) * Math.exp(-n / 22);
    this.pulseWave = ctx.createPeriodicWave(real, imag);
    this.far = farBus(this.kit!);
    // Start fetching the pat pat recordings now, so they are in before the first ride.
    this.patpatEngine = new PatpatEngine(ctx, this.master);
  }

  private get kit(): Kit | null {
    if (!this.ctx || !this.master) return null;
    return { ctx: this.ctx, out: this.master, noise: (r) => this.noiseSource(r) };
  }

  /** Ear muffs: the engine and the line sound muffled and quieter, the countryside stays clear. */
  setEarmuffs(on: boolean): void {
    this.earmuffs = on;
    this.applyEarmuffs();
  }

  private applyEarmuffs(): void {
    if (!this.engineBus || !this.engineLp) return;
    this.engineBus.gain.value = this.earmuffs ? 0.45 : 1;
    this.engineLp.frequency.value = this.earmuffs ? 1400 : 20000;
  }

  /** A job starts: set up its sounds (rain, the mosque, traffic). */
  startAmbience(a: Ambience): void {
    const k = this.kit;
    this.amb = a;
    this.dogT = 8 + Math.random() * 20;
    this.ezanT = a.ezan === 'soon' ? 20 + Math.random() * 20 : a.ezan === 'maybe' && Math.random() < 0.4 ? 60 + Math.random() * 90 : Infinity;
    this.ezanUntil = 0;
    this.thunderT = 20 + Math.random() * 30;
    if (k && !this.beds) this.beds = { rain: rainBed(k), bees: beeBed(k), spray: sprayBed(k), traffic: trafficBed(k) };
    this.beds?.rain.set(a.rain ? 0.05 : 0);
    this.beds?.bees.set(0);
    this.beds?.spray.set(0);
    this.beds?.traffic.set(0);
  }

  stopAmbience(): void {
    this.amb = null;
    if (this.beds) for (const b of Object.values(this.beds)) b.set(0);
  }

  /** Per frame while playing: dogs, the ezan, thunder. */
  private ambience(dt: number): void {
    const a = this.amb;
    const k = this.kit;
    if (!a || !k) return;
    const now = this.ctx!.currentTime;
    const quiet = now < this.ezanUntil;
    this.dogT -= dt;
    if (this.dogT <= 0) {
      this.dogT = 25 + Math.random() * 40;
      if (!quiet) dog(k, this.volume, this.far!);
    }
    this.ezanT -= dt;
    if (this.ezanT <= 0) {
      this.ezanT = Infinity;
      // The dogs keep quiet for the call to prayer.
      this.ezanUntil = now + ezan(k, 1);
    }
    if (a.rain) {
      this.thunderT -= dt;
      if (this.thunderT <= 0) {
        this.thunderT = 30 + Math.random() * 50;
        thunder(k, 0.8);
      }
    }
  }

  /**
   * Footsteps from the distance walked; a splash on stepping into the stream. `surface` is what
   * the worker walks on.
   */
  walk(dist: number, surface: Surface, wading: boolean): void {
    const k = this.kit;
    if (!k) return;
    if (wading && !this.wasWading) splash(k, 1);
    this.wasWading = wading;
    this.stepDist += dist;
    if (this.stepDist >= 0.72) {
      this.stepDist = 0;
      step(k, wading ? 'water' : surface, 1);
    }
  }

  /** Levels 0..1 of the looping beds. */
  setBees(level: number): void {
    this.beds?.bees.set(level * 0.5);
  }

  setSpray(level: number): void {
    this.beds?.spray.set(level * 0.12);
  }

  setTraffic(level: number): void {
    this.beds?.traffic.set(level * 0.5);
  }

  private tractor: Tractor | null = null;
  private patpatEngine: PatpatEngine | null = null;

  /** The pat pat's engine: on while driving; `rpm` 0 (idle) .. 1. The recording once it has loaded. */
  patpat(on: boolean, rpm = 0): void {
    const k = this.kit;
    if (!k) return;
    this.patpatEngine ??= new PatpatEngine(k.ctx, k.out);
    this.tractor ??= new Tractor(k);
    const real = this.patpatEngine;
    const e = real.ready || real.running ? real : this.tractor;
    if (e === real && this.tractor.running) this.tractor.stop();
    if (on && !e.running) e.start();
    if (!on && e.running) e.stop();
    if (on) e.set(rpm);
  }

  /** The pat pat's gear lever thrown (only with the recorded engine). */
  patpatGear(): void {
    if (this.patpatEngine?.running) this.patpatEngine.gear();
  }

  /** Falling over on the slope: a body thump into the grass. */
  fall(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t + 0.05, 'sine', 120, 45, 0.5, 0.004, 0.25);
    this.hiss(t, 'bandpass', 1800, 0.7, 0.25, 0.02, 0.35, 700);
  }

  /** Old mobile phone ringing (the customer's call). */
  ring(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 8; i++) {
        const t = ctx.currentTime + r * 0.9 + i * 0.05;
        this.tone(t, 'square', i % 2 ? 1320 : 1760, i % 2 ? 1320 : 1760, 0.035, 0.002, 0.04);
      }
    }
  }

  hen(panic: boolean): void {
    const k = this.kit;
    if (k) cluck(k, panic, 1);
  }

  snake(): void {
    const k = this.kit;
    if (k) snakeHiss(k, 1);
  }

  sting(): void {
    const k = this.kit;
    if (k) sting(k, 1);
  }

  hoseCut(): void {
    const k = this.kit;
    if (k) hoseCut(k, 1);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  get engineRunning(): boolean {
    return !!this.engine;
  }

  private noiseSource(rate = 1): AudioBufferSourceNode {
    const n = this.ctx!.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    n.playbackRate.value = rate;
    n.loopStart = Math.random();
    return n;
  }

  startEngine(): void {
    const ctx = this.ctx;
    if (!ctx || this.engine) return;
    this.engine = buildEngine(ctx, this.engineBus!, this.pulseWave!, (r) => this.noiseSource(r));
    this.flare = 0.5;
    this.rpm = 0.35;
    const t = ctx.currentTime;
    this.engine.out.gain.setValueAtTime(0, t);
    this.engine.out.gain.linearRampToValueAtTime(0.5, t + 0.08);
  }

  /** Engine dies: rpm falls away. `sputter` = dies with a couple of misfires (overheat). */
  stopEngine(sputter = false): void {
    const ctx = this.ctx;
    const e = this.engine;
    if (!ctx || !e) return;
    this.engine = null;
    const t = ctx.currentTime;
    const dur = sputter ? 1.4 : 0.9;
    e.osc.frequency.cancelScheduledValues(t);
    e.osc.frequency.setValueAtTime(e.osc.frequency.value, t);
    e.osc.frequency.exponentialRampToValueAtTime(9, t + dur);
    e.muffler.frequency.setTargetAtTime(160, t, 0.25);
    e.lowpass.frequency.setTargetAtTime(500, t, 0.2);
    e.out.gain.setValueAtTime(e.out.gain.value, t);
    e.out.gain.linearRampToValueAtTime(e.out.gain.value * 0.8, t + dur * 0.5);
    e.out.gain.linearRampToValueAtTime(0, t + dur);
    e.whine.gain.setTargetAtTime(0, t, 0.15);
    e.swish.gain.setTargetAtTime(0, t, 0.05);
    if (sputter) {
      this.pop(t + 0.25, 0.25);
      this.pop(t + 0.6, 0.18);
    }
    this.click(t + dur, 0.05);
    setTimeout(() => e.stop(), (dur + 0.3) * 1000);
  }

  private water: { gain: GainNode } | null = null;

  /** Babbling stream: noise through a wandering band-pass, louder the closer the worker is (0..1). */
  setWater(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.water) {
      const n = this.noiseSource(0.9);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 1.2;
      // Gurgle: the band wanders quickly and randomly.
      const wob = this.noiseSource(0.004);
      const wl = ctx.createBiquadFilter();
      wl.type = 'lowpass';
      wl.frequency.value = 6;
      const wd = ctx.createGain();
      wd.gain.value = 1400;
      wob.connect(wl).connect(wd).connect(bp.frequency);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 300;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      n.connect(bp).connect(hp).connect(gain).connect(this.master!);
      n.start();
      wob.start();
      this.water = { gain };
    }
    this.water.gain.gain.setTargetAtTime(level * 0.12, ctx.currentTime, 0.3);
  }

  private grainAcc = 0;
  private misfireT = 0;

  /**
   * Per frame: engine rpm 0..1, load ratio (cut rate / what the engine can take), temperature 0..1+,
   * grass cells cut per second and the engine strain 0..1 (bogging down).
   */
  update(dt: number, throttle: number, loadRatio: number, outdoors: boolean, temp = 0.3, cutRate = 0, strain = 0, tall = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const e = this.engine;
    if (e) {
      this.flare = Math.max(0, this.flare - dt * 0.7);
      const load = Math.min(1, Math.max(0, loadRatio - 0.3) / 0.9);
      // Rpm with inertia (it already sags under load in the simulation); a hot engine runs a bit rough.
      const want = Math.min(1, throttle + this.flare);
      this.rpm += (want - this.rpm) * Math.min(1, dt * (want > this.rpm ? 5 : 3));
      const r = this.rpm;
      // Lugging: past its capacity the engine drops in pitch, sounds choked and starts to misfire.
      const bog = Math.min(1, Math.max(0, (loadRatio - 0.85) / 0.6) * 0.7 + strain * 0.6);
      const f = (46 + r * 112) * (1 - 0.2 * bog);
      e.osc.frequency.setTargetAtTime(f, t, 0.03);
      e.am.gain.setTargetAtTime(0.5 + r * 0.4, t, 0.05);
      // Labouring engine: uneven firing when overloaded or overheating.
      e.jitter.gain.setTargetAtTime(4.5 * (1 - r) + 0.8 + Math.max(0, temp - 0.85) * 25 + Math.max(0, loadRatio - 1) * 14, t, 0.1);
      e.lope.gain.setTargetAtTime(0.3 * (1 - r) * (1 - r) + 0.45 * bog, t, 0.1);
      e.lfo.frequency.setTargetAtTime(6.3 - 3 * bog, t, 0.2);
      e.muffler.frequency.setTargetAtTime(f * 2.6, t, 0.04);
      e.lowpass.frequency.setTargetAtTime((700 + r * 4200) * (1 - 0.5 * bog), t, 0.04);
      e.clatter.gain.setTargetAtTime(0.025 + r * 0.05, t, 0.05);
      e.out.gain.setTargetAtTime(0.32 + r * 0.38, t, 0.05);
      // Line whine: air rushing past the spinning line, rises with rpm.
      e.whineFilter.frequency.setTargetAtTime(900 + r * 2600, t, 0.05);
      e.whine.gain.setTargetAtTime(r * r * 0.11, t, 0.05);
      const cutting = Math.min(1, cutRate / 120);
      e.swish.gain.setTargetAtTime(CUT_VOLUME * (0.2 * cutting * r + 0.06 * load * r), t, 0.04);
      e.strands.frequency.setTargetAtTime(90 + r * 150, t, 0.05);
      this.cutGrains(dt, cutRate * r, tall);
      // Misfires while lugging: the output drops out for a moment with a wet pop.
      this.misfireT -= dt;
      if (bog > 0.25 && this.misfireT <= 0) {
        this.misfireT = 0.12 + Math.random() * (0.6 - bog * 0.45);
        const v = e.out.gain.value;
        e.out.gain.cancelScheduledValues(t);
        e.out.gain.setValueAtTime(v, t);
        e.out.gain.linearRampToValueAtTime(v * 0.25, t + 0.025);
        e.out.gain.linearRampToValueAtTime(v, t + 0.11);
        this.pop(t + 0.03, 0.12 + bog * 0.12, true);
      }
    }
    this.ambience(dt);
    if (outdoors) {
      this.birdsT -= dt;
      if (this.birdsT <= 0) {
        this.birdsT = 3 + Math.random() * 6;
        this.bird();
      }
    }
  }

  /**
   * The satisfying part: each clump the line goes through gives a short "fip" (a bright noise snap
   * sweeping down) over a soft low "tup". Density follows the grass cut per second, with random
   * spacing so it never sounds like a machine gun. `tall` makes them fuller and lower.
   */
  private cutGrains(dt: number, cellsPerSec: number, tall = 0): void {
    const ctx = this.ctx!;
    this.grainAcc += dt * Math.min(32, cellsPerSec * 0.2);
    const t = ctx.currentTime;
    while (this.grainAcc >= 1) {
      this.grainAcc -= 1;
      const at = t + Math.random() * dt;
      const f = (3200 + Math.random() * 2400) * (1 - tall * 0.25);
      const v = CUT_VOLUME * (0.18 + Math.random() * 0.14 + tall * 0.06);
      this.hiss(at, 'bandpass', f, 3.2, v, 0.0015, 0.028 + Math.random() * 0.02 + tall * 0.015, f * 0.35);
      this.tone(at, 'sine', 240 + Math.random() * 60, 110, v * 0.35, 0.002, 0.035);
    }
  }

  /** Glove wiping the face shield: a soft squeak and rub. */
  wipe(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.hiss(t, 'bandpass', 1400, 1.5, 0.12, 0.08, 0.45, 2600);
    this.tone(t + 0.1, 'sine', 900, 1300, 0.03, 0.05, 0.25);
  }

  /** Thorny canes being chewed: woody crackle. */
  bramble(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const at = t + i * (0.02 + Math.random() * 0.03);
      this.hiss(at, 'bandpass', 900 + Math.random() * 900, 4, 0.16, 0.001, 0.03, 500);
      this.tone(at, 'triangle', 420 + Math.random() * 200, 200, 0.06, 0.001, 0.03);
    }
  }

  /** The head jams on wrapped canes: a choked thud. */
  jam(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 'sine', 160, 60, 0.35, 0.003, 0.2);
    this.hiss(t, 'lowpass', 700, 0.8, 0.25, 0.002, 0.18);
  }

  // ------------------------------------------------------------- one-shots

  private env(g: GainNode, t: number, vol: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(t: number, type: OscillatorType | 'pulse', f0: number, f1: number, vol: number, attack: number, decay: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    if (type === 'pulse') o.setPeriodicWave(this.pulseWave!);
    else o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + attack + decay);
    const g = ctx.createGain();
    this.env(g, t, vol, attack, decay);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  private hiss(t: number, type: BiquadFilterType, freq: number, q: number, vol: number, attack: number, decay: number, freqEnd?: number): void {
    const ctx = this.ctx!;
    const n = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, vol, attack, decay);
    n.connect(f).connect(g).connect(this.master!);
    n.start(t);
    n.stop(t + attack + decay + 0.05);
  }

  /** One combustion pop: pulse burst + exhaust bark + low thump. */
  private pop(t: number, vol: number, wet = false): void {
    if (!this.ctx) return;
    const f = 48 + Math.random() * 18;
    this.tone(t, 'pulse', f * 1.4, f * 0.8, vol * 0.9, 0.004, 0.09);
    this.hiss(t, 'bandpass', wet ? 380 : 900, wet ? 0.7 : 1.1, vol * (wet ? 0.8 : 1.2), 0.002, wet ? 0.16 : 0.09);
    this.tone(t, 'sine', 95, 38, vol * 0.8, 0.003, 0.14);
  }

  private click(t: number, vol: number): void {
    this.hiss(t, 'highpass', 3500, 0.7, vol, 0.001, 0.025);
  }

  /** Pull cord: the rope whirs out and the engine turns over against compression. */
  crank(strength: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = Math.max(0.2, strength);
    const dur = 0.28 + s * 0.22;
    this.hiss(t, 'bandpass', 700, 2.5, 0.12 + s * 0.12, 0.03, dur, 2200 * s + 600);
    // Compression strokes, faster the harder the pull.
    const strokes = 2 + Math.round(s * 4);
    let tt = t + 0.04;
    for (let i = 0; i < strokes; i++) {
      this.tone(tt, 'sine', 85, 45, 0.16 + s * 0.12, 0.004, 0.06);
      this.hiss(tt, 'lowpass', 380, 0.7, 0.12, 0.003, 0.05);
      tt += 0.11 - s * 0.05 + i * 0.012;
    }
    // Recoil spring winding the rope back.
    this.hiss(t + dur, 'bandpass', 1800, 3, 0.05, 0.02, 0.18, 900);
  }

  /** The engine fires a few times and dies (on choke). `wet` = flooded, soggy pops. */
  cough(times = 3, wet = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    let t = ctx.currentTime + 0.12;
    for (let i = 0; i < times; i++) {
      const v = (wet ? 0.18 : 0.32) * (i === times - 1 ? 0.6 : 1) * (0.8 + Math.random() * 0.4);
      this.pop(t, v, wet);
      // Two-stroke misfires come in uneven pairs.
      if (!wet && Math.random() < 0.5) this.pop(t + 0.045 + Math.random() * 0.02, v * 0.6);
      t += 0.12 + Math.random() * 0.12;
    }
    if (wet) this.hiss(t, 'lowpass', 600, 0.6, 0.1, 0.05, 0.35);
  }

  /** Choke lever: a firm two-stage mechanical click. */
  choke(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.click(t, 0.18);
    this.tone(t, 'triangle', 1400, 900, 0.06, 0.001, 0.03);
    this.click(t + 0.045, 0.12);
  }

  /** Primer bulb: squish and a fuel bubble. */
  prime(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.hiss(t, 'lowpass', 900, 0.8, 0.12, 0.01, 0.08);
    this.tone(t + 0.04, 'sine', 380 + Math.random() * 80, 240, 0.07, 0.005, 0.07);
  }

  /** Line snaps off on a stone. */
  snap(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.hiss(t, 'highpass', 5000, 0.8, 0.3, 0.001, 0.06);
    this.tone(t, 'square', 2200, 700, 0.1, 0.001, 0.08);
  }

  stone(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 'square', 2600, 1700, 0.1, 0.001, 0.05);
    this.hiss(t, 'bandpass', 3800, 1.5, 0.28, 0.001, 0.07);
  }

  /** The line flicking a stone it is about to hit: a light "tık". */
  tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 'square', 3400, 2900, 0.035, 0.001, 0.02);
    this.tone(t + 0.07, 'square', 3200, 2700, 0.03, 0.001, 0.02);
  }

  trunk(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 'triangle', 240, 130, 0.3, 0.002, 0.12);
    this.hiss(t, 'bandpass', 1100, 1, 0.22, 0.002, 0.14);
  }

  bump(ok: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 'sine', ok ? 160 : 120, 70, 0.3, 0.002, 0.08);
    this.hiss(t, 'lowpass', 700, 0.7, 0.2, 0.002, 0.07);
    if (ok) this.hiss(t + 0.03, 'highpass', 4000, 0.7, 0.08, 0.002, 0.1);
  }

  refill(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.hiss(ctx.currentTime, 'bandpass', 500, 0.8, 0.12, 0.05, 0.6);
  }

  ui(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.tone(ctx.currentTime, 'triangle', 900, 700, 0.12, 0.002, 0.04);
  }

  success(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(ctx.currentTime + i * 0.12, 'triangle', f, f, 0.16, 0.01, 0.25));
  }

  coin(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.tone(ctx.currentTime, 'square', 1320, 1760, 0.07, 0.005, 0.12);
  }

  private bird(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const base = 2600 + Math.random() * 1500;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.tone(ctx.currentTime + i * 0.11, 'sine', base, base * 1.3, 0.02, 0.01, 0.06);
  }
}

interface EngineNodes {
  osc: OscillatorNode;
  am: GainNode;
  jitter: GainNode;
  lope: GainNode;
  muffler: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  clatter: GainNode;
  out: GainNode;
  whine: GainNode;
  whineFilter: BiquadFilterNode;
  swish: GainNode;
  /** Strand-pass frequency of the cut sound. */
  strands: OscillatorNode;
  /** Idle lope LFO (slows down when the engine lugs). */
  lfo: OscillatorNode;
  stop: () => void;
}

function buildEngine(ctx: AudioContext, master: AudioNode, wave: PeriodicWave, noise: (rate?: number) => AudioBufferSourceNode): EngineNodes {
  const sources: AudioScheduledSourceNode[] = [];
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(wave);
  osc.frequency.value = 50;
  sources.push(osc);

  // Firing-frequency jitter: slow random wobble added to the oscillator frequency.
  const jn = noise(0.02);
  const jl = ctx.createBiquadFilter();
  jl.type = 'lowpass';
  jl.frequency.value = 9;
  const jitter = ctx.createGain();
  jitter.gain.value = 4;
  jn.connect(jl).connect(jitter).connect(osc.frequency);
  sources.push(jn);

  // Combustion crackle: noise whose amplitude follows each exhaust pulse.
  const cn = noise();
  const cf = ctx.createBiquadFilter();
  cf.type = 'bandpass';
  cf.frequency.value = 1300;
  cf.Q.value = 0.7;
  const crackle = ctx.createGain();
  crackle.gain.value = 0;
  const am = ctx.createGain();
  am.gain.value = 0.6;
  osc.connect(am).connect(crackle.gain);
  cn.connect(cf).connect(crackle);
  sources.push(cn);

  // Exhaust: resonant band that follows the rpm, in parallel with a lowpassed body.
  const sum = ctx.createGain();
  const toneGain = ctx.createGain();
  toneGain.gain.value = 0.8;
  osc.connect(toneGain).connect(sum);
  crackle.connect(sum);
  const muffler = ctx.createBiquadFilter();
  muffler.type = 'bandpass';
  muffler.frequency.value = 140;
  muffler.Q.value = 1.3;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 900;
  lowpass.Q.value = 0.9;
  const mix = ctx.createGain();
  const mufflerGain = ctx.createGain();
  mufflerGain.gain.value = 1.4;
  sum.connect(muffler).connect(mufflerGain).connect(mix);
  sum.connect(lowpass).connect(mix);
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(512);
  for (let i = 0; i < 512; i++) {
    const x = (i / 511) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
  }
  shaper.curve = curve;
  shaper.oversample = '2x';

  // Idle lope: irregular slow amplitude wobble, strong at idle only.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 6.3;
  const lope = ctx.createGain();
  lope.gain.value = 0.25;
  const out = ctx.createGain();
  out.gain.value = 0;
  const trem = ctx.createGain();
  trem.gain.value = 1;
  lfo.connect(lope).connect(trem.gain);
  mix.connect(shaper).connect(trem).connect(out).connect(master);
  sources.push(lfo);

  // Mechanical clatter (piston, clutch drum): bright noise ticking with the pulse.
  const mn = noise();
  const mf = ctx.createBiquadFilter();
  mf.type = 'highpass';
  mf.frequency.value = 4200;
  const clatterAm = ctx.createGain();
  clatterAm.gain.value = 0;
  osc.connect(clatterAm.gain);
  const clatter = ctx.createGain();
  clatter.gain.value = 0.03;
  mn.connect(mf).connect(clatterAm).connect(clatter).connect(out);
  sources.push(mn);

  // Line whine and grass swish (not shaped by the exhaust).
  const wn = noise();
  const whineFilter = ctx.createBiquadFilter();
  whineFilter.type = 'bandpass';
  whineFilter.frequency.value = 1500;
  whineFilter.Q.value = 2.2;
  const whine = ctx.createGain();
  whine.gain.value = 0;
  wn.connect(whineFilter).connect(whine).connect(master);
  sources.push(wn);
  // Cutting: noise in the mid band, roughened by a fast random flutter and chopped at the rate the
  // line strands pass (two per turn), so it rasps instead of hissing. The crisp snaps of single stems
  // are added on top as grains (GameAudio.cutGrains).
  const sn = noise(1.3);
  const sf = ctx.createBiquadFilter();
  sf.type = 'bandpass';
  sf.frequency.value = 1500;
  sf.Q.value = 0.8;
  const flutter = ctx.createGain();
  flutter.gain.value = 0.6;
  const fn = noise(0.06);
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.value = 28;
  const fd = ctx.createGain();
  fd.gain.value = 3;
  fn.connect(fl).connect(fd).connect(flutter.gain);
  const chop = ctx.createGain();
  chop.gain.value = 0.5;
  const strands = ctx.createOscillator();
  strands.type = 'square';
  strands.frequency.value = 160;
  const chopDepth = ctx.createGain();
  chopDepth.gain.value = 0.45;
  strands.connect(chopDepth).connect(chop.gain);
  const swish = ctx.createGain();
  swish.gain.value = 0;
  sn.connect(sf).connect(flutter).connect(chop).connect(swish).connect(master);
  sources.push(sn, fn, strands);

  for (const s of sources) s.start();
  return {
    osc,
    am,
    jitter,
    lope,
    muffler,
    lowpass,
    clatter,
    out,
    whine,
    whineFilter,
    swish,
    strands,
    lfo,
    stop: () => sources.forEach((s) => s.stop()),
  };
}
