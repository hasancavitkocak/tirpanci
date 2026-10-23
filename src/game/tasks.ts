import { makeRng } from './rng';
import type { Result } from './session';

/**
 * Günlük görevler: three small tasks a day (the same for everyone that day), each paying a little
 * when done, and a bonus for doing all three. Progress comes from the jobs finished that day.
 */

export interface TaskDef {
  id: string;
  /** What to do, for the list. */
  text: string;
  /** How much of it (jobs, TL, ...). */
  goal: number;
  reward: number;
}

/** What a finished job tells the tasks. */
export interface JobDone {
  result: Result;
  /** A coffee-house job. */
  ilan: boolean;
  parTime: number;
  /** The engine overheated during it. */
  overheated: boolean;
}

const POOL: (TaskDef & { count: (j: JobDone) => number })[] = [
  { id: 'jobs', text: '2 iş bitir', goal: 2, reward: 400, count: () => 1 },
  { id: 'noknock', text: 'Hiç darbe almadan bir iş bitir', goal: 1, reward: 600, count: (j) => (j.result.knocks === 0 ? 1 : 0) },
  { id: 'stars3', text: 'Bir işi 3 yıldızla bitir', goal: 1, reward: 600, count: (j) => (j.result.stars >= 3 ? 1 : 0) },
  { id: 'ilan', text: 'Bir ilan işi yap', goal: 1, reward: 500, count: (j) => (j.ilan ? 1 : 0) },
  { id: 'fast', text: 'Bir işi hedef süreden önce bitir', goal: 1, reward: 500, count: (j) => (j.result.time <= j.parTime ? 1 : 0) },
  { id: 'earn', text: 'Bugün 2.000 TL kazan', goal: 2000, reward: 400, count: (j) => j.result.total },
  { id: 'cool', text: 'Motoru hararet yaptırmadan bir iş bitir', goal: 1, reward: 400, count: (j) => (j.overheated ? 0 : 1) },
  { id: 'tip', text: 'Bir müşterinin isteğini yerine getir', goal: 1, reward: 400, count: (j) => (j.result.tip > 0 ? 1 : 0) },
];

/** Paid on top when all three of the day's tasks are done. */
export const ALL_DONE_BONUS = 1500;

/** The day's three tasks (picked by the date, so the same all day). */
export function dayTasks(day: string): TaskDef[] {
  let seed = 7;
  for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const rnd = makeRng(seed);
  const pool = [...POOL];
  const out: TaskDef[] = [];
  while (out.length < 3) {
    const t = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    out.push({ id: t.id, text: t.text, goal: t.goal, reward: t.reward });
  }
  return out;
}

/** How far a finished job takes a task. */
export function taskCount(id: string, job: JobDone): number {
  return POOL.find((t) => t.id === id)?.count(job) ?? 0;
}
