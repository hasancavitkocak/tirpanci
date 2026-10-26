import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { StatusBar } from '@capacitor/status-bar';
import { DEFAULT_EQUIPMENT, Equipment, NO_UPGRADES, Upgrades } from '../game/config';

export const isNative = Capacitor.isNativePlatform();

export interface LifecycleHandlers {
  onBackground: () => void;
  onForeground: () => void;
  /** Return true if the back press was handled; false lets the app exit. */
  onBack: () => boolean;
}

/** Wire up native-only behaviour: fullscreen, lifecycle pause, Android back button. */
export async function initPlatform(h: LifecycleHandlers): Promise<void> {
  document.addEventListener('visibilitychange', () => (document.hidden ? h.onBackground() : h.onForeground()));
  if (!isNative) return;
  try {
    await StatusBar.hide();
  } catch {
    /* not supported on this platform */
  }
  await App.addListener('appStateChange', ({ isActive }) => (isActive ? h.onForeground() : h.onBackground()));
  await App.addListener('backButton', () => {
    if (!h.onBack()) void App.exitApp();
  });
}

let vibrationOn = true;

export function setVibration(on: boolean): void {
  vibrationOn = on;
}

export function haptic(strength: 'light' | 'medium' | 'heavy'): void {
  if (!vibrationOn) return;
  if (!isNative) {
    navigator.vibrate?.(strength === 'heavy' ? 50 : strength === 'medium' ? 25 : 10);
    return;
  }
  const style = strength === 'heavy' ? ImpactStyle.Heavy : strength === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
  void Haptics.impact({ style }).catch(() => {});
}

export interface SaveData {
  version: 1;
  money: number;
  unlocked: number;
  /** Each job's best: stars, coverage, pay, and its fastest time (seconds). */
  best: Record<number, { stars: number; coverage: number; pay: number; time?: number }>;
  upgrades: Upgrades;
  sfxVolume: number;
  vibration: boolean;
  tutorialSeen: boolean;
  /** The player has looked round by dragging (the hint for it is not shown again). */
  lookSeen?: boolean;
  /** The first job, started at home (take the trimmer, fit line), has been played. */
  introDone?: boolean;
  /** Fixed graphics quality; unset = automatic. */
  quality?: 'low' | 'medium' | 'high';
  toggleThrottle?: boolean;
  /** Playing camera: first person (default) or behind the worker. */
  camera?: 'fpv' | 'follow';
  /** Easy one-finger controls (default) or joystick + throttle pad. */
  controls?: 'easy' | 'advanced';
  equipment: Equipment;
  /** Weather for every job ('auto' or unset = each level's own). */
  weather?: 'auto' | 'sunny' | 'rain' | 'fog' | 'evening';
  /** "Reklamları kaldır" bought (also checked against the store at start). */
  noAds: boolean;
  /** Daily reward: day it was last taken (YYYY-MM-DD, local) and the streak of days in a row. */
  daily: { last: string; streak: number };
  /** When each field was last mown (ms since 1970): it grows back after some hours. */
  mownAt?: Record<number, number>;
  /** The latest time the game has seen (setting the clock back does not make grass grow). */
  lastSeen?: number;
  /** Coffee-house jobs posted (the garden and the seed each is made from), and when each garden's last one was done. */
  /** The coffee-house jobs up on the board, and the day each was posted (YYYY-MM-DD). */
  ilanlar?: { slot: number; seed: number; day?: string }[];
  ilanDone?: Record<number, number>;
  /** The day's tasks: which day, how far each has got, which rewards are taken, the bonus taken. */
  tasks?: { day: string; progress: Record<string, number>; claimed: string[]; bonus: boolean };
  /** The village made nicer: the paints and yard decorations bought, and the paint on the pat pat. */
  decor?: string[];
  /** Yard decorations bought but taken away (kept: put back any time). */
  decorOff?: string[];
  paint?: string;
  /** The starter pack bought; when the game was first played (it is offered for the first days). */
  starterBought?: boolean;
  firstPlay?: number;
  /** Vehicles bought, and the one driven. */
  vehicles?: string[];
  vehicle?: string;
  /** The trailer (bought) left off the tractor. */
  trailerOff?: boolean;
  /** The patos (bought) hitched to the tractor instead of the trailer. */
  patosOn?: boolean;
  /** The hazelnut harvest's state (game/harvest.ts), once Yeşilyamaç's gardens are done. */
  harvest?: import('../game/harvest').HarvestState;
  /** Harvests sold so far, and the one the menu last offered a new harvest after (it pops up once). */
  harvestRound?: number;
  harvestOffered?: number;
  /**
   * The level numbering the save is in: unset = the first one, where Karadere's jobs were 9-13 (two
   * jobs were added to Yeşilyamaç as 9 and 10, Karadere's became 11-15; see loadSave).
   */
  levelIds?: number;
}

export const DEFAULT_SAVE: SaveData = {
  version: 1,
  money: 0,
  unlocked: 1,
  best: {},
  upgrades: { ...NO_UPGRADES },
  sfxVolume: 0.8,
  vibration: true,
  tutorialSeen: false,
  equipment: { ...DEFAULT_EQUIPMENT, owned: [...DEFAULT_EQUIPMENT.owned] },
  noAds: false,
  daily: { last: '', streak: 0 },
  levelIds: 2,
};

const KEY = 'kral-tirpan-save';

export async function loadSave(): Promise<SaveData> {
  try {
    const raw = isNative ? (await Preferences.get({ key: KEY })).value : localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (!d.levelIds) renumberLevels(d);
    const base = structuredClone(DEFAULT_SAVE);
    return { ...base, ...d, upgrades: { ...NO_UPGRADES, ...d.upgrades }, equipment: { ...base.equipment, ...d.equipment }, daily: { ...base.daily, ...d.daily } };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

/**
 * A save from before Yeşilyamaç's two new jobs (9 and 10): Karadere's 9-13 moved up to 11-15 (their
 * bests and mowing times with them), and the progress past Yeşilyamaç's end with them.
 */
function renumberLevels(d: Partial<SaveData>): void {
  const move = <T>(rec: Record<number, T> | undefined) => {
    if (!rec) return rec;
    const out: Record<number, T> = {};
    for (const [k, v] of Object.entries(rec)) {
      const id = Number(k);
      out[id >= 9 && id <= 13 ? id + 2 : id] = v;
    }
    return out;
  };
  d.best = move(d.best);
  d.mownAt = move(d.mownAt);
  if ((d.unlocked ?? 1) >= 9) d.unlocked = (d.unlocked ?? 1) + 2;
  d.levelIds = 2;
}

export async function writeSave(d: SaveData): Promise<void> {
  const raw = JSON.stringify(d);
  try {
    if (isNative) await Preferences.set({ key: KEY, value: raw });
    else localStorage.setItem(KEY, raw);
  } catch {
    /* storage unavailable (private mode); progress is kept for this session only */
  }
}
