import './styles.css';
import './hud.css';
import * as THREE from 'three';
import { GameAudio } from './audio/audio';
import { BushKind, DAILY, ENGINE, EXTRAS, HIVE, LEVELS, LINE_TYPES, LevelDef, MACHINES, NO_UPGRADES, PLAYER, REQUEST_TEXT, THEME_NAME, TRIMMER, Theme, UPGRADES, WEATHER_ICON, Weather, VEHICLES, DECOR, PAINTS } from './game/config';
import { CarryOver, Result, Session } from './game/session';
import { PRIMES_NEEDED, PullResult } from './game/starter';
import { Input } from './input/input';
import { Visor } from './ui/visor';
import { initAds, maybeInterstitial, setAdsRemoved, showRewarded } from './platform/ads';
import { COIN_PACKS, STARTER, STARTER_ID, buyProduct, buyRemoveAds, ownsRemoveAds, ownsStarter, productPrices, removeAdsPrice, restoreRemoveAds } from './platform/store';
import { DEFAULT_SAVE, SaveData, haptic, initPlatform, loadSave, setVibration, writeSave } from './platform/native';
import { preloadBushTextures } from './render/hazelnut';
import { preloadGround } from './render/scenery';
import { streamDistance } from './render/stream';
import { Models, loadModels } from './render/models';
import { Quality, View } from './render/view';
import { WorldView } from './render/world';
import { drawVillageMap } from './ui/villageMap';
import { formatWait, readyIn } from './game/regrow';
import { makeIlan } from './game/ilan';
import { GoldKind, goldArt } from './ui/goldArt';
import { ShopPreview } from './render/shopPreview';
import { ALL_DONE_BONUS, JobDone, TaskDef, dayTasks, taskCount } from './game/tasks';
import { activeEvents, eventPay } from './game/events';
import { REGIONS, setPosted } from './game/village';
import { SAGA_MAPS } from './ui/sagaMaps';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

type Mode = 'loading' | 'menu' | 'playing' | 'paused' | 'result';

/** What a knock is called on the HUD, by place. */
const KNOCK_NAME: Record<Theme, string> = { findik: 'ocak darbesi', mezarlik: 'taş darbesi', yayla: 'darbe', yol: 'darbe' };
const KNOCK_TOAST: Record<BushKind, string> = {
  ocak: 'Ocağa vurdun! Fındık dalları zarar gördü',
  mezar: 'Mezar taşına vurdun! Dikkat et',
  kaya: '',
};

/** Local date as YYYY-MM-DD. */
function today(offsetDays = 0): string {
  return dayOf(Date.now() + offsetDays * 86400000);
}

/** The local day (YYYY-MM-DD) of a moment, ms. */
function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ms from a moment to the next local midnight. */
function untilMidnight(ms: number): number {
  const d = new Date(ms);
  d.setHours(24, 0, 0, 0);
  return d.getTime() - ms;
}

/** Tips on the loading screen between jobs. */
const LOAD_TIPS = [
  'İpucu: ocak diplerinde gazı hafiflet, dallara vurma.',
  'İpucu: misina tık tık ederse yakında taş var, dikkat!',
  'İpucu: motor ısınırsa biraz rölantide bekle, soğusun.',
  'İpucu: biçtiğin tarlanın otu yeniden uzar, yine iş çıkar.',
  'İpucu: her gün köy kahvesinde yeni ilanlar var.',
  'İpucu: başka bir bahçenin kapısına git, oradaki işe geçebilirsin.',
];

/** An SVG icon from the symbols in index.html. */
function icon(id: string, cls = 'ic'): string {
  return `<svg class="${cls}"><use href="#${id}"/></svg>`;
}

/**
 * A picture that may not exist yet (artist images in public/textures): the icon shows until one of
 * the files loads.
 */
function picture(files: string[], fallback: string): string {
  const [first, ...rest] = files;
  const next = rest.length ? `this.onerror=null;this.src='./textures/${rest[0]}';this.onerror=()=>this.remove()` : 'this.remove()';
  return `${icon(fallback, 'ic pic-icon')}<img src="./textures/${first}" alt="" onload="this.classList.add('ok')" onerror="${next}">`;
}

/** Shop pictures in public/textures (shop-<id>.webp), preloaded at start. */
const SHOP_PICTURES = ['patpat', 'traktor', 'romork', 'emektar', 'usta', 'sirt', 'yuvarlak', 'koseli', 'burgulu', 'kulaklik', 'siperlik', 'depo', 'kalin', 'kafa', 'motor', 'cizme'];

/** Development: every field playable without unlocking. Set to false before release. */
const UNLOCK_ALL = true;
/** Development: ?tirpan in the address starts jobs in the field, trimmer in hand (no pat pat ride). */
const DEV_TRIMMER = new URLSearchParams(location.search).has('tirpan');
/** Development build only: the purse never runs below this (never in a release build). */
const DEV_MONEY = 9_999_999;

class Game {
  mode: Mode = 'loading';
  session: Session | null = null;
  save: SaveData = structuredClone(DEFAULT_SAVE);
  readonly audio = new GameAudio();
  view!: View;
  input!: Input;
  private models: Models = {};
  private level: LevelDef = LEVELS[0];
  private last = performance.now();
  private hudT = 0;
  private cutAcc = 0;
  private cutRate = 0;
  private toastAt: Record<string, number> = {};
  private lastResult: Result | null = null;
  /** The result screen's earnings were already doubled with an ad. */
  private doubled = false;
  private fpsAcc = 0;
  private fpsFrames = 0;
  /** First-person facing, radians. */
  private lookYaw = Math.PI;
  private lastPull = 1;
  /** Where the job just finished ended, while the day goes on (next job); null from the menu. */
  private lastJob: CarryOver | null = null;
  /** The pat pat's gear: 1 forward, -1 reverse, 0 neutral. */
  private patGear = 0;
  private lastCutHaptic = 0;
  private visor!: Visor;
  private visorHinted = false;
  /** How tall the grass being cut is (0 normal .. 1 tall weeds), smoothed, for the sound. */
  private cutTall = 0;
  private lastCluck = 0;
  /** A held context action is down (fitting line). */
  private actionHeld = false;
  /** The context actions now shown (to rebuild the buttons only when they change). */
  private actionKey = '';
  /** Daily reward on offer (TL) while the daily screen is open. */
  private dailyAmount = 0;
  private dailyStreak = 0;

  async boot(): Promise<void> {
    this.save = await loadSave();
    // The starter pack is offered for the first days from here.
    this.save.firstPlay ??= Date.now();
    // Development build only: money without end, to try everything in the shop.
    if (import.meta.env.DEV) this.save.money = Math.max(this.save.money, DEV_MONEY);
    setVibration(this.save.vibration);
    this.audio.setVolume(this.save.sfxVolume);
    setAdsRemoved(this.save.noAds);
    void this.checkStore();
    const q = (params.get('quality') as Quality) || this.save.quality || this.defaultQuality();
    this.view = new View($<HTMLCanvasElement>('game'), q);
    this.input = new Input($('touch'), $('stick'), $('knob'), $('pad'), $('btn-bump'), $('btn-stop'), $('btn-rethread'));
    // One way to play: the easy controls (the choice and the throttle latch are gone from the settings).
    this.input.toggleThrottle = false;
    this.input.fpv = this.cameraMode === 'fpv';
    this.applyControls();
    this.input.onPause = () => (this.mode === 'playing' ? this.pause() : this.mode === 'paused' ? this.resume() : undefined);
    this.visor = new Visor($<HTMLCanvasElement>('visor'));
    this.bindUi();
    void initAds();
    void initPlatform({
      onBackground: () => this.mode === 'playing' && this.pause(),
      onForeground: () => {},
      onBack: () => {
        if (this.mode === 'playing') return this.pause(), true;
        if (this.mode === 'paused') return this.resume(), true;
        const open = document.querySelector('.screen.dim.show');
        if (open) {
          open.classList.remove('show');
          return true;
        }
        return false;
      },
    });

    $('loading-text').textContent = 'Modeller yükleniyor…';
    // A new tip every few seconds while the models load.
    const tips = [
      'İpucu: ocak diplerinde gazı hafiflet, dallara vurma.',
      'İpucu: taşa vuran misina kopar, otun içine dikkatli bak.',
      'İpucu: benzin bitince patpatı yanına getir, bidon kasada.',
      'İpucu: şevden inerken yavaş yürü, ayağın kayar.',
      'İpucu: arılar kızınca dereye dal, peşini bırakırlar.',
    ];
    let tip = 0;
    const tipTimer = window.setInterval(() => ($('loading-tip').textContent = tips[++tip % tips.length]), 2600);
    [this.models] = await Promise.all([loadModels((p) => ($('load-fill').style.width = `${20 + p * 70}%`)), preloadBushTextures(), preloadGround()]);
    $('load-fill').style.width = '95%';
    // Menu background: the first field with the worker standing at the depot.
    this.applyLook();
    this.view.load(this.menuSession(), this.models, true);
    this.view.mode = 'orbit';
    $('load-fill').style.width = '100%';
    window.clearInterval(tipTimer);
    this.showMenu();
    // Warm the browser cache with the portraits and shop pictures so the screens show them at once.
    for (const f of [...new Set(LEVELS.map((l) => l.client.face))].map((x) => `${x}.webp`).concat(SHOP_PICTURES.map((x) => `shop-${x}.webp`))) new Image().src = `./textures/${f}`;
    // And the painted screens' pictures (the job map's regions, the wooden boards, the buttons): fetched
    // and decoded now, held so they stay decoded (they appeared a moment late the first time).
    for (const f of [...REGIONS.map((r) => `bolge${r.id}.webp`), 'pano.webp', 'tabela.webp', 'rozet.webp', 'pin.webp', 'kilit.webp', 'yildiz.webp', 'yildiz-bos.webp', 'btn-oyna2.webp', 'btn-gez.webp', 'btn-para.webp']) {
      const im = new Image();
      im.src = `./harita/${f}`;
      void im.decode().catch(() => {});
      this.warmed.push(im);
    }
    requestAnimationFrame((t) => this.loop(t));
    (window as unknown as { __ready: boolean }).__ready = true;
  }

  /** The vehicle (and trailer) chosen in the shop during a job: it stands where the old one stood, at once. */
  private applyVehicle(): void {
    const s = this.session;
    if (!s || s.driving) return;
    s.field.tractor = this.save.vehicle === 'traktor';
    s.field.trailer = this.trailerOn ? { yaw: NaN } : null;
    this.audio.setTractor(s.field.tractor);
    this.view.swapVehicle(this.models);
  }

  /** Serbest gez: in the village without a job. */
  private roaming = false;

  /** Pictures decoded ahead of the screens that show them (held so they stay decoded). */
  private readonly warmed: HTMLImageElement[] = [];

  /** The trailer bought and hitched, behind the tractor driven. */
  private get trailerOn(): boolean {
    return this.save.vehicle === 'traktor' && !!this.save.vehicles?.includes('romork') && !this.save.trailerOff;
  }

  /** Menu background: the worker with his trimmer standing in front of the pat pat, on the harman at home. */
  private menuSession(): Session {
    const s = new Session(LEVELS[0], NO_UPGRADES);
    // The vehicle chosen in the shop stands there.
    s.field.tractor = this.save.vehicle === 'traktor';
    s.field.trailer = this.trailerOn ? { yaw: NaN } : null;
    const v = s.field.vehicle;
    // At home: the pat pat on the harman in front of the house.
    const top = s.field.harmanSpot;
    if (top) ({ x: v.x, z: v.z, yaw: v.yaw } = top);
    // In front of the tractor's nose, a little to its right, turned a quarter away from it.
    const D = s.field.dims;
    const nose = D.joint + D.headAxle + D.headFront + 0.9;
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    s.x = v.x + fx * nose - fz * 0.6;
    s.z = v.z + fz * nose + fx * 0.6;
    s.yaw = v.yaw - Math.PI / 2 + 0.35;
    // Trimmer head resting on the ground in front of him (the session put it ahead of the start pose).
    s.headX = s.x + Math.sin(s.yaw) * 1.2 - Math.cos(s.yaw) * 0.25;
    s.headZ = s.z + Math.cos(s.yaw) * 1.2 + Math.sin(s.yaw) * 0.25;
    return s;
  }

  private defaultQuality(): Quality {
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (!mobile) return 'high';
    // Phones start on low (a Galaxy A05s: ~50 fps low, ~32 fps medium); the player can raise it in settings.
    return 'low';
  }

  // ---------------------------------------------------------------- screens
  /** "Buy X for N TL?" over the shop; true when bought. */
  private confirmBuy(name: string, price: number): Promise<boolean> {
    return this.ask(name, `<b>${price.toLocaleString('tr-TR')} TL</b> karşılığında satın almak istiyor musun?<br><small>Kalan paran: ${(this.save.money - price).toLocaleString('tr-TR')} TL</small>`, 'Satın Al');
  }

  /** A yes/no question over whatever is on screen; true for yes. */
  private ask(title: string, html: string, yes: string): Promise<boolean> {
    const box = $('confirm');
    $('confirm-title').textContent = title;
    $('confirm-text').innerHTML = html;
    $('btn-confirm-yes').textContent = yes;
    box.classList.add('show');
    // Whatever was held lets go: the stick held under the question (BÖLÜMÜ AÇ while driving) would
    // otherwise stay pushed and the pat pat run on by itself after it.
    this.input.reset();
    return new Promise((done) => {
      const close = (yes: boolean) => {
        box.classList.remove('show');
        $('btn-confirm-yes').onclick = $('btn-confirm-no').onclick = box.onclick = null;
        if (!yes) this.audio.ui();
        done(yes);
      };
      $('btn-confirm-yes').onclick = () => close(true);
      $('btn-confirm-no').onclick = () => close(false);
      // A tap outside says no, but not the very tap that opened it: the action buttons act on the touch
      // going down, and its click lands on this backdrop when the finger lifts.
      const opened = performance.now();
      box.onclick = (e) => {
        if (e.target === box && performance.now() - opened > 500) close(false);
      };
    });
  }

  private show(id: string | null): void {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
  }

  private showMenu(): void {
    this.mode = 'menu';
    this.hideVisor();
    document.body.classList.remove('playing', 'fuel-empty');
    this.updateMoney();
    this.show('menu');
    void this.updateNoAds();
    this.updateStarter();
    this.updateTasksBadge();
    this.updateEvents();
    this.offerDaily();
  }

  // ---------------------------------------------------------------- daily reward, remove ads

  /** Once a day on the menu: the daily reward, bigger every day in a row (a missed day starts over). */
  /** Today's tasks and how far each has got (a new day starts them afresh). */
  private dayState(): { defs: TaskDef[]; st: NonNullable<SaveData['tasks']> } {
    const day = today();
    if (this.save.tasks?.day !== day) this.save.tasks = { day, progress: {}, claimed: [], bonus: false };
    return { defs: dayTasks(day), st: this.save.tasks };
  }

  /** Rewards waiting to be taken (for the badge on the menu button). */
  private tasksReady(): number {
    const { defs, st } = this.dayState();
    const done = defs.filter((t) => (st.progress[t.id] ?? 0) >= t.goal && !st.claimed.includes(t.id)).length;
    const bonus = !st.bonus && defs.every((t) => st.claimed.includes(t.id)) ? 1 : 0;
    return done + bonus;
  }

  private updateTasksBadge(): void {
    const n = this.tasksReady();
    $('tasks-badge').textContent = n ? String(n) : '';
  }

  /** A job done: move the day's tasks on, and say so for each one it completes. */
  private countTasks(job: JobDone): void {
    const { defs, st } = this.dayState();
    for (const t of defs) {
      const before = st.progress[t.id] ?? 0;
      if (before >= t.goal) continue;
      const now = Math.min(t.goal, before + taskCount(t.id, job));
      st.progress[t.id] = now;
      if (now >= t.goal) this.toast(`Görev tamam: ${t.text} (+${t.reward} TL, Görevler'den al)`, 'good');
    }
  }

  private openTasks(): void {
    const { defs, st } = this.dayState();
    const list = $('task-list');
    list.innerHTML = '';
    const row = (text: string, sub: string, frac: number, label: string, enabled: boolean, onTake: (() => void) | null, cls = '') => {
      const r = document.createElement('div');
      r.className = `task ${cls}`;
      r.innerHTML = `<div><b>${text}</b><br><small>${sub}</small></div>`;
      const b = document.createElement('button');
      b.className = 'btn buy';
      b.textContent = label;
      b.disabled = !enabled;
      if (onTake) b.onclick = onTake;
      r.appendChild(b);
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.innerHTML = `<i style="width:${Math.round(Math.min(1, frac) * 100)}%"></i>`;
      r.appendChild(bar);
      list.appendChild(r);
    };
    const take = (amount: number, mark: () => void) => () => {
      this.save.money += amount;
      mark();
      void writeSave(this.save);
      this.audio.coin();
      this.audio.success();
      this.updateMoney();
      this.updateTasksBadge();
      this.openTasks();
    };
    for (const t of defs) {
      const p = st.progress[t.id] ?? 0;
      const done = p >= t.goal;
      const taken = st.claimed.includes(t.id);
      const shown = t.goal >= 100 ? `${p.toLocaleString('tr-TR')} / ${t.goal.toLocaleString('tr-TR')} TL` : `${p} / ${t.goal}`;
      row(t.text, `${shown} · Ödül ${t.reward} TL`, p / t.goal, taken ? 'ALINDI' : done ? 'AL' : `${t.reward} TL`, done && !taken, take(t.reward, () => st.claimed.push(t.id)), taken ? 'done' : '');
    }
    const all = defs.every((t) => st.claimed.includes(t.id));
    const n = defs.filter((t) => st.claimed.includes(t.id)).length;
    row('Hepsini bitir', `Üç görevin ödülünü al · Büyük ödül ${ALL_DONE_BONUS} TL`, n / defs.length, st.bonus ? 'ALINDI' : all ? 'AL' : `${ALL_DONE_BONUS} TL`, all && !st.bonus, take(ALL_DONE_BONUS, () => (st.bonus = true)), `bonus${st.bonus ? ' done' : ''}`);
    this.show('tasks');
  }

  private offerDaily(): void {
    const d = this.save.daily;
    if (d.last === today()) return;
    this.dailyStreak = d.last === today(-1) ? d.streak + 1 : 1;
    this.dailyAmount = DAILY[Math.min(DAILY.length, this.dailyStreak) - 1];
    $('daily-amount').textContent = String(this.dailyAmount);
    $('daily-days').innerHTML = DAILY.map((v, i) => {
      const day = i + 1;
      const shown = Math.min(this.dailyStreak, DAILY.length);
      const cls = day < shown ? 'done' : day === shown ? 'today' : '';
      return `<div class="${cls}">${day}. gün<b>${v}</b></div>`;
    }).join('');
    $('daily').classList.add('show');
  }

  private async takeDaily(withAd: boolean): Promise<void> {
    if (!$('daily').classList.contains('show')) return;
    let amount = this.dailyAmount;
    if (withAd && (await showRewarded(`+${amount * 2} TL!`))) amount *= 2;
    this.save.money += amount;
    this.save.daily = { last: today(), streak: this.dailyStreak };
    void writeSave(this.save);
    this.audio.coin();
    this.audio.success();
    this.updateMoney();
    $('daily').classList.remove('show');
  }

  /** The store knows if "remove ads" was bought (e.g. before a reinstall). */
  private async checkStore(): Promise<void> {
    if (this.save.noAds || !(await ownsRemoveAds())) return;
    this.save.noAds = true;
    setAdsRemoved(true);
    void writeSave(this.save);
    void this.updateNoAds();
  }

  private async updateNoAds(): Promise<void> {
    const b = $<HTMLButtonElement>('btn-noads');
    b.style.display = this.save.noAds ? 'none' : '';
    if (this.save.noAds) return;
    b.innerHTML = `${icon('i-noads')}<span>Reklamsız</span>`;
  }

  /** The "remove ads" offer: what it gives and the store price. */
  private async openNoAds(): Promise<void> {
    $('noads-offer').classList.add('show');
    const price = await removeAdsPrice();
    $('offer-price').textContent = price ?? '₺299,99';
  }

  private async buyNoAds(): Promise<void> {
    if (this.save.noAds) return;
    if (!(await buyRemoveAds())) return;
    this.save.noAds = true;
    setAdsRemoved(true);
    void writeSave(this.save);
    this.audio.success();
    $('noads-offer').classList.remove('show');
    void this.updateNoAds();
  }

  /** "Satın alımları geri yükle", with the answer shown on the button that asked (settings or the offer). */
  private async restorePurchases(id = 'btn-restore'): Promise<void> {
    const b = $(id);
    const label = b.textContent;
    b.textContent = 'Kontrol ediliyor…';
    // The starter pack, if it was bought (before a reinstall): its lasting parts; the money only if this
    // save never had it.
    if (!this.save.starterBought && (await ownsStarter())) {
      this.grantStarter(true);
      void writeSave(this.save);
      this.updateMoney();
    }
    const ok = (await restoreRemoveAds()) || !!this.save.starterBought;
    if (ok) {
      this.save.noAds = true;
      setAdsRemoved(true);
      void writeSave(this.save);
      void this.updateNoAds();
      setTimeout(() => $('noads-offer').classList.remove('show'), 1200);
    }
    b.textContent = ok ? 'Reklamsız sürüm geri yüklendi' : 'Geri yüklenecek satın alım yok';
    setTimeout(() => (b.textContent = label), 2500);
  }

  // ---------------------------------------------------------------- the customer's call

  /** The customer phones with the job (and what they want); accepting starts it. */
  /** Now, never earlier than the latest time seen (setting the clock back does not grow grass). */
  private now(): number {
    const n = Math.max(Date.now(), this.save.lastSeen ?? 0);
    this.save.lastSeen = n;
    return n;
  }

  /** Milliseconds until a field has grown back (0 = ready for a job). */
  private readyIn(lv: LevelDef): number {
    return readyIn(lv, this.save.mownAt, this.now());
  }

  /** A field mown not long ago: wait for it, or grow it back at once for a rewarded ad. */
  private offerRegrow(lv: LevelDef): void {
    const wait = this.readyIn(lv);
    if (!wait) return this.openCall(lv);
    $('regrow-text').textContent = `${lv.name} daha yeni biçildi. Otlar ${formatWait(wait)} sonra yeniden uzar. Beklemek istemezsen kısa bir reklamla hemen büyüt.`;
    this.show('regrow');
  }

  private openCall(lv: LevelDef): void {
    if (this.readyIn(lv)) return this.offerRegrow(lv);
    this.regrowFor = lv;
    const c = lv.client;
    $('call-face').innerHTML = picture([`${c.face}.webp`], 'i-person');
    $('call-name').textContent = `${c.name} arıyor…`;
    $('call-place').innerHTML = `${lv.place} · ${THEME_NAME[lv.theme]} ${icon(WEATHER_ICON[this.weatherOf(lv)])}`;
    $('call-text').textContent = `“${c.call}”`;
    $('call-request').textContent = c.request === 'none' ? '' : `İstek: ${REQUEST_TEXT[c.request]} · Bahşiş ${c.tip} TL`;
    $('btn-call-ok').onclick = () => {
      $('call').classList.remove('show');
      void this.startWithLoader(lv);
    };
    this.audio.ring();
    this.show('call');
  }

  /** The field shown in the regrow offer (the last one asked for). */
  private regrowFor: LevelDef = LEVELS[0];

  private async watchAdToRegrow(): Promise<void> {
    const lv = this.regrowFor;
    if (!(await showRewarded('Otlar büyüdü!'))) return;
    if (this.save.mownAt) delete this.save.mownAt[lv.id];
    void writeSave(this.save);
    this.openCall(lv);
  }

  private updateMoney(): void {
    document.querySelectorAll('.money').forEach((e) => (e.textContent = this.save.money.toLocaleString('tr-TR')));
  }

  /** The coffee house opens once the first two jobs are done. */
  private get ilanOpen(): boolean {
    return UNLOCK_ALL || this.save.unlocked >= 3;
  }

  /**
   * Post a job in every neighbour's garden that has none and has waited long enough since its last;
   * hand the jobs to the village (they show in the gardens and on the boards).
   */
  private refreshIlanlar(): LevelDef[] {
    const R = REGIONS[0];
    // A new day, a new board: the jobs not taken yesterday come down (a job being done now is kept).
    const day = dayOf(this.now());
    const doing = this.mode !== 'menu' && this.level.id >= 100 ? this.level.id : -1;
    const list = (this.save.ilanlar = (this.save.ilanlar ?? []).filter((i) => (i.day ?? day) === day || i.slot === doing));
    for (const i of list) i.day ??= day;
    if (this.ilanOpen) {
      for (const s of R.slots) {
        if (list.some((i) => i.slot === s.id)) continue;
        // A garden whose job was done today gets its next one tomorrow.
        const done = this.save.ilanDone?.[s.id];
        if (done && dayOf(done) === day) continue;
        // A neighbour posts one job at a time: draw again if the owner already has one up.
        const owners = list.map((i) => makeIlan(R.slots.find((q) => q.id === i.slot)!, i.seed, R.name, R.id).client.name);
        let seed = Math.floor(Math.random() * 1e9);
        for (let k = 0; k < 20 && owners.includes(makeIlan(s, seed, R.name, R.id).client.name); k++) seed = Math.floor(Math.random() * 1e9);
        list.push({ slot: s.id, seed, day });
      }
    }
    const defs = list.flatMap((i) => {
      const s = R.slots.find((q) => q.id === i.slot);
      return s ? [makeIlan(s, i.seed, R.name, R.id)] : [];
    });
    setPosted(defs);
    return defs;
  }

  /** The job list's tab: a village (its id) or the coffee house (0); null = where the next job is. */
  private levelTab: number | null = null;

  /**
   * The job list, one tab at a time: each village's jobs, and the coffee house's odd jobs. It opens on
   * the village of the next job to do.
   */
  private openLevels(): void {
    const ilanlar = this.refreshIlanlar();
    const next = LEVELS.find((l) => l.id === this.save.unlocked) ?? LEVELS[LEVELS.length - 1];
    const tab = this.levelTab ?? next.region ?? 1;
    // The tabs: the villages (how many of their jobs are done), then the coffee house's jobs (how many
    // are posted).
    const bar = $('level-tabs');
    bar.innerHTML = '';
    const tabs: [number, string][] = REGIONS.map((r) => {
      const jobs = LEVELS.filter((l) => (l.region ?? 1) === r.id);
      const open = UNLOCK_ALL || !jobs.length || jobs[0].id <= this.save.unlocked;
      const done = jobs.filter((l) => this.save.best[l.id]).length;
      return [r.id, open ? `${r.name} <span class="tab-sub">${done}/${jobs.length}</span>` : `<svg class="ic"><use href="#i-lock"/></svg> ${r.name}`];
    });
    if (this.ilanOpen) tabs.push([0, `İlanlar${ilanlar.length ? ` <span class="tab-count">${ilanlar.length}</span>` : ''}`]);
    for (const [id, label] of tabs) {
      const t = document.createElement('button');
      t.className = id === tab ? 'on' : '';
      t.innerHTML = label;
      t.onclick = () => {
        this.audio.ui();
        this.levelTab = id;
        this.openLevels();
      };
      bar.appendChild(t);
    }
    const list = $('level-list');
    list.innerHTML = '';
    list.scrollTop = 0;
    // The villages are maps with a path through their jobs; the coffee house's jobs a list.
    list.className = tab === 0 ? 'level-grid' : 'saga';
    $('levels').classList.toggle('saga-on', tab !== 0);
    const head = (text: string, sub = '') => {
      const h = document.createElement('div');
      h.className = 'lv-head';
      h.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
      list.appendChild(h);
    };
    if (tab === 0) {
      // The coffee house's board: odd jobs in the neighbours' gardens.
      head('Köy Kahvesi İlanları', 'Her gün yeni ilanlar. Alınmayan ilanlar ertesi gün yenilenir.');
      for (const lv of ilanlar) {
        const b = document.createElement('button');
        b.className = 'level ilan';
        const req = lv.client.request === 'none' ? lv.client.name : `${lv.client.name} · ${REQUEST_TEXT[lv.client.request]}`;
        b.innerHTML = `<span class="lv-num"><svg class="ic"><use href="#i-coffee"/></svg></span>
          <span class="lv-wx">${icon(WEATHER_ICON[this.weatherOf(lv)])}</span>
          <b>${lv.name}</b><small>${req}</small>${this.payTag(lv)}`;
        b.onclick = () => {
          this.audio.unlock();
          this.audio.ui();
          this.openCall(lv);
        };
        list.appendChild(b);
      }
      // Gardens waiting for their next job.
      for (const s of REGIONS[0].slots) {
        if (ilanlar.some((l) => l.id === s.id)) continue;
        const left = untilMidnight(this.now());
        const b = document.createElement('button');
        b.className = 'level ilan growing';
        b.innerHTML = `<span class="lv-num"><svg class="ic"><use href="#i-coffee"/></svg></span><b>Komşu Bahçesi</b><small>Yeni ilan yarın (${formatWait(left)})</small>
          <span class="lv-ad">${icon('i-play')} Reklam izle, ilan gelsin</span>`;
        // Not wanting to wait: a rewarded ad posts a job there now.
        b.onclick = async () => {
          this.audio.unlock();
          if (!(await showRewarded('Yeni ilan geldi!'))) return;
          if (this.save.ilanDone) delete this.save.ilanDone[s.id];
          void writeSave(this.save);
          this.openLevels();
        };
        list.appendChild(b);
      }
      this.show('levels');
      return;
    }
    const focus = this.drawSaga(list, tab);
    this.show('levels');
    list.scrollTop = Math.max(0, (focus / 100) * list.firstElementChild!.clientHeight - list.clientHeight * 0.55);
  }

  /**
   * The job map is moved by dragging it, like a page on the phone: fingers do that already; this gives
   * the mouse the same (with a little glide after letting go), and a drag does not count as a tap.
   */
  private dragToScroll(el: HTMLElement): void {
    let startY = 0, startTop = 0, lastY = 0, lastT = 0, speed = 0, moved = false, down = false, glide = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !el.classList.contains('saga')) return;
      cancelAnimationFrame(glide);
      down = true;
      moved = false;
      startY = lastY = e.clientY;
      startTop = el.scrollTop;
      lastT = performance.now();
      speed = 0;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      if (Math.abs(e.clientY - startY) > 6) moved = true;
      el.scrollTop = startTop - (e.clientY - startY);
      const now = performance.now();
      speed = (lastY - e.clientY) / Math.max(1, now - lastT);
      lastY = e.clientY;
      lastT = now;
    });
    window.addEventListener('pointerup', () => {
      if (!down) return;
      down = false;
      let v = speed * 16;
      const step = () => {
        if (Math.abs(v) < 0.5) return;
        el.scrollTop += v;
        v *= 0.93;
        glide = requestAnimationFrame(step);
      };
      step();
    });
    el.addEventListener('click', (e) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    }, true);
  }

  /** The highest job open when the map was last drawn: a job opened since gets its opening shown. */
  private sagaSeen = 0;

  /**
   * A village's jobs as a path on its map, climbing from the bottom (the first job) to the top: the
   * jobs done with their stars, the next one with the worker's pin on it, those not yet open greyed
   * and padlocked (the first of them with its price to open it now) under a grey mist. On the artist's
   * map (see sagaMaps.ts) the jobs sit on its road; without one a road is drawn on plain green. Each
   * job is a wooden badge with its number. Gives where the
   * next job is (percent of the map's height from the top) for the scroll.
   */
  private drawSaga(list: HTMLElement, tab: number): number {
    const jobs = LEVELS.filter((l) => (l.region ?? 1) === tab);
    const region = REGIONS.find((r) => r.id === tab)!;
    const open = (lv: LevelDef) => UNLOCK_ALL || lv.id <= this.save.unlocked;
    const fresh = this.sagaSeen && this.save.unlocked > this.sagaSeen ? this.save.unlocked : 0;
    this.sagaSeen = this.save.unlocked;
    const art = SAGA_MAPS[tab];
    const map = document.createElement('div');
    map.className = `saga-map${art ? ' art' : ''}`;
    // Where each job sits, in percent of the map (x from the left, y from the top).
    let pts: { x: number; y: number }[];
    let road = '';
    if (art) {
      map.style.aspectRatio = `${art.w} / ${art.h}`;
      map.style.setProperty('--bg', `url(/harita/bolge${tab}.webp)`);
      pts = jobs.map((_, i) => art.spots[i] ?? art.spots[art.spots.length - 1]);
    } else {
      // No picture yet: swinging left and right up a green hill, a road drawn between the jobs.
      const STEP = 118, BOTTOM = 90, TOP = 170;
      const h = BOTTOM + TOP + STEP * (jobs.length - 1);
      map.style.height = `${h}px`;
      pts = jobs.map((_, i) => ({ x: 50 + 28 * Math.sin(i * 1.2), y: ((h - BOTTOM - i * STEP) / h) * 100 }));
      const half = (STEP / 2 / h) * 100;
      const path = (a: number, b: number) => {
        let d = `M${pts[a].x} ${pts[a].y}`;
        for (let i = a + 1; i <= b; i++) d += ` C${pts[i - 1].x} ${pts[i - 1].y - half} ${pts[i].x} ${pts[i].y + half} ${pts[i].x} ${pts[i].y}`;
        return d;
      };
      const nOpen = jobs.filter(open).length;
      const done = nOpen > 1 ? path(0, nOpen - 1) : '';
      const ahead = nOpen < jobs.length ? path(Math.max(0, nOpen - 1), jobs.length - 1) : '';
      road = `<svg class="saga-path" viewBox="0 0 100 100" preserveAspectRatio="none">
        ${done ? `<path class="road-edge" d="${done}"/><path class="road" d="${done}"/>` : ''}
        ${ahead ? `<path class="road-off" d="${ahead}"/>` : ''}
      </svg>`;
    }
    const last = jobs.length - 1;
    const stars = jobs.reduce((t, l) => t + (this.save.best[l.id]?.stars ?? 0), 0);
    // The part of the map not open yet lies under a grey mist, from halfway between the last open job
    // and the first locked one up to the top.
    const lockAt = jobs.findIndex((l) => !open(l));
    const mist = lockAt < 0 ? 0 : lockAt === 0 ? 100 : (pts[lockAt - 1].y + pts[lockAt].y) / 2;
    map.innerHTML = `${road}${mist ? `<div class="saga-mist" style="height:${mist}%"></div>` : ''}
      <div class="saga-sign"><b>${region.name}</b><small>${jobs[0] && open(jobs[0]) ? `<img src="./harita/yildiz.webp" alt=""> ${stars} / ${jobs.length * 3}` : 'Önceki köy bitince açılır'}</small></div>`;
    const firstLocked = jobs.find((l) => !open(l));
    // The worker's pin: on the first open job not done yet.
    const nextJob = jobs.find((l) => open(l) && !this.save.best[l.id]);
    let focus = pts[0].y;
    jobs.forEach((lv, i) => {
      const locked = !open(lv);
      const best = this.save.best[lv.id];
      const wait = locked ? 0 : this.readyIn(lv);
      const next = lv === nextJob;
      if (next || (!nextJob && (lv === firstLocked || (!firstLocked && i === last)))) focus = pts[i].y;
      const b = document.createElement('button');
      b.className = `saga-node${locked ? ' locked' : ''}${best ? ' done' : ''}${next ? ' next' : ''}${wait ? ' growing' : ''}${lv.id === fresh ? ' fresh' : ''}${pts[i].x < 50 ? ' pin-left' : ''}`;
      b.style.left = `${pts[i].x}%`;
      b.style.top = `${pts[i].y}%`;
      const starRow = [0, 1, 2].map((k) => `<img src="./harita/${best && k < best.stars ? 'yildiz' : 'yildiz-bos'}.webp" alt="">`).join('');
      b.innerHTML = `${next ? '<img class="sn-pin" src="./harita/pin.webp" alt="">' : ''}
        <span class="sn-disc"><b>${locked ? '<img class="sn-lock" src="./harita/kilit.webp" alt="">' : lv.id}</b></span>
        ${locked ? '' : `<span class="sn-stars">${starRow}</span>`}
        <span class="sn-name">${lv.name}</span>
        ${lv === firstLocked ? `<span class="sn-tag price">${this.unlockLabel(lv)}</span>` : wait ? `<span class="sn-tag wait">${icon('i-clock')} ${formatWait(wait)}</span>` : ''}`;
      b.onclick = () => {
        this.audio.unlock();
        this.audio.ui();
        if (locked) void this.buyUnlock(lv).then((ok) => ok && this.openLevels());
        else this.offerRegrow(lv);
      };
      map.appendChild(b);
    });
    list.appendChild(map);
    return focus;
  }

  /**
   * Opening a locked job early, for game money: six times its pay, in five hundreds (a real shortcut,
   * dearer than playing the job before it a few times).
   */
  private unlockPrice(lv: LevelDef): number {
    return Math.max(2500, Math.round((lv.pay * 6) / 500) * 500);
  }

  /**
   * Open the next locked job for money (asked first). Short of money: offer the store (in a job too:
   * the job waits behind it). True when opened.
   */
  /**
   * Opening a locked job and every locked one before it (progress is kept as the highest job open, so
   * they open together): the jobs and the sum of their prices.
   */
  private unlockCost(lv: LevelDef): { jobs: LevelDef[]; price: number } {
    const jobs = LEVELS.filter((l) => l.id > this.save.unlocked && l.id <= lv.id);
    return { jobs, price: jobs.reduce((t, l) => t + this.unlockPrice(l), 0) };
  }

  /** The price on an unlock button: the sum, and how many jobs it opens when more than one. */
  private unlockLabel(lv: LevelDef): string {
    const { jobs, price } = this.unlockCost(lv);
    return `${jobs.length > 1 ? `${jobs.length} bölüm · ` : ''}${price.toLocaleString('tr-TR')} TL`;
  }

  private async buyUnlock(lv: LevelDef): Promise<boolean> {
    const { jobs, price } = this.unlockCost(lv);
    if (!jobs.length) return false;
    // More than one: say which open with it.
    const also = jobs.length > 1 ? `<br><small>Öncesindeki kilitli ${jobs.length - 1} bölüm de açılır: ${jobs.slice(0, -1).map((l) => l.name).join(', ')}.</small>` : '';
    if (this.save.money < price) {
      const short = price - this.save.money;
      const go = await this.ask(`${lv.name} kilitli`, `Hemen açmak için <b>${price.toLocaleString('tr-TR')} TL</b> lazım, <b>${short.toLocaleString('tr-TR')} TL</b> eksik.<br><small>Mağazadan para alabilir ya da önceki işi bitirip bedavaya açabilirsin.</small>`, 'Mağazaya Git');
      if (go) {
        if (this.mode === 'playing') this.pauseForShop();
        this.openStore();
      }
      return false;
    }
    if (!(await this.ask(`${lv.name}`, `Bu tarlayı <b>${price.toLocaleString('tr-TR')} TL</b> karşılığında hemen açmak istiyor musun?${also}<br><small>Kalan paran: ${(this.save.money - price).toLocaleString('tr-TR')} TL</small>`, 'Hemen Aç'))) return false;
    this.save.money -= price;
    this.save.unlocked = Math.max(this.save.unlocked, lv.id);
    void writeSave(this.save);
    this.audio.coin();
    this.audio.success();
    haptic('medium');
    this.updateMoney();
    WorldView.unlockedUpTo = this.save.unlocked;
    for (const l of jobs) this.view.unlockField(l.id, l.name);
    this.toast(`${lv.name} açıldı! Menüde BAHÇEYE GİT'ten seçebilirsin`, 'good');
    return true;
  }

  /** The village as the player has made it: the pat pat's paint, the yard decorations (for the next world built). */
  private applyLook(): void {
    WorldView.paintHue = PAINTS.find((p) => p.id === this.save.paint)?.hue ?? null;
    WorldView.decor = (this.save.decor ?? []).filter((d) => !this.save.decorOff?.includes(d));
  }

  /** A job's pay for the list: raised by an event, it shows in gold with the old pay struck through. */
  private payTag(lv: LevelDef): string {
    const pay = eventPay(lv, new Date());
    return pay === lv.pay ? `<span class="lv-pay">${lv.pay} TL</span>` : `<span class="lv-pay event"><s>${lv.pay}</s> ${pay} TL</span>`;
  }

  /** The menu's banner for the events on today. */
  private updateEvents(): void {
    const ev = activeEvents(new Date());
    const el = $('event-banner');
    el.innerHTML = ev.map((e) => `<b>${e.name}</b> ${e.text}`).join('<br>');
    el.style.display = ev.length ? '' : 'none';
  }

  /** The weather a job is played in: the level's own, or the one chosen in the settings. */
  private weatherOf(lv: LevelDef): Weather {
    // No work in the fields of an evening: an old saved choice of it counts as sunny.
    const w = this.save.weather && this.save.weather !== 'auto' ? this.save.weather : lv.weather;
    return w === 'evening' ? 'sunny' : w;
  }

  private shopTab: 'tirpan' | 'misina' | 'donanim' | 'yukseltme' | 'arac' | 'koy' = 'tirpan';
  /** The shop's village tab: the paints or the yard. */
  private koyPart: 'boya' | 'avlu' = 'boya';
  /** What the Köy tab's turntable shows: a paint (by id) or a yard decoration (by id). */
  private koyLook: { boya: string | null; avlu: string } = { boya: null, avlu: 'saksi' };
  private shopPreview: ShopPreview | null = null;
  /** The shop opened from the yard during a job (closing it goes back to the job). */
  private shopInGame = false;
  /** Store prices of the money packs and the starter pack, once fetched. */
  private prices: Record<string, string> = {};

  /** The starter pack is offered for the first days of play, until bought. */
  private get starterOffered(): boolean {
    return !this.save.starterBought && this.now() - (this.save.firstPlay ?? this.now()) < STARTER.days * 86_400_000;
  }

  private updateStarter(): void {
    $('btn-starter').style.display = this.starterOffered ? '' : 'none';
  }

  /** What the starter pack gives: money (unless already given), the pro face shield, no forced ads. */
  private grantStarter(coins: boolean): void {
    if (coins) this.save.money += STARTER.coins;
    if (!this.save.equipment.owned.includes('siperlik')) this.save.equipment.owned.push('siperlik');
    this.save.noAds = true;
    this.save.starterBought = true;
    setAdsRemoved(true);
    void this.updateNoAds();
    this.updateStarter();
  }

  /** Buy a money pack or the starter pack from the store. */
  private async buyPack(id: string): Promise<void> {
    const pack = COIN_PACKS.find((p) => p.id === id);
    if (!(await buyProduct(id, !!pack))) return;
    if (pack) this.save.money += pack.coins;
    else this.grantStarter(true);
    void writeSave(this.save);
    this.audio.coin();
    this.audio.success();
    haptic('medium');
    this.updateMoney();
    this.openStore();
  }

  /**
   * The store (real money, apart from the shop's game money): the starter pack in the first days, the
   * money packs, no forced ads. Prices come from the store.
   */
  private openStore(): void {
    const list = $('store-list');
    list.innerHTML = '';
    const ids = [STARTER_ID, ...COIN_PACKS.map((p) => p.id)];
    if (ids.some((id) => !this.prices[id])) {
      void productPrices(ids).then((p) => {
        if (!Object.keys(p).length) return;
        this.prices = { ...this.prices, ...p };
        if ($('store').classList.contains('show')) this.openStore();
      });
    }
    const card = (pic: string, name: string, desc: string, label: string, enabled: boolean, onBuy: () => void, extra = '') => {
      const c = document.createElement('div');
      c.className = `shop-card pack ${extra}`;
      c.innerHTML = `<div class="pic">${pic}</div><b>${name}</b><small>${desc}</small>`;
      const btn = document.createElement('button');
      btn.className = 'btn buy';
      btn.textContent = label;
      btn.disabled = !enabled;
      btn.onclick = () => {
        this.audio.unlock();
        onBuy();
      };
      c.appendChild(btn);
      list.appendChild(c);
    };
    // The artist's picture (store-<id>.webp) when there is one, the drawn gold until then.
    const goldPic = (id: string, kind: GoldKind) => `${goldArt(kind)}<img src="./textures/store-${id}.webp" alt="" onload="this.classList.add('ok')" onerror="this.remove()">`;
    const kinds: Record<string, GoldKind> = { para_10000: 'kese', para_35000: 'cuval', para_100000: 'sandik' };
    const buy = (id: string) => () => void this.buyPack(id);
    if (this.starterOffered) card(goldPic(STARTER_ID, 'yigin'), 'Başlangıç Paketi', `${STARTER.coins.toLocaleString('tr-TR')} TL + Pro Siperlik + reklamsız oyun. Sadece ilk ${STARTER.days} gün!`, this.prices[STARTER_ID] ?? '…', !!this.prices[STARTER_ID], buy(STARTER_ID), 'starter-card');
    for (const p of COIN_PACKS) card(goldPic(p.id, kinds[p.id] ?? 'kese'), p.name, `${p.coins.toLocaleString('tr-TR')} TL`, this.prices[p.id] ?? '…', !!this.prices[p.id], buy(p.id));
    if (!this.save.noAds) card(`<svg class="ic"><use href="#i-noads"/></svg>`, 'Reklamsız Oyna', 'İşler arasındaki reklamlar kalkar. Ödüllü reklamlar isteğe bağlı kalır.', 'İNCELE', true, () => {
        // The offer opens over the menu.
        this.showMenu();
        void this.openNoAds();
      });
    this.updateMoney();
    this.show('store');
  }

  /** The shop: one category at a time, items as cards with a picture. */
  private openShop(): void {
    const tabs: [typeof this.shopTab, string][] = [
      ['tirpan', 'Tırpan'],
      ['misina', 'Misina'],
      ['donanim', 'Donanım'],
      ['yukseltme', 'Güç'],
      ['arac', 'Araç'],
      ['koy', 'Köy'],
    ];
    const bar = $('shop-tabs');
    bar.innerHTML = '';
    for (const [id, name] of tabs) {
      const t = document.createElement('button');
      t.className = id === this.shopTab ? 'on' : '';
      t.textContent = name;
      t.onclick = () => {
        this.audio.ui();
        this.shopTab = id;
        this.openShop();
      };
      bar.appendChild(t);
    }
    const list = $('shop-list');
    list.innerHTML = '';
    const eq = this.save.equipment;
    const card = (pic: string, name: string, desc: string, extra: string, label: string, enabled: boolean, onBuy: () => void, selected = false) => {
      const c = document.createElement('div');
      c.className = `shop-card${selected ? ' selected' : ''}`;
      c.innerHTML = `<div class="pic">${pic}</div><b>${name}</b><small>${desc}</small>${extra}`;
      const btn = document.createElement('button');
      btn.className = 'btn buy';
      btn.textContent = label;
      btn.disabled = !enabled;
      btn.onclick = async () => {
        this.audio.unlock();
        // A price on the button: ask first (picking something already owned does not).
        const price = /^([\d.]+) TL$/.exec(label);
        if (price && !(await this.confirmBuy(name, Number(price[1].replace(/\./g, ''))))) return;
        onBuy();
        void writeSave(this.save);
        this.updateMoney();
        this.openShop();
      };
      c.appendChild(btn);
      list.appendChild(c);
      return c;
    };
    // The artist's shop picture (shop-<id>.webp), or an icon until there is one.
    const pic = (id: string, fallback: string) => picture([`shop-${id}.webp`], fallback);
    // Machines and line types: buy once, then pick one.
    const choice = (items: { id: string; name: string; desc: string; price: number }[], pics: Record<string, string>, selected: string, pick: (id: string) => void) => {
      for (const it of items) {
        const owned = eq.owned.includes(it.id);
        const on = selected === it.id;
        const label = on ? 'SEÇİLİ' : owned ? 'SEÇ' : `${it.price} TL`;
        card(pics[it.id], it.name, it.desc, '', label, !on && (owned || this.save.money >= it.price), () => {
          if (!owned) {
            if (this.save.money < it.price) return;
            this.save.money -= it.price;
            eq.owned.push(it.id);
            this.audio.coin();
          } else this.audio.ui();
          pick(it.id);
        }, on);
      }
    };
    if (this.shopTab === 'tirpan') {
      choice(MACHINES, { standart: pic('emektar', 'i-engine'), usta: pic('usta', 'i-engine') + '<span class="pic-badge">43cc</span>', sirt: pic('sirt', 'i-engine') }, eq.machine, (id) => (eq.machine = id as typeof eq.machine));
    } else if (this.shopTab === 'misina') {
      choice(LINE_TYPES, { yuvarlak: pic('yuvarlak', 'i-spool'), kare: pic('koseli', 'i-spool'), burgulu: pic('burgulu', 'i-spool') }, eq.lineType, (id) => (eq.lineType = id as typeof eq.lineType));
    } else if (this.shopTab === 'koy') {
      // The village made nicer, in two parts so each fits on the screen: a paint for the pat pat (pick
      // one), and things for the yard (they stay).
      const sub = document.createElement('div');
      sub.className = 'tabs sub-tabs';
      for (const [id, name] of [['boya', 'Patpat Boyası'], ['avlu', 'Avlu']] as const) {
        const t = document.createElement('button');
        t.className = id === this.koyPart ? 'on' : '';
        t.textContent = name;
        t.onclick = () => {
          this.audio.ui();
          this.koyPart = id;
          this.openShop();
        };
        sub.appendChild(t);
      }
      list.appendChild(sub);
      const owned = this.save.decor ?? [];
      const using = this.save.paint ?? 'mavi';
      // The turntable: the pat pat in the paint picked (tap a card to see it), or the decoration.
      const look = this.koyPart === 'boya' ? (this.koyLook.boya ?? using) : this.koyLook.avlu;
      const box = document.createElement('div');
      box.className = 'shop-preview';
      list.appendChild(box);
      this.shopPreview ??= new ShopPreview(this.models);
      const lookName = this.koyPart === 'boya' ? PAINTS.find((p) => p.id === look)?.name : DECOR.find((d) => d.id === look)?.name;
      if (this.koyPart === 'boya') this.shopPreview.showPatpat(PAINTS.find((p) => p.id === look)?.hue ?? null);
      else this.shopPreview.showDecor(look);
      this.shopPreview.attach(box);
      const cap = document.createElement('small');
      cap.textContent = `${lookName ?? ''} · Görmek için karta dokun`;
      box.appendChild(cap);
      const preview = (c: HTMLElement, id: string) => {
        if (id === look) c.classList.add('previewing');
        c.onclick = (e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          this.audio.ui();
          if (this.koyPart === 'boya') this.koyLook.boya = id;
          else this.koyLook.avlu = id;
          this.openShop();
        };
      };
      const swatch = (hue: number | null) => `<div class="swatch" style="background:${hue === null ? '#2f62b0' : `hsl(${Math.round(hue * 360)}, 62%, 45%)`}"></div>`;
      for (const p of this.koyPart === 'boya' ? PAINTS : []) {
        const has = p.price === 0 || owned.includes(`boya_${p.id}`);
        const on = using === p.id;
        const c = card(swatch(p.hue), p.name, 'Patpatın rengi', '', on ? 'SEÇİLİ' : has ? 'SEÇ' : `${p.price} TL`, !on && (has || this.save.money >= p.price), () => {
          if (!has) {
            if (this.save.money < p.price) return;
            this.save.money -= p.price;
            this.save.decor = [...owned, `boya_${p.id}`];
            this.audio.coin();
          } else this.audio.ui();
          this.save.paint = p.id;
          this.koyLook.boya = null;
          // In the yard during a job: the pat pat out there takes the paint at once.
          this.view.repaintPatpat(p.hue);
          this.applyLook();
        }, on);
        preview(c, p.id);
      }
      const decorPic: Record<string, string> = { saksi: 'i-sun', cardak: 'i-tractor', kulube: 'i-person', camasir: 'i-hand' };
      for (const d of this.koyPart === 'avlu' ? DECOR : []) {
        const has = owned.includes(d.id);
        const placed = has && !this.save.decorOff?.includes(d.id);
        const c = card(pic(`koy-${d.id}`, decorPic[d.id]), d.name, d.desc, '', placed ? 'KALDIR' : has ? 'EKLE' : `${d.price} TL`, has || this.save.money >= d.price, () => {
          if (!has) {
            if (this.save.money < d.price) return;
            this.save.money -= d.price;
            this.save.decor = [...owned, d.id];
            this.audio.coin();
          } else {
            // Bought once: taken away and put back as the player likes.
            this.save.decorOff = placed ? [...(this.save.decorOff ?? []), d.id] : (this.save.decorOff ?? []).filter((x) => x !== d.id);
            this.audio.ui();
          }
          if (this.shopInGame) this.toast(`${d.name} bir sonraki işte avluda ${placed ? 'olmayacak' : 'olacak'}`, 'good');
        }, placed);
        preview(c, d.id);
      }
    } else if (this.shopTab === 'arac') {
      // Vehicles: the pat pat is had from the start; the tractor shows what is coming.
      const owned = this.save.vehicles ?? ['patpat'];
      const using = this.save.vehicle ?? 'patpat';
      for (const v of VEHICLES) {
        const has = owned.includes(v.id);
        if (v.attach) {
          // The trailer: bought once (with the tractor), then hitched on or left off.
          const hitched = has && !this.save.trailerOff;
          const canBuy = owned.includes('traktor') && this.save.money >= v.price;
          const label = has ? (hitched ? 'ÇIKAR' : 'TAK') : owned.includes('traktor') ? `${v.price.toLocaleString('tr-TR')} TL` : 'ÖNCE TRAKTÖR';
          card(pic(v.id, 'i-tractor'), v.name, v.desc, '', label, has || canBuy, () => {
            if (!has) {
              if (!canBuy) return;
              this.save.money -= v.price;
              this.save.vehicles = [...owned, v.id];
              this.save.trailerOff = false;
              this.audio.coin();
            } else {
              this.save.trailerOff = hitched;
              this.audio.ui();
            }
            if (this.mode === 'menu') this.view.load(this.menuSession(), this.models, true);
            else if (this.shopInGame) this.applyVehicle();
          }, hitched);
          continue;
        }
        const on = using === v.id;
        const label = v.soon ? 'YAKINDA' : on ? 'SEÇİLİ' : has ? 'SEÇ' : `${v.price.toLocaleString('tr-TR')} TL`;
        const badge = v.soon ? `<span class="pic-badge">${v.price.toLocaleString('tr-TR')} TL</span>` : '';
        card(pic(v.id, 'i-tractor') + badge, v.name, v.desc, '', label, !v.soon && !on && (has || this.save.money >= v.price), () => {
          if (!has) {
            if (this.save.money < v.price) return;
            this.save.money -= v.price;
            this.save.vehicles = [...owned, v.id];
            this.audio.coin();
          } else this.audio.ui();
          this.save.vehicle = v.id;
          // On the menu: the yard behind it shows the vehicle chosen; in a job it stands there at once.
          if (this.mode === 'menu') this.view.load(this.menuSession(), this.models, true);
          else if (this.shopInGame) this.applyVehicle();
        }, on);
      }
    } else if (this.shopTab === 'donanim') {
      // Extras: bought once; then taken off and put back on as the player likes.
      const pics: Record<string, string> = { kulaklik: pic('kulaklik', 'i-ear'), siperlik: pic('siperlik', 'i-visor') };
      for (const it of EXTRAS) {
        const owned = eq.owned.includes(it.id);
        const worn = owned && !eq.off?.includes(it.id);
        card(pics[it.id], it.name, it.desc, '', worn ? 'ÇIKAR' : owned ? 'TAK' : `${it.price} TL`, owned || this.save.money >= it.price, () => {
          if (!owned) {
            if (this.save.money < it.price) return;
            this.save.money -= it.price;
            eq.owned.push(it.id);
            this.audio.coin();
          } else {
            eq.off = worn ? [...(eq.off ?? []), it.id] : (eq.off ?? []).filter((x) => x !== it.id);
            this.audio.ui();
          }
          if (this.shopInGame) this.toast(`${it.name} bir sonraki işte ${worn ? 'çıkarılmış' : 'takılı'} olacak`, 'good');
        }, worn);
      }
    } else {
      const pics: Record<string, string> = { tank: pic('depo', 'i-tank'), line: pic('kalin', 'i-spool'), head: pic('kafa', 'i-head'), motor: pic('motor', 'i-engine'), boots: pic('cizme', 'i-boot') };
      for (const u of UPGRADES) {
        const lvl = this.save.upgrades[u.id];
        const max = lvl >= u.prices.length;
        const price = max ? 0 : u.prices[lvl];
        const pips = `<div class="pips">${u.prices.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>`;
        card(pics[u.id], u.name, u.desc, pips, max ? 'TAMAM' : `${price} TL`, !max && this.save.money >= price, () => {
          if (this.save.money < price) return;
          this.audio.coin();
          this.save.money -= price;
          this.save.upgrades[u.id]++;
        });
      }
    }
    this.updateMoney();
    this.show('shop');
  }

  private openSettings(): void {
    $<HTMLInputElement>('set-sfx').value = String(Math.round(this.save.sfxVolume * 100));
    $<HTMLInputElement>('set-vibration').checked = this.save.vibration;
    document.querySelectorAll<HTMLButtonElement>('#set-quality button').forEach((b) => b.classList.toggle('on', b.dataset.q === this.view.quality));
    document.querySelectorAll<HTMLButtonElement>('#set-weather button').forEach((b) => b.classList.toggle('on', b.dataset.w === (this.save.weather ?? 'auto')));
    $('settings').classList.add('show');
  }

  private bindUi(): void {
    const on = (id: string, fn: () => void) =>
      $(id).addEventListener('click', () => {
        this.audio.unlock();
        this.audio.ui();
        fn();
      });
    on('btn-play', () => this.openLevels());
    this.dragToScroll($('level-list'));
    on('btn-noads', () => void this.openNoAds());
    on('btn-starter', () => this.openStore());
    on('btn-tasks', () => this.openTasks());
    on('btn-tasks-close', () => this.showMenu());
    on('btn-store', () => this.openStore());
    on('btn-store-close', () => (this.shopInGame ? this.resume() : this.showMenu()));
    on('btn-store-restore', () => void this.restorePurchases('btn-store-restore'));
    on('btn-offer-buy', () => void this.buyNoAds());
    on('btn-offer-later', () => $('noads-offer').classList.remove('show'));
    on('btn-offer-restore', () => void this.restorePurchases('btn-offer-restore'));
    on('btn-restore', () => void this.restorePurchases());
    on('btn-daily-take', () => void this.takeDaily(false));
    on('btn-daily-ad', () => void this.takeDaily(true));
    on('btn-call-no', () => this.show('levels'));
    on('btn-regrow-other', () => this.openLevels());
    on('btn-regrow-ad', () => void this.watchAdToRegrow());
    on('btn-ad-fuel', () => void this.watchAdToFuel());
    on('btn-levels-close', () => this.show('menu'));
    on('btn-shop', () => this.openShop());
    on('btn-shop-close', () => {
      // From the yard: back to the job (resume closes it); from the menu: back to the menu.
      if (this.shopInGame) this.resume();
      else this.show('menu');
    });
    on('btn-roam', () => void this.startRoam());
    on('btn-settings', () => this.openSettings());
    // From the pause menu: the settings over the game, back to the pause menu when done.
    on('btn-pause-settings', () => {
      $('pause').classList.remove('show');
      this.openSettings();
    });
    on('btn-settings-close', () => {
      $('settings').classList.remove('show');
      void writeSave(this.save);
      if (this.mode === 'paused') $('pause').classList.add('show');
    });
    on('btn-reset', () => {
      if (!confirm('Tüm para, yükseltme ve bahçe ilerlemen silinsin mi?')) return;
      // Settings and the bought "remove ads" stay.
      const keep = { sfxVolume: this.save.sfxVolume, vibration: this.save.vibration, quality: this.save.quality, noAds: this.save.noAds };
      this.save = { ...structuredClone(DEFAULT_SAVE), ...keep };
      void writeSave(this.save);
      this.updateMoney();
    });
    $<HTMLInputElement>('set-sfx').addEventListener('input', (e) => {
      this.save.sfxVolume = Number((e.target as HTMLInputElement).value) / 100;
      this.audio.setVolume(this.save.sfxVolume);
      void writeSave(this.save);
    });
    $<HTMLInputElement>('set-vibration').addEventListener('change', (e) => {
      this.save.vibration = (e.target as HTMLInputElement).checked;
      setVibration(this.save.vibration);
    });
    document.querySelectorAll<HTMLButtonElement>('#set-weather button').forEach((b) =>
      b.addEventListener('click', () => {
        this.save.weather = b.dataset.w as Weather | 'auto';
        document.querySelectorAll('#set-weather button').forEach((x) => x.classList.toggle('on', x === b));
      }),
    );
    document.querySelectorAll<HTMLButtonElement>('#set-quality button').forEach((b) =>
      b.addEventListener('click', () => {
        const q = b.dataset.q as Quality;
        this.save.quality = q;
        this.view.setQuality(q);
        document.querySelectorAll('#set-quality button').forEach((x) => x.classList.toggle('on', x === b));
      }),
    );
    on('btn-pause', () => this.pause());
    on('btn-cam', () => this.toggleCamera());
    this.bindStarter();
    on('btn-resume', () => this.resume());
    on('btn-restart', () => void this.startWithLoader(this.level));
    on('btn-quit', () => this.quitToMenu());
    on('btn-finish', () => this.finish());
    on('btn-ad-cool', () => void this.watchAdToCool());
    $('btn-visor').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.wipeVisor();
    });
    window.addEventListener('keydown', (e) => e.code === 'KeyV' && this.mode === 'playing' && this.wipeVisor());
    this.bindFreeCam();
    // The village map: the HARİTA button (or M); the game waits while it is open.
    on('btn-map', () => this.toggleMap(true));
    on('btn-map-close', () => this.toggleMap(false));
    window.addEventListener('keydown', (e) => e.code === 'KeyM' && this.mode === 'playing' && this.toggleMap(!this.mapOpen));
    on('btn-ad-double', () => void this.watchAdToDouble());
    // Leaving the result screen is where an interstitial may show (see ads.ts for how often).
    on('btn-next', () => {
      const next = LEVELS.find((l) => l.id === this.level.id + 1);
      if (next) void this.afterResult(() => this.openCall(next));
    });
    on('btn-again', () => void this.afterResult(() => this.offerRegrow(this.level)));
    on('btn-menu', () => void this.afterResult(() => this.quitToMenu()));
  }

  private applyControls(): void {
    const easy = true;
    this.input.easy = easy;
    this.input.reset();
    document.body.classList.toggle('easy', easy);
    this.updateTutorialText();
  }

  private updateTutorialText(): void {
    const drag = '<svg class="ic"><use href="#i-drag"/></svg>';
    const move = '<svg class="ic"><use href="#i-move"/></svg>';
    if (this.input.easy) {
      if (this.input.trimmer) {
        // (Both on the left: the trigger stands where the right one would be.)
        $('tut-left').innerHTML = `${move} Sürükle: yürü, sağa sola dön<br>GAZ: basılı tut, yavaş yavaş artar`;
        $('tut-right').innerHTML = '';
      } else {
        $('tut-left').innerHTML = `${drag} Sol: sürükle, etrafa bak`;
        $('tut-right').innerHTML = `Sağ: sürükle, yürü ${move}`;
      }
    } else {
      $('tut-left').innerHTML = `${move} Sürükle: yürü / dön`;
      $('tut-right').innerHTML = this.cameraMode === 'fpv' ? `Sürükle: etrafa bak ${drag}` : `Gaz pedi: bas ve kaydır ${drag}`;
    }
  }

  private get cameraMode(): 'fpv' | 'follow' {
    return this.save.camera ?? 'fpv';
  }

  private toggleCamera(): void {
    this.save.camera = this.cameraMode === 'fpv' ? 'follow' : 'fpv';
    void writeSave(this.save);
    this.input.fpv = this.cameraMode === 'fpv';
    if (this.session) this.lookYaw = this.session.yaw;
    if (this.mode === 'playing' || this.mode === 'paused') {
      this.view.mode = this.cameraMode;
      this.view.resize();
      this.view.snapCamera();
    }
    this.updateTutorialText();
  }

  // ---------------------------------------------------------------- engine start
  private bindStarter(): void {
    $('btn-prime').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.prime();
    });
    $('btn-choke').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.choke();
    });
    const handle = $('cord-handle');
    const rope = $('rope');
    let id: number | null = null;
    let y0 = 0;
    let t0 = 0;
    let max = 0;
    let tMax = 0;
    const set = (d: number) => {
      handle.style.transform = `translateY(${d}px)`;
      rope.style.height = `${26 + d}px`;
    };
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.audio.unlock();
      id = e.pointerId;
      handle.setPointerCapture(e.pointerId);
      y0 = e.clientY;
      t0 = performance.now();
      max = 0;
      tMax = t0;
      handle.style.transition = 'none';
      rope.style.transition = 'none';
    });
    handle.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const d = Math.max(0, Math.min(150, e.clientY - y0));
      // Speed is measured from when the cord starts moving, so holding the handle first is fine.
      if (max < 4 && d < 4) t0 = performance.now();
      if (d > max) {
        max = d;
        tMax = performance.now();
      }
      set(d);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      // A real pull is long and fast: strength = length x speed.
      const len = max / 130;
      const speed = max / Math.max(1, tMax - t0); // px per ms
      const strength = Math.min(1, len) * Math.max(0.3, Math.min(1, speed / 0.45));
      handle.style.transition = 'transform 0.18s ease-out';
      rope.style.transition = 'height 0.18s ease-out';
      set(0);
      if (max > 15) this.pullCord(strength);
    };
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'playing' || e.repeat) return;
      if (e.code === 'Digit1') this.prime();
      if (e.code === 'Digit2') this.choke();
      if (e.code === 'KeyR') this.pullCord(1);
      if (e.code === 'KeyC') this.toggleCamera();
    });
  }

  private hideVisor(): void {
    if (!this.visor) return;
    this.visor.visible = false;
    this.visor.update(0);
    document.body.classList.remove('visor-dirty');
  }

  private wipeVisor(): void {
    if (this.visor.dirt < 0.02) return;
    this.visor.wipe();
    this.audio.wipe();
    haptic('light');
  }

  private async watchAdToCool(): Promise<void> {
    const s = this.session;
    if (!s?.overheated || this.mode !== 'playing') return;
    this.mode = 'paused';
    this.audio.suspend();
    const ok = await showRewarded('Motor soğutuldu!');
    this.audio.resume();
    this.mode = 'playing';
    this.last = performance.now();
    if (ok && this.session === s) s.coolNow();
  }

  /** Out of fuel far from the can: a rewarded ad fills the tank on the spot. */
  private async watchAdToFuel(): Promise<void> {
    const s = this.session;
    if (!s || s.fuel > 0 || s.running || this.mode !== 'playing') return;
    this.mode = 'paused';
    this.audio.suspend();
    const ok = await showRewarded('Depo doldu!');
    this.audio.resume();
    this.mode = 'playing';
    this.last = performance.now();
    if (!ok || this.session !== s) return;
    s.fillTank();
    this.toast('Depo doldu! Pompala ve motoru çalıştır', 'good');
    this.updateStarterUi();
    this.updateHud(s);
  }

  /** Rewarded ad on the result screen: pays the job's earnings once more. */
  private async watchAdToDouble(): Promise<void> {
    const r = this.lastResult;
    if (!r || r.total <= 0 || this.mode !== 'result' || this.doubled) return;
    this.doubled = true;
    $('btn-ad-double').style.display = 'none';
    const ok = await showRewarded(`+${r.total} TL kazandın!`);
    if (!ok) {
      this.doubled = false;
      $('btn-ad-double').style.display = '';
      return;
    }
    this.save.money += r.total;
    void writeSave(this.save);
    $('result-table').querySelector('tr.total td:last-child')!.textContent = `${r.total * 2} TL`;
    this.audio.success();
    haptic('medium');
  }

  private async afterResult(go: () => void): Promise<void> {
    if (this.mode !== 'result') return;
    await maybeInterstitial();
    go();
  }

  private prime(): void {
    const s = this.session;
    if (!s || s.running || this.mode !== 'playing') return;
    this.audio.unlock();
    s.starter.prime();
    this.audio.prime();
    haptic('light');
    this.updateStarterUi();
  }

  private choke(): void {
    const s = this.session;
    if (!s || s.running || this.mode !== 'playing') return;
    s.starter.setChoke(!s.starter.choke);
    this.audio.choke();
    haptic('light');
    this.updateStarterUi();
  }

  private pullCord(strength: number): void {
    const s = this.session;
    if (!s || s.running || this.mode !== 'playing') return;
    this.lastPull = strength;
    s.pull(strength);
    haptic(strength > 0.6 ? 'medium' : 'light');
  }

  private onPull(r: PullResult): void {
    const s = this.session!;
    this.audio.crank(r === 'weak' ? this.lastPull * 0.5 : this.lastPull);
    switch (r) {
      case 'weak':
        this.toast('Daha uzun ve hızlı çek!', '', 'weak', 1.5);
        break;
      case 'dry':
        this.toast(s.fuel <= 0 ? 'Depo boş! Bidonun yanına git' : 'Karbüratöre benzin gelmiyor: POMPA', 'warn', 'dry', 2);
        break;
      case 'cough':
        this.audio.cough(3);
        this.view.puff(10, -0.1);
        this.toast('Öksürdü! Jikleyi bırak, tekrar çek', 'good');
        break;
      case 'flooded':
        this.audio.cough(1, true);
        this.view.puff(6, 0.3);
        this.toast('Motor boğuldu! Jikle kapalı birkaç kez çek', 'warn', 'flood', 2);
        break;
      case 'hot':
        this.toast('Motor çok sıcak, çalışmıyor. Soğumasını bekle', 'warn', 'hot', 2);
        break;
      case 'start':
        this.audio.startEngine();
        this.view.puff(22, s.temp < ENGINE.warm ? -0.15 : 0);
        haptic('heavy');
        this.toast('Motor çalıştı!', 'good');
        break;
      case 'nothing':
        break;
    }
    this.updateStarterUi();
  }

  private updateStarterUi(): void {
    const s = this.session;
    const off = !!s && !s.running && !s.intro && !s.driving && s.hasTrimmer && this.mode === 'playing';
    document.body.classList.toggle('engine-off', off);
    if (!s || !off) return;
    const st = s.starter;
    $('bulb-fill').style.height = `${Math.min(1, st.primes / PRIMES_NEEDED) * 100}%`;
    $('btn-choke').classList.toggle('on', st.choke);
    $('choke-text').textContent = st.choke ? 'JİKLE ÇEKİLİ' : 'JİKLE';
    let hint: string;
    let focus: 'prime' | 'choke' | 'cord';
    if (s.overheated) {
      hint = 'Motor hararet yaptı: soğumasını bekle';
      focus = 'cord';
    } else if (s.fuel <= 0) {
      hint = 'Depo boş! Sarı halkaya, bidonun yanına git';
      focus = 'cord';
    } else if (st.dry) {
      hint = `POMPA'ya bas (${st.primes}/${PRIMES_NEEDED}): karbüratöre benzin gelsin`;
      focus = 'prime';
    } else if (st.flooded) {
      hint = st.choke ? 'Motor boğuldu! Önce jikleyi bırak' : 'Boğulan motoru aç: ipi birkaç kez çek';
      focus = st.choke ? 'choke' : 'cord';
    } else if (!st.warm && !st.popped && !st.choke) {
      hint = "Motor soğuk: JİKLE'yi çek";
      focus = 'choke';
    } else if (st.popped && st.choke) {
      hint = 'Öksürdü! Jikleyi bırak';
      focus = 'choke';
    } else if (st.warm && st.choke) {
      hint = 'Motor sıcak: jikleyi bırak';
      focus = 'choke';
    } else {
      hint = st.popped || st.warm ? 'Şimdi ipi sertçe çek!' : 'İpi hızlıca aşağı çek (öksürene kadar)';
      focus = 'cord';
    }
    $('starter-hint').textContent = hint;
    $('btn-prime').classList.toggle('highlight', focus === 'prime');
    $('btn-choke').classList.toggle('highlight', focus === 'choke');
    $('cord').classList.toggle('highlight', focus === 'cord');
  }

  // ---------------------------------------------------------------- play
  /**
   * Build a job behind the loading screen: it is shown (and painted) first, so the seconds the phone
   * spends building the field are spent on it, not on a frozen screen.
   */
  private async startWithLoader(def: LevelDef, title = `${def.name} hazırlanıyor…`): Promise<void> {
    this.mode = 'loading';
    this.audio.stopEngine();
    $('loading-text').textContent = title;
    $('loading-tip').textContent = LOAD_TIPS[Math.floor(Math.random() * LOAD_TIPS.length)];
    $('load-fill').style.width = '60%';
    this.show('loading');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    this.start(def);
  }

  /**
   * Serbest gez: the village of the job map's region shown last, no job in it. From the house door
   * (the vehicle in the garage, the trimmer left in it), in first person; walk, drive, look round, the
   * shop by the house. No objective, gauges, time or pay; the pause card's Ana Menü ends it.
   */
  private async startRoam(): Promise<void> {
    const tab = this.levelTab ?? 1;
    const def = LEVELS.find((l) => (l.region ?? 1) === tab) ?? LEVELS[0];
    const place = REGIONS.find((r) => r.id === tab)?.name ?? 'Köy';
    this.roaming = true;
    this.lastJob = null;
    await this.startWithLoader(def, `${place} hazırlanıyor…`);
  }

  start(def: LevelDef): void {
    // Today's events may raise the pay.
    const lv = { ...def, weather: this.weatherOf(def), pay: eventPay(def, new Date()) };
    this.level = def;
    // Every job starts on the pat pat by the house at the top of the slope, the trimmer in the trailer without line.
    // (Development: ?tirpan in the address starts every job in the field with the trimmer in hand.)
    const from = this.roaming ? 'home' : DEV_TRIMMER ? 'ready' : !this.save.introDone && def.id === LEVELS[0].id ? 'home' : 'patpat';
    // On from the last job's field if the day goes on; from home after the menu.
    this.session = new Session(lv, this.save.upgrades, this.input.easy ? 1.5 : 1, this.save.equipment, from, this.roaming ? undefined : (this.lastJob ?? undefined));
    // Roaming: nothing to do first (no trimmer to take for a job).
    if (this.roaming) {
      this.session.intro = null;
      this.session.roaming = true;
    }
    document.body.classList.toggle('roam', this.roaming);
    // The vehicle bought and chosen in the shop.
    this.session.field.tractor = this.save.vehicle === 'traktor';
    this.session.field.trailer = this.trailerOn ? { yaw: NaN } : null;
    this.audio.setTractor(this.session.field.tractor);
    this.lastJob = null;
    // The coffee-house jobs stand in the neighbours' gardens.
    this.refreshIlanlar();
    // The other fields' boards show a padlock beyond the jobs open to the player, or how long until
    // a field mown not long ago has grown back.
    // The fields still locked by the player's own progress show it (chain and padlock), even while
    // development lets every job be played from the list.
    WorldView.unlockedUpTo = this.save.unlocked;
    this.applyLook();
    WorldView.waitText = Object.fromEntries(LEVELS.map((l) => [l.id, this.readyIn(l) ? `Ot uzuyor: ${formatWait(this.readyIn(l))}` : 'Hazır']));
    this.view.load(this.session, this.models);
    // Every job starts in first person, at the worker's eyes on the harman (the eye button still
    // switches to the camera behind him for the job).
    this.save.camera = 'fpv';
    this.input.fpv = true;
    this.updateTutorialText();
    this.view.mode = this.cameraMode;
    this.lookYaw = this.session.yaw;
    this.pitchHands = this.session.hasTrimmer;
    this.pitchEase = null;
    this.view.pitch = this.session.hasTrimmer ? -0.55 : -0.06;
    this.view.resize();
    this.view.snapCamera();
    // One frame drawn now, behind the loading screen, so the first one seen is the job's own view (the
    // worker hidden in first person, the camera at his eyes), not a frame from the menu's camera.
    this.view.frame(0);
    this.view.snapCamera();
    this.view.frame(0);
    this.input.reset();
    this.visor.clear();
    this.visorHinted = false;
    $('btn-finish').classList.remove('show');
    $('toasts').innerHTML = '';
    $('tutorial').classList.toggle('show', !this.save.tutorialSeen);
    this.mode = 'playing';
    document.body.classList.add('playing');
    this.show('hud');
    this.audio.unlock();
    this.audio.stopEngine();
    this.audio.setEarmuffs(this.session.gear.earmuffs);
    this.audio.startAmbience({ rain: lv.weather === 'rain', ezan: lv.theme === 'mezarlik' ? 'soon' : 'never', traffic: false });
    $('hud-knock-name').textContent = KNOCK_NAME[lv.theme];
    const chip = $('request-chip');
    chip.classList.remove('broken');
    chip.textContent = lv.client.request === 'none' ? '' : `${lv.client.name}: ${REQUEST_TEXT[lv.client.request]}`;
    this.updateStarterUi();
    // The job: which field (it is marked on the map), for whom.
    if (this.roaming) this.toast('Serbest gez: köyü istediğin gibi dolaş. Çıkmak için duraklat › Ana Menü', 'good');
    else this.toast(`Bugünkü iş: ${lv.name} (${lv.client.name}). Yeri HARİTA'da işaretli`, 'good', 'job', 6);
  }

  /** The shop from the yard: the job waits (paused, without the pause card) until it is closed. */
  private openShopInGame(): void {
    if (this.mode !== 'playing') return;
    this.pauseForShop();
    this.shopTab = 'koy';
    this.openShop();
  }

  /** The job waits (paused, without the pause card) behind the shop or the store. */
  private pauseForShop(): void {
    this.mode = 'paused';
    this.input.reset();
    this.audio.suspend();
    this.shopInGame = true;
  }

  private pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.reset();
    this.audio.suspend();
    $('pause').classList.add('show');
  }

  private resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.audio.resume();
    $('pause').classList.remove('show');
    if (this.shopInGame) {
      // The shop and the store are screens of their own: showing them hid the game's; back to it.
      this.shopInGame = false;
      this.show('hud');
    }
    this.last = performance.now();
  }

  private quitToMenu(): void {
    this.lastJob = null;
    this.roaming = false;
    document.body.classList.remove('roam');
    this.audio.resume();
    this.audio.stopEngine();
    this.audio.patpat(false);
    this.audio.stopAmbience();
    this.audio.setBees(0);
    this.audio.setSpray(0);
    this.audio.setTraffic(0);
    this.session = null;
    this.applyLook();
    this.view.load(this.menuSession(), this.models, true);
    this.view.mode = 'orbit';
    this.view.resize();
    this.showMenu();
  }

  private finish(): void {
    const s = this.session;
    if (!s || this.mode !== 'playing') return;
    const r = s.finish();
    this.lastResult = r;
    this.lastJob = s.carryOver();
    this.audio.stopEngine();
    this.audio.patpat(false);
    this.audio.stopAmbience();
    this.audio.setBees(0);
    this.audio.setSpray(0);
    this.audio.setTraffic(0);
    this.mode = 'result';
    this.hideVisor();
    document.body.classList.remove('playing', 'engine-off', 'fuel-empty', 'overheated');
    let record = false;
    if (r.total > 0) {
      this.save.money += r.total;
      this.countTasks({ result: r, ilan: this.level.id >= 100, parTime: this.level.parTime, overheated: s.overheats > 0 });
      if (this.level.id >= 100) {
        // A coffee-house job done: off the board; that garden gets a new one after a while.
        this.save.ilanlar = (this.save.ilanlar ?? []).filter((i) => i.slot !== this.level.id);
        (this.save.ilanDone ??= {})[this.level.id] = this.now();
      } else {
        // Mown: the grass grows back over the next hours.
        (this.save.mownAt ??= {})[this.level.id] = this.now();
        const prev = this.save.best[this.level.id];
        // The fastest time is kept on its own: a new record whenever it is beaten.
        record = !!prev?.time && r.time < prev.time;
        const time = Math.min(r.time, prev?.time ?? Infinity);
        if (!prev || r.stars > prev.stars || (r.stars === prev.stars && r.total > prev.pay)) {
          this.save.best[this.level.id] = { stars: r.stars, coverage: r.coverage, pay: r.total, time };
        } else prev.time = time;
        this.save.unlocked = Math.max(this.save.unlocked, this.level.id + 1);
      }
      this.audio.success();
      haptic('medium');
    }
    void writeSave(this.save);
    $('result-title').textContent = r.total > 0 ? 'Bahçe tertemiz!' : 'İş yarım kaldı';
    $('result-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < r.stars ? '' : 'off'}"><img src="./harita/${i < r.stars ? 'yildiz' : 'yildiz-bos'}.webp" alt=""></span>`).join('');
    const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const rows: [string, string, string?][] = [
      ['Biçilen alan', `%${(r.coverage * 100).toFixed(1)}`],
      ['Süre', record ? `${mmss(r.time)} · YENİ REKOR!` : mmss(r.time), record ? 'pos' : ''],
      ['Biçme ücreti', `${r.base} TL`],
      ['Hız primi', `+${r.timeBonus} TL`],
      [`${this.level.theme === 'mezarlik' ? 'Taş hasarı' : 'Ocak hasarı'} (${r.knocks} darbe)`, `−${r.penalty} TL`, 'neg'],
      ['Benzin ve misina', `−${r.expenses} TL`, 'neg'],
    ];
    if (r.accidents > 0) rows.push(['Kazalar (arı, tavuk, hortum)', `−${r.accidents} TL`, 'neg']);
    const c = this.level.client;
    if (c.request !== 'none') rows.push([`Bahşiş · ${c.name}`, r.requestMet ? `+${r.tip} TL` : 'yok (istek tutmadı)', r.requestMet ? '' : 'neg']);
    $('result-table').innerHTML =
      rows.map(([a, b, c]) => `<tr><td>${a}</td><td class="${c ?? ''}">${b}</td></tr>`).join('') +
      `<tr class="total"><td>Eline geçen</td><td>${r.total} TL</td></tr>`;
    const hasNext = LEVELS.some((l) => l.id === this.level.id + 1) && r.total > 0;
    $('btn-next').style.display = hasNext ? '' : 'none';
    this.doubled = false;
    $('btn-ad-double').style.display = r.total > 0 ? '' : 'none';
    $('ad-double-text').textContent = `+${r.total} TL daha al`;
    this.show('result');
  }

  private toast(text: string, kind: '' | 'warn' | 'good' = '', key?: string, every = 0): void {
    const now = performance.now();
    if (key && now - (this.toastAt[key] ?? -1e9) < every * 1000) return;
    if (key) this.toastAt[key] = now;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    const box = $('toasts');
    box.appendChild(el);
    this.placeToasts();
    while (box.children.length > 3) box.firstChild?.remove();
    // Long enough to read: by its length (warnings a little longer).
    const ms = Math.max(2600, 1200 + text.length * 70) * (kind === 'warn' ? 1.3 : 1);
    el.style.animationDuration = `${ms}ms`;
    setTimeout(() => el.remove(), ms + 100);
  }

  private handleEvents(s: Session): void {
    for (const e of s.events) {
      switch (e.type) {
        case 'cut':
          this.cutAcc += e.n;
          this.cutTall += (Math.min(1, Math.max(0, e.weight / Math.max(1, e.n) - 1) * 2.5) - this.cutTall) * 0.3;
          this.view.emitCut(e.x, e.z, e.n, s.cutRadius, Math.max(0, e.weight / Math.max(1, e.n) - 1) * 2.5);
          // A light tick in the hands while the line bites (at most ~7 a second).
          if (performance.now() - this.lastCutHaptic > 140) {
            this.lastCutHaptic = performance.now();
            haptic('light');
          }
          break;
        case 'stone-near':
          this.view.emit(e.x, e.z, 3, 'spark');
          this.audio.tick();
          haptic('light');
          break;
        case 'stone':
          this.view.markStone(e.x, e.z);
          this.view.emit(e.x, e.z, 14, 'spark');
          this.view.kick(0.6);
          this.audio.stone();
          haptic('medium');
          this.toast('Taşa vurdun! Misina kısaldı', 'warn', 'stone', 3);
          break;
        case 'line-broken':
          this.audio.snap();
          haptic('heavy');
          this.toast("Misina komple koptu! Motoru durdur, MİSİNA TAK'a basılı tut", 'warn');
          break;
        case 'rethread-done':
          this.audio.ui();
          haptic('medium');
          this.toast('Yeni misina takıldı', 'good');
          break;
        case 'rethread-blocked':
          this.toast(e.reason === 'running' ? 'Misina takmak için önce motoru durdur (STOP)' : 'Makarada misina yok! Bidonun yanına git', 'warn', 'rethread', 2);
          break;
        case 'stop':
          this.audio.stopEngine();
          haptic('medium');
          this.updateStarterUi();
          break;
        case 'strain':
          this.toast('Motor zorlanıyor! Sık otta yavaş ilerle', 'warn', 'strain', 4);
          haptic('light');
          break;
        case 'bogged':
          this.audio.stopEngine(true);
          this.view.puff(18, 0.6);
          haptic('heavy');
          this.toast('Motor boğuldu! Ota çok hızlı daldın. İpi çek, yeniden çalıştır', 'warn');
          this.updateStarterUi();
          break;
        case 'engine-hot':
          this.toast('Motor çok ısındı! Gazı biraz kes', 'warn');
          haptic('medium');
          break;
        case 'overheat':
          this.audio.stopEngine(true);
          this.view.puff(25, 1);
          haptic('heavy');
          this.toast('Motor hararet yaptı ve durdu!', 'warn');
          this.updateStarterUi();
          this.updateHud(s);
          break;
        case 'cooled':
          this.toast('Motor soğudu, yeniden çalıştırabilirsin', 'good');
          this.updateStarterUi();
          this.updateHud(s);
          break;
        case 'trunk':
          if (e.kind === 'ocak') this.view.emit(e.x, e.z, 8, 'leaf');
          this.view.shakeBushAt(e.x, e.z);
          this.view.kick(0.4);
          if (e.kind !== 'mezar') this.audio.trunk();
          haptic('heavy');
          this.toast(KNOCK_TOAST[e.kind], 'warn', 'trunk', 3);
          break;
        case 'swarm':
          haptic('heavy');
          this.toast(s.field.hasStream ? 'Arılar kızdı! Kaç, dereye dal!' : 'Arılar kızdı! Hemen uzaklaş!', 'warn');
          break;
        case 'bees-gone':
          this.toast('Arılar kovana döndü', 'good', 'bees', 4);
          break;
        case 'sting':
          this.audio.sting();
          haptic('heavy');
          this.view.kick(0.5);
          $('sting-flash').classList.add('on');
          setTimeout(() => $('sting-flash').classList.remove('on'), 60);
          this.toast(`Arı soktu! −${HIVE.stingPenalty} TL`, 'warn', 'sting', 1);
          break;
        case 'snake':
          this.audio.snake();
          haptic(e.scared ? 'heavy' : 'medium');
          if (e.scared) this.view.kick(0.7);
          this.toast(e.scared ? 'Yılan! Ödün koptu, bir an dondun kaldın' : 'Otun içinden bir yılan kaçtı!', 'warn');
          break;
        case 'hen-hit':
          this.view.emit(e.x, e.z, 18, 'feather');
          this.audio.hen(true);
          haptic('heavy');
          this.toast('Tavuğa çarptın! Bağıra çağıra kaçtı −50 TL', 'warn');
          break;
        case 'hen-panic':
          if (performance.now() - this.lastCluck > 700) {
            this.lastCluck = performance.now();
            this.audio.hen(true);
          }
          break;
        case 'board':
          this.view.driveOrbit = 0;
          this.patGear = 0;
          this.audio.patpat(true);
          haptic('medium');
          this.updateStarterUi();
          this.toast('Sağda sürükle ve sür (tarifi: Ayarlar › Nasıl oynanır?)', 'good', 'board', 120);
          break;
        case 'alight':
          this.audio.patpat(false);
          this.lookYaw = s.yaw;
          this.updateStarterUi();
          break;
        case 'gate':
          this.audio.gate(e.open);
          break;
        case 'bump-vehicle':
          haptic('heavy');
          this.view.kick(0.5);
          this.audio.trunk();
          break;
        case 'slip':
          haptic('light');
          this.toast('Ayağın kayıyor! Şevde yavaş yürü', 'warn', 'slip', 4);
          break;
        case 'fall':
          this.audio.fall();
          this.audio.stopEngine();
          haptic('heavy');
          this.toast(this.save.upgrades.boots > 0 ? 'Düştün! Motor stop etti' : 'Düştün! Motor stop etti. Çivili çizme kaymayı azaltır', 'warn');
          this.updateStarterUi();
          break;
        case 'hose-cut':
          this.audio.hoseCut();
          haptic('heavy');
          this.view.kick(0.4);
          this.toast('Hortumu kestin! Su fışkırıyor −80 TL', 'warn');
          break;
        case 'intro':
          if (e.step === 'line') {
            this.audio.ui();
            this.toast('Tırpan elinde! Şimdi misinayı tak', 'good');
          } else {
            this.save.introDone = true;
            void writeSave(this.save);
            this.toast('Hazırsın! Bahçeye gir, motoru çalıştır', 'good');
            this.updateStarterUi();
          }
          break;
        case 'request-broken': {
          const c = s.level.client;
          $('request-chip').classList.add('broken');
          this.toast(`${c.name} memnun olmayacak: ${REQUEST_TEXT[c.request].toLocaleLowerCase('tr')} tutmadı`, 'warn');
          break;
        }
        case 'bump':
          this.audio.bump(e.ok);
          if (e.ok) this.view.emit(s.headX, s.headZ, 6, 'dust');
          else if (s.spool <= 0.001) this.toast('Makarada misina kalmadı! Sarı halkaya git', 'warn', 'spool', 4);
          break;
        case 'fuel-empty':
          this.audio.stopEngine();
          this.toast(this.save.noAds ? 'Benzin bitti! Bidonun yanına (sarı halka) git' : 'Benzin bitti! Bidona git ya da reklamla doldur', 'warn');
          haptic('heavy');
          this.updateStarterUi();
          break;
        case 'pull':
          this.onPull(e.result);
          break;
        case 'fuel-low':
          this.toast('Benzin azaldı', 'warn');
          break;
        case 'line-short':
          this.toast("Misina kısaldı: MİSİNA'ya bas", '', 'line', 6);
          break;
        case 'refill': {
          this.audio.refill();
          const what = e.fuel && e.line ? 'Benzin ve misina dolduruldu' : e.fuel ? 'Depo doldu' : 'Misina tamamlandı';
          this.toast(s.running || !e.fuel ? what : `${what}. Pompala ve motoru çalıştır`, 'good', 'refill', 3);
          this.updateStarterUi();
          break;
        }
        case 'tangle-warn':
          this.toast('Misinaya dikenli dal dolanıyor!', 'warn', 'tanglew', 4);
          haptic('medium');
          break;
        case 'tangled':
          this.audio.jam();
          haptic('heavy');
          this.toast("Misina böğürtlene dolandı! Motoru durdur, TEMİZLE'ye basılı tut", 'warn');
          break;
        case 'untangled':
          this.audio.ui();
          this.toast('Dikenler temizlendi', 'good');
          break;
        case 'bramble-hit':
          this.audio.bramble();
          this.view.emit(e.x, e.z, 3, 'leaf');
          break;
        case 'bramble-cleared':
          this.audio.coin();
          this.view.emit(e.x, e.z, 16, 'leaf');
          this.toast('Böğürtlen temizlendi +20 TL', 'good');
          break;
        case 'finish-ready':
          this.audio.success();
          $('btn-finish').classList.add('show');
          this.toast('%90 tamam! İstersen işi bitir, istersen temizle', 'good');
          break;
      }
    }
    s.events.length = 0;
  }

  private updateHud(s: Session): void {
    const cov = s.field.coverage;
    $('progress-fill').style.width = `${Math.min(100, cov * 100)}%`;
    $('progress-text').textContent = `%${Math.floor(cov * 100)}`;
    const fuel = $('fuel-fill');
    fuel.style.width = `${(s.fuel / s.gear.tank) * 100}%`;
    fuel.classList.toggle('low', s.fuel < s.gear.tank * 0.15);
    $('line-fill').style.width = `${(s.line / s.gear.lineMax) * 100}%`;
    $('spool-text').textContent = `${Math.round(s.spool * 100)} cm`;
    $('temp-fill').style.width = `${Math.min(1, s.temp) * 100}%`;
    document.querySelector('.gauge.temp')!.classList.toggle('hot', s.temp > ENGINE.hotWarn);
    document.body.classList.toggle('overheated', s.overheated);
    if (s.overheated) {
      // Off-engine cooling: temp(t) = temp0 * exp(-k t) until it reaches the restart temperature.
      const left = Math.max(0, Math.log(s.temp / ENGINE.restart) / ENGINE.coolOffK);
      $('oh-fill').style.width = `${Math.min(100, ((1 - s.temp) / (1 - ENGINE.restart)) * 100)}%`;
      $('oh-text').textContent = `Soğuması bekleniyor… yaklaşık ${Math.ceil(left)} sn`;
    }
    $('hud-time').textContent = `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`;
    $('hud-knocks').textContent = String(s.knocks);
    this.drawMinimap(s);
  }

  /** When fuel or line runs out, an arrow on screen points to the fuel can. */
  private updateGuide(s: Session): void {
    const lineOut = (s.broken && s.spool < TRIMMER.rethreadUse) || (s.line < TRIMMER.lineMin && s.spool < 0.01);
    const fuelOut = s.fuel < s.gear.tank * 0.15;
    // First job: the arrow shows the way to the pat pat with the trimmer in its trailer.
    const toTrailer = s.intro === 'take' && !s.nearVehicle;
    const show = toTrailer || ((lineOut || fuelOut) && !s.atDepot && !s.intro);
    $('guide').classList.toggle('show', show);
    if (!show) return;
    const goal = toTrailer ? s.field.vehicle : s.field.depot;
    const dx = goal.x - s.x;
    const dz = goal.z - s.z;
    const cam = this.view.camera.getWorldDirection(new THREE.Vector3());
    // Angle from the camera's forward to the depot, + = to the right.
    const ang = Math.atan2(cam.x * dz - cam.z * dx, cam.x * dx + cam.z * dz);
    $('guide-arrow').style.transform = `rotate(${(ang * 180) / Math.PI}deg)`;
    const what = fuelOut && lineOut ? 'Benzin ve misina' : fuelOut ? 'Benzin' : 'Misina';
    $('guide-text').textContent = toTrailer ? `Pat pat ${Math.round(Math.hypot(dx, dz))} m` : `${what}: bidon ${Math.round(Math.hypot(dx, dz))} m`;
  }

  private drawMinimap(s: Session): void {
    const c = $<HTMLCanvasElement>('minimap');
    const f = s.field;
    if (c.width !== f.gw || c.height !== f.gd) {
      c.width = f.gw;
      c.height = f.gd;
    }
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(f.gw, f.gd);
    const d = img.data;
    for (let k = 0; k < f.gw * f.gd; k++) {
      const h = f.grass[k];
      const o = k * 4;
      if (!f.mask[k]) {
        d[o] = 90;
        d[o + 1] = 70;
        d[o + 2] = 45;
      } else if (h <= 0.3) {
        d[o] = 196;
        d[o + 1] = 214;
        d[o + 2] = 120;
      } else {
        d[o] = 40;
        d[o + 1] = 92;
        d[o + 2] = 30;
      }
      d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const sx = f.gw / f.width;
    const sz = f.gd / f.depth;
    const px = (x: number) => (x + f.width / 2) * sx;
    const pz = (z: number) => (z + f.depth / 2) * sz;
    const bushColor: Record<BushKind, string> = { ocak: '#2a5a1c', mezar: '#d8d4c8', kaya: '#8b8a83' };
    for (const b of f.bushes) {
      ctx.fillStyle = bushColor[b.kind];
      ctx.beginPath();
      ctx.arc(px(b.x), pz(b.z), b.kind === 'ocak' ? 3.2 : b.kind === 'kaya' ? 3.5 * b.scale : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (f.hose.length > 1) {
      ctx.strokeStyle = f.hoseCut ? '#7fb6e0' : '#3fae4a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      f.hose.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
      ctx.stroke();
    }
    ctx.fillStyle = '#f2c230';
    for (const h of f.hives) ctx.fillRect(px(h.x) - 3, pz(h.z) - 3, 6, 6);
    ctx.fillStyle = '#ffffff';
    for (const h of f.hens) {
      if (h.state === 'gone' || !f.inField(h.x, h.z)) continue;
      ctx.beginPath();
      ctx.arc(px(h.x), pz(h.z), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#5a2a4a';
    for (const b of f.brambles) {
      if (b.hp <= 0) continue;
      ctx.beginPath();
      ctx.arc(px(b.x), pz(b.z), b.r * sx, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd23a';
    ctx.fillRect(px(f.depot.x) - 3, Math.min(f.gd - 5, pz(f.depot.z)) - 2, 6, 5);
    const mx = px(s.x);
    const my = Math.min(f.gd - 3, pz(s.z));
    ctx.strokeStyle = '#ff3b2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.sin(s.yaw) * 9, my + Math.cos(s.yaw) * 9);
    ctx.stroke();
    ctx.fillStyle = '#ff3b2a';
    ctx.beginPath();
    ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Free camera, for looking round the scene: C toggles it while playing (the game stops, the HUD
   * hides) or on the menu (round the village behind it, the menu hidden); Esc leaves it too. WASD move,
   * Q / E down / up, Shift faster, dragging the mouse looks round.
   */
  private bindFreeCam(): void {
    window.addEventListener('keydown', (e) => {
      const v = this.view;
      if (e.code === 'Escape' && v.freeCam) {
        v.freeCam = null;
        document.body.classList.remove('freecam');
        return;
      }
      if (e.code !== 'KeyC' || e.repeat || !this.freeCamMode) return;
      if (v.freeCam) v.freeCam = null;
      else {
        const p = v.camera.position;
        const d = v.camera.getWorldDirection(new THREE.Vector3());
        v.freeCam = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))) };
      }
      document.body.classList.toggle('freecam', !!v.freeCam);
      this.input.reset();
    });
    let drag: { x: number; y: number } | null = null;
    window.addEventListener('pointerdown', (e) => this.view.freeCam && (drag = { x: e.clientX, y: e.clientY }));
    window.addEventListener('pointerup', () => (drag = null));
    window.addEventListener('pointermove', (e) => {
      const c = this.view.freeCam;
      if (!c || !drag) return;
      c.yaw -= (e.clientX - drag.x) * 0.004;
      c.pitch = Math.max(-1.5, Math.min(1.5, c.pitch - (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY };
    });
  }

  /** Where the free camera may be used: in a job, or on the menu with nothing open over it. */
  private get freeCamMode(): boolean {
    return this.mode === 'playing' || (this.mode === 'menu' && !document.querySelector('.screen.show:not(#menu)'));
  }

  private mapOpen = false;
  /** Seconds the look hint has been on screen. */
  private lookHintFor = 0;
  /** First person: whether the view's pitch was last set for the trimmer in hand, and where it is easing to. */
  private pitchHands = false;
  private pitchEase: number | null = null;

  private toggleMap(open: boolean): void {
    this.mapOpen = open && this.mode === 'playing';
    if (this.session) $('map-title').textContent = `${this.session.field.region.name} Köyü`;
    $('map').classList.toggle('show', this.mapOpen);
    this.input.reset();
  }

  /** Draw the map with this job and where the worker and the pat pat are (village coordinates). */
  private drawMap(t: number): void {
    const s = this.session;
    if (!s) return;
    const o = s.field.origin;
    const v = s.field.vehicle;
    drawVillageMap(
      $<HTMLCanvasElement>('map-canvas'),
      {
        current: s.field.level.id,
        region: s.field.region.id,
        unlockedUpTo: UNLOCK_ALL ? 99 : this.save.unlocked,
        waiting: Object.fromEntries(LEVELS.map((l) => [l.id, this.readyIn(l) ? formatWait(this.readyIn(l)) : null])),
        worker: { x: s.x + o.x, z: s.z + o.z, yaw: s.yaw },
        patpat: { x: v.x + o.x, z: v.z + o.z },
      },
      t,
    );
  }

  private flyFreeCam(dt: number): void {
    const c = this.view.freeCam!;
    const k = (code: string) => (this.input.held(code) ? 1 : 0);
    const speed = (this.input.held('ShiftLeft') || this.input.held('ShiftRight') ? 18 : 5) * dt;
    const fwd = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown');
    const side = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
    // Facing (sin yaw, cos yaw); its right is (-cos yaw, sin yaw).
    c.x += (Math.sin(c.yaw) * fwd - Math.cos(c.yaw) * side) * speed;
    c.z += (Math.cos(c.yaw) * fwd + Math.sin(c.yaw) * side) * speed;
    c.y += (k('KeyE') - k('KeyQ')) * speed;
  }

  private loop(t: number): void {
    requestAnimationFrame((n) => this.loop(n));
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (this.view.freeCam && (this.mode === 'playing' || this.mode === 'menu')) {
      this.flyFreeCam(dt);
      this.view.frame(0);
      return;
    }
    if (this.mapOpen) {
      if (this.mode !== 'playing') this.toggleMap(false);
      else {
        this.drawMap(t / 1000);
        return;
      }
    }
    const s = this.session;
    if (this.mode === 'playing' && s) {
      const m = this.input.move2();
      const look = this.input.takeLook(dt);
      const fpv = this.view.mode === 'fpv';
      let moveX: number;
      let moveZ: number;
      if (fpv) {
        // Stick: up/down walks, left/right turns. Dragging on the right half looks around.
        // Turning right = yaw decreasing (facing (sin yaw, cos yaw), right = (-cos yaw, sin yaw)).
        this.lookYaw -= look.dx * 0.0065 + m.x * PLAYER.turnSpeed * dt;
        // Trimmer in hand the view looks down at the line; empty-handed, at eye level. Taking it up or
        // putting it away eases the view over (until then it stays where the player put it).
        const hands = this.session!.hasTrimmer;
        if (hands !== this.pitchHands) {
          this.pitchHands = hands;
          this.pitchEase = hands ? -0.55 : -0.06;
        }
        if (this.pitchEase !== null) {
          this.view.pitch += (this.pitchEase - this.view.pitch) * Math.min(1, dt * 3);
          if (Math.abs(this.pitchEase - this.view.pitch) < 0.01 || look.dy) this.pitchEase = null;
        }
        this.view.pitch = Math.max(-1.25, Math.min(0.55, this.view.pitch - look.dy * 0.004));
        moveX = Math.sin(this.lookYaw) * -m.y;
        moveZ = Math.cos(this.lookYaw) * -m.y;
      } else {
        // Follow camera: drag on the right half orbits it round the worker; walking is relative to it.
        this.view.orbitYaw -= look.dx * 0.006;
        this.view.orbitHeight = Math.max(0, Math.min(1, this.view.orbitHeight + look.dy * 0.004));
        const c = Math.cos(this.view.orbitYaw);
        const sn = Math.sin(this.view.orbitYaw);
        // Screen right = (cos, -sin), screen down = (sin, cos) for a camera behind at angle orbitYaw.
        moveX = m.x * c + m.y * sn;
        moveZ = -m.x * sn + m.y * c;
      }
      // First person: looking up past straight ahead lifts the trimmer off the ground.
      const lift = fpv ? Math.max(0, Math.min(1, (this.view.pitch - 0.05) / 0.45)) : 0;
      this.input.tickGas();
      const throttle = this.input.throttleLevel;
      const bump = this.input.takeBump();
      if (!this.save.tutorialSeen && (Math.hypot(m.x, m.y) > 0.3 || throttle)) {
        this.save.tutorialSeen = true;
        setTimeout(() => $('tutorial').classList.remove('show'), 2500);
      }
      // On the pat pat the stick is throttle (up; down brakes, then backs up) and steering (left / right).
      const drive = s.driving ? { throttle: -m.y, steer: m.x } : undefined;
      if (s.driving) {
        moveX = moveZ = 0;
        this.lookYaw = s.yaw;
        // Dragging on the right turns the camera round the pat pat; it drifts back behind when let go.
        this.view.driveOrbit -= look.dx * 0.006;
        if (look.dx === 0) this.view.driveOrbit *= Math.exp(-dt * 0.8);
        this.view.driveOrbit = Math.max(-Math.PI, Math.min(Math.PI, this.view.driveOrbit));
        this.audio.patpat(true, Math.min(1, Math.abs(s.field.vehicle.speed) / 4 + Math.max(0, -m.y) * 0.3), Math.min(1, Math.abs(s.field.vehicle.speed) / s.field.dims.forward));
        // The gear: into first or reverse as the stick is pushed from standing, or across from one to
        // the other; back to neutral once stopped with the stick let go.
        const dir = Math.abs(m.y) > 0.15 ? (m.y < 0 ? 1 : -1) : 0;
        if (dir && dir !== this.patGear) {
          this.audio.patpatGear();
          this.patGear = dir;
        } else if (!dir && Math.abs(s.field.vehicle.speed) < 0.1) this.patGear = 0;
      }
      s.advance(dt, {
        drive,
        moveX,
        moveZ,
        throttle,
        bump,
        yaw: fpv ? this.lookYaw : undefined,
        sweep: this.input.sweep,
        stop: this.input.takeStop(),
        rethread: this.input.rethreading || this.actionHeld,
        lift,
      });
      // The throttle lever: shown with the trimmer in hand and the engine running; back to idle when it
      // stops (it starts again ticking over, not flat out).
      const trimmerInHand = s.hasTrimmer && !s.driving && !s.intro;
      document.body.classList.toggle('gas-on', trimmerInHand && s.running);
      document.body.classList.toggle('trimmer-hand', trimmerInHand);
      // Trimmer in hand the right thumb is on the trigger: the left one walks and turns (looking).
      if (this.input.trimmer !== trimmerInHand) {
        this.input.trimmer = trimmerInHand;
        this.updateTutorialText();
      }
      // The look hint: it stays a few seconds, then goes as soon as the player moves (walks or looks).
      const hint = !this.save.lookSeen && !s.intro && !trimmerInHand;
      if (hint) {
        this.lookHintFor += dt;
        const moved = this.input.looked > 0 || Math.hypot(m.x, m.y) > 0.2;
        if (this.lookHintFor > 3 && moved) {
          this.save.lookSeen = true;
          void writeSave(this.save);
        }
      }
      document.body.classList.toggle('look-hint', hint);
      if (!s.running && this.input.throttleOn) this.input.setGas(0);
      if (throttle && s.cold) this.toast('Motor ısınıyor, birkaç saniye tam güç vermez', '', 'cold', 8);
      this.handleEvents(s);
      this.cutRate += (this.cutAcc / Math.max(dt, 1e-3) - this.cutRate) * 0.2;
      this.cutAcc = 0;
      this.audio.update(dt, s.rpm, s.cutting ? s.loadRatio : 0, true, s.temp, s.cutting ? this.cutRate : 0, s.strain, this.cutTall);
      this.input.renderPad(s.sweep / PLAYER.sweepMax, s.rpm);
      // (Heard only near it: from 12 m off, rising by the bank.)
      this.audio.setWater(Math.max(0, 1 - streamDistance(s.field, s.x, s.z) / 12));
      this.ambientSounds(s, dt);
      // Face shield: dirtied by the cut grass in first person.
      this.visor.visible = this.view.mode === 'fpv';
      // The face shield dirties slowly (the pro one about half as fast again).
      // In the first garden it dirties faster until the player has been told to wipe it once.
      const learn = this.level.id === LEVELS[0].id && !this.visorHinted ? 2.5 : 1;
      if (s.cutting) this.visor.feed(dt * (s.gear.proVisor ? 0.1 : 0.2) * learn, this.cutRate, this.cutTall);
      this.visor.update(dt);
      const dirt = this.visor.dirt;
      document.body.classList.toggle('visor-dirty', this.visor.visible && dirt > 0.12 && !this.visor.wiping);
      if (!this.visorHinted && dirt > 0.35 && this.visor.visible) {
        this.visorHinted = true;
        this.toast("Siperlik kirlendi! SİPERLİK'e bas, sil", 'warn');
      }
      document.body.classList.toggle('strain', s.strain > ENGINE.strainWarn);
      document.body.classList.toggle('fuel-empty', s.fuel <= 0 && !s.running && !this.save.noAds);
      $('btn-rethread').style.setProperty('--p', String(s.rethread));
      document.body.classList.toggle('line-broken', s.hasTrimmer && (s.broken || (s.line < TRIMMER.lineMin && s.spool < 0.01)));
      this.updateIntro(s);
      document.body.classList.toggle('tangled', s.tangle > 0.3);
      $('rethread-label').textContent = s.tangle > 0.3 ? 'TEMİZLE' : 'MİSİNA TAK';
      this.updateGuide(s);
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.2;
        this.updateHud(s);
      }
      if (s.field.coverage >= 0.995) this.finish();
    }
    if (this.mode !== 'paused') this.view.frame(dt);
    this.trackFps(dt);
  }

  /**
   * The context actions (a column of big buttons on the left): by the pat pat get on, put the trimmer
   * in the trailer or take it out; at the start of a job take the trimmer and fit line (held, with a
   * progress bar); on the pat pat get off. Rebuilt only when the choices change.
   */
  /**
   * The messages line up under the objective and beside the action buttons (on the left), never over
   * either of them; the right edge's round buttons stay clear too.
   */
  private placeToasts(): void {
    const box = $('toasts');
    const o = $('objective');
    const acts = $('actions');
    box.style.top = o.innerHTML ? `${o.getBoundingClientRect().bottom + 8}px` : '';
    const left = acts.children.length ? acts.getBoundingClientRect().right + 8 : 0;
    box.style.left = `${left}px`;
    box.style.right = left ? '62px' : '0';
  }

  private renderActions(list: { id: string; icon: string; label: string; sub: string; hold?: boolean; progress?: number; run?: () => void }[]): void {
    const box = $('actions');
    // A held button keeps its element while its text and bar move (rebuilding would drop the hold).
    const key = list.map((a) => `${a.id}|${a.label}|${a.hold ? '' : a.sub}`).join(';');
    if (key !== this.actionKey) {
      this.actionKey = key;
      // (The hints along the bottom move clear of the buttons on the left.)
      document.body.classList.toggle('has-acts', list.length > 0);
      requestAnimationFrame(() => this.placeToasts());
      this.actionHeld = false;
      box.innerHTML = '';
      for (const a of list) {
        const b = document.createElement('button');
        b.className = `action-btn${a.hold ? ' hold' : ''}`;
        b.dataset.id = a.id;
        b.innerHTML = `<span class="act-ic">${icon(a.icon)}</span><span class="act-text"><b>${a.label}</b><small>${a.sub}</small>${a.hold ? '<span class="act-bar"><i></i></span>' : ''}</span>`;
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.audio.unlock();
          if (a.hold) this.actionHeld = true;
          else {
            this.audio.ui();
            haptic('medium');
            a.run?.();
          }
        });
        for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => (this.actionHeld = false));
        box.appendChild(b);
      }
    }
    for (const a of list) {
      if (!a.hold) continue;
      const b = box.querySelector<HTMLElement>(`[data-id="${a.id}"]`);
      const small = b?.querySelector('small');
      if (small && small.textContent !== a.sub) small.textContent = a.sub;
      const bar = b?.querySelector<HTMLElement>('.act-bar i');
      if (bar) bar.style.width = `${Math.round((a.progress ?? 0) * 100)}%`;
    }
  }

  /** What to do next at the start of a job (with an arrow to the pat pat), and the context actions. */
  private updateIntro(s: Session): void {
    document.body.classList.toggle('intro', !!s.intro);
    document.body.classList.toggle('driving', s.driving);
    const acts: Parameters<Game['renderActions']>[0] = [];
    if (s.driving) {
      const rolling = Math.abs(s.field.vehicle.speed) > 0.5;
      acts.push({ id: 'off', icon: 'i-tractor', label: 'İN', sub: rolling ? 'önce dur' : s.field.tractor ? 'traktörden in' : 'patpattan in', run: () => s.alight() });
      if (s.canOpenGate) acts.push({ id: 'gate', icon: 'i-lock', label: 'KAPIYI AÇ', sub: 'avlu kapısı', run: () => s.openGate() });
      if (s.canShutGate) acts.push({ id: 'gate-shut', icon: 'i-lock', label: 'KAPIYI KAPAT', sub: 'avlu kapısı', run: () => s.shutGate() });
    } else if (s.intro === 'line') {
      acts.push({ id: 'line', icon: 'i-rethread', label: 'MİSİNA TAK', sub: s.rethread > 0 ? `sarılıyor %${Math.round(s.rethread * 100)}` : 'basılı tut', hold: true, progress: s.rethread });
    } else {
      // (Roaming there is no job to take the trimmer for.)
      if (s.canTake && !s.roaming) acts.push({ id: 'take', icon: 'i-hand', label: 'TIRPANI AL', sub: 'kasadan al', run: () => s.takeTrimmer() });
      if (s.canBoard) acts.push({ id: 'board', icon: 'i-tractor', label: s.field.tractor ? 'TRAKTÖRE BİN' : 'PATPATA BİN', sub: s.roaming ? 'köyü gez' : !s.vehicleAtField ? 'tarlaya sür' : 'bidonu yanına getir', run: () => s.board() });
      if (s.canDrop) acts.push({ id: 'drop', icon: 'i-hand', label: 'TIRPANI BIRAK', sub: 'kasaya koy', run: () => s.dropTrimmer() });
      if (s.canOpenGate) acts.push({ id: 'gate', icon: 'i-lock', label: 'KAPIYI AÇ', sub: 'avlu kapısı', run: () => s.openGate() });
      if (s.canShutGate) acts.push({ id: 'gate-shut', icon: 'i-lock', label: 'KAPIYI KAPAT', sub: 'avlu kapısı', run: () => s.shutGate() });
      if (s.atHouse) acts.push({ id: 'shop', icon: 'i-coins', label: 'DÜKKAN', sub: 'boya, avlu, alet', run: () => this.openShopInGame() });
    }
    // At a locked field's gate, on foot or driving.
    // At another field's gate (on foot or driving): open it for money, or take on its job.
    const gate = this.gateNear(s);
    if (gate?.kind === 'buy') acts.push({ id: 'unlock', icon: 'i-lock', label: 'BÖLÜMÜ AÇ', sub: this.unlockLabel(gate.lv), run: () => void this.buyUnlock(gate.lv) });
    if (gate?.kind === 'switch') acts.push({ id: 'switch', icon: 'i-map', label: 'BU İŞE GEÇ', sub: gate.lv.name, run: () => void this.switchJob(gate.lv) });
    this.renderActions(acts);
    let text = '';
    // The vehicle by name (the pat pat carries the trimmer in its trailer; nothing rides on the tractor).
    const tr = s.field.tractor;
    const to = tr ? 'Traktöre' : 'Patpata';
    if (s.intro === 'take') {
      const v = s.field.vehicle;
      const near = s.nearVehicle;
      const d = Math.round(Math.hypot(v.x - s.x, v.z - s.z));
      const arrow = this.arrowTo(s, v.x, v.z);
      const name = s.field.level.name;
      if (s.driving && s.vehicleAtField) text = `Tarlaya geldin: dur ve İN'e bas<small>Sonra tırpanı ${tr ? 'al' : 'kasadan al'}</small>`;
      else if (s.driving) {
        // Along the way: towards a point a little way on along the route, the distance still to go.
        const r = this.routeAhead(s);
        text = `${this.arrowTo(s, r.x, r.z)}${name}: ${r.left} m<small>Yolu takip et · HARİTA'da işin yeri işaretli</small>`;
      }
      else if (!s.vehicleAtField) text = near ? `${to} bin, tarlaya sür<small>${to.toLocaleUpperCase('tr')} BİN butonuna bas</small>` : `${arrow}${to} git (${d} m)<small>${tr ? 'Traktör yolun başında' : 'Patpat yolun başında, tırpan kasasında'}</small>`;
      else text = near ? (tr ? 'Tırpanını al' : 'Tırpan patpatın kasasında: al onu') : `${arrow}${to} git (${d} m)<small>Sürükleyerek yürü, köyde istediğin yere gidebilirsin</small>`;
    } else if (!s.intro && !s.vehicleAtField) {
      // Carrying on from the last job: to the pat pat, then on to this job's field.
      const v = s.field.vehicle;
      const name = s.field.level.name;
      if (s.driving) {
        const r = this.routeAhead(s);
        text = `${this.arrowTo(s, r.x, r.z)}${name}: ${r.left} m<small>Yolu takip et · HARİTA'da işin yeri işaretli</small>`;
      } else if (s.nearVehicle) text = `${to} bin, ${name} tarlasına sür<small>${tr ? 'Tırpan seninle gelir' : 'Binince tırpan kasaya konur'}</small>`;
      else text = `${this.arrowTo(s, v.x, v.z)}${to} git (${Math.round(Math.hypot(v.x - s.x, v.z - s.z))} m)<small>Sıradaki iş: ${name}</small>`;
    } else if (s.intro === 'line') {
      const p = Math.round(s.rethread * 100);
      text = p > 0 ? `Misina sarılıyor: %${p}<small>Bırakma, birazdan biter</small>` : 'Misina takılı değil<small>MİSİNA TAK butonuna basılı tut</small>';
      text += `<span class="obj-bar"><i style="width:${p}%"></i></span>`;
    }
    // (Roaming: no job to point to.)
    if (this.roaming) text = '';
    const el = $('objective');
    if (el.innerHTML !== text) {
      el.innerHTML = text;
      this.placeToasts();
    }
  }

  /** An arrow (inline SVG) pointing from the worker towards (x, z) as seen from the camera. */
  private arrowTo(s: Session, x: number, z: number): string {
    const cam = this.view.camera.getWorldDirection(new THREE.Vector3());
    const dx = x - s.x;
    const dz = z - s.z;
    const ang = Math.round((Math.atan2(cam.x * dz - cam.z * dx, cam.x * dx + cam.z * dz) * 180) / Math.PI / 5) * 5;
    return `<svg class="ic" style="transform: rotate(${ang}deg)"><use href="#i-arrow"/></svg>`;
  }

  /** On the way to the job: a point some 12 m on along the route from the pat pat, and the metres left. */
  /**
   * Coming up to a locked field's gate (on foot or driving): the next one in turn can be opened for
   * money there and then (returned, for its button); for the others, say which comes first.
   */
  private gateNear(s: Session): { lv: LevelDef; kind: 'buy' | 'switch' } | null {
    const f = s.field;
    const p = s.driving ? f.head(f.vehicle.x, f.vehicle.z, f.vehicle.yaw, f.vehicle.art) : { x: s.x, z: s.z };
    // The nearest gate within reach.
    let o: (typeof f.others)[number] | null = null;
    let best = 6;
    for (const q of f.others) {
      const gx = q.level.theme === 'mezarlik' ? (q.minX + q.maxX) / 2 : q.entryX;
      const d = Math.hypot(p.x - gx, p.z - (q.maxZ + 1.5));
      if (d < best) {
        best = d;
        o = q;
      }
    }
    if (o) {
      const lv = o.level;
      // A neighbour's garden: its posted job can be taken on from here (none posted: nothing to do).
      if (lv.id >= 100) return lv.pay ? { lv, kind: 'switch' } : null;
      if (lv.id > this.save.unlocked) {
        this.toast(`${lv.name} kilitli: önceki işleri bitir ya da BÖLÜMÜ AÇ ile hemen aç`, 'warn', `lock-${lv.id}`, 25);
        return { lv, kind: 'buy' };
      }
      // Open, and grown: its job can be taken on here; still growing back: how long.
      const wait = this.readyIn(lv);
      if (wait) {
        this.toast(`${lv.name}: otlar uzuyor (${formatWait(wait)})`, '', `grow-${lv.id}`, 25);
        return null;
      }
      return { lv, kind: 'switch' };
    }
    return null;
  }

  /**
   * Take on another field's job from its gate: the day goes on from here (the pat pat and the worker
   * where they are), the new field built behind the loading screen. Half a job left behind is asked
   * about first (it is not paid).
   */
  private async switchJob(lv: LevelDef): Promise<void> {
    const s = this.session;
    if (!s || this.mode !== 'playing') return;
    const done = Math.round(s.field.coverage * 100);
    if (done >= 2) {
      this.mode = 'paused';
      const go = await this.ask(lv.name, `Şu anki iş yarım kalacak (%${done}), parası ödenmez.<br>Bu işe geçmek istiyor musun?`, 'Geç');
      this.mode = 'playing';
      this.last = performance.now();
      if (!go) return;
    }
    this.lastJob = s.carryOver();
    // (From Serbest gez: the job starts from here, a job like any other.)
    this.roaming = false;
    document.body.classList.remove('roam');
    void this.startWithLoader(lv);
  }

  private routeAhead(s: Session): { x: number; z: number; left: number } {
    const l = s.field.lane;
    const v = s.field.vehicle;
    let n = 0;
    for (let i = 1; i < l.length; i++) if ((l[i].x - v.x) ** 2 + (l[i].z - v.z) ** 2 < (l[n].x - v.x) ** 2 + (l[n].z - v.z) ** 2) n = i;
    let left = 0;
    for (let i = n + 1; i < l.length; i++) left += Math.hypot(l[i].x - l[i - 1].x, l[i].z - l[i - 1].z);
    const p = l[Math.min(l.length - 1, n + 15)];
    return { x: p.x, z: p.z, left: Math.round(left / 5) * 5 };
  }

  /** Footsteps and splashes, bees, the spraying hose and passing cars, by where the worker is. */
  private ambientSounds(s: Session, dt: number): void {
    const f = s.field;
    if (s.driving) this.audio.walk(0, 'grass', s.wading);
    else if (s.speed > 0.2) {
      const onRoad = f.roadX !== null && Math.abs(s.x - f.roadX) < 3;
      const g = f.grassAt(s.x, s.z);
      const surface = onRoad ? 'road' : !f.inField(s.x, s.z) ? 'grass' : g > 1.2 ? 'tall' : g > 0.3 ? 'grass' : 'soil';
      this.audio.walk(s.speed * dt, surface, s.wading);
    } else this.audio.walk(0, 'grass', s.wading);
    let bees = 0;
    for (const h of f.hives) {
      const d = Math.hypot(h.sx - s.x, h.sz - s.z);
      bees = Math.max(bees, h.swarm > 0 ? Math.max(0, 1 - d / 10) : Math.max(0, 1 - d / 4) * 0.25);
    }
    this.audio.setBees(bees);
    const hc = f.hoseCut;
    this.audio.setSpray(hc ? Math.max(0, 1 - Math.hypot(hc.x - s.x, hc.z - s.z) / 12) : 0);
    const car = this.view.critters?.nearestCar ?? Infinity;
    this.audio.setTraffic(Math.max(0, 1 - car / 45) ** 2);
  }

  /** Drop the quality one step if the game is clearly struggling. */
  private trackFps(dt: number): void {
    if (this.mode !== 'playing' || params.has('quality')) return;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc < 4) return;
    const fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    if (fps < 40 && this.view.quality !== 'low' && !this.save.quality) {
      const q: Quality = this.view.quality === 'high' ? 'medium' : 'low';
      this.view.setQuality(q);
    }
  }

  /** For tests. */
  levelById(id: number): LevelDef | undefined {
    return LEVELS.find((l) => l.id === id);
  }

  /** For tests. */
  get result(): Result | null {
    return this.lastResult;
  }
}

const game = new Game();
(window as unknown as { __game: Game }).__game = game;
void game.boot();
