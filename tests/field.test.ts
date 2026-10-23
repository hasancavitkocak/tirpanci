import { describe, expect, it } from 'vitest';
import { BUSH, CUT_HEIGHT, LEVELS, NO_UPGRADES } from '../src/game/config';
import { Field } from '../src/game/field';
import { Session } from '../src/game/session';
import { crank, runBot } from './bot';

describe('Field', () => {
  it('is deterministic per level', () => {
    const a = new Field(LEVELS[1]);
    const b = new Field(LEVELS[1]);
    expect(a.bushes.map((x) => [x.x, x.z])).toEqual(b.bushes.map((x) => [x.x, x.z]));
    expect(a.total).toBe(b.total);
  });

  it('plants bushes in rows apart from each other and keeps grass off the stems', () => {
    for (const lv of LEVELS) {
      const f = new Field(lv);
      if (lv.theme !== 'yol') expect(f.bushes.length, lv.name).toBeGreaterThan(3);
      expect(f.brambles.length).toBe(lv.brambles ?? 0);
      for (const b of f.bushes) {
        if (b.kind === 'ocak') for (const c of f.bushes) if (b !== c) expect(Math.hypot(b.x - c.x, b.z - c.z)).toBeGreaterThanOrEqual(BUSH.spacing);
        expect(f.grassAt(b.x, b.z)).toBe(0);
      }
    }
  });

  it('places what the level asks for: hives, snakes, hens, the hose, the stream', () => {
    for (const lv of LEVELS) {
      const f = new Field(lv);
      expect(f.hives.length, lv.name).toBe(lv.hives ?? 0);
      expect(f.snakes.length, lv.name).toBe(lv.snakes ?? 0);
      expect(f.hens.length, lv.name).toBe(lv.chickens ?? 0);
      expect(f.hose.length > 1, lv.name).toBe(!!lv.hose);
      expect(f.hasStream).toBe(!!lv.stream);
      if (lv.stream) {
        // The stream bed is carved in, and the worker may walk to it.
        const z = 0;
        expect(f.height(f.streamX(z), z)).toBeLessThan(f.height(f.streamX(z) - 3, z));
        expect(f.bounds(z).maxX).toBeGreaterThan(f.streamX(z));
      }
    }
  });

  it('cuts a swept capsule and counts coverage once per cell', () => {
    const f = new Field(LEVELS[0]);
    const n = f.cutSegment(-5, 4, 5, 4, 0.4);
    expect(n).toBeGreaterThan(100);
    expect(f.grassAt(0, 4)).toBeLessThanOrEqual(CUT_HEIGHT);
    const mown = f.mown;
    expect(f.cutSegment(-5, 4, 5, 4, 0.4)).toBe(0);
    expect(f.mown).toBe(mown);
    expect(f.takeDirty()).not.toBeNull();
    expect(f.takeDirty()).toBeNull();
  });
});

describe('Session', () => {
  it('a scripted worker can mow every field past the finish line', () => {
    for (const lv of LEVELS) {
      const s = new Session(lv, NO_UPGRADES);
      runBot(s, lv.parTime * 4, 1.9);
      expect(s.canFinish, lv.name).toBe(true);
      const r = s.finish();
      // The scripted worker is clumsy (knocks, stings); a careful player keeps the pay minus fuel and line.
      expect(r.base + r.timeBonus - r.expenses, lv.name).toBeGreaterThan(0);
      expect(r.stars).toBeGreaterThanOrEqual(1);
    }
  });

  it('runs out of fuel and refills at the depot for a fee', () => {
    const s = new Session(LEVELS[0], NO_UPGRADES);
    crank(s);
    expect(s.running).toBe(true);
    s.fuel = 0.001;
    s.x = 0;
    s.z = 0;
    for (let i = 0; i < 60; i++) s.step({ moveX: 0, moveZ: 0, throttle: true, bump: false });
    expect(s.engineOn).toBe(false);
    expect(s.cutting).toBe(false);
    s.x = s.field.depot.x;
    s.z = s.field.depot.z;
    for (let i = 0; i < 60 * 5; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false });
    expect(s.fuel).toBeGreaterThan(s.gear.tank * 0.9);
    expect(s.expenses).toBeGreaterThan(0);
  });

  it('the head follows the player, not an automatic swing', () => {
    const s = new Session(LEVELS[0], NO_UPGRADES);
    crank(s);
    for (let i = 0; i < 60; i++) s.step({ moveX: 0, moveZ: 0, throttle: true, bump: false, sweep: 0 });
    const ahead = { x: s.headX, z: s.headZ };
    expect(Math.abs(s.sweep)).toBeLessThan(1e-6);
    for (let i = 0; i < 60; i++) s.step({ moveX: 0, moveZ: 0, throttle: true, bump: false, sweep: 1 });
    // Facing -z (yaw = PI): the worker's right is +x.
    expect(s.headX).toBeGreaterThan(ahead.x + 0.5);
  });

  it('a hard hit on short line breaks it; it is re-threaded only with the engine off', () => {
    const s = new Session(LEVELS[0], NO_UPGRADES);
    crank(s);
    // The stone with the most room round it (no bush in the way of the line).
    const room = (p: { x: number; z: number }) => Math.min(...s.field.bushes.map((b) => Math.hypot(b.x - p.x, b.z - p.z)));
    const st = [...s.field.stones].sort((a, b) => room(b) - room(a))[0];
    s.line = 3.5;
    s.yaw = Math.PI;
    s.x = st.x;
    s.z = st.z + 1.15;
    for (let i = 0; i < 90 && !s.broken; i++) s.step({ moveX: 0, moveZ: 0, throttle: true, bump: false, yaw: Math.PI });
    expect(s.broken).toBe(true);
    expect(s.cutRadius).toBe(0);
    s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, rethread: true });
    expect(s.events.some((e) => e.type === 'rethread-blocked')).toBe(true);
    s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, stop: true });
    expect(s.running).toBe(false);
    for (let i = 0; i < 60 * 3; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, rethread: true });
    expect(s.broken).toBe(false);
    expect(s.line).toBe(s.gear.lineMax);
  });

  it('meets the customer request for a tip, and breaks it on a knock', () => {
    const lv = LEVELS.find((l) => l.client.request === 'no-knock')!;
    const s = new Session(lv, NO_UPGRADES);
    expect(s.requestOk).toBe(true);
    crank(s);
    const b = s.field.bushes[0];
    s.x = b.x;
    s.z = b.z + 2;
    for (let i = 0; i < 120 && s.knocks === 0; i++) s.step({ moveX: 0, moveZ: 0, throttle: true, bump: false, yaw: Math.PI });
    expect(s.knocks).toBeGreaterThan(0);
    expect(s.requestOk).toBe(false);
    expect(s.events.some((e) => e.type === 'request-broken')).toBe(true);
  });

  it('bees swarm when the trimmer revs by the hive and give up in the stream', () => {
    const lv = LEVELS.find((l) => (l.hives ?? 0) > 0 && l.stream)!;
    const s = new Session(lv, NO_UPGRADES);
    crank(s);
    const h = s.field.hives[0];
    s.x = h.x;
    // The line touches the hive: they come out at once.
    s.x = h.x - 0.22;
    s.z = h.z + 1.4;
    for (let i = 0; i < 60 * 6 && h.swarm === 0; i++) s.step({ moveX: 0, moveZ: 0, throttle: true, bump: false, yaw: Math.PI });
    expect(h.swarm).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 3; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false });
    expect(s.stings).toBeGreaterThan(0);
    // Into the water: they leave.
    s.x = s.field.streamX(s.z);
    s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false });
    s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false });
    expect(s.wading).toBe(true);
    expect(h.swarm).toBe(0);
  });

  it('a hose under the head is cut once', () => {
    const lv = LEVELS.find((l) => l.hose)!;
    const s = new Session(lv, NO_UPGRADES);
    crank(s);
    const p = s.field.hose[Math.floor(s.field.hose.length / 2)];
    // Facing -z the head works 0.22 m to the right (+x) of straight ahead.
    s.x = p.x - 0.22;
    s.z = p.z + 1.4;
    for (let i = 0; i < 60 && !s.field.hoseCut; i++) s.step({ moveX: 0, moveZ: 0, throttle: true, bump: false, yaw: Math.PI });
    expect(s.field.hoseCut).not.toBeNull();
    expect(s.finish().accidents).toBeGreaterThan(0);
  });

  it('the first job starts at home: get on the pat pat, drive it down to the field, take the trimmer, fit line, then start', () => {
    const s = new Session(LEVELS[0], NO_UPGRADES, 1, undefined, 'home');
    expect(s.intro).toBe('take');
    expect(s.hasTrimmer).toBe(false);
    expect(s.pull(1)).toBe('nothing');
    // By the house at the top of the lane, outside the field; the pat pat is parked there.
    expect(s.field.inField(s.x, s.z)).toBe(false);
    expect(s.driving).toBe(false);
    expect(s.vehicleAtField).toBe(false);
    const v = s.field.vehicle;
    for (let i = 0; i < 60 * 10 && !s.nearVehicle; i++) s.step({ moveX: v.x - s.x, moveZ: v.z - s.z, throttle: false, bump: false });
    expect(s.nearVehicle).toBe(true);
    // Not up here: the trimmer stays in the trailer until the pat pat is down at the field.
    expect(s.takeTrimmer()).toBe(false);
    expect(s.board()).toBe(true);
    // Getting on does not open the yard gate: only driving up to it does.
    for (let i = 0; i < 60; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: 0, steer: 0 } });
    expect(s.field.gateOpen).toBe(0);
    // Down the lane, steering for a point a little way ahead on it; the gate is open before the pat pat
    // gets to it (it never has to wait).
    const yg = s.field.yardGate!;
    let closest = Infinity;
    const lane = s.field.lane;
    for (let i = 0; i < 60 * 90 && !s.vehicleAtField; i++) {
      const h = s.field.head(v.x, v.z, v.yaw, v.art);
      if (s.field.gateOpen < 0.95) closest = Math.min(closest, Math.hypot(h.x - (yg.ax + yg.bx) / 2, h.z - (yg.az + yg.bz) / 2));
      let k = 0;
      for (let j = 1; j < lane.length; j++) if (Math.hypot(lane[j].x - v.x, lane[j].z - v.z) < Math.hypot(lane[k].x - v.x, lane[k].z - v.z)) k = j;
      const t = lane[Math.min(lane.length - 1, k + 4)];
      let err = Math.atan2(t.x - v.x, t.z - v.z) - v.yaw;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: Math.abs(err) > 0.5 ? 0.5 : 1, steer: Math.max(-1, Math.min(1, -err * 3)) } });
    }
    expect(s.vehicleAtField).toBe(true);
    expect(closest).toBeGreaterThan(1.2);
    // Driven off down the lane: it has shut behind the pat pat.
    expect(s.field.gateOpen).toBe(0);
    for (let i = 0; i < 60 * 3 && s.driving; i++) {
      s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: 0, steer: 0 } });
      s.alight();
    }
    expect(s.driving).toBe(false);
    expect(s.hasTrimmer).toBe(false);
    expect(s.takeTrimmer()).toBe(true);
    expect(s.intro).toBe('line');
    for (let i = 0; i < 60 * 3 && s.intro; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, rethread: true });
    expect(s.intro).toBe(null);
    expect(s.broken).toBe(false);
    expect(crank(s)).toBeLessThan(30);
    expect(s.running).toBe(true);
    // Back on the pat pat and off again: the trimmer comes back into his hands, ready to start.
    s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, stop: true });
    expect(s.running).toBe(false);
    expect(s.board()).toBe(true);
    expect(s.hasTrimmer).toBe(false);
    expect(s.alight()).toBe(true);
    expect(s.hasTrimmer).toBe(true);
    expect(crank(s)).toBeLessThan(30);
  });

  it('running down a steep bank the feet slip and the worker falls; climbing it he does not', () => {
    const lv = LEVELS.find((l) => (l.banks ?? 0) > 0)!;
    const s = new Session(lv, NO_UPGRADES);
    crank(s);
    // Find the steepest spot on the line x = 0 (on a bank).
    let z = 0;
    for (let t = -lv.depth / 2 + 2; t < lv.depth / 2 - 2; t += 0.1) if (s.field.grade(0, t).g > s.field.grade(0, z).g) z = t;
    expect(s.field.grade(0, z).g).toBeGreaterThan(0.5);
    // Uphill (towards -z): no fall.
    s.x = 0;
    s.z = z + 1.5;
    for (let i = 0; i < 60 * 3; i++) s.step({ moveX: 0, moveZ: -1, throttle: false, bump: false });
    expect(s.events.some((e) => e.type === 'fall')).toBe(false);
    // Downhill at full pace: a fall, and the engine stalls.
    s.events.length = 0;
    s.x = 0;
    s.z = z - 1.5;
    for (let i = 0; i < 60 * 3 && !s.fallen; i++) s.step({ moveX: 0, moveZ: 1, throttle: false, bump: false });
    expect(s.events.some((e) => e.type === 'fall')).toBe(true);
    expect(s.running).toBe(false);
  });

  it('the yard gate opens for the pat pat coming from outside, stays open while it waits there, shuts when it drives off', () => {
    const s = new Session(LEVELS[0], NO_UPGRADES, 1, undefined, 'home');
    const f = s.field;
    const g = f.yardGate!;
    const mx = (g.ax + g.bx) / 2;
    const mz = (g.az + g.bz) / 2;
    // 8 m outside the gate, facing it.
    const ox = mx - f.plateau.x;
    const oz = mz - f.plateau.z;
    const l = Math.hypot(ox, oz);
    const v = f.vehicle;
    v.x = mx + (ox / l) * 8;
    v.z = mz + (oz / l) * 8;
    v.yaw = Math.atan2(-ox, -oz);
    v.art = 0;
    s.x = v.x;
    s.z = v.z;
    expect(s.board()).toBe(true);
    const drive = (throttle: number) => s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle, steer: 0 } });
    for (let i = 0; i < 30; i++) drive(0);
    expect(f.gateOpen).toBe(0);
    // Towards it: it opens; stopped short of it, it stays open.
    for (let i = 0; i < 60 * 0.8; i++) drive(1);
    for (let i = 0; i < 60 * 3; i++) drive(0);
    const d = Math.hypot(v.x - mx, v.z - mz);
    expect(d).toBeGreaterThan(3);
    expect(f.gateOpen).toBe(1);
    // Backing off: it shuts.
    for (let i = 0; i < 60 * 2; i++) drive(-1);
    for (let i = 0; i < 60 * 3; i++) drive(0);
    expect(f.gateOpen).toBe(0);
  });

  it('drives the pat pat (into the field too, flattening the grass but not through the bushes), the refill spot comes along', () => {
    const s = new Session(LEVELS[0], NO_UPGRADES);
    const f = s.field;
    const v = f.vehicle;
    s.x = v.x;
    s.z = v.z - 1.2;
    expect(s.board()).toBe(true);
    expect(s.pull(1)).toBe('nothing');
    const depot0 = { ...f.depot };
    const start = { x: v.x, z: v.z };
    // Forward along the path below the field, then try to turn into the field.
    for (let i = 0; i < 60 * 3; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: 1, steer: 0 } });
    expect(Math.hypot(v.x - start.x, v.z - start.z)).toBeGreaterThan(3);
    expect(Math.hypot(f.depot.x - depot0.x, f.depot.z - depot0.z)).toBeGreaterThan(3);
    const mown = f.mown;
    for (let i = 0; i < 60 * 6; i++) {
      s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: 1, steer: -1 } });
      for (const b of f.bushes) expect(Math.hypot(b.x - v.x, b.z - v.z)).toBeGreaterThan(0.5);
    }
    // Flattened grass is not mown grass.
    expect(f.mown).toBe(mown);
    // Stop, then get off (not while it is still rolling).
    for (let i = 0; i < 60 * 3 && s.driving; i++) {
      s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: 0, steer: 0 } });
      s.alight();
    }
    expect(s.driving).toBe(false);
    expect(s.nearVehicle).toBe(true);
  });

  it('a job started at the pat pat: the line is fitted by hand, not by the refill spot next to it', () => {
    const s = new Session(LEVELS[1], NO_UPGRADES, 1, undefined, 'patpat');
    // As if driven down to the field and stepped off beside the trailer.
    const v = s.field.vehicle;
    v.x = -s.field.width / 2 + 1.9;
    v.z = s.field.depth / 2 + 4.3;
    v.yaw = Math.PI / 2;
    s.field.placeDepot();
    s.x = v.x;
    s.z = v.z - 1.6;
    expect(s.nearVehicle).toBe(true);
    // The trimmer is in the trailer: take it, or get on the pat pat.
    expect(s.canTake).toBe(true);
    expect(s.canBoard).toBe(true);
    expect(s.takeTrimmer()).toBe(true);
    for (let i = 0; i < 30; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false });
    expect(s.broken).toBe(true);
    expect(s.intro).toBe('line');
    for (let i = 0; i < 60 * 3 && s.intro; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, rethread: true });
    expect(s.intro).toBe(null);
    expect(s.line).toBe(s.gear.lineMax);
  });

  it('the mosque yard wall stops the worker; the gate lets him through', () => {
    const lv = LEVELS.find((l) => l.theme === 'mezarlik')!;
    const s = new Session(lv, NO_UPGRADES);
    const f = s.field;
    // Walk straight down at the wall away from the gate: stays inside.
    s.x = f.wallX - 3;
    s.z = f.wallBottom - 1;
    for (let i = 0; i < 60 * 3; i++) s.step({ moveX: 0, moveZ: 1, throttle: false, bump: false });
    expect(s.z).toBeLessThan(f.wallBottom);
    // Through the gate: out.
    s.x = 0;
    s.z = f.wallBottom - 1;
    for (let i = 0; i < 60 * 3; i++) s.step({ moveX: 0, moveZ: 1, throttle: false, bump: false });
    expect(s.z).toBeGreaterThan(f.wallBottom);
  });

  it('long heavy work overheats the engine; it restarts after cooling', () => {
    // (Not the first job: it heats the engine less on purpose.)
    const s = new Session(LEVELS[4], NO_UPGRADES);
    crank(s);
    s.temp = 0.99;
    s.throttle = 1;
    for (let i = 0; i < 60 * 20 && s.running; i++) {
      s.load = 144; // as if cutting thick grass at the edge of what the engine takes, the whole time
      s.step({ moveX: 0, moveZ: 0, throttle: true, bump: false });
    }
    expect(s.overheated).toBe(true);
    expect(s.pull(1)).toBe('hot');
    s.coolNow();
    expect(s.overheated).toBe(false);
    expect(s.pull(1)).toBe('start');
  });
});


describe('Session.advance', () => {
  it('keeps a button press made in a frame shorter than one step', () => {
    const s = new Session(LEVELS[0], NO_UPGRADES);
    crank(s);
    const base = { moveX: 0, moveZ: 0, throttle: false, bump: false };
    s.advance(0.005, { ...base, stop: true });
    expect(s.running).toBe(true);
    s.advance(0.02, base);
    expect(s.running).toBe(false);
  });
});

describe('engine load', () => {
  it('held flat out, the first job does not overheat the engine in three minutes; a later one does', () => {
    const run = (lv: (typeof LEVELS)[number]) => {
      const s = new Session(lv, NO_UPGRADES, 1);
      crank(s);
      expect(s.running).toBe(true);
      // Standing on the spot, throttle held (light load: a little grass cut in front).
      for (let i = 0; i < 60 * 180 && !s.overheated; i++) s.step({ moveX: 0, moveZ: 0, throttle: true, bump: false });
      return s.overheated;
    };
    expect(run(LEVELS[0])).toBe(false);
    expect(run(LEVELS[4])).toBe(true);
  });

  it('re-opening the throttle in grass does not bog the engine at once', () => {
    const s = new Session(LEVELS[0], NO_UPGRADES);
    crank(s);
    s.temp = 0.3;
    s.load = 240; // was just cutting thick grass
    for (let i = 0; i < 30; i++) s.step({ moveX: 0, moveZ: 0, throttle: true, bump: false });
    expect(s.running).toBe(true);
    expect(s.strain).toBeLessThan(0.2);
  });
});
