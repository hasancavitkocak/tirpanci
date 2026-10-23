import { LevelDef } from './config';

/**
 * Seasonal events: for a stretch of the year some jobs pay more (the hazelnut harvest, the move up to
 * the highland meadows, the clean-up before the feasts). Dates are local; the feasts move each year,
 * so theirs are listed per year.
 */
export interface GameEvent {
  id: string;
  name: string;
  /** One line for the menu banner. */
  text: string;
  /** From and to, inclusive: "MM-DD" every year, or "YYYY-MM-DD" for one year only. */
  from: string;
  to: string;
  /** Pay multiplier for a job (1 = not touched). */
  mult: (lv: LevelDef) => number;
}

const feast = (id: string, name: string, from: string, to: string): GameEvent => ({
  id,
  name,
  text: 'Cami avlusu ve mezarlık işleri 2 kat ücret',
  from,
  to,
  mult: (lv) => (lv.theme === 'mezarlik' ? 2 : 1),
});

export const EVENTS: GameEvent[] = [
  { id: 'bahar', name: 'Bahar Temizliği', text: 'Otlar coştu: bütün işler %20 fazla ücret', from: '04-15', to: '05-15', mult: () => 1.2 },
  { id: 'yayla', name: 'Yayla Göçü', text: 'Yayla çayırları 1,5 kat ücret', from: '06-15', to: '07-15', mult: (lv) => (lv.theme === 'yayla' ? 1.5 : 1) },
  { id: 'hasat', name: 'Fındık Hasadı', text: 'Hasat öncesi ocak dipleri temizlenmeli: fındık bahçeleri 1,5 kat ücret', from: '08-01', to: '09-15', mult: (lv) => (lv.theme === 'findik' ? 1.5 : 1) },
  feast('ramazan-2027', 'Ramazan Bayramı Öncesi', '2027-03-02', '2027-03-11'),
  feast('kurban-2027', 'Kurban Bayramı Öncesi', '2027-05-09', '2027-05-19'),
  feast('ramazan-2028', 'Ramazan Bayramı Öncesi', '2028-02-19', '2028-02-28'),
  feast('kurban-2028', 'Kurban Bayramı Öncesi', '2028-04-28', '2028-05-08'),
];

/** The events on at a date. */
export function activeEvents(date: Date): GameEvent[] {
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const ymd = `${date.getFullYear()}-${md}`;
  return EVENTS.filter((e) => (e.from.length === 5 ? md >= e.from && md <= e.to : ymd >= e.from && ymd <= e.to));
}

/** A job's pay with the events on at a date (rounded to ten). */
export function eventPay(lv: LevelDef, date: Date): number {
  const k = activeEvents(date).reduce((m, e) => m * e.mult(lv), 1);
  return k === 1 ? lv.pay : Math.round((lv.pay * k) / 10) * 10;
}
