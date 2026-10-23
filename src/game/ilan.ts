import { GrassStyle, LevelDef, RequestId, Weather } from './config';
import { makeRng } from './rng';
import { Slot } from './village';

/**
 * Köy kahvesi ilanları: odd jobs in the neighbours' gardens, posted on the coffee-house board. Each is
 * made from a seed: whose garden, the weather, the grass, the stones and weeds, what they ask for and
 * what they pay (by the size of the garden and how heavy the work is). One garden at a time takes one
 * job. The board is new every day: yesterday's jobs not taken are gone, and a garden whose job was done
 * gets its next one the next day (or now, for a rewarded ad).
 */

const OWNERS: { name: string; garden: string; meadow: string; face: string }[] = [
  { name: 'Hasan Amca', garden: "Hasan Amca'nın Bahçesi", meadow: "Hasan Amca'nın Çayırı", face: 'dede' },
  { name: 'Fadime Teyze', garden: "Fadime Teyze'nin Bahçesi", meadow: "Fadime Teyze'nin Çayırı", face: 'teyze' },
  { name: 'Rıza Dayı', garden: "Rıza Dayı'nın Bahçesi", meadow: "Rıza Dayı'nın Çayırı", face: 'remzi' },
  { name: 'Hatçe Abla', garden: "Hatçe Abla'nın Bahçesi", meadow: "Hatçe Abla'nın Çayırı", face: 'sukriye' },
  { name: 'Osman Ağa', garden: "Osman Ağa'nın Bahçesi", meadow: "Osman Ağa'nın Çayırı", face: 'muhtar' },
  { name: 'Cemile Teyze', garden: "Cemile Teyze'nin Bahçesi", meadow: "Cemile Teyze'nin Çayırı", face: 'teyze' },
  { name: 'İsmail Usta', garden: "İsmail Usta'nın Bahçesi", meadow: "İsmail Usta'nın Çayırı", face: 'arici' },
];

const CALLS = [
  'Kahvede ilanını gördüm. Bahçe ot bağladı, bir el atıver.',
  'Oğlum gurbette, bahçeye bakan yok. Sen bir biçiver, hakkını veririm.',
  'Ot dize çıktı, fındık toplarken ayak basacak yer kalmadı.',
  'Komşular söylendi, otlar onların bahçesine taşıyor. Bugün halledelim.',
  'Hasat yaklaşıyor, ocak dipleri temiz olsun.',
];

const REQUESTS: { id: RequestId; tip: number }[] = [
  { id: 'none', tip: 0 },
  { id: 'none', tip: 0 },
  { id: 'no-knock', tip: 150 },
  { id: 'fast', tip: 120 },
  { id: 'clean', tip: 140 },
];

/** The job posted in a neighbour's garden for a seed. */
export function makeIlan(slot: Slot, seed: number, place: string, region: number): LevelDef {
  const rnd = makeRng(seed);
  const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const owner = pick(OWNERS);
  const meadow = slot.theme === 'yayla';
  const weatherRoll = rnd();
  const weather: Weather = weatherRoll < 0.6 ? 'sunny' : weatherRoll < 0.85 ? 'rain' : 'fog';
  const grass: GrassStyle = meadow ? 'cayir' : pick(['taze', 'koyu', 'kuru'] as GrassStyle[]);
  const giant = rnd() < 0.3;
  const area = slot.w * slot.d;
  const req = pick(REQUESTS);
  // Pay by the size and how heavy it is (giant weeds, wet grass); rounded to ten.
  const heavy = 1 + (giant ? 0.3 : 0) + (weather === 'rain' ? 0.2 : 0);
  const pay = Math.round((area * 1.25 * heavy) / 10) * 10;
  return {
    id: slot.id,
    name: meadow ? owner.meadow : owner.garden,
    place,
    region,
    theme: slot.theme,
    weather,
    grass,
    giant,
    width: slot.w,
    depth: slot.d,
    rowGap: 6.5,
    plantGap: 5.4 + rnd() * 0.6,
    stones: Math.round(3 + area / 60 + rnd() * 4),
    slope: 0,
    bumps: 0.3 + rnd() * 0.5,
    banks: rnd() < 0.3 ? 1 : 0,
    snakes: meadow && rnd() < 0.6 ? 1 + Math.floor(rnd() * 2) : 0,
    pay,
    parTime: Math.round(area * 0.6 * (giant ? 1.2 : 1)),
    seed,
    client: { name: owner.name, face: owner.face, call: pick(CALLS), request: req.id, tip: req.tip },
  };
}
