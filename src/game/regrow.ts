import { LevelDef } from './config';

/**
 * The grass grows back: a field mown is ready for another job after some hours of real time (bigger
 * fields take longer). A field never mown is ready at once (the story jobs never wait). A rewarded ad
 * grows it back at once.
 */

/** Hours until a mown field has grown back: 2 for the smallest garden up to 8 for the biggest meadow. */
export function regrowHours(lv: LevelDef): number {
  return Math.min(8, 2 + (lv.width * lv.depth) / 220);
}

/** Milliseconds until the field is ready again (0 = ready). `mownAt`: when each field was last mown. */
export function readyIn(lv: LevelDef, mownAt: Record<number, number> | undefined, now: number): number {
  const t = mownAt?.[lv.id];
  if (!t) return 0;
  return Math.max(0, t + regrowHours(lv) * 3600_000 - now);
}

/** "2 sa 15 dk", "40 dk", "1 dk". */
export function formatWait(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(m / 60);
  return h ? `${h} sa ${m % 60} dk` : `${m} dk`;
}
