import { describe, expect, it } from 'vitest';
import { LEVELS, NO_UPGRADES } from '../src/game/config';
import { Session } from '../src/game/session';
import { HARVEST, beansKg, capacityOf, dryWithAd, harvestNeeds, harvestOn, harvestSacks, loadSack, newHarvest, sellNuts, spreadSack, suckCell, tickHarvest } from '../src/game/harvest';

const H = 3600_000;

describe('Harvest', () => {
  it('goes round: collect, spread, dry, thresh, dry again, sell, rest, and idle until started again', () => {
    const h = newHarvest();
    let now = 0;
    const cap = capacityOf(false, false);
    expect(cap).toBe(HARVEST.capacity.patpat);
    // Trips with the pat pat until every sack is on the harman.
    let trips = 0;
    while (h.stage === 'collect') {
      for (const g of HARVEST.gardens) while (loadSack(h, g, cap));
      expect(h.load).toBeLessThanOrEqual(cap);
      while (spreadSack(h, now));
      trips++;
    }
    expect(trips).toBe(Math.ceil(harvestSacks() / cap));
    expect(h.stage).toBe('drying');
    expect(tickHarvest(h, now + 10 * H)).toBe(false);
    expect(tickHarvest(h, now + HARVEST.dryHours * H)).toBe(true);
    expect(h.stage).toBe('thresh');
    for (let c = 0; c < HARVEST.cells; c++) suckCell(h, c, now);
    expect(h.stage).toBe('beans');
    expect(beansKg(h)).toBe(harvestSacks() * HARVEST.kgPerSack);
    now = 1000 * H;
    tickHarvest(h, now + HARVEST.dryHours * H);
    expect(h.stage).toBe('sell');
    expect(sellNuts(h, now)).toBe(harvestSacks() * HARVEST.kgPerSack * HARVEST.pricePerKg);
    expect(h.stage).toBe('rest');
    tickHarvest(h, now + HARVEST.everyDays * 24 * H);
    expect(h.stage).toBe('idle');
    expect(Object.keys(h.waiting)).toHaveLength(0);
  });

  it('the tractor carries sacks only with its trailer', () => {
    expect(capacityOf(true, false)).toBe(0);
    expect(capacityOf(true, true)).toBe(HARVEST.capacity.trailer);
    const h = newHarvest();
    expect(loadSack(h, HARVEST.gardens[0], 0)).toBe(false);
  });

  it('needs the tractor and the patos to start; a day to dry, or two ads', () => {
    expect(harvestNeeds({ tractor: false, patos: false })).toEqual(['Traktör', 'Patos']);
    expect(harvestNeeds({ tractor: true, patos: false })).toEqual(['Patos']);
    expect(harvestNeeds({ tractor: true, patos: true })).toEqual([]);
    expect(HARVEST.dryHours).toBe(24);
    expect(HARVEST.dryAds).toBe(2);
    expect(harvestOn(newHarvest())).toBe(true);
    expect(harvestOn({ ...newHarvest(), stage: 'idle' })).toBe(false);
    expect(harvestOn(undefined)).toBe(false);
  });

  it('the ads dry it at once, each taking its share of the time off', () => {
    const h = newHarvest();
    h.load = harvestSacks();
    while (spreadSack(h, 0));
    const whole = HARVEST.dryHours * H;
    for (let a = 1; a < HARVEST.dryAds; a++) {
      dryWithAd(h, 0);
      expect(h.until).toBeCloseTo((whole * (HARVEST.dryAds - a)) / HARVEST.dryAds, -3);
      expect(tickHarvest(h, 0)).toBe(false);
    }
    dryWithAd(h, 0);
    expect(tickHarvest(h, 0)).toBe(true);
    expect(h.stage).toBe('thresh');
  });
});

describe('A load of sacks', () => {
  /** Full gas for 2 s from the middle of the lane down to the field, up it (uphill) or down it, with this share of a full load. */
  const run = (load: number, up: boolean) => {
    const s = new Session(LEVELS[0], NO_UPGRADES, 1, undefined, 'home');
    const f = s.field;
    const v = f.vehicle;
    const lane = f.lane;
    const a = lane[Math.floor(lane.length / 2)];
    const b = lane[Math.floor(lane.length / 2) + 3];
    const down = Math.atan2(b.x - a.x, b.z - a.z);
    Object.assign(v, { x: a.x, z: a.z, yaw: up ? down + Math.PI : down, speed: 0, art: 0 });
    s.x = v.x;
    s.z = v.z;
    s.board();
    f.cargoCap = 16;
    f.cargo = Math.round(16 * load);
    const x0 = v.x;
    const z0 = v.z;
    for (let i = 0; i < 60 * 2; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, drive: { throttle: 1, steer: 0 } });
    return Math.hypot(v.x - x0, v.z - z0);
  };
  it('a full load is slower than none, and slower still uphill', () => {
    const empty = run(0, true);
    const full = run(1, true);
    const fullDown = run(1, false);
    expect(full).toBeLessThan(empty * 0.8);
    expect(full).toBeLessThan(fullDown);
  });
});
