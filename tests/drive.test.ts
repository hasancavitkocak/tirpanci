import { describe, expect, it } from 'vitest';
import { LEVELS, NO_UPGRADES } from '../src/game/config';
import { Session } from '../src/game/session';

/** On the vehicle in the garage at home: out, KAPIYI AÇ when it shows, through the gate and down the lane to the field. */
function driveToField(tractor: boolean, trailer: boolean, waitForGate: boolean) {
  const s = new Session(LEVELS[0], NO_UPGRADES, 1, undefined, 'home');
  const f = s.field;
  f.tractor = tractor;
  f.trailer = trailer ? { yaw: NaN } : null;
  const v = f.vehicle;
  Object.assign(v, f.laneStart!);
  s.x = v.x;
  s.z = v.z;
  expect(s.board()).toBe(true);
  const step = (throttle: number, steer: number) => s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle, steer } });
  const lane = f.lane;
  let opened = false;
  let stuck = 0;
  for (let i = 0; i < 60 * 90 && !s.vehicleAtField; i++) {
    if (!opened && s.canOpenGate) {
      s.openGate();
      opened = true;
      // Waiting for it to open, or driving on as it slides.
      if (waitForGate) for (let j = 0; j < 60 * 4; j++) step(0, 0);
    }
    let k = 0;
    for (let j = 1; j < lane.length; j++) if (Math.hypot(lane[j].x - v.x, lane[j].z - v.z) < Math.hypot(lane[k].x - v.x, lane[k].z - v.z)) k = j;
    const t = lane[Math.min(lane.length - 1, k + 4)];
    let err = Math.atan2(t.x - v.x, t.z - v.z) - v.yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    step(Math.abs(err) > 0.5 ? 0.5 : 1, Math.max(-1, Math.min(1, -err * 3)));
    if (i > 60 && Math.abs(v.speed) < 0.05) stuck++;
  }
  return { s, opened, stuck };
}

describe('driving from the garage to the field', () => {
  for (const [tractor, trailer] of [[false, false], [true, false], [true, true]])
    for (const wait of [true, false])
      it(`${tractor ? 'tractor' : 'pat pat'}${trailer ? ' with the trailer' : ''}, ${wait ? 'gate waited for' : 'driving on as the gate swings open'}`, () => {
        const { s, opened, stuck } = driveToField(tractor, trailer, wait);
        expect(opened).toBe(true);
        expect(s.vehicleAtField).toBe(true);
        // Never held up (by the garage, the gate or the fence) for more than half a second; driving
        // straight on, at most until the gate has swung open.
        expect(stuck).toBeLessThan(wait ? 30 : 60 * 3.6);
      });

  it('the trailer stays hitched: its axle a drawbar length behind the hitch, never swung past its limit', () => {
    const { s } = driveToField(true, true, true);
    const f = s.field;
    const a = f.trailerAxle()!;
    const h = f.hitch;
    expect(Math.hypot(h.x - a.x, h.z - a.z)).toBeCloseTo(3, 5);
    expect(Math.abs(Math.atan2(Math.sin(a.yaw - f.vehicle.yaw), Math.cos(a.yaw - f.vehicle.yaw)))).toBeLessThanOrEqual(1.3 + 1e-9);
  });

  it('the tractor climbs over the stream boulders the pat pat stops at', () => {
    for (const tractor of [false, true]) {
      const s = new Session(LEVELS[0], NO_UPGRADES, 1, undefined, 'home');
      const f = s.field;
      f.tractor = tractor;
      // A big one in the middle of the stream, where the village lets one go.
      const open = (x: number, z: number) => {
        const c = f.clampWalk(x, z);
        return Math.hypot(c.x - x, c.z - z) < 0.01;
      };
      const big = f.streamStones.find((b) => b.s > 0.5 && Math.abs(b.x - f.streamX(b.z)) < 1 && open(b.x, b.z - 3) && open(b.x, b.z + 3))!;
      expect(big).toBeTruthy();
      // A wheel over the boulder.
      expect(f.stoneLift(big.x, big.z)).toBeGreaterThan(0.3);
      const fits = f.vehicleFits(big.x, big.z, 0, 0);
      expect(fits).toBe(tractor);
    }
  });

  it('roaming (Serbest gez), getting off either vehicle leaves him empty-handed; on a job he takes the trimmer', () => {
    for (const tractor of [false, true]) {
      for (const roaming of [true, false]) {
        const s = new Session(LEVELS[0], NO_UPGRADES, 1, undefined, 'home');
        s.intro = null;
        s.roaming = roaming;
        s.field.tractor = tractor;
        const v = s.field.vehicle;
        Object.assign(v, s.field.laneStart!);
        s.x = v.x;
        s.z = v.z;
        expect(s.board()).toBe(true);
        for (let i = 0; i < 60; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: 0.6, steer: 0 } });
        for (let i = 0; i < 120 && Math.abs(v.speed) > 0.1; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: -0.5, steer: 0 } });
        v.speed = 0;
        expect(s.alight()).toBe(true);
        expect(s.hasTrimmer).toBe(!roaming);
        if (roaming) expect(s.takeTrimmer()).toBe(false);
      }
    }
  });
});

