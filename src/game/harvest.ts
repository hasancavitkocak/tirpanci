/**
 * The hazelnut harvest (Fındık Harmanı) in Yeşilyamaç once its gardens are done, started by the player
 * from the job list (it needs the tractor and the patos; Serbest gez never starts it):
 *
 * 1. collect: white sacks of hazelnuts in their husks wait at the gates of the gardens across the stream
 *    (HARVEST.gardens). They are loaded on the pat pat or the tractor's trailer (by itself, a sack at a
 *    time), the load making the vehicle heavy (Field.cargo), and brought to the harman by the house.
 * 2. spread: emptied and spread on the harman; when every sack is there the nuts dry in the sun.
 * 3. drying: the fresh nuts cannot go into the patos wet: HARVEST.dryHours, real time (as the grass
 *    growing back), or HARVEST.dryAds rewarded ads.
 * 4. thresh: the patos (bought in the shop, towed only by the tractor) by the harman, its drum turned by
 *    the tractor; its hose sucks the nuts up off the harman, the clean nuts pour onto a blue tarp beside
 *    it and the husks fly out. (Without a patos the dried nuts wait on the harman.)
 * 5. beans: the clean nuts dry on the tarp, as long again (or three ads).
 * 6. sell: the merchant comes; the nuts sold by the kilo.
 * 7. rest: the next harvest can be started HARVEST.everyDays later (idle until then).
 */

export type HarvestStage = 'idle' | 'collect' | 'drying' | 'thresh' | 'beans' | 'sell' | 'rest';

export const HARVEST = {
  /** The gardens the sacks come from (Dere Yanı, Değirmen Önü) and how many from each. */
  gardens: [9, 10],
  /**
   * Where each lot of sacks waits when a harvest has not picked its own (HarvestState.piles): by the track
   * from the bridge to the two gardens, north of it, well away from their gates.
   */
  piles: { 9: { x: -90, z: -159, yaw: -Math.PI / 2, side: -1 }, 10: { x: -83, z: -159, yaw: -Math.PI / 2, side: -1 } } as Record<number, PilePlace>,
  sacksPer: 8,
  /** How many sacks ride on each (the tractor carries them in its trailer only). */
  capacity: { patpat: 16, trailer: 16 } as const,
  /** Real hours the nuts take to dry, in their husks on the harman and clean on the tarp (a day). */
  dryHours: 24,
  /** Rewarded ads that dry them at once (each takes its share of the time left off). */
  dryAds: 2,
  /** Clean nuts a sack gives (kg), and the merchant's price (TL a kilo). */
  kgPerSack: 25,
  pricePerKg: 22,
  /** Days between harvests. */
  everyDays: 2,
  /** The harman's nuts in cells (a grid over its round floor) the hose sucks up one by one. */
  cells: 48,
  /** The patos in the shop. */
  patosPrice: 45000,
};

/**
 * Where a lot of sacks waits (village coordinates): a point on a track (the vehicle's bed is brought
 * there), the track's heading, and the side of it the pile stands on (+1 right, -1 left, looking along).
 */
export interface PilePlace {
  x: number;
  z: number;
  yaw: number;
  side: number;
}

/** The harvest's state, kept in the save. */
export interface HarvestState {
  stage: HarvestStage;
  /** Sacks still waiting at each garden's gate (by job id). */
  waiting: Record<number, number>;
  /** Sacks on the vehicle now. */
  load: number;
  /** Sacks emptied and spread on the harman. */
  spread: number;
  /** When the drying (or the rest) is over, ms since 1970; and how many ads have been watched for it. */
  until?: number;
  ads?: number;
  /** The harman's cells already sucked up by the patos (their indices). */
  sucked?: number[];
  /** The next harvest's start (in the rest). */
  next?: number;
  /** Started by the player (earlier versions put one out by themselves). */
  started?: boolean;
  /** Where this harvest's sacks wait (chosen afresh for each harvest, by the village's tracks). */
  piles?: Record<number, PilePlace>;
}

const HOUR = 3600_000;

/** A new harvest (started by the player): the sacks at the gardens' gates. */
export function newHarvest(): HarvestState {
  return { stage: 'collect', waiting: Object.fromEntries(HARVEST.gardens.map((g) => [g, HARVEST.sacksPer])), load: 0, spread: 0, started: true };
}

/** All the sacks of a harvest. */
export const harvestSacks = (): number => HARVEST.gardens.length * HARVEST.sacksPer;

/** How many sacks a vehicle carries: the pat pat; the tractor only with its trailer. */
export function capacityOf(tractor: boolean, trailer: boolean): number {
  return tractor ? (trailer ? HARVEST.capacity.trailer : 0) : HARVEST.capacity.patpat;
}

/** Time passing: the drying done, the rest over (a new harvest can be started). Returns true when the stage changed. */
export function tickHarvest(h: HarvestState, now: number): boolean {
  if ((h.stage === 'drying' || h.stage === 'beans' || h.stage === 'rest') && (h.until ?? h.next ?? 0) <= now) {
    if (h.stage === 'rest') Object.assign(h, { stage: 'idle' as const, waiting: {}, until: undefined, ads: undefined, sucked: undefined, next: undefined });
    else {
      h.stage = h.stage === 'drying' ? 'thresh' : 'sell';
      h.until = undefined;
      h.ads = undefined;
    }
    return true;
  }
  return false;
}

/** Load a sack from a garden's gate onto the vehicle (one a call). False when there is none or no room. */
export function loadSack(h: HarvestState, garden: number, capacity: number): boolean {
  if (h.stage !== 'collect' || (h.waiting[garden] ?? 0) <= 0 || h.load >= capacity) return false;
  h.waiting[garden]--;
  h.load++;
  return true;
}

/** Empty a sack off the vehicle and spread it on the harman; the last one starts the drying. */
export function spreadSack(h: HarvestState, now: number): boolean {
  if (h.stage !== 'collect' || h.load <= 0) return false;
  h.load--;
  h.spread++;
  if (h.spread >= harvestSacks()) startDrying(h, now, 'drying');
  return true;
}

function startDrying(h: HarvestState, now: number, stage: 'drying' | 'beans'): void {
  h.stage = stage;
  h.until = now + HARVEST.dryHours * HOUR;
  h.ads = 0;
}

/** A rewarded ad watched while drying: its share of the time left off (the last one dries it). */
export function dryWithAd(h: HarvestState, now: number): void {
  if (h.stage !== 'drying' && h.stage !== 'beans') return;
  h.ads = (h.ads ?? 0) + 1;
  const left = Math.max(0, (h.until ?? now) - now);
  h.until = h.ads >= HARVEST.dryAds ? now : now + left * (1 - 1 / (HARVEST.dryAds - h.ads + 1));
}

/** How far the patos has got (0..1). */
export function threshed(h: HarvestState): number {
  return (h.sucked?.length ?? 0) / HARVEST.cells;
}

/** The hose sucks up a cell of the harman; the last one starts the clean nuts drying. */
export function suckCell(h: HarvestState, cell: number, now: number): boolean {
  if (h.stage !== 'thresh' || cell < 0 || cell >= HARVEST.cells) return false;
  const s = (h.sucked ??= []);
  if (s.includes(cell)) return false;
  s.push(cell);
  if (s.length >= HARVEST.cells) startDrying(h, now, 'beans');
  return true;
}

/** Clean nuts on the tarp (kg), as far as the patos has got. */
export function beansKg(h: HarvestState): number {
  const all = harvestSacks() * HARVEST.kgPerSack;
  if (h.stage === 'beans' || h.stage === 'sell') return all;
  if (h.stage === 'thresh') return Math.round(all * threshed(h));
  return 0;
}

/** The merchant buys the nuts: the money, and the next harvest set for later. */
export function sellNuts(h: HarvestState, now: number): number {
  if (h.stage !== 'sell') return 0;
  const pay = beansKg(h) * HARVEST.pricePerKg;
  Object.assign(h, { stage: 'rest' as const, waiting: {}, load: 0, spread: 0, until: undefined, ads: undefined, sucked: undefined, next: now + HARVEST.everyDays * 24 * HOUR });
  return pay;
}

/** What the harvest needs that the player has not got (empty: it can be started). */
export function harvestNeeds(has: { patos: boolean; tractor: boolean }): string[] {
  const out: string[] = [];
  if (!has.tractor) out.push('Traktör');
  if (!has.patos) out.push('Patos');
  return out;
}

/** A harvest under way (sacks out, nuts on the harman or the tarp): not idle, not resting. */
export const harvestOn = (h: HarvestState | null | undefined): boolean => !!h && h.stage !== 'idle' && h.stage !== 'rest';

/** What to do now, in a line (for the job list's card and the toasts when a stage ends). */
export function harvestHint(h: HarvestState, now: number, has: { patos: boolean; tractor: boolean }): string {
  const left = (t?: number) => {
    const m = Math.max(0, Math.round(((t ?? now) - now) / 60000));
    return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`;
  };
  const waiting = Object.values(h.waiting).reduce((a, b) => a + b, 0);
  switch (h.stage) {
    case 'collect':
      if (h.load > 0) return `Harmana götür: kasayı sarı BOŞALTMA alanına getir, araçtan in, boşalt (${h.load} çuval araçta)`;
      return waiting ? `Harmanda ${h.spread}/${harvestSacks()} çuval. Kalan ${waiting} çuval yol kenarında: hepsi serilince yaş fındık kurumaya başlar` : 'Çuvalları harmana ser';
    case 'drying':
      return `Yaş fındık harmanda kuruyor: ${left(h.until)}. Kurumadan patosa verilmez`;
    case 'thresh':
      if (!has.tractor) return 'Fındık kurudu. Patos için önce traktör lazım (Dükkân)';
      if (!has.patos) return 'Fındık kurudu. Patos lazım (Dükkân, sadece traktöre takılır)';
      return `Fındık kurudu: patosu sarı PATOS alanına geri geri park et, çalıştır, hortumla yığını çek (%${Math.round(threshed(h) * 100)})`;
    case 'beans':
      return `Tane fındık brandada kuruyor: ${left(h.until)}`;
    case 'sell':
      return `Tüccar geldi: ${beansKg(h)} kg fındığı sat`;
    case 'rest':
      return `Yeni hasat ${left(h.next)} sonra`;
    case 'idle':
      return 'Yeni hasat hazır: HASADI BAŞLAT';
  }
}
