/** Game tuning and level definitions. All distances in metres, times in seconds. */

/** What kind of place the job is: decides what grows in the field and what stands around it. */
export type Theme = 'findik' | 'yayla' | 'mezarlik' | 'yol';
/** How the grass looks: fresh green, highland meadow full of flowers, dry late summer, dark and shaded. */
export type GrassStyle = 'taze' | 'cayir' | 'kuru' | 'koyu';
export type Weather = 'sunny' | 'rain' | 'fog' | 'evening';

/**
 * What the customer asks for on the phone; met = a tip on top of the pay.
 * no-knock: don't hit the bushes / tea / graves; fast: finish quickly; clean: mow (almost) everything;
 * chickens: don't hit the hens; hose: don't cut the hose; bees: don't get stung.
 */
export type RequestId = 'none' | 'no-knock' | 'fast' | 'clean' | 'chickens' | 'hose' | 'bees';

export interface Client {
  name: string;
  /** Portrait: public/textures/<face>.png (an icon is shown until it exists). */
  face: string;
  /** What they say on the phone. */
  call: string;
  request: RequestId;
  tip: number;
}

export interface LevelDef {
  id: number;
  name: string;
  /** The village (map) it is in: 1 Yeşilyamaç (default), 2 Karadere. */
  region?: number;
  place: string;
  theme: Theme;
  weather: Weather;
  grass: GrassStyle;
  /** Patches of giant weeds (dev ot): much taller and thicker, heavy on the engine. */
  giant?: boolean;
  /** Field size (x = width, z = depth). */
  width: number;
  depth: number;
  /** Hazelnut bushes (ocak) are planted in rows across the slope: distance between rows and between
   * bushes in a row, metres. Graves use them too. */
  rowGap: number;
  plantGap: number;
  /** Bramble (böğürtlen) patches that tangle the line (none in the current levels). */
  brambles?: number;
  /** Number of stones hidden in the grass. */
  stones: number;
  /** Overall slope rise over the field depth, metres (the field climbs towards -z). */
  slope: number;
  /** Amplitude of the rolling bumps. */
  bumps: number;
  /** Payment for a fully mown field, TL. */
  pay: number;
  /** Target time for the speed bonus. */
  parTime: number;
  seed: number;
  /** A stream (dere) runs beside the field on the right; the worker can walk down into it. */
  stream?: boolean;
  hives?: number;
  snakes?: number;
  chickens?: number;
  /** A garden hose lying across the field. */
  hose?: boolean;
  /** Steep banks (şev) across the field where the worker's feet can slip. */
  banks?: number;
  /** How heavy the grass is on the engine (1 = normal); the first gardens are soft. */
  grassLoad?: number;
  /** How hard the work heats the engine (1 = full; the first jobs go easy so it does not overheat there). */
  heat?: number;
  client: Client;
}

const GRANDPA: Client = { name: 'Dedem', face: 'dede', call: 'Torunum, bahçe ot bağladı. Bir biçiver, harçlığını veririm.', request: 'none', tip: 0 };

export const LEVELS: LevelDef[] = [
  { id: 1, name: 'Dedemin Bahçesi', place: 'Yeşilyamaç', theme: 'findik', weather: 'sunny', grass: 'taze', width: 14, depth: 15, rowGap: 6.5, plantGap: 5.6, stones: 3, slope: 0.8, bumps: 0.2, pay: 300, heat: 0.55, parTime: 110, seed: 11, stream: true, grassLoad: 0.7, client: GRANDPA },
  {
    id: 2, name: 'Yamaç Bahçe', place: 'Yeşilyamaç', theme: 'findik', weather: 'sunny', grass: 'taze', width: 16, depth: 18, rowGap: 6.5, plantGap: 5.4, stones: 5, slope: 3.5, bumps: 0.4, pay: 550, heat: 0.7, parTime: 190, seed: 23, stream: true, chickens: 4, banks: 1, grassLoad: 0.85,
    client: { name: 'Hatice Teyze', face: 'teyze', call: 'Oğlum tavuklarım evin önünde geziyor, aman onları ürkütme ha!', request: 'chickens', tip: 120 },
  },
  {
    id: 3, name: 'Dere Kenarı', place: 'Yeşilyamaç', theme: 'findik', weather: 'rain', grass: 'koyu', width: 20, depth: 24, rowGap: 6.5, plantGap: 5.4, stones: 9, slope: 5, bumps: 0.6, pay: 900, heat: 0.85, parTime: 320, seed: 37, stream: true, hose: true, giant: true,
    client: { name: 'Remzi Amca', face: 'remzi', call: 'Komşu inadına hortumunu yine bahçeme sermiş. Kesersen kavga çıkar, dikkat et!', request: 'hose', tip: 180 },
  },
  {
    id: 4, name: 'Tepedeki Bahçe', place: 'Yeşilyamaç', theme: 'findik', weather: 'sunny', grass: 'kuru', width: 26, depth: 32, rowGap: 6.5, plantGap: 5.4, stones: 14, slope: 8.5, bumps: 0.85, pay: 1500, parTime: 560, seed: 53, stream: true, hives: 3, snakes: 2, giant: true, banks: 2,
    client: { name: 'Şükriye Teyze', face: 'sukriye', call: 'Ocaklar bu sene çok verimli, sakın dallarına vurma. Kovanlar da orada, dikkat!', request: 'no-knock', tip: 300 },
  },
  {
    id: 5, name: 'Uzungöl Yaylası', place: 'Yeşilyamaç', theme: 'yayla', weather: 'fog', grass: 'cayir', width: 28, depth: 30, rowGap: 6, plantGap: 6, stones: 12, slope: 4, bumps: 0.8, pay: 1600, parTime: 500, seed: 71, stream: true, snakes: 3,
    client: { name: 'Yayla Muhtarı', face: 'muhtar', call: 'Hayvanlar inmeden çayırı biçmen lazım, akşama yetiştir!', request: 'fast', tip: 250 },
  },
  {
    id: 6, name: 'Köy Camii Avlusu', place: 'Yeşilyamaç', theme: 'mezarlik', weather: 'sunny', grass: 'koyu', width: 26, depth: 24, rowGap: 3, plantGap: 2.2, stones: 7, slope: 2, bumps: 0.2, pay: 1700, parTime: 480, seed: 79,
    client: { name: 'İmam Efendi', face: 'imam', call: 'Cumadan önce avlu ve kabristan temizlensin. Mezar taşlarına dikkat evladım.', request: 'no-knock', tip: 300 },
  },
  {
    id: 7, name: 'Yol Kenarı', place: 'Yeşilyamaç', theme: 'yol', weather: 'sunny', grass: 'kuru', width: 11, depth: 62, rowGap: 8, plantGap: 8, stones: 30, slope: 4, bumps: 0.35, pay: 1800, parTime: 540, seed: 83, giant: true,
    client: { name: 'Belediye', face: 'belediye', call: 'Yol kenarı tertemiz olacak, denetime geliyorlar. Ot kalmasın!', request: 'clean', tip: 260 },
  },
  {
    id: 8, name: 'Kovanlı Yayla', place: 'Yeşilyamaç', theme: 'yayla', weather: 'sunny', grass: 'cayir', width: 32, depth: 34, rowGap: 6, plantGap: 6, stones: 16, slope: 8, bumps: 1, pay: 2000, parTime: 760, seed: 89, stream: true, hives: 6, snakes: 2, banks: 3,
    client: { name: 'Arıcı Kemal', face: 'arici', call: 'Kovanların yanında motoru bağırtma, arılar kızar. Sokulursan karışmam!', request: 'bees', tip: 350 },
  },
  // Karadere, the village beyond: bigger fields, heavier work.
  {
    id: 9, name: 'Değirmen Bahçesi', place: 'Karadere', region: 2, theme: 'findik', weather: 'rain', grass: 'koyu', width: 24, depth: 28, rowGap: 6.5, plantGap: 5.4, stones: 12, slope: 6, bumps: 0.7, pay: 2300, parTime: 430, seed: 101, stream: true, banks: 1, giant: true,
    client: { name: 'Değirmenci Hüseyin', face: 'remzi', call: 'Değirmenin yanındaki bahçe ot içinde kaldı. Yağmur durmuyor ama iş beklemez!', request: 'clean', tip: 300 },
  },
  {
    id: 10, name: 'Köprübaşı', place: 'Karadere', region: 2, theme: 'findik', weather: 'sunny', grass: 'taze', width: 28, depth: 32, rowGap: 6.5, plantGap: 5.4, stones: 14, slope: 5, bumps: 0.6, pay: 2700, parTime: 560, seed: 113, stream: true, chickens: 5, hose: true,
    client: { name: 'Nazife Teyze', face: 'teyze', call: 'Tavuklarım köprünün dibinde gezer, komşunun hortumu da orada. İkisine de dikkat et oğlum.', request: 'chickens', tip: 350 },
  },
  {
    id: 11, name: 'Karadere Mezarlığı', place: 'Karadere', region: 2, theme: 'mezarlik', weather: 'sunny', grass: 'koyu', width: 28, depth: 26, rowGap: 3, plantGap: 2.2, stones: 8, slope: 2, bumps: 0.2, pay: 2500, parTime: 660, seed: 127,
    client: { name: 'Karadere İmamı', face: 'imam', call: 'Bayram geliyor, kabristan tertemiz olmalı. Taşlara dokunma evladım.', request: 'no-knock', tip: 400 },
  },
  {
    id: 12, name: 'Uzun Tarla', place: 'Karadere', region: 2, theme: 'yol', weather: 'fog', grass: 'kuru', width: 12, depth: 70, rowGap: 8, plantGap: 8, stones: 34, slope: 4, bumps: 0.4, pay: 2600, parTime: 600, seed: 131, giant: true,
    client: { name: 'Karadere Muhtarı', face: 'muhtar', call: 'Uzun tarla baştan sona ot doldu. Sis var ama bugün bitmesi lazım!', request: 'fast', tip: 380 },
  },
  {
    id: 13, name: 'Büyük Bahçe', place: 'Karadere', region: 2, theme: 'findik', weather: 'sunny', grass: 'kuru', width: 30, depth: 40, rowGap: 6.5, plantGap: 5.4, stones: 22, slope: 9, bumps: 0.9, pay: 3600, parTime: 900, seed: 149, stream: true, hives: 4, snakes: 3, banks: 2, giant: true,
    client: { name: 'Arıcı Cemal', face: 'arici', call: 'Kardeşim Kemal sana güveniyor, ben de güveniyorum. Bahçe büyük, kovanlar dört tane, yılan da çıkar. Kolay gelsin!', request: 'bees', tip: 500 },
  },
];

/** What the customer's request means, for the HUD chip and the result screen. */
export const REQUEST_TEXT: Record<RequestId, string> = {
  none: '',
  'no-knock': 'Hiçbir şeye vurma',
  fast: 'Çabuk bitir',
  clean: 'Tertemiz biç (%97)',
  chickens: 'Tavuklara dokunma',
  hose: 'Hortumu kesme',
  bees: 'Arılara sokulma',
};

export const THEME_NAME: Record<Theme, string> = { findik: 'Fındık bahçesi', yayla: 'Yayla', mezarlik: 'Cami avlusu', yol: 'Yol kenarı' };
export const WEATHER_NAME: Record<Weather, string> = { sunny: 'Güneşli', rain: 'Yağmurlu', fog: 'Sisli', evening: 'Akşamüstü' };
/** Icon (SVG symbol id in index.html) for each weather. */
export const WEATHER_ICON: Record<Weather, string> = { sunny: 'i-sun', rain: 'i-rain', fog: 'i-fog', evening: 'i-evening' };

/** Grass simulation grid resolution (cells per metre = 1 / CELL). */
export const CELL = 0.125;
/** Spacing of the rendered grass clumps (independent of the simulation grid). */
export const CLUMP = 0.25;
/** Height left after one pass of the line (fraction of full height). */
export const CUT_HEIGHT = 0.12;
/** A cell counts as mown once its height is at or below this. */
export const MOWN_AT = 0.3;
/** Coverage needed to finish a field and the star thresholds. */
export const FINISH_AT = 0.9;
export const STARS_AT = [0.9, 0.95, 0.985] as const;

/** What stands in the field: hazelnut ocak, a gravestone, a boulder. */
export type BushKind = 'ocak' | 'mezar' | 'kaya';

/**
 * Per kind: bare radius (no grass), line hit radius, player block radius, pay deduction per knock and
 * whether it is stone (the line hits it like a stone: sparks, more wear).
 */
export const BUSH_KINDS: Record<BushKind, { trunk: number; hit: number; block: number; penalty: number; hard: boolean }> = {
  ocak: { trunk: 0.4, hit: 0.28, block: 1, penalty: 5, hard: false },
  mezar: { trunk: 0.42, hit: 0.26, block: 0.5, penalty: 8, hard: true },
  kaya: { trunk: 0.75, hit: 0.6, block: 0.8, penalty: 0, hard: true },
};

export const BUSH = {
  /** No grass grows within this radius of the bush centre (bare soil round the stems). */
  trunk: 0.4,
  /** The line touching within this radius of the centre knocks the stems. */
  hit: 0.28,
  /** Player collision radius around the bush centre. */
  block: 1,
  /** Minimum distance between bush centres. */
  spacing: 4,
};

/** Bramble patches (böğürtlen): thorny canes that wrap round the spinning line. */
export const BRAMBLE = {
  /** Patch radius range, metres. */
  rMin: 0.55,
  rMax: 0.95,
  /** Line contact time (s, at full rpm) to cut a patch down. */
  toughness: 2.2,
  /** Tangle gained per second of contact at full rpm; at 1 the line is wrapped and the head stops. */
  tangleRate: 0.42,
  /** Holding the clear button this long (engine off) unwraps the line. */
  clearTime: 1.6,
  /** Walking speed inside a patch. */
  slow: 0.45,
  /** Bonus per cleared patch, TL. */
  bonus: 20,
};

/** Beehives: the trimmer revving close by makes the bees angry; then they swarm the worker. */
export const HIVE = {
  /** Head within this of a hive with the engine revving builds anger. */
  near: 3,
  /** Anger per second at full rpm right next to it; lost per second otherwise. */
  angerRate: 0.3,
  calm: 0.15,
  /** After a swarm the hive stays quiet this long. */
  rest: 45,
  /** A swarm stings at most this many times, then goes home. */
  maxStings: 3,
  /** How long a swarm chases, and how fast. */
  swarmTime: 9,
  swarmSpeed: 2.4,
  /** A sting when the swarm is this close, at most one per `stingEvery` seconds. */
  stingAt: 0.9,
  stingEvery: 1.3,
  stingPenalty: 10,
  /** Player block radius. */
  block: 0.55,
};

/** Snakes hide in tall grass; they bolt when the head or the worker comes close and give him a fright. */
export const SNAKE = { notice: 1.7, speed: 1.7, flee: 4, scare: 0.9 };

/** Hens wander round the field and run from the line. */
export const HEN = { walk: 0.35, run: 2.6, panic: 2.2, hit: 0.28, penalty: 50 };

/** The garden hose: the head passing right over it cuts it. No grass grows under it. */
export const HOSE = { bare: 0.32, cutAt: 0.13, penalty: 80 };

/**
 * Steep ground: past `slipFrom` (rise per metre) the feet start to slide downhill, more when walking
 * fast and on wet grass; sliding faster than `fallAt` (m/s) and the worker falls. `slideAccel` turns
 * the slip into a slide speed (m/s); `slideDecay` is how fast it dies away (1/s).
 */
export const SLOPE = { slipFrom: 0.42, slideAccel: 3.2, slideDecay: 3.5, fallAt: 1.15, fallTime: 2.2, wet: 1.5, bankRise: 1.25, bankWidth: 0.42 };

/**
 * The pat pat: an articulated pair, the head (kafa: engine and two drive wheels) turning about the
 * hitch pin in front of the cargo trailer (kasa). The trailer's centre is the vehicle's position.
 * Top speed forward / reverse (m/s), acceleration and braking (m/s²); the steering wheel turns the
 * head up to `maxArt` (rad) at `artRate` (rad/s). Distances (m): the pin ahead of the trailer centre,
 * the trailer axle behind it, the head's axle ahead of the pin and its nose ahead of the axle; half
 * tracks of the head and the trailer, and of the ruts they wear in the lane; the seat ahead of the
 * trailer centre. Driving over grass flattens it to `crushTo` (not mown).
 */
export const PATPAT = {
  forward: 4.2, reverse: 1.5, accel: 1.8, brake: 4.5, maxArt: 0.7, artRate: 1.3,
  joint: 1.26, rearAxle: 0.65, headAxle: 0.36, headFront: 0.46,
  headTrack: 0.58, kasaTrack: 0.74, track: 0.66, seat: 0.38, crushTo: 0.5,
};

/** Rain: wet grass is heavier to cut. */
export const WET_LOAD = 1.35;

/** A stone hit at high rpm can snap the line off even when it is long (chance per hit). */
export const STONE_SNAP = 0.18;

export const PLAYER = {
  radius: 0.3,
  walkSpeed: 3,
  /** Walking speed multiplier while the throttle is held (careful work). */
  workSpeed: 0.8,
  turnRate: 7,
  /** How far forward the trimmer head is from the player. */
  reach: 1.4,
  /** The machine hangs on the right hip, so the head works a little to the right of centre. */
  headSide: 0.22,
  /** Largest swing of the head to either side, radians (the player steers it). */
  sweepMax: 0.95,
  /** How fast the worker can swing the head, rad/s. */
  sweepRate: 4.2,
  /** First-person turning speed at full stick, rad/s. */
  turnSpeed: 2.2,
};

/** Engine temperature model: 0 = cold, ~0.3 = normal running, >= 1 = overheats and stalls. */
export const ENGINE = {
  idleTemp: 0.3,
  /**
   * Extra temperature at full throttle without / with full cutting load: held flat out it overheats
   * even in light grass in about a minute and a quarter (sooner in heavy grass), so let it idle now and then.
   */
  revTemp: 1.0,
  loadTemp: 0.32,
  /** Approach rates (1/s) towards the target temperature. */
  heatK: 0.016,
  coolRunK: 0.04,
  coolOffK: 0.03,
  /** Below this the engine is cold: needs the choke to start and gives limited power at first. */
  warm: 0.12,
  /** Power is limited until the engine has warmed up to this. */
  warmedUp: 0.08,
  hotWarn: 0.85,
  /** After overheating it can be restarted once it has cooled to this. */
  restart: 0.6,
  /** Grass cells per second the engine cuts comfortably at full throttle (scales with throttle^1.5). */
  fullLoad: 160,
  /** Overload above this (load / capacity) drags the rpm down and builds strain. */
  strainFrom: 1,
  /** Strain gained per second per unit of overload, lost per second when under capacity. */
  strainGain: 0.85,
  strainLoss: 0.7,
  /** Warn at this strain; stall (bogged down) at 1. */
  strainWarn: 0.35,
};

export const TRIMMER = {
  /** Fuel use per second at idle / full throttle, litres. */
  idleUse: 0.0006,
  fullUse: 0.0035,
  /** Line length (cm) after a bump-feed; the guard knife trims anything longer. */
  lineMax: 16,
  lineMin: 3,
  /** Line pulled out per bump-feed tap, cm. */
  bump: 4,
  /** Below this the line has gone back inside the head: it must be re-threaded with the engine off. */
  brokenAt: 1,
  /** Holding the re-thread button this long fits new line. */
  rethreadTime: 2.5,
  /** Spool used by a re-thread, metres. */
  rethreadUse: 0.25,
  /** Line lost per cell cut (wear) and per hit. */
  wearPerCell: 0.002,
  stoneHit: 3.5,
  trunkHit: 2.5,
  /** Cutting radius (m) = base + line cm * perCm. */
  radiusBase: 0.15,
  radiusPerCm: 0.022,
  /** Throttle spin-up / spin-down speed per second. */
  spinUp: 3.5,
  spinDown: 2.2,
  /** Minimum throttle at which the line cuts. */
  cutThrottle: 0.45,
};

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  /** Price of each next level; length = max level. */
  prices: number[];
}

export type UpgradeId = 'tank' | 'line' | 'head' | 'motor' | 'boots';

export const UPGRADES: UpgradeDef[] = [
  { id: 'tank', name: 'Büyük Depo', desc: 'Daha çok benzin, daha az depo dönüşü', prices: [300, 700, 1400] },
  { id: 'line', name: 'Kalın Misina', desc: 'Taşa, ocağa çarpınca daha az kopar', prices: [250, 600, 1200] },
  { id: 'head', name: 'Geniş Kafa', desc: 'Daha uzun misina, daha geniş biçme', prices: [400, 900, 1800] },
  { id: 'motor', name: 'Güçlü Motor', desc: 'Daha hızlı savurma ve yürüyüş', prices: [500, 1100, 2200] },
  { id: 'boots', name: 'Çivili Lastik Çizme', desc: 'Yokuşta daha az yavaşlarsın', prices: [200, 500] },
];

export type Upgrades = Record<UpgradeId, number>;

export const NO_UPGRADES: Upgrades = { tank: 0, line: 0, head: 0, motor: 0, boots: 0 };

export type MachineId = 'standart' | 'usta' | 'sirt';
export type LineTypeId = 'yuvarlak' | 'kare' | 'burgulu';
export type ExtraId = 'kulaklik' | 'siperlik';

export interface EquipDef<T extends string> {
  id: T;
  name: string;
  desc: string;
  price: number;
}

/** Brush cutters: more power and better cooling, at the cost of fuel. */
export const MACHINES: (EquipDef<MachineId> & { power: number; fuel: number; cooling: number; walk: number })[] = [
  { id: 'standart', name: 'Emektar 33cc', desc: 'Dededen kalma, idare eder', price: 0, power: 1, fuel: 1, cooling: 0, walk: 1 },
  { id: 'usta', name: 'Usta 43cc', desc: 'Sık otta az zorlanır, biraz fazla yakar', price: 1500, power: 1.3, fuel: 1.2, cooling: 0.04, walk: 1 },
  { id: 'sirt', name: 'Sırt Motoru 52cc', desc: 'Motor sırtta: en güçlüsü, adım hafif, iyi soğur', price: 3800, power: 1.6, fuel: 1.35, cooling: 0.08, walk: 1.08 },
];

/** Line types: cutting effort against wear. */
export const LINE_TYPES: (EquipDef<LineTypeId> & { load: number; wear: number })[] = [
  { id: 'yuvarlak', name: 'Yuvarlak Misina', desc: 'Standart, dengeli', price: 0, load: 1, wear: 1 },
  { id: 'kare', name: 'Köşeli Misina', desc: 'Sert otu kolay keser, çabuk aşınır', price: 400, load: 0.82, wear: 1.35 },
  { id: 'burgulu', name: 'Burgulu Misina', desc: 'Dayanıklı, kesişi normal', price: 650, load: 0.95, wear: 0.65 },
];

export const EXTRAS: EquipDef<ExtraId>[] = [
  { id: 'kulaklik', name: 'Kulaklık', desc: 'Motor sesi kısılır, kuşları ve dereyi duyarsın', price: 300 },
  { id: 'siperlik', name: 'Pro Siperlik', desc: 'Ot sıçraması yarı yarıya az kirletir', price: 550 },
];

export interface Equipment {
  machine: MachineId;
  lineType: LineTypeId;
  /** Ids of everything bought (machines, line types, extras). */
  owned: string[];
  /** Extras bought but taken off (kept: put back on any time). */
  off?: string[];
}

export const DEFAULT_EQUIPMENT: Equipment = { machine: 'standart', lineType: 'yuvarlak', owned: ['standart', 'yuvarlak'] };

/** Equipment stats after upgrades and the chosen machine and line. */
export function gearStats(u: Upgrades, e: Equipment = DEFAULT_EQUIPMENT) {
  const m = MACHINES.find((x) => x.id === e.machine) ?? MACHINES[0];
  const l = LINE_TYPES.find((x) => x.id === e.lineType) ?? LINE_TYPES[0];
  return {
    /** Engine capacity multiplier, and how hard the line shape makes cutting. */
    power: m.power,
    lineLoad: l.load,
    fuelUse: m.fuel,
    backpack: e.machine === 'sirt',
    earmuffs: e.owned.includes('kulaklik') && !e.off?.includes('kulaklik'),
    proVisor: e.owned.includes('siperlik') && !e.off?.includes('siperlik'),
    tank: 1 + u.tank * 0.4,
    /** Multiplier on line wear and hit loss. */
    lineToughness: l.wear / (1 + u.line * 0.45),
    lineMax: TRIMMER.lineMax + u.head * 3,
    sweepRate: PLAYER.sweepRate * (1 + u.motor * 0.12),
    /** Lower peak temperature with a better engine. */
    cooling: u.motor * 0.05 + m.cooling,
    walk: PLAYER.walkSpeed * (1 + u.motor * 0.06) * m.walk,
    slopeGrip: 1 - u.boots * 0.3,
    /** Spare line on the spool, metres. */
    spool: 1.2,
  };
}

/** Price of a full spool refill and a litre of fuel at the depot. */
export const PRICES = { spool: 60, fuelPerLitre: 45 };
/** Pay deduction for each knock on a bush's stems. */
export const BUSH_PENALTY = 5;

/** Daily reward by day of the streak (the last one repeats). */
export const DAILY = [100, 150, 200, 250, 300, 400, 600];

/**
 * Vehicles to drive to the jobs: bought once, then picked. `soon`: in the shop to look forward to,
 * not for sale yet (its 3D model is still being made).
 */
export const VEHICLES: { id: string; name: string; desc: string; price: number; soon?: boolean }[] = [
  { id: 'patpat', name: 'Patpat', desc: 'Köyün emektarı. Belinden kırma, her yola girer.', price: 0 },
  { id: 'traktor', name: 'Traktör', desc: 'Daha hızlı, yokuşta daha güçlü. Uzak tarlalara çabuk gidersin.', price: 30000, soon: true },
];

/** The village made nicer: paints for the pat pat (one at a time) and things for the yard (all bought stay). */
export const PAINTS: { id: string; name: string; price: number; hue: number | null }[] = [
  { id: 'mavi', name: 'Mavi (fabrika)', price: 0, hue: null },
  { id: 'kirmizi', name: 'Kırmızı boya', price: 2000, hue: 0.0 },
  { id: 'yesil', name: 'Yeşil boya', price: 2000, hue: 0.33 },
  { id: 'sari', name: 'Sarı boya', price: 2500, hue: 0.13 },
];
export const DECOR: { id: string; name: string; desc: string; price: number }[] = [
  { id: 'saksi', name: 'Saksı Çiçekleri', desc: 'Evin önüne rengârenk saksılar.', price: 1500 },
  { id: 'cardak', name: 'Çardak', desc: 'Harmanın kenarına gölgelik, altında bank.', price: 4000 },
  { id: 'kulube', name: 'Köpek Kulübesi', desc: 'Avlunun bekçisine bir yuva.', price: 3000 },
  { id: 'camasir', name: 'Çamaşır İpi', desc: 'Rüzgârda sallanan çamaşırlar.', price: 800 },
];
