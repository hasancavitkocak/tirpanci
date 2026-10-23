import { BRAMBLE, BUSH_KINDS, BushKind, DEFAULT_EQUIPMENT, ENGINE, Equipment, FINISH_AT, HEN, HIVE, HOSE, LevelDef, PATPAT, PLAYER, PRICES, SLOPE, SNAKE, STARS_AT, STONE_SNAP, TRIMMER, Upgrades, WET_LOAD, gearStats } from './config';
import { Field } from './field';
import { PullResult, Starter } from './starter';

export interface SessionInput {
  /** Desired movement in world space (x, z), length 0..1. */
  moveX: number;
  moveZ: number;
  throttle: boolean;
  /** True on the step the bump-feed button was pressed. */
  bump: boolean;
  /** First-person: the facing is set by the player, not by the walking direction. */
  yaw?: number;
  /** Where the player wants the head: -1 = full left, 0 = straight ahead, 1 = full right. */
  sweep?: number;
  /** True on the step the stop switch was pressed. */
  stop?: boolean;
  /** Held: fitting new line into the head (engine must be off). */
  rethread?: boolean;
  /** How far the worker lifts the head off the ground, 0..1 (first person: follows the look). */
  lift?: number;
  /** Driving the pat pat: throttle -1 (back) .. 1 (forward), steering -1 (left) .. 1 (right). */
  drive?: { throttle: number; steer: number };
}

/** Where a job ended: its level, the worker and the pat pat (village coordinates). */
export interface CarryOver {
  level: number;
  /** The village it was in (a job in another village starts from that village's house). */
  region: number;
  worker: { x: number; z: number; yaw: number };
  vehicle: { x: number; z: number; yaw: number; art: number };
}

export type SessionEvent =
  | { type: 'cut'; x: number; z: number; n: number; weight: number }
  | { type: 'gate'; open: boolean }
  | { type: 'stone'; x: number; z: number }
  /** The spinning line just brushed past a stone (a warning tick). */
  | { type: 'stone-near'; x: number; z: number }
  | { type: 'trunk'; x: number; z: number; kind: BushKind }
  | { type: 'bump'; ok: boolean }
  | { type: 'fuel-empty' }
  | { type: 'fuel-low' }
  | { type: 'line-short' }
  | { type: 'line-broken' }
  | { type: 'rethread-done' }
  | { type: 'rethread-blocked'; reason: 'running' | 'spool' }
  | { type: 'refill'; fuel: boolean; line: boolean }
  | { type: 'tangle-warn' }
  | { type: 'tangled' }
  | { type: 'untangled' }
  | { type: 'bramble-cleared'; x: number; z: number }
  | { type: 'bramble-hit'; x: number; z: number }
  | { type: 'pull'; result: PullResult }
  | { type: 'stop' }
  | { type: 'engine-hot' }
  | { type: 'strain' }
  | { type: 'bogged' }
  | { type: 'overheat' }
  | { type: 'cooled' }
  | { type: 'finish-ready' }
  | { type: 'swarm'; x: number; z: number }
  | { type: 'bees-gone' }
  | { type: 'sting' }
  | { type: 'snake'; x: number; z: number; scared: boolean }
  | { type: 'hen-hit'; x: number; z: number }
  | { type: 'hen-panic'; x: number; z: number }
  | { type: 'hose-cut'; x: number; z: number }
  /** The customer's request can no longer be met. */
  | { type: 'request-broken' }
  | { type: 'intro'; step: 'line' | 'done' }
  | { type: 'slip' }
  | { type: 'fall' }
  | { type: 'board' }
  | { type: 'alight' }
  | { type: 'bump-vehicle' };

export interface Result {
  coverage: number;
  time: number;
  stars: number;
  base: number;
  timeBonus: number;
  /** Bonus for cleared bramble patches. */
  brambles: number;
  penalty: number;
  expenses: number;
  total: number;
  knocks: number;
  /** Stings, hens hit and the cut hose, TL. */
  accidents: number;
  /** The customer's tip (0 when the request was not met). */
  tip: number;
  requestMet: boolean;
}

export const STEP = 1 / 60;

/** One play of a field: fixed-step simulation of the worker, the trimmer and the grass. */
export class Session {
  readonly field: Field;
  readonly gear: ReturnType<typeof gearStats>;
  time = 0;
  state: 'running' | 'done' = 'running';

  // Player
  x: number;
  z: number;
  yaw = Math.PI;
  speed = 0;
  /** Smoothed actual velocity, for animation. */
  vx = 0;
  vz = 0;

  // Engine
  readonly starter = new Starter();
  /** Engine running (started with the pull cord). */
  running = false;
  throttle = 0;
  fuel: number;
  /** Engine temperature, see ENGINE. */
  temp = 0;
  /** Stalled from overheating; cannot be restarted until it cools to ENGINE.restart. */
  overheated = false;
  /** How many times it overheated this job. */
  overheats = 0;

  // Line and head
  /** Line out of the head, cm. */
  line: number;
  /** Spare line on the spool, metres. */
  spool: number;
  /** Line has gone back into the head and must be re-threaded. */
  broken = false;
  /** Re-thread / clearing progress 0..1 while the button is held. */
  rethread = 0;
  /** Bramble canes wrapped round the head, 0..1; at 1 the head is jammed (`tangled`). */
  tangle = 0;
  tangled = false;
  brambleBonus = 0;
  private tangleWarned = false;
  /** Fuel added and whether line was renewed during the current visit to the depot. */
  private refillFuel = 0;
  private refillLine = false;
  /** Head swing angle, radians; positive = to the worker's right. */
  sweep = 0;
  headX = 0;
  headZ = 0;
  cutting = false;
  /** Head lifted off the ground, 0..1 (eased). */
  lift = 0;
  /** Smoothed grass cells cut per second (engine load), weighted by how lush the grass was. */
  load = 0;
  /** Engine speed 0..1: the throttle, dragged down when the line cuts more than the engine can take. */
  rpm = 0;
  /** Builds up while overloaded; at 1 the engine bogs down and stalls. */
  strain = 0;
  private strainAnnounced = false;

  knocks = 0;
  /** Pay deducted for knocks (depends on what was hit). */
  knockPenalty = 0;
  stings = 0;
  henHits = 0;
  expenses = 0;
  /** Frozen with fright (a snake), seconds left. */
  scared = 0;
  /** In the stream. */
  wading = false;
  /** Sliding down a steep bank, m/s. */
  slide = 0;
  /** On the pat pat's seat, driving it. */
  driving = false;
  /** Down after a fall, seconds left. */
  fallen = 0;
  private slipAnnounced = false;
  /**
   * A job starts with the trimmer in the pat pat's trailer, without line: take it, fit line, then go
   * to work. null once that is done (or when the session starts ready, as in tests).
   */
  intro: 'take' | 'line' | null = null;
  /** The trimmer is in the worker's hands (not while it lies in the trailer). */
  hasTrimmer = true;
  private requestBroken = false;
  /** How heavy the grass is to cut here: wet in the rain, soft in the first gardens. */
  private readonly grassWeight: number;
  readonly events: SessionEvent[] = [];
  private finishAnnounced = false;
  private lowFuelAnnounced = false;
  private hotAnnounced = false;
  private refilling = false;
  private rethreadHeld = false;
  private acc = 0;
  private pendingBump = false;
  private pendingStop = false;

  /**
   * @param parScale multiplies the level's target time for the speed bonus
   *   (easy controls keep the head straight ahead and mow a narrower strip).
   */
  /**
   * `start`: 'home' / 'patpat' = by the house at the top of the lane, the pat pat parked there (beside
   * it at the mosque), with the trimmer in the trailer and no line. 'ready' = trimmer in hand.
   */
  /**
   * `after`: where the job before this one ended (village coordinates): the day goes on from there,
   * the worker standing where he was with the trimmer in his hands, the pat pat where he left it.
   */
  constructor(readonly level: LevelDef, upgrades: Upgrades, private readonly parScale = 1, equipment: Equipment = DEFAULT_EQUIPMENT, start: 'home' | 'patpat' | 'ready' = 'ready', after?: CarryOver) {
    this.field = new Field(level, false, after && after.level !== level.id ? after.level : null);
    this.gear = gearStats(upgrades, equipment);
    this.grassWeight = (level.weather === 'rain' ? WET_LOAD : 1) * (level.grassLoad ?? 1);
    this.fuel = this.gear.tank;
    this.line = this.gear.lineMax;
    this.spool = this.gear.spool;
    this.x = this.field.depot.x + 1.2;
    this.z = this.field.depot.z - 1.2;
    if (start !== 'ready') {
      // Empty-handed: the trimmer is in the pat pat's trailer, without line.
      this.intro = 'take';
      this.hasTrimmer = false;
      this.line = 0;
      this.broken = true;
      const v = this.field.vehicle;
      const top = this.field.laneStart;
      const O = this.field.origin;
      if (after && after.level !== level.id && after.region === this.field.region.id && this.field.vehicleFits(after.vehicle.x - O.x, after.vehicle.z - O.z, after.vehicle.yaw, after.vehicle.art)) {
        // Carrying on where the last job ended: the worker with his trimmer (line on), the pat pat
        // where he left it. He puts the trimmer in the trailer and drives on to this job.
        v.x = after.vehicle.x - O.x;
        v.z = after.vehicle.z - O.z;
        v.yaw = after.vehicle.yaw;
        v.art = after.vehicle.art;
        this.field.placeDepot();
        ({ x: this.x, z: this.z } = this.field.clampWalk(after.worker.x - O.x, after.worker.z - O.z));
        this.yaw = after.worker.yaw;
        this.intro = null;
        this.hasTrimmer = true;
        this.line = this.gear.lineMax;
        this.broken = false;
      } else if (top) {
        // Out of the house at the top of the slope, the pat pat parked at the head of the lane: get on
        // and drive it down to the field.
        ({ x: v.x, z: v.z, yaw: v.yaw } = top);
        this.field.placeDepot();
        ({ x: this.x, z: this.z } = this.field.clampWalk(this.field.doorstep.x, this.field.doorstep.z));
        this.yaw = Math.atan2(v.x - this.x, v.z - this.z);
      } else {
        // Beside the trailer, on the field side, facing up into the field.
        this.x = v.x - Math.sin(v.yaw) * 0.6;
        this.z = v.z - Math.cos(v.yaw) * 0.6 - (v.width / 2 + 0.9);
        this.yaw = Math.PI;
      }
    }
    this.updateHead();
  }

  /** Where this job ended, village coordinates (for the next job to carry on from). */
  carryOver(): CarryOver {
    const O = this.field.origin;
    const v = this.field.vehicle;
    return { level: this.level.id, region: this.field.region.id, worker: { x: this.x + O.x, z: this.z + O.z, yaw: this.yaw }, vehicle: { x: v.x + O.x, z: v.z + O.z, yaw: v.yaw, art: v.art } };
  }

  /** Close enough to the pat pat to reach into its trailer. */
  get nearVehicle(): boolean {
    const v = this.field.vehicle;
    return Math.hypot(this.x - v.x, this.z - v.z) < v.length / 2 + 1.4;
  }

  /** Can get on the pat pat now (next to it, trimmer engine off, on his feet). */
  get canBoard(): boolean {
    return !this.driving && this.intro !== 'line' && !this.running && this.fallen <= 0 && this.nearVehicle;
  }

  /** Can put the trimmer in the trailer / take it out. */
  get canDrop(): boolean {
    return this.hasTrimmer && !this.intro && !this.driving && !this.running && this.nearVehicle;
  }

  get canTake(): boolean {
    return !this.hasTrimmer && !this.driving && this.nearVehicle && !(this.intro === 'take' && !this.vehicleAtField);
  }

  /** The pat pat is down by the field (not still up at the house): the start of a job goes on there. */
  get vehicleAtField(): boolean {
    const v = this.field.vehicle;
    const dx = Math.max(0, Math.abs(v.x) - this.field.width / 2);
    const dz = Math.max(0, Math.abs(v.z) - this.field.depth / 2);
    // In the field or on the path at its open bottom side (not behind the side fence).
    return dx < 3.5 && dz < 8.5;
  }

  /** Put the trimmer in the trailer (walk about empty-handed). */
  dropTrimmer(): boolean {
    if (!this.canDrop) return false;
    this.hasTrimmer = false;
    this.rethread = 0;
    return true;
  }

  /** Get on the pat pat (the trimmer goes in the trailer). */
  board(): boolean {
    if (!this.canBoard) return false;
    this.hasTrimmer = false;
    this.driving = true;
    this.field.vehicle.speed = 0;
    this.seat();
    this.events.push({ type: 'board' });
    return true;
  }

  /** Get off on the left, beside the seat, taking the trimmer back out of the trailer. */
  alight(): boolean {
    const v = this.field.vehicle;
    if (!this.driving || Math.abs(v.speed) > 0.5) return false;
    this.driving = false;
    // At the start of a job it still has no line: take it out and fit line first (the intro).
    if (!this.intro) this.hasTrimmer = true;
    v.speed = 0;
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    const off = v.width / 2 + PLAYER.radius + 0.25;
    ({ x: this.x, z: this.z } = this.field.clampWalk(v.x + fx * 0.6 + fz * off, v.z + fz * 0.6 - fx * off));
    this.yaw = v.yaw;
    this.vx = this.vz = this.speed = 0;
    this.updateHead();
    this.events.push({ type: 'alight' });
    return true;
  }

  /** The worker on the seat follows the pat pat. */
  private seat(): void {
    const v = this.field.vehicle;
    this.x = v.x + Math.sin(v.yaw) * PATPAT.seat;
    this.z = v.z + Math.cos(v.yaw) * PATPAT.seat;
    this.yaw = v.yaw;
    this.updateHead();
  }

  /** Drive the pat pat: throttle and brake along its heading, steering turns it as it rolls. */
  private driveStep(dt: number, d: { throttle: number; steer: number }): void {
    const v = this.field.vehicle;
    // Through the stream it crawls.
    // Through the stream it crawls; a wheel in a big puddle's deep mud holds it back.
    const deep = this.field.patpatWheels().some((w) => (this.field.puddleAt(w.x, w.z)?.r ?? 0) > 0.8);
    const ford = this.field.inWater(v.x, v.z) ? 0.45 : deep ? 0.6 : 1;
    // Off the roads across the village's rough grass it crawls (keep to the roads); in and round the
    // field and on the harman it runs freely.
    const f = this.field;
    const nearField = Math.abs(v.x) < f.width / 2 + 5 && Math.abs(v.z) < f.depth / 2 + 6;
    const onHarman = Math.hypot(v.x - f.plateau.x, v.z - f.plateau.z) < f.plateau.r;
    const rough = !nearField && !onHarman && f.roadDistance(v.x, v.z) > 2.6 ? 0.4 : 1;
    const want = (d.throttle >= 0 ? d.throttle * PATPAT.forward : d.throttle * PATPAT.reverse) * ford * rough;
    const braking = Math.sign(want) !== Math.sign(v.speed) && Math.abs(v.speed) > 0.05;
    const rate = (braking ? PATPAT.brake : PATPAT.accel) * dt;
    v.speed += Math.max(-rate, Math.min(rate, want - v.speed));
    v.steer += (d.steer - v.steer) * Math.min(1, dt * 5);
    // The steering wheel turns the head about the hitch pin (at a finite rate, up to full lock).
    const turn = PATPAT.artRate * dt;
    const art = v.art + Math.max(-turn, Math.min(turn, -v.steer * PATPAT.maxArt - v.art));
    // The head's axle rolls along its heading; the trailer is dragged after the pin (its wheels don't
    // slip sideways), and the head keeps its angle to the trailer.
    const h = this.field.head(v.x, v.z, v.yaw, art);
    const jx = h.jx + Math.sin(h.yaw) * v.speed * dt;
    const jz = h.jz + Math.cos(h.yaw) * v.speed * dt;
    const rx = v.x - Math.sin(v.yaw) * PATPAT.rearAxle;
    const rz = v.z - Math.cos(v.yaw) * PATPAT.rearAxle;
    const yaw = Math.atan2(jx - rx, jz - rz);
    const nx = jx - Math.sin(yaw) * PATPAT.joint;
    const nz = jz - Math.cos(yaw) * PATPAT.joint;
    if (this.field.vehicleFits(nx, nz, yaw, art)) {
      v.x = nx;
      v.z = nz;
      v.yaw = yaw;
      v.art = art;
    } else {
      if (Math.abs(v.speed) > 1.2) this.events.push({ type: 'bump-vehicle' });
      v.speed = 0;
      // Standing, the head may still turn if there is room.
      if (this.field.vehicleFits(v.x, v.z, v.yaw, art)) v.art = art;
    }
    this.field.placeDepot();
    // The wheels flatten the grass they roll over.
    if (Math.abs(v.speed) > 0.05) {
      for (const w of this.field.patpatWheels()) {
        this.field.crush(w.x, w.z, 0.2, PATPAT.crushTo);
        // On the lane the wheels sink into the soft earth and leave ruts.
        this.field.press(w.x, w.z, Math.abs(v.speed) * dt);
      }
    }
    const px = this.x;
    const pz = this.z;
    this.seat();
    this.vx = (this.x - px) / dt;
    this.vz = (this.z - pz) / dt;
    this.speed = Math.abs(v.speed);
    this.wading = this.field.inWater(v.x, v.z);
  }

  /** The pat pat's distance from the yard gate a frame ago (is it coming towards it?). */
  private gateDist = Infinity;
  /** Held open for the pat pat (it came towards the gate and has not driven off from it yet). */
  private gateHeld = false;

  /** The yard's gate slides open when the worker or the pat pat comes up to it, and shuts after them. */
  private moveGate(dt: number): void {
    const f = this.field;
    const g = f.yardGate;
    if (!g) return;
    const mx = (g.ax + g.bx) / 2;
    const mz = (g.az + g.bz) / 2;
    const h = f.head(f.vehicle.x, f.vehicle.z, f.vehicle.yaw, f.vehicle.art);
    // On foot it opens as he comes up. Driving (from inside or out), it opens as the pat pat comes
    // towards it and shuts once it drives away; stopped, it stays as it was; with any of the pat pat
    // in or by the gateway it stays open.
    const walker = !this.driving && Math.hypot(this.x - mx, this.z - mz) < 4.5;
    const v = f.vehicle;
    const rx = v.x - Math.sin(v.yaw) * PATPAT.rearAxle;
    const rz = v.z - Math.cos(v.yaw) * PATPAT.rearAxle;
    const d = Math.min(Math.hypot(h.x - mx, h.z - mz), Math.hypot(v.x - mx, v.z - mz), Math.hypot(rx - mx, rz - mz));
    const moving = Math.abs(v.speed) > 0.2;
    const coming = moving && d < this.gateDist - 1e-4;
    const going = moving && d > this.gateDist + 1e-4;
    this.gateDist = d;
    if (!this.driving) this.gateHeld = false;
    else if (d < 3.5) this.gateHeld = true;
    else if (d < 9) {
      if (coming) this.gateHeld = true;
      else if (going) this.gateHeld = false;
    } else this.gateHeld = false;
    const want = walker || this.gateHeld || d < 2.5 ? 1 : 0;
    const was = f.gateOpen;
    f.gateOpen = Math.max(0, Math.min(1, f.gateOpen + Math.sign(want - f.gateOpen) * dt * (want ? 1.6 : 0.7)));
    if (was === 0 && f.gateOpen > 0) this.events.push({ type: 'gate', open: true });
    if (was === 1 && f.gateOpen < 1) this.events.push({ type: 'gate', open: false });
  }

  /** On foot in the yard by the house (the shop can be opened there). */
  get atHouse(): boolean {
    const h = this.field.house;
    return !this.driving && Math.hypot(this.x - h.x, this.z - h.z) < 6.5;
  }

  /** Take the trimmer out of the trailer (at the start of a job: then fit line). */
  takeTrimmer(): boolean {
    if (!this.canTake) return false;
    this.hasTrimmer = true;
    if (this.intro === 'take') {
      this.intro = 'line';
      this.events.push({ type: 'intro', step: 'line' });
    }
    return true;
  }

  get canFinish(): boolean {
    return this.field.coverage >= FINISH_AT;
  }

  get atDepot(): boolean {
    return Math.hypot(this.x - this.field.depot.x, this.z - this.field.depot.z) < 2.2;
  }

  get engineOn(): boolean {
    return this.running;
  }

  /** Engine not yet warmed up: limited power. */
  get cold(): boolean {
    return this.running && this.temp < ENGINE.warmedUp;
  }

  /** Cutting radius of the spinning line, metres. */
  get cutRadius(): number {
    return this.broken ? 0 : TRIMMER.radiusBase + this.line * TRIMMER.radiusPerCm;
  }

  /** Pull the starter cord with a strength 0..1. */
  pull(strength: number): PullResult {
    if (this.running || this.state !== 'running' || this.intro || this.driving || !this.hasTrimmer) return 'nothing';
    let r: PullResult;
    if (this.overheated) r = strength < 0.4 ? 'weak' : 'hot';
    else if (this.fuel <= 0) r = 'dry';
    else {
      this.starter.warm = this.temp >= ENGINE.warm;
      r = this.starter.pull(strength);
    }
    if (r === 'start') this.running = true;
    this.events.push({ type: 'pull', result: r });
    return r;
  }

  /** Cool the engine down at once (rewarded ad). */
  coolNow(): void {
    this.temp = Math.min(this.temp, ENGINE.idleTemp);
    if (this.overheated) {
      this.overheated = false;
      this.events.push({ type: 'cooled' });
    }
  }

  /** Fill the tank on the spot (rewarded ad); the engine still has to be started. */
  fillTank(): void {
    this.fuel = this.gear.tank;
    this.lowFuelAnnounced = false;
  }

  /** Whether the customer's request is (still) met. */
  get requestOk(): boolean {
    switch (this.level.client.request) {
      case 'no-knock':
        return this.knocks === 0;
      case 'chickens':
        return this.henHits === 0;
      case 'hose':
        return !this.field.hoseCut;
      case 'bees':
        return this.stings === 0;
      case 'fast':
        return this.time <= this.fastTime;
      case 'clean':
        return true;
      default:
        return false;
    }
  }

  /** "Çabuk bitir": the job must be finished within this time. */
  get fastTime(): number {
    return this.level.parTime * this.parScale * 0.75;
  }

  /** Advance by real elapsed time (runs whole fixed steps). */
  advance(dt: number, input: SessionInput): void {
    this.acc = Math.min(this.acc + dt, 0.25);
    // Button presses are kept until a step runs: on high refresh-rate screens a frame can be shorter
    // than one step, and a press in such a frame must not be lost.
    this.pendingBump ||= input.bump;
    this.pendingStop ||= !!input.stop;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step({ ...input, bump: this.pendingBump, stop: this.pendingStop });
      this.pendingBump = this.pendingStop = false;
    }
  }

  step(input: SessionInput): void {
    if (this.state !== 'running') return;
    const dt = STEP;
    this.time += dt;
    const f = this.field;
    this.moveGate(dt);

    if (input.stop && this.running) {
      this.running = false;
      this.events.push({ type: 'stop' });
    }

    // --- Throttle, fuel and temperature
    const maxThrottle = this.cold ? 0.6 : 1;
    const want = input.throttle && this.running ? maxThrottle : 0;
    this.throttle += (want - this.throttle) * Math.min(1, (want > this.throttle ? TRIMMER.spinUp : TRIMMER.spinDown) * dt);
    if (!this.running) this.throttle = Math.max(0, this.throttle - dt * 3);
    if (this.running) {
      this.fuel = Math.max(0, this.fuel - (TRIMMER.idleUse + (TRIMMER.fullUse - TRIMMER.idleUse) * this.throttle) * this.gear.fuelUse * dt);
      if (this.fuel === 0) {
        this.running = false;
        this.starter.ranDry();
        this.events.push({ type: 'fuel-empty' });
      } else if (!this.lowFuelAnnounced && this.fuel < this.gear.tank * 0.15) {
        this.lowFuelAnnounced = true;
        this.events.push({ type: 'fuel-low' });
      }
    }
    this.updateTemp(dt);

    // --- Bump feed: tapping the head lets out more line from the spool.
    if (input.bump) {
      const room = this.gear.lineMax - this.line;
      const give = this.broken ? 0 : Math.min(TRIMMER.bump, room, this.spool * 100);
      if (give > 0.01) {
        this.line += give;
        this.spool -= give / 100;
      }
      this.events.push({ type: 'bump', ok: give > 0.01 });
    }

    // --- Clearing wrapped bramble canes off the head (engine off).
    if (input.rethread && this.tangle > 0.3) {
      if (this.running) {
        if (!this.rethreadHeld) this.events.push({ type: 'rethread-blocked', reason: 'running' });
      } else {
        this.rethread += dt / BRAMBLE.clearTime;
        if (this.rethread >= 1) {
          this.rethread = 0;
          this.tangle = 0;
          this.tangled = false;
          this.tangleWarned = false;
          this.events.push({ type: 'untangled' });
        }
      }
    }
    // --- Re-threading the head (engine off, uses line from the spool).
    else if (input.rethread && this.hasTrimmer && (this.broken || this.line < TRIMMER.lineMin)) {
      if (this.running) {
        if (!this.rethreadHeld) this.events.push({ type: 'rethread-blocked', reason: 'running' });
      } else if (this.spool < TRIMMER.rethreadUse) {
        if (!this.rethreadHeld) this.events.push({ type: 'rethread-blocked', reason: 'spool' });
      } else {
        this.rethread += dt / TRIMMER.rethreadTime;
        if (this.rethread >= 1) {
          this.rethread = 0;
          this.broken = false;
          this.line = this.gear.lineMax;
          this.spool -= TRIMMER.rethreadUse;
          this.events.push({ type: 'rethread-done' });
          if (this.intro === 'line') {
            this.intro = null;
            this.events.push({ type: 'intro', step: 'done' });
          }
        }
      }
    } else this.rethread = 0;
    this.rethreadHeld = !!input.rethread;

    // --- Refill at the depot (fuel and line cost money, deducted from the pay). The message says what
    // was actually refilled, once the worker has finished there (or walks away).
    if (this.atDepot) {
      let did = false;
      if (this.fuel < this.gear.tank - 0.001) {
        const add = Math.min(0.35 * dt, this.gear.tank - this.fuel);
        this.fuel += add;
        this.refillFuel += add;
        this.expenses += add * PRICES.fuelPerLitre;
        did = true;
        this.lowFuelAnnounced = false;
      }
      // (Not at the start of a job: the line is fitted by hand then, see `intro`.)
      if (!this.intro && (this.spool < this.gear.spool - 0.001 || this.line < this.gear.lineMax - 0.01 || this.broken)) {
        const before = this.spool;
        this.spool = this.gear.spool;
        this.line = this.gear.lineMax;
        this.broken = false;
        this.refillLine = true;
        this.expenses += ((this.gear.spool - before) / this.gear.spool) * PRICES.spool;
        did = true;
      }
      if (this.refilling && !did) this.reportRefill();
      this.refilling = did;
    } else if (this.refilling || this.refillLine || this.refillFuel > 0) {
      this.reportRefill();
      this.refilling = false;
    }

    // --- Driving the pat pat (the trimmer is off and in the trailer meanwhile)
    if (this.driving) {
      this.driveStep(dt, input.drive ?? { throttle: 0, steer: 0 });
      this.cutting = false;
      this.load += (0 - this.load) * Math.min(1, dt * 3);
      this.updateLoad(dt);
      this.updateCritters(dt);
      return;
    }

    // --- Walking
    const len = Math.hypot(input.moveX, input.moveZ);
    const mag = Math.min(1, len);
    const mx = len > 0 ? input.moveX / len : 0;
    const mz = len > 0 ? input.moveZ / len : 0;
    if (input.yaw !== undefined) this.yaw = input.yaw;
    else if (mag > 0.05) {
      const target = Math.atan2(mx, mz);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, PLAYER.turnRate * dt);
    }
    let speed = this.gear.walk * mag * (this.throttle > 0.3 ? PLAYER.workSpeed : 1);
    if (mag > 0.05) {
      const h0 = f.height(this.x, this.z);
      const h1 = f.height(this.x + mx * 0.3, this.z + mz * 0.3);
      const grade = (h1 - h0) / 0.3;
      if (grade > 0) speed *= Math.max(0.4, 1 - grade * 1.6 * this.gear.slopeGrip);
    }
    if (f.brambles.some((b) => b.hp > 0 && Math.hypot(b.x - this.x, b.z - this.z) < b.r)) speed *= BRAMBLE.slow;
    this.wading = f.inWater(this.x, this.z);
    if (this.wading) speed *= 0.6;
    if (this.scared > 0) {
      this.scared -= dt;
      speed = 0;
    }
    if (this.fallen > 0) {
      this.fallen -= dt;
      speed = 0;
    }
    const px = this.x;
    const pz = this.z;
    if (mag > 0.05) {
      this.x += mx * speed * dt;
      this.z += mz * speed * dt;
    }
    this.slip(dt, mag * speed / Math.max(0.1, this.gear.walk), mag > 0.05 ? mx : 0, mag > 0.05 ? mz : 0);
    this.collide();
    this.vx += ((this.x - px) / dt - this.vx) * 0.25;
    this.vz += ((this.z - pz) / dt - this.vz) * 0.25;
    this.speed = Math.hypot(this.vx, this.vz);

    // --- The player swings the head; the line cuts along the path it travelled this step.
    const ax = this.headX;
    const az = this.headZ;
    const target = Math.max(-1, Math.min(1, input.sweep ?? 0)) * PLAYER.sweepMax;
    const maxStep = this.gear.sweepRate * dt;
    this.sweep += Math.max(-maxStep, Math.min(maxStep, target - this.sweep));
    this.updateHead();
    this.lift += ((input.lift ?? 0) - this.lift) * Math.min(1, dt * 8);
    this.cutting = this.lift < 0.25 && this.running && this.rpm >= TRIMMER.cutThrottle && !this.broken && !this.tangled && this.line > TRIMMER.lineMin * 0.5;
    let n = 0;
    let weight = 0;
    if (this.cutting) {
      const r = this.cutRadius;
      n = f.cutSegment(ax, az, this.headX, this.headZ, r);
      // Wet grass is heavier; a sharper line shape makes it easier.
      weight = f.lastCutWeight * this.grassWeight * this.gear.lineLoad;
      if (n) {
        this.wear(n * TRIMMER.wearPerCell * this.gear.lineToughness);
        this.events.push({ type: 'cut', x: this.headX, z: this.headZ, n, weight });
      }
      for (const s of f.stones) {
        s.cooldown -= dt;
        const d = Math.hypot(s.x - this.headX, s.z - this.headZ);
        s.warn = (s.warn ?? 0) - dt;
        if (s.warn <= 0 && d >= s.r + r && d < s.r + r + 0.35) {
          s.warn = 0.45;
          this.events.push({ type: 'stone-near', x: s.x, z: s.z });
        }
        if (s.cooldown <= 0 && d < s.r + r) {
          s.cooldown = 0.6;
          s.hit = true;
          this.events.push({ type: 'stone', x: s.x, z: s.z });
          this.wear(TRIMMER.stoneHit * this.gear.lineToughness, true);
          // At full revs a stone can snap the line off at the head even when it is long.
          if (this.rpm > 0.8 && Math.random() < STONE_SNAP * this.gear.lineToughness) this.wear(this.line, true);
        }
      }
      for (const b of f.bushes) {
        b.cooldown -= dt;
        const k = BUSH_KINDS[b.kind];
        if (b.cooldown <= 0 && Math.hypot(b.x - this.headX, b.z - this.headZ) < k.hit * b.scale + r) {
          b.cooldown = 1;
          if (k.penalty > 0) {
            b.knocks++;
            this.knocks++;
            this.knockPenalty += k.penalty;
            if (this.level.client.request === 'no-knock') this.breakRequest();
          }
          this.events.push(k.hard ? { type: 'stone', x: this.headX, z: this.headZ } : { type: 'trunk', x: b.x, z: b.z, kind: b.kind });
          if (k.hard && k.penalty > 0) this.events.push({ type: 'trunk', x: b.x, z: b.z, kind: b.kind });
          this.wear((k.hard ? TRIMMER.stoneHit : TRIMMER.trunkHit) * this.gear.lineToughness, true);
        }
      }
      if (!f.hoseCut && f.hose.length && f.hoseDistance(this.headX, this.headZ) < HOSE.cutAt) {
        f.hoseCut = { x: this.headX, z: this.headZ };
        this.events.push({ type: 'hose-cut', x: this.headX, z: this.headZ });
        if (this.level.client.request === 'hose') this.breakRequest();
      }
      for (const h of f.hens) {
        if (h.state === 'gone' || Math.hypot(h.x - this.headX, h.z - this.headZ) > HEN.hit + r * 0.5) continue;
        h.state = 'gone';
        h.yaw = Math.atan2(h.x - this.x, h.z - this.z);
        this.henHits++;
        this.events.push({ type: 'hen-hit', x: h.x, z: h.z });
        if (this.level.client.request === 'chickens') this.breakRequest();
      }
      for (const b of f.brambles) {
        if (b.hp <= 0 || Math.hypot(b.x - this.headX, b.z - this.headZ) > b.r + r * 0.6) continue;
        // Thorny canes: slow to cut, heavy on the engine, and they wind round the head.
        b.hp = Math.max(0, b.hp - (this.rpm * dt) / BRAMBLE.toughness);
        weight += 3.6 * this.rpm;
        this.tangle = Math.min(1, this.tangle + BRAMBLE.tangleRate * this.rpm * dt);
        if (Math.random() < dt * 6) this.events.push({ type: 'bramble-hit', x: this.headX, z: this.headZ });
        if (b.hp === 0) {
          this.brambleBonus += BRAMBLE.bonus;
          this.events.push({ type: 'bramble-cleared', x: b.x, z: b.z });
        }
      }
      if (!this.tangleWarned && this.tangle > 0.55) {
        this.tangleWarned = true;
        this.events.push({ type: 'tangle-warn' });
      }
      if (this.tangle >= 1 && !this.tangled) {
        this.tangled = true;
        this.events.push({ type: 'tangled' });
      }
      if (!this.broken && this.line < TRIMMER.lineMin && n) this.events.push({ type: 'line-short' });
    }
    // A jammed head stalls the engine like heavy grass does, unless the throttle is released.
    if (this.tangled && this.running) weight += 3.6 * this.throttle;
    this.load += (weight / dt - this.load) * Math.min(1, dt * 3);
    this.updateLoad(dt);

    this.updateCritters(dt);
    if (this.level.client.request === 'fast' && this.time > this.fastTime) this.breakRequest();

    if (!this.finishAnnounced && this.canFinish) {
      this.finishAnnounced = true;
      this.events.push({ type: 'finish-ready' });
    }
  }

  /** End the job and compute the pay. */
  finish(): Result {
    this.state = 'done';
    this.running = false;
    const coverage = this.field.coverage;
    const stars = STARS_AT.filter((t) => coverage >= t).length;
    const base = Math.round(this.level.pay * Math.min(1, coverage));
    const timeBonus = coverage >= FINISH_AT ? Math.round(Math.max(0, 1 - this.time / (this.level.parTime * this.parScale)) * this.level.pay * 0.4) : 0;
    const penalty = this.knockPenalty;
    const expenses = Math.round(this.expenses);
    const brambles = this.brambleBonus;
    const accidents = this.stings * HIVE.stingPenalty + this.henHits * HEN.penalty + (this.field.hoseCut ? HOSE.penalty : 0);
    const c = this.level.client;
    const requestMet = c.request !== 'none' && coverage >= FINISH_AT && this.requestOk && (c.request !== 'clean' || coverage >= 0.97);
    const tip = requestMet ? c.tip : 0;
    const total = coverage >= FINISH_AT ? Math.max(0, base + timeBonus + brambles + tip - penalty - expenses - accidents) : 0;
    return { coverage, time: this.time, stars, base, timeBonus, brambles, penalty, expenses, total, knocks: this.knocks, accidents, tip, requestMet };
  }

  /**
   * Steep banks: past the grip of the boots the feet slide downhill, most when going down or across
   * fast and on wet grass (climbing, the feet dig in); sliding too fast, the worker falls and the
   * engine stalls. (mx, mz): walking direction, 0 standing.
   */
  private slip(dt: number, pace: number, mx: number, mz: number): void {
    const { g, dx, dz } = this.field.grade(this.x, this.z);
    const wet = this.level.weather === 'rain' ? SLOPE.wet : 1;
    const down = mx * dx + mz * dz;
    const way = mx === 0 && mz === 0 ? 0.35 : down > 0 ? 0.6 + down : 0.25;
    const drive = Math.max(0, g - SLOPE.slipFrom) * way * (0.4 + pace) * wet * this.gear.slopeGrip;
    // The slide speed follows what the ground and the walking ask for: it builds up over a moment
    // and dies away when the feet find grip.
    const target = this.fallen > 0 ? 0 : drive * SLOPE.slideAccel;
    this.slide += (target - this.slide) * Math.min(1, dt * (target > this.slide ? 2.5 : SLOPE.slideDecay));
    if (this.slide < 0.02) {
      this.slide = 0;
      this.slipAnnounced = false;
      return;
    }
    this.x += dx * this.slide * dt;
    this.z += dz * this.slide * dt;
    if (!this.slipAnnounced && this.slide > 0.35) {
      this.slipAnnounced = true;
      this.events.push({ type: 'slip' });
    }
    if (this.slide > SLOPE.fallAt) {
      this.slide = 0;
      this.fallen = SLOPE.fallTime;
      if (this.running) {
        this.running = false;
        this.strain = 0;
      }
      this.events.push({ type: 'fall' });
    }
  }

  private breakRequest(): void {
    if (this.requestBroken) return;
    this.requestBroken = true;
    this.events.push({ type: 'request-broken' });
  }

  /** Bees, snakes and hens. */
  private updateCritters(dt: number): void {
    const f = this.field;
    const revving = this.running && this.rpm > 0.4;
    for (const h of f.hives) {
      const d = Math.hypot(h.x - this.headX, h.z - this.headZ);
      if (h.swarm <= 0) {
        h.rest = Math.max(0, h.rest - dt);
        // The line touching the hive: they come out at once.
        if (h.rest > 0) h.anger = 0;
        else if (this.cutting && d < 0.45 + this.cutRadius) h.anger = 1;
        else if (revving && d < HIVE.near) h.anger += HIVE.angerRate * this.rpm * (1.2 - d / HIVE.near) * dt;
        else h.anger = Math.max(0, h.anger - HIVE.calm * dt);
        if (h.anger >= 1) {
          h.anger = 0;
          h.swarm = HIVE.swarmTime;
          h.stung = 0;
          h.sx = h.x;
          h.sz = h.z;
          this.events.push({ type: 'swarm', x: h.x, z: h.z });
        } else {
          h.sx += (h.x - h.sx) * Math.min(1, dt * 2);
          h.sz += (h.z - h.sz) * Math.min(1, dt * 2);
        }
        continue;
      }
      // Chasing the worker. Ducking into the stream throws them off.
      h.swarm -= dt;
      const dx = this.x - h.sx;
      const dz = this.z - h.sz;
      const dw = Math.hypot(dx, dz) || 1;
      if (this.wading || dw > 14) h.swarm = 0;
      const step = Math.min(dw, HIVE.swarmSpeed * dt);
      h.sx += (dx / dw) * step;
      h.sz += (dz / dw) * step;
      h.stingT -= dt;
      if (dw < HIVE.stingAt && h.stingT <= 0) {
        h.stingT = HIVE.stingEvery;
        this.stings++;
        h.stung++;
        this.events.push({ type: 'sting' });
        if (this.level.client.request === 'bees') this.breakRequest();
        if (h.stung >= HIVE.maxStings) h.swarm = 0;
      }
      if (h.swarm <= 0) {
        h.swarm = 0;
        h.rest = HIVE.rest;
        this.events.push({ type: 'bees-gone' });
      }
    }
    for (const s of f.snakes) {
      if (s.state === 'hidden') {
        const dh = Math.hypot(s.x - this.headX, s.z - this.headZ);
        const dp = Math.hypot(s.x - this.x, s.z - this.z);
        if ((dh < SNAKE.notice && this.cutting) || dp < SNAKE.notice * 0.8) {
          s.state = 'flee';
          s.t = SNAKE.flee;
          s.yaw = Math.atan2(s.x - this.x, s.z - this.z);
          const scared = dp < SNAKE.notice;
          if (scared) this.scared = SNAKE.scare;
          this.events.push({ type: 'snake', x: s.x, z: s.z, scared });
        }
      } else if (s.state === 'flee') {
        s.t -= dt;
        // Slithers off in a wavy line.
        s.yaw += Math.sin(this.time * 7) * dt * 2;
        s.x += Math.sin(s.yaw) * SNAKE.speed * dt;
        s.z += Math.cos(s.yaw) * SNAKE.speed * dt;
        if (s.t <= 0) s.state = 'gone';
      }
    }
    for (const h of f.hens) {
      if (h.state === 'gone') {
        // Runs off out of the field, flapping.
        if (Math.abs(h.x) < f.width / 2 + 12 && Math.abs(h.z) < f.depth / 2 + 12) {
          h.x += Math.sin(h.yaw) * HEN.run * 1.3 * dt;
          h.z += Math.cos(h.yaw) * HEN.run * 1.3 * dt;
        }
        continue;
      }
      const dh = Math.hypot(h.x - this.headX, h.z - this.headZ);
      if (revving && dh < HEN.panic && h.state !== 'panic') {
        h.state = 'panic';
        h.t = 1.2 + Math.random();
        h.yaw = Math.atan2(h.x - this.headX, h.z - this.headZ) + (Math.random() - 0.5) * 0.8;
        this.events.push({ type: 'hen-panic', x: h.x, z: h.z });
      }
      h.t -= dt;
      if (h.state === 'panic') {
        h.speed = HEN.run;
        if (h.t <= 0) {
          h.state = 'wander';
          h.t = 1 + Math.random() * 2;
          h.tx = h.x;
          h.tz = h.z;
        }
      } else {
        if (h.t <= 0) {
          // Peck a while, then walk a few steps somewhere else in the yard.
          h.t = 2 + Math.random() * 4;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * f.yard.r;
          h.tx = f.yard.x + Math.cos(a) * r;
          h.tz = f.yard.z + Math.sin(a) * r;
        }
        const dx = h.tx - h.x;
        const dz = h.tz - h.z;
        const d = Math.hypot(dx, dz);
        h.speed = d > 0.1 ? HEN.walk : 0;
        if (d > 0.1) h.yaw = Math.atan2(dx, dz);
      }
      h.x += Math.sin(h.yaw) * h.speed * dt;
      h.z += Math.cos(h.yaw) * h.speed * dt;
      // A fright can send them a little way off, but they stay round the yard (never in the field).
      const dx = h.x - f.yard.x;
      const dz = h.z - f.yard.z;
      const d = Math.hypot(dx, dz);
      const max = f.yard.r * 1.8;
      if (d > max) {
        h.x = f.yard.x + (dx / d) * max;
        h.z = f.yard.z + (dz / d) * max;
      }
    }
  }

  private reportRefill(): void {
    // Topping up a nearly full tank is not news; a real refill is.
    const fuel = this.refillFuel > this.gear.tank * 0.12;
    if (fuel || this.refillLine) this.events.push({ type: 'refill', fuel, line: this.refillLine });
    this.refillFuel = 0;
    this.refillLine = false;
  }

  /** Shorten the line; a hard hit on short line snaps it off inside the head. */
  private wear(cm: number, hit = false): void {
    if (this.broken) return;
    this.line = Math.max(0, this.line - cm);
    if (this.line < TRIMMER.brokenAt || (hit && this.line < TRIMMER.lineMin)) {
      this.line = 0;
      this.broken = true;
      this.events.push({ type: 'line-broken' });
    }
  }

  /** How hard the engine is working: cut rate over what it can take at this throttle. */
  get loadRatio(): number {
    return this.load / (ENGINE.fullLoad * this.gear.power * Math.max(0.3, this.throttle) ** 1.5);
  }

  private updateLoad(dt: number): void {
    if (!this.running) {
      this.rpm = Math.max(0, this.rpm - dt * 2);
      this.strain = Math.max(0, this.strain - dt * ENGINE.strainLoss);
      return;
    }
    // Strain only builds while the line is actually cutting (the load figure lags behind for a moment).
    const ratio = this.cutting && this.load > 1 ? this.loadRatio : 0;
    const over = ratio - ENGINE.strainFrom;
    // Under load the rpm sags: a little near capacity, a lot when overloaded.
    const sag = Math.min(0.45, Math.max(0, ratio - 0.75) * 0.5);
    this.rpm += (this.throttle * (1 - sag) - this.rpm) * Math.min(1, dt * 6);
    this.strain = Math.max(0, this.strain + (over > 0 ? over * ENGINE.strainGain : -ENGINE.strainLoss) * dt);
    if (!this.strainAnnounced && this.strain > ENGINE.strainWarn) {
      this.strainAnnounced = true;
      this.events.push({ type: 'strain' });
    } else if (this.strain < ENGINE.strainWarn * 0.3) this.strainAnnounced = false;
    if (this.strain >= 1) {
      this.running = false;
      this.strain = 0;
      this.strainAnnounced = false;
      this.events.push({ type: 'bogged' });
    }
  }

  private updateTemp(dt: number): void {
    const loadK = Math.min(1, this.load / (ENGINE.fullLoad * this.gear.power));
    // The first jobs heat it less (light work): held flat out there it should not overheat.
    const heat = this.field.level.heat ?? 1;
    const target = this.running ? ENGINE.idleTemp + this.throttle * (ENGINE.revTemp + ENGINE.loadTemp * loadK) * heat - this.gear.cooling * this.throttle : 0;
    const k = target > this.temp ? (this.running && this.throttle > 0.2 ? ENGINE.heatK : ENGINE.coolRunK * 2) : this.running ? ENGINE.coolRunK : ENGINE.coolOffK;
    this.temp += (target - this.temp) * Math.min(1, k * dt);
    if (this.running && this.temp >= 1) {
      this.running = false;
      this.overheated = true;
      this.overheats++;
      this.events.push({ type: 'overheat' });
    }
    if (!this.hotAnnounced && this.temp > ENGINE.hotWarn) {
      this.hotAnnounced = true;
      this.events.push({ type: 'engine-hot' });
    } else if (this.temp < ENGINE.hotWarn - 0.15) this.hotAnnounced = false;
    if (this.overheated && this.temp < ENGINE.restart) {
      this.overheated = false;
      this.events.push({ type: 'cooled' });
    }
  }

  private updateHead(): void {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    // Right of the facing direction.
    const rx = -fz;
    const rz = fx;
    const a = this.sweep;
    // The head swings on an arc round the worker, a little closer at the ends.
    const reach = PLAYER.reach * (1 - 0.12 * Math.abs(a));
    this.headX = this.x + (fx * Math.cos(a) + rx * Math.sin(a)) * reach + rx * PLAYER.headSide;
    this.headZ = this.z + (fz * Math.cos(a) + rz * Math.sin(a)) * reach + rz * PLAYER.headSide;
  }

  private collide(): void {
    const f = this.field;
    // The parked pat pat: a capsule along its length.
    const v = f.vehicle;
    const ax = Math.sin(v.yaw);
    const az = Math.cos(v.yaw);
    const half = v.length / 2 - v.width / 2;
    const t = Math.max(-half, Math.min(half, (this.x - v.x) * ax + (this.z - v.z) * az));
    const cx = v.x + ax * t;
    const cz = v.z + az * t;
    const dx0 = this.x - cx;
    const dz0 = this.z - cz;
    const d0 = Math.hypot(dx0, dz0);
    const min0 = v.width / 2 + PLAYER.radius;
    if (d0 < min0 && d0 > 1e-6) {
      this.x = cx + (dx0 / d0) * min0;
      this.z = cz + (dz0 / d0) * min0;
    }
    const solid = (x: number, z: number, r: number) => {
      const dx = this.x - x;
      const dz = this.z - z;
      const d = Math.hypot(dx, dz);
      const min = r + PLAYER.radius;
      if (d < min && d > 1e-6) {
        this.x = x + (dx / d) * min;
        this.z = z + (dz / d) * min;
      }
    };
    // The stem clump does not grow with the crown: cap the scale so the base stays reachable.
    for (const b of f.bushes) solid(b.x, b.z, BUSH_KINDS[b.kind].block * (b.kind === 'ocak' ? Math.min(b.scale, 1.15) : b.scale));
    for (const h of f.hives) solid(h.x, h.z, HIVE.block);
    // Walls: pushed off each segment (half the wall's thickness plus the body).
    for (const y of f.yardProps) solid(y.x, y.z, y.r);
    const g = f.yardGate;
    const gate = g && f.gateOpen < 0.95 ? [g] : [];
    for (const w of [...f.walls, ...f.fences, ...f.yardWalls, ...gate]) {
      const dx = w.bx - w.ax;
      const dz = w.bz - w.az;
      const t = Math.max(0, Math.min(1, ((this.x - w.ax) * dx + (this.z - w.az) * dz) / (dx * dx + dz * dz)));
      solid(w.ax + dx * t, w.az + dz * t, 0.21);
    }
    solid(f.house.x, f.house.z, 3.4);
    solid(f.mosque.x, f.mosque.z, 6.5);
    if (f.hut) solid(f.hut.x, f.hut.z, 3);
    ({ x: this.x, z: this.z } = f.clampWalk(this.x, this.z));
  }
}
