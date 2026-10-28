import './styles.css';
import './hud.css';
import * as THREE from 'three';
import { GameAudio } from './audio/audio';
import { BushKind, DAILY, ENGINE, EXTRAS, HIVE, LEVELS, LINE_TYPES, LevelDef, MACHINES, NO_UPGRADES, PLAYER, REQUEST_TEXT, SNAKE, COW, BIG_PULL, THEME_NAME, TRIMMER, Theme, UPGRADES, WEATHER_ICON, WEATHER_NAME, Weather, VEHICLES, DECOR, PAINTS } from './game/config';
import { CarryOver, Result, Session } from './game/session';
import { PRIMES_NEEDED, PullResult, Starter } from './game/starter';
import { Input } from './input/input';
import { Visor } from './ui/visor';
import { initAds, maybeInterstitial, setAdsRemoved, showRewarded } from './platform/ads';
import { COIN_PACKS, HARVEST_NOW, STARTER, STARTER_ID, buyProduct, buyRemoveAds, ownsRemoveAds, ownsStarter, productPrices, removeAdsPrice, restoreRemoveAds } from './platform/store';
import { DEFAULT_SAVE, SaveData, haptic, initPlatform, loadSave, setVibration, writeSave } from './platform/native';
import { preloadBushTextures } from './render/hazelnut';
import { preloadGround } from './render/scenery';
import { streamDistance } from './render/stream';
import { Models, loadModels } from './render/models';
import { Quality, View } from './render/view';
import { WorldView } from './render/world';
import { MOBILE } from './platform/device';
import { drawVillageMap, preloadVillageArt } from './ui/villageMap';
import { formatWait, readyIn } from './game/regrow';
import { makeIlan } from './game/ilan';
import { GoldKind, goldArt } from './ui/goldArt';
import { ShopPreview } from './render/shopPreview';
import { ALL_DONE_BONUS, JobDone, TaskDef, dayTasks, taskCount } from './game/tasks';
import { activeEvents, eventPay } from './game/events';
import { REGIONS, setPosted, village } from './game/village';
import { HARVEST, HarvestState, beansKg, capacityOf, dryWithAd, harvestHint, harvestNeeds, harvestOn, harvestSacks, loadSack, newHarvest, sellNuts, spreadSack, suckCell, tickHarvest } from './game/harvest';
import { HEAP_R, harmanCells, harvestSpots, inSpot, loadSpot, pickPiles, sackPile, tarpSpot } from './render/harvest';
import { WOOD, cutAt, cutStand, gatePile, inCrown, layTree, loadLog, logsWaiting, newWood, pickFieldTree, pileSpots, sellStock, stackLog, treeBlocks, treePoint, underTree, woodCapacity, woodSpots } from './game/wood';
import type { FieldTree, LogPile, WoodState } from './game/wood';
import { TILL, layBostan, pickTillTask, tillAt, tillPay, tilled } from './game/tiller';
import type { TillTask } from './game/tiller';
import { TILLER_AHEAD } from './render/tiller';
import { BURN, blow, burnPay, heaped, pickBurnTask, revealTufts } from './game/burn';
import type { BurnTask } from './game/burn';
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

/**
 * How far the starter's handle may be pulled, px (the cord on screen: see .cord in hud.css). A full,
 * fast pull is 87 % of it in about 290 ms: the same pull as ever, scaled with the panel.
 */
const PULL_PX = 108;
/**
 * The harvest: seconds a sack takes to load or spread (held) and between the hose's sucks; how far the
 * hose reaches from the patos and its mouth to a heap (m).
 */
const SACK_PACE = 0.55;
/** The village the harvest is in (Yeşilyamaç). */
const HARVEST_REGION = 1;
/** The job list's tab for the harvest. */
const HARVEST_TAB = -1;
/** The storm's tree: seconds the chainsaw takes through a piece at full throttle (less throttle, longer; ticking over it does not cut), and a log to load or stack. */
const CUT_PACE = 2.2;
const LOG_PACE = 0.7;
/** The chainsaw's starter: as the trimmer's, its carburettor always primed (it has no primer bulb). */
function sawStarter(): Starter {
  const st = new Starter();
  st.primes = PRIMES_NEEDED;
  return st;
}
/** The evening's work (once a day, in Karadere, by its barn): its cows brought home; from which job, how many, the pay. */
const EVENING = { needs: 11, cows: 4, pay: 500 };
/** A vehicle that is a tractor (the small one or the big one): the trailer and the patos go behind it. */
const isTractor = (id: string | undefined): boolean => id === 'traktor' || id === 'buyuk';
/** How near a hidden snake the dog smells it out (m). */
const DOG_NOSE = 4;
/** How near the tree's middle the chainsaw is taken in hand (m). */
const TREE_NEAR = 12;
/** A time left as a clock, hours:minutes:seconds (47:59:59). */
const clock = (ms: number): string => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`;
};
const SUCK_PACE = 0.5;
const HOSE_REACH = 14;
const SUCK_REACH = 1.6;
/** Seconds the camera stays turned round the vehicle, driving on untouched, before it comes back behind. */
const ORBIT_HOLD = 4;

/**
 * First person, the look down at the line with the trimmer in hand (radians): the screen held sideways
 * is short, so further down than the hands' own pitch to keep the head in view.
 */
const TRIMMER_PITCH = -0.75;

/** Shop pictures in public/textures (shop-<id>.webp), preloaded at start. */
const SHOP_PICTURES = ['patpat', 'traktor', 'romork', 'patos', 'emektar', 'usta', 'sirt', 'yuvarlak', 'koseli', 'burgulu', 'kulaklik', 'siperlik', 'depo', 'kalin', 'kafa', 'motor', 'cizme'];

/** Development: every field playable without unlocking. Set to false before release. */
const UNLOCK_ALL = true;
/** Development: ?tirpan in the address starts jobs in the field, trimmer in hand (no pat pat ride). */
const DEV_TRIMMER = new URLSearchParams(location.search).has('tirpan');

/**
 * Frames drawn a second at most, playing and on the menu (its yard behind the buttons). A phone's 120 Hz
 * screen would otherwise have them drawn twice as often for nothing: a powerful phone keeps up and heats.
 */
const FPS_CAP = 60;
const MENU_FPS = 30;
/** On the menu with a screen over it (the shop, the store, the job map, a card): the yard behind needs only this. */
const OVERLAY_FPS = 5;
/** Development: the purse never runs below this, in the browser and in the test APK (DEV_MONEY_ON). Set DEV_MONEY_ON to false before release. */
const DEV_MONEY = 9_999_999;
const DEV_MONEY_ON = true;

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
  /** Automatic quality: the highest it may go now (lowered for good when the game struggled at a level), and the smooth spells in a row. */
  private autoCeiling: Quality = 'high';
  private fpsSmooth = 0;
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
  /** Which held action is held (the harvest's ÇUVAL YÜKLE, BOŞALT VE SER). */
  private heldId = '';
  /** The harvest in this job: its patos turning, its hose in the worker's hands, sucking now; a held action's pace. */
  private patosRunning = false;
  private hoseInHand = false;
  private sucking = 0;
  private harvestT = 0;
  /** The objective's text and the line button's label as last put on the page (set only when they change). */
  private objText = '';
  private rethreadLabel = '';
  /** Seconds since the camera was last turned round the vehicle. */
  private orbitIdle = 0;
  /** The harvest is drawn and played in this job (Yeşilyamaç, once its gardens are done). */
  private harvestHere = false;
  /** The storm's wood is drawn and played in this job (Karadere, once the chainsaw's job is open). */
  private woodHere = false;
  /** Serbest gez with logs waiting by the gates or on the vehicle: the steps to bring them home told. */
  private wooding = false;
  private woodT = 0;
  /** A storm's tree down in this job's garden (null: none), and how many cuts it has had. */
  private woodTree: FieldTree | null = null;
  private woodCut = 0;
  /** How far the chainsaw is through the piece it is on (0..1; kept when the throttle is let go). */
  private sawT = 0;
  /**
   * The chainsaw's own engine: started on the trimmer's starter (no primer: just the choke and the cord;
   * cold, choke on till it coughs, then off and pull again; warm, a pull), running while it is in hand
   * (put away it stops), warm once it has run in this job.
   */
  private sawStarter = sawStarter();
  private sawRunning = false;
  /** The chainsaw was in hand last frame (its starter shown or hidden when that changes). */
  private sawWasInHand = false;
  /**
   * The motor çapa: this job's tilling (null: none asked for), the tiller taken out of the vehicle, its
   * engine (as the chainsaw's: choke and cord), how far the work had got when last told (quarters).
   */
  private tillTask: TillTask | null = null;
  private tillerInHand = false;
  private tillWasInHand = false;
  private tillStarter = sawStarter();
  private tillRunning = false;
  private tillQuarter = 0;
  /**
   * The cut grass to blow together and burn (null: not asked for); the blower taken out of the vehicle,
   * its engine; which tuft to look at next for the grass mown under it; whether the heap's being ready
   * has been told.
   */
  private burnTask: BurnTask | null = null;
  private blowerInHand = false;
  private blowerWasInHand = false;
  private blowerStarter = sawStarter();
  private blowerRunning = false;
  private burnReveal = 0;
  private burnReady = false;
  /** The evening's cows being brought home (Serbest gez started from the menu's Akşam button); all home told. */
  private eveningRun = false;
  private eveningDone = false;
  /** Seconds to the dog's next bark while it is after a snake. */
  private barkT = 0;
  /** Coming in from the other village by its road (lastJob holds where): starts driving at its way out. */
  private arrival = false;
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
    if (import.meta.env.DEV || DEV_MONEY_ON) this.save.money = Math.max(this.save.money, DEV_MONEY);
    setVibration(this.save.vibration);
    this.audio.setVolume(this.save.sfxVolume);
    setAdsRemoved(this.save.noAds);
    void this.checkStore();
    const q = (params.get('quality') as Quality) || this.save.quality || this.defaultQuality();
    this.view = new View($<HTMLCanvasElement>('game'), q);
    // The 3D context dropped by the phone (the screen off a while, the GPU memory taken back): asked
    // back, and once it is, the game opened again from the save (the textures and models are gone with
    // the old context). Saved first so nothing of the job's progress outside it is lost.
    const canvas = $<HTMLCanvasElement>('game');
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      void writeSave(this.save);
    });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
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
      // Back from the screen being off: the 3D drawn again at once (some WebViews show a blank page
      // until the next change otherwise).
      onForeground: () => {
        this.view.resize();
        this.view.frame(0);
      },
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
      'İpucu: bayırdan inerken yavaş yürü, ayağın kayar.',
      'İpucu: arılar kızınca dereye dal, peşini bırakırlar.',
    ];
    let tip = 0;
    const tipTimer = window.setInterval(() => ($('loading-tip').textContent = tips[++tip % tips.length]), 2600);
    [this.models] = await Promise.all([loadModels((p) => ($('load-fill').style.width = `${20 + p * 70}%`)), preloadBushTextures(), preloadGround(), preloadVillageArt()]);
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
    s.field.tractor = isTractor(this.save.vehicle);
    s.field.bigTractor = this.save.vehicle === 'buyuk';
    s.field.trailer = this.trailerOn ? { yaw: NaN } : null;
    this.audio.setTractor(s.field.tractor, s.field.bigTractor);
    this.view.swapVehicle(this.models);
  }

  /** Serbest gez: in the village without a job. */
  private roaming = false;
  /** The job about to start was taken on while roaming (it starts with the trimmer in the vehicle). */
  private fromRoam = false;
  /**
   * The next job taken on from the result: the finished field stays as it is, the worker puts the
   * trimmer in the vehicle and drives to the next field's gate, where it is loaded and opens.
   */
  private travelTo: LevelDef | null = null;
  /**
   * Fındık Harmanı played (started from its tab): its steps told and its buttons shown. Serbest gez
   * is the player's own: a harvest under way is seen there but asks nothing.
   */
  private harvesting = false;
  /** Entered from the harvest's tab (the fields' gates and tips keep quiet; from Serbest gez they do not). */
  private harvestTab = false;
  /** The harvest's step last told (a warning when it changes to one that needs it). */
  private guideKey = '';
  /** A line under the shop's tabs: what a purchase or a hitch did, or why it cannot be had. */
  private shopNote: { text: string; kind: '' | 'warn' | 'good' } | null = null;
  /** Where closing the shop goes back to, when not the menu (the harvest's card that sent the player there). */
  private shopBack: (() => void) | null = null;
  /** The store's price for starting a harvest at once, once asked. */
  private harvestPrice = '';

  /** Pictures decoded ahead of the screens that show them (held so they stay decoded). */
  private readonly warmed: HTMLImageElement[] = [];

  /** The patos bought and hitched (instead of the trailer), behind the tractor driven. */
  private get patosHitched(): boolean {
    return isTractor(this.save.vehicle) && !!this.save.vehicles?.includes('patos') && !!this.save.patosOn;
  }

  /** Something on the tractor's hitch: the trailer or the patos (and which, for the scene). */
  private get trailerOn(): boolean {
    WorldView.towed = this.patosHitched ? 'patos' : 'romork';
    return this.patosHitched || (isTractor(this.save.vehicle) && !!this.save.vehicles?.includes('romork') && !this.save.trailerOff);
  }

  /** Menu background: the worker with his trimmer standing in front of the pat pat, on the harman at home. */
  private menuSession(): Session {
    // (The menu's yard is just the yard: no harvest drawn there, whatever the last job left.)
    WorldView.harvest = false;
    const s = new Session(LEVELS[0], NO_UPGRADES);
    // The vehicle chosen in the shop stands there.
    s.field.tractor = isTractor(this.save.vehicle);
    s.field.bigTractor = this.save.vehicle === 'buyuk';
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

  /**
   * Automatic quality's start: computers high; phones low (a Galaxy A05s: ~50 fps low, ~32 fps medium),
   * a strong one (8 cores and 6 GB or more) medium. While playing it goes up a step when smooth, down
   * when struggling (see trackFps). (On a phone each quality draws fewer pixels: View's PHONE_RATIO.)
   */
  private defaultQuality(): Quality {
    if (!MOBILE) return 'high';
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0;
    return (navigator.hardwareConcurrency ?? 0) >= 8 && memory >= 6 ? 'medium' : 'low';
  }

  // ---------------------------------------------------------------- screens
  /** "Buy X for N TL?" over the shop; true when bought. */
  private confirmBuy(name: string, price: number): Promise<boolean> {
    return this.ask(name, `<b>${price.toLocaleString('tr-TR')} TL</b> karşılığında satın almak istiyor musun?<br><small>Kalan paran: ${(this.save.money - price).toLocaleString('tr-TR')} TL</small>`, 'Satın Al');
  }

  /** A yes/no question over whatever is on screen; true for yes. */
  /**
   * A rewarded ad; true when the reward was earned. Not earned (closed early, none to show, no
   * connection), it says so: the player otherwise sees nothing happen.
   */
  private async rewarded(text: string): Promise<boolean> {
    const ok = await showRewarded(text);
    if (!ok) this.notice('Reklam tamamlanmadı', 'Ödül verilmedi. Reklam sonuna kadar izlenmedi ya da şu an reklam yok; biraz sonra yeniden dene.');
    return ok;
  }

  /** A short notice: a message while playing, a card with one button elsewhere. */
  private notice(title: string, text: string): void {
    if (this.mode === 'playing') {
      this.toast(`${title}: ${text}`, 'warn');
      return;
    }
    const no = $('btn-confirm-no');
    no.style.display = 'none';
    void this.ask(title, text, 'Tamam').then(() => (no.style.display = ''));
  }

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
    this.updateHarvestBtn();
    this.offerHarvest();
    this.updateEveningBtn();
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
    if (withAd && (await this.rewarded(`+${amount * 2} TL!`))) amount *= 2;
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
    b.innerHTML = `<img class="cb-art" src="./harita/rozet-reklamsiz.webp" alt=""><span>Reklamsız</span>`;
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

  /**
   * A job's card (picked on the map, or a coffee-house notice): the customer with what they say, and what
   * the job is — its pay, the field's size, how heavy the grass, what is in it, the weather, the
   * customer's wish and tip, the best done there; KABUL ET starts it.
   */
  private openCall(lv: LevelDef): void {
    if (this.readyIn(lv)) return this.offerRegrow(lv);
    this.regrowFor = lv;
    const c = lv.client;
    $('call-face').innerHTML = picture([`${c.face}.webp`], 'i-person');
    $('call-name').textContent = lv.id < 100 ? `${lv.id}. ${lv.name}` : lv.name;
    $('call-place').innerHTML = `${c.name} · ${lv.place} · ${THEME_NAME[lv.theme]}`;
    $('call-text').textContent = `“${c.call}”`;
    const pay = eventPay(lv, new Date());
    const w = this.weatherOf(lv);
    const load = lv.giant ? 'Dev ot' : (lv.grassLoad ?? 1) >= 1.25 ? 'Ağır ot' : (lv.grassLoad ?? 1) < 0.9 ? 'Hafif ot' : 'Normal ot';
    const has = [lv.stones ? `${lv.stones} taş` : '', lv.hives ? 'Arı kovanı' : '', lv.snakes ? 'Yılan' : '', lv.banks ? 'Bayır' : '', lv.stream ? 'Dere' : '', lv.hose ? 'Hortum' : ''].filter(Boolean);
    const best = this.save.best[lv.id];
    $('call-facts').innerHTML = [
      `<span class="pay">${pay === lv.pay ? '' : `<s>${lv.pay}</s> `}${pay.toLocaleString('tr-TR')} TL</span>`,
      `<span>${Math.round(lv.width * lv.depth).toLocaleString('tr-TR')} m²</span>`,
      `<span>${load}</span>`,
      `<span>${icon(WEATHER_ICON[w])} ${WEATHER_NAME[w]}</span>`,
      ...has.map((t) => `<span>${t}</span>`),
      c.request === 'none' ? '' : `<span>İstek: ${REQUEST_TEXT[c.request]} · +${c.tip} TL</span>`,
      best ? `<span class="best">En iyi: ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}</span>` : '',
    ].join('');
    $('btn-call-ok').onclick = () => {
      $('call').classList.remove('show');
      if (this.canTravelTo(lv)) this.beginTravel(lv);
      else void this.startWithLoader(lv);
    };
    this.show('call');
  }

  /** The next job can be driven to from the finished one: just finished, in the same village. */
  private canTravelTo(lv: LevelDef): boolean {
    const s = this.session;
    if (this.mode !== 'result' || !s || this.roaming) return false;
    return s.field.others.some((o) => o.level.id === lv.id) || ((lv.region ?? 1) !== s.field.region.id && !!s.field.exit);
  }

  /** The other village (the one the way out leads to). */
  private otherRegion(s: Session): (typeof REGIONS)[number] | null {
    return REGIONS.find((r) => r.id !== s.field.region.id && LEVELS.some((l) => (l.region ?? 1) === r.id)) ?? null;
  }

  /**
   * Driving up to the village's way out, roaming or on the way to a job over there: the board's button
   * takes the player there (returned: where to).
   */
  private exitNear(s: Session): (typeof REGIONS)[number] | null {
    const e = s.field.exit;
    const v = s.field.vehicle;
    if (!e || !s.driving || Math.hypot(v.x - e.x, v.z - e.z) > 10) return null;
    if (!this.roaming && !(this.travelTo && (this.travelTo.region ?? 1) !== s.field.region.id)) return null;
    return this.otherRegion(s);
  }

  /**
   * Arriving in a village by its road: on it some way in from the way out, facing into the village,
   * the worker beside the seat (village coordinates; `level` is the one coming from).
   */
  private arrivalAt(region: number, level: number): CarryOver | null {
    const r = REGIONS.find((q) => q.id === region);
    const t = r && village(r).roads[0].pts;
    if (!t || t.length < 4) return null;
    // (Outside its arch if it has one: driven in under it.)
    const ab = village(r).archBack;
    const inFrom = ab === undefined ? 8 : Math.min(8, ab - 4);
    let i = t.length - 1;
    for (let d = 0; i > 3 && d < inFrom; i--) d += Math.hypot(t[i].x - t[i - 1].x, t[i].z - t[i - 1].z);
    const p = t[i];
    const q = t[i - 3];
    const yaw = Math.atan2(q.x - p.x, q.z - p.z);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    return { level, region, vehicle: { x: p.x, z: p.z, yaw, art: 0 }, worker: { x: p.x + fx * 0.6 + fz * 1.5, z: p.z + fz * 0.6 - fx * 1.5, yaw } };
  }

  /** Off to the other village: Serbest gez there, or the job there being travelled to. */
  private leaveVillage(to: (typeof REGIONS)[number]): void {
    const s = this.session;
    if (!s || this.mode !== 'playing') return;
    const lv = this.travelTo;
    const carry = this.arrivalAt(to.id, s.level.id);
    if (!carry) return;
    this.lastJob = carry;
    this.arrival = true;
    this.travelTo = null;
    document.body.classList.remove('travel');
    if (lv) {
      this.fromRoam = true;
      void this.startWithLoader(lv, `${to.name} yolu…`);
    } else {
      this.levelTab = to.id;
      void this.startRoam();
    }
  }

  /** Back into the finished field to drive on to the next job (see travelTo). */
  private beginTravel(lv: LevelDef): void {
    const s = this.session!;
    this.travelTo = lv;
    s.state = 'running';
    $('btn-finish').classList.remove('show');
    this.mode = 'playing';
    this.last = performance.now();
    this.show('hud');
    document.body.classList.add('playing', 'travel');
    this.audio.startAmbience({ rain: s.field.level.weather === 'rain', ezan: 'never', traffic: false });
    this.updateStarterUi();
    const far = (lv.region ?? 1) !== s.field.region.id;
    this.toast(far ? `Tırpanı ${s.field.tractor ? 'traktöre' : 'patpata'} koy, köy çıkışından ${REGIONS.find((r) => r.id === lv.region)?.name ?? 'öbür köy'} yoluna sür` : `Tırpanı ${s.field.tractor ? 'traktöre' : 'patpata'} koy, ${lv.name} bahçesine sür`, 'good', 'travel', 4, 3500);
  }

  /** On the way to the next job: arrived at its gate with the trimmer in the vehicle, it is loaded there. */
  private travelStep(s: Session): void {
    const lv = this.travelTo;
    if (!lv || s.hasTrimmer) return;
    const g = this.gatePoint(s, lv);
    const v = s.field.vehicle;
    if (!g || Math.hypot(v.x - g.x, v.z - g.z) > 9) return;
    if (s.driving && Math.abs(v.speed) > 0.3) return;
    this.travelTo = null;
    document.body.classList.remove('travel');
    this.lastJob = s.carryOver();
    // (It starts as a job taken on at its gate: the trimmer in the vehicle, to be taken out.)
    this.fromRoam = true;
    void this.startWithLoader(lv);
  }

  /** A field's gate (where its job is taken on), in this field's coordinates. */
  private gatePoint(s: Session, lv: LevelDef): { x: number; z: number } | null {
    const q = s.field.others.find((o) => o.level.id === lv.id);
    if (!q) return null;
    return { x: q.level.theme === 'mezarlik' ? (q.minX + q.maxX) / 2 : q.entryX, z: q.maxZ + 1.5 };
  }

  /** The field shown in the regrow offer (the last one asked for). */
  private regrowFor: LevelDef = LEVELS[0];

  private async watchAdToRegrow(): Promise<void> {
    const lv = this.regrowFor;
    if (!(await this.rewarded('Otlar büyüdü!'))) return;
    if (this.save.mownAt) delete this.save.mownAt[lv.id];
    void writeSave(this.save);
    this.openCall(lv);
  }

  private updateMoney(): void {
    // (Never running out while testing: topped up again when it runs low.)
    if ((import.meta.env.DEV || DEV_MONEY_ON) && this.save.money < DEV_MONEY / 10) {
      this.save.money = DEV_MONEY;
      void writeSave(this.save);
    }
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
    list.className = tab === 0 || tab === HARVEST_TAB ? 'level-grid' : 'saga';
    $('levels').classList.toggle('saga-on', tab !== 0 && tab !== HARVEST_TAB);
    const head = (text: string, sub = '') => {
      const h = document.createElement('div');
      h.className = 'lv-head';
      h.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
      list.appendChild(h);
    };
    // (The harvest has no tab any more: the menu's Fındık Harmanı button and card.)
    if (tab === HARVEST_TAB) {
      this.levelTab = HARVEST_REGION;
      this.openLevels();
      return;
    }
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
          if (!(await this.rewarded('Yeni ilan geldi!'))) return;
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
    const map = list.firstElementChild as HTMLElement;
    list.classList.toggle('wide-map', map.classList.contains('wide'));
    this.show('levels');
    if (map.classList.contains('wide')) list.scrollLeft = Math.max(0, (focus.x / 100) * map.clientWidth - list.clientWidth * 0.5);
    else list.scrollTop = Math.max(0, (focus.y / 100) * map.clientHeight - list.clientHeight * 0.55);
  }

  /**
   * The job map is moved by dragging it, like a page on the phone: fingers do that already; this gives
   * the mouse the same (with a little glide after letting go), and a drag does not count as a tap.
   */
  private dragToScroll(el: HTMLElement): void {
    let startY = 0, startTop = 0, lastY = 0, lastT = 0, speed = 0, moved = false, down = false, glide = 0;
    let startX = 0, startLeft = 0, lastX = 0, speedX = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !el.classList.contains('saga')) return;
      cancelAnimationFrame(glide);
      down = true;
      moved = false;
      startY = lastY = e.clientY;
      startTop = el.scrollTop;
      startX = lastX = e.clientX;
      startLeft = el.scrollLeft;
      speedX = 0;
      lastT = performance.now();
      speed = 0;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      if (Math.abs(e.clientY - startY) > 6 || Math.abs(e.clientX - startX) > 6) moved = true;
      el.scrollTop = startTop - (e.clientY - startY);
      el.scrollLeft = startLeft - (e.clientX - startX);
      const now = performance.now();
      speed = (lastY - e.clientY) / Math.max(1, now - lastT);
      speedX = (lastX - e.clientX) / Math.max(1, now - lastT);
      lastY = e.clientY;
      lastX = e.clientX;
      lastT = now;
    });
    window.addEventListener('pointerup', () => {
      if (!down) return;
      down = false;
      let v = speed * 16;
      let vx = speedX * 16;
      const step = () => {
        if (Math.abs(v) < 0.5 && Math.abs(vx) < 0.5) return;
        el.scrollTop += v;
        el.scrollLeft += vx;
        v *= 0.93;
        vx *= 0.93;
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
   * job is a wooden badge with its number and what it pays. Gives where the next job is (percent of the
   * map across and down) for the scroll.
   */
  private drawSaga(list: HTMLElement, tab: number): { x: number; y: number } {
    const jobs = LEVELS.filter((l) => (l.region ?? 1) === tab);
    const region = REGIONS.find((r) => r.id === tab)!;
    const open = (lv: LevelDef) => UNLOCK_ALL || lv.id <= this.save.unlocked;
    const fresh = this.sagaSeen && this.save.unlocked > this.sagaSeen ? this.save.unlocked : 0;
    this.sagaSeen = this.save.unlocked;
    const art = SAGA_MAPS[tab];
    const map = document.createElement('div');
    // (A wide picture: the whole village in view at once, its jobs smaller.)
    const wide = !!art && art.w > art.h;
    map.className = `saga-map${art ? ' art' : ''}${wide ? ' wide' : ''}`;
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
    // (Not on a wide picture: its road runs across, not up; the padlocks say it there.)
    const mist = wide || lockAt < 0 ? 0 : lockAt === 0 ? 100 : (pts[lockAt - 1].y + pts[lockAt].y) / 2;
    map.innerHTML = `${road}${mist ? `<div class="saga-mist" style="height:${mist}%"></div>` : ''}
      <div class="saga-sign"><b>${region.name}</b><small>${jobs[0] && open(jobs[0]) ? `<img src="./harita/yildiz.webp" alt=""> ${stars} / ${jobs.length * 3}` : 'Önceki köy bitince açılır'}</small></div>`;
    const firstLocked = jobs.find((l) => !open(l));
    // The worker's pin: on the first open job not done yet.
    const nextJob = jobs.find((l) => open(l) && !this.save.best[l.id]);
    let focus = pts[0];
    jobs.forEach((lv, i) => {
      const locked = !open(lv);
      const best = this.save.best[lv.id];
      const wait = locked ? 0 : this.readyIn(lv);
      const next = lv === nextJob;
      if (next || (!nextJob && (lv === firstLocked || (!firstLocked && i === last)))) focus = pts[i];
      const b = document.createElement('button');
      b.className = `saga-node${locked ? ' locked' : ''}${best ? ' done' : ''}${next ? ' next' : ''}${wait ? ' growing' : ''}${lv.id === fresh ? ' fresh' : ''}${pts[i].x < 50 ? ' pin-left' : ''}`;
      b.style.left = `${pts[i].x}%`;
      b.style.top = `${pts[i].y}%`;
      const starRow = [0, 1, 2].map((k) => `<img src="./harita/${best && k < best.stars ? 'yildiz' : 'yildiz-bos'}.webp" alt="">`).join('');
      b.innerHTML = `${next ? '<img class="sn-pin" src="./harita/pin.webp" alt="">' : ''}
        <span class="sn-disc"><b>${locked ? '<img class="sn-lock" src="./harita/kilit.webp" alt="">' : lv.id}</b></span>
        ${locked ? '' : `<span class="sn-stars">${starRow}</span>`}
        ${next ? `<span class="sn-name">${lv.name}</span>` : ''}
        ${lv === firstLocked ? `<span class="sn-tag price">${this.unlockLabel(lv)}</span>` : wait ? `<span class="sn-tag wait">${icon('i-clock')} ${formatWait(wait)}</span>` : locked || (wide && !next) ? '' : this.payChip(lv)}`;
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
    WorldView.dog = !!this.save.dog && !!this.save.decor?.includes('kulube');
  }

  /** A job's pay on the map, under its badge (an event's raise in pink). */
  private payChip(lv: LevelDef): string {
    const pay = eventPay(lv, new Date());
    return `<span class="sn-tag pay${pay === lv.pay ? '' : ' event'}">${pay.toLocaleString('tr-TR')} TL</span>`;
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
    if (!this.save.noAds) card(`<img class="ok" src="./harita/rozet-reklamsiz.webp" alt="">`, 'Reklamsız Oyna', 'İşler arasındaki reklamlar kalkar. Ödüllü reklamlar isteğe bağlı kalır.', 'İNCELE', true, () => {
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
        this.shopNote = null;
        this.openShop();
      };
      bar.appendChild(t);
    }
    const list = $('shop-list');
    list.innerHTML = '';
    const note = $('shop-note');
    note.textContent = this.shopNote?.text ?? '';
    note.className = `shop-note ${this.shopNote?.kind ?? ''}`;
    note.style.display = this.shopNote ? '' : 'none';
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
    // Something for later on, not on sale yet: greyed, a padlock and the job it opens at on its button;
    // tapped, it says so.
    const lockedCard = (pic: string, name: string, desc: string, wait: number) => {
      const c = card(pic, name, desc, '', `🔒 ${wait}. İŞ`, true, () => {
        this.audio.ui();
        this.shopNote = { text: `${name} ${wait}. işe gelince satışa çıkar. Önce önceki işleri bitir.`, kind: 'warn' };
      });
      c.classList.add('locked');
    };
    // The artist's shop picture (shop-<id>.webp), or an icon until there is one.
    const pic = (id: string, fallback: string) => picture([`shop-${id}.webp`], fallback);
    // Machines and line types: buy once, then pick one.
    const choice = (items: { id: string; name: string; desc: string; price: number; needs?: number }[], pics: Record<string, string>, selected: string, pick: (id: string) => void) => {
      for (const it of items) {
        const owned = eq.owned.includes(it.id);
        const on = selected === it.id;
        const wait = owned ? null : this.lockedUntil(it.needs);
        if (wait) {
          lockedCard(pics[it.id], it.name, it.desc, wait);
          continue;
        }
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
      // Karabaş, the dog: free, adopted once the kennel is bought (its picture from its own model).
      if (this.koyPart === 'avlu') {
        const kennel = owned.includes('kulube');
        const mine = !!this.save.dog;
        const desc = 'Kangal köpeği. Seninle işe gelir, saklı yılanları önceden bulup kaçırır. Ücretsiz.';
        const c = card(pic('koy-kopek', 'i-person'), 'Karabaş', desc, '', mine ? 'SENİN' : kennel ? 'SAHİPLEN' : 'ÖNCE KULÜBE', !mine, () => {
          if (!kennel) {
            this.audio.ui();
            this.shopNote = { text: 'Karabaş’ı sahiplenmek için önce Köpek Kulübesi’ni al', kind: 'warn' };
            return;
          }
          this.save.dog = true;
          this.audio.success();
          haptic('medium');
          this.shopNote = { text: `Karabaş artık senin! ${this.shopInGame ? 'Bir sonraki işte' : 'İşe'} seninle gelir, saklı yılanları bulur`, kind: 'good' };
        }, mine);
        if (!kennel) c.classList.add('locked');
        preview(c, 'kopek');
      }
    } else if (this.shopTab === 'arac') {
      // Vehicles: the pat pat is had from the start; the tractor shows what is coming.
      const owned = this.save.vehicles ?? ['patpat'];
      const using = this.save.vehicle ?? 'patpat';
      for (const v of VEHICLES) {
        const has = owned.includes(v.id);
        const wait = has ? null : this.lockedUntil(v.needs);
        if (wait) {
          lockedCard(pic(v.id, 'i-tractor'), v.name, v.desc, wait);
          continue;
        }
        if (v.attach) {
          // The trailer and the patos: bought once (the tractor first), then hitched on or left off; one at a time.
          const patos = v.id === 'patos';
          const hitched = has && (patos ? !!this.save.patosOn : !this.save.trailerOff && !this.save.patosOn);
          const tractor = owned.includes('traktor') || owned.includes('buyuk');
          const canBuy = tractor && this.save.money >= v.price;
          const label = has ? (hitched ? 'ÇIKAR' : 'TAK') : tractor ? `${v.price.toLocaleString('tr-TR')} TL` : 'ÖNCE TRAKTÖR';
          const state = has ? `<span class="hitch-badge${hitched ? ' on' : ''}">${hitched ? (isTractor(using) ? 'TAKILI' : 'TAKILI · TRAKTÖRÜ SEÇ') : 'TAKILI DEĞİL'}</span>` : '';
          card(pic(v.id, 'i-tractor') + state, v.name, v.desc, '', label, has || canBuy || !tractor, () => {
            if (!has && !tractor) {
              this.shopNote = { text: `${v.name} sadece traktöre takılır: önce traktörü al`, kind: 'warn' };
              return;
            }
            if (!has) {
              if (!canBuy) return;
              this.save.money -= v.price;
              this.save.vehicles = [...owned, v.id];
              this.audio.coin();
            } else this.audio.ui();
            // Hitched (just bought or put on): the other one off; or taken off.
            const on = !has || !hitched;
            const other = patos ? owned.includes('romork') && !this.save.trailerOff && !this.save.patosOn : !!this.save.patosOn;
            if (patos) {
              this.save.patosOn = on;
              if (on) this.save.trailerOff = true;
            } else {
              this.save.trailerOff = !on;
              if (on) this.save.patosOn = false;
            }
            // Said plainly: what is on the hitch now, what came off, and the tractor to be picked.
            const off = on && other ? ` ${patos ? 'Römork' : 'Patos'} çıkarıldı (ikisi birden takılmaz).` : '';
            const pick = on && !isTractor(using) ? ' Traktörü SEÇ: arkasında gelir.' : '';
            const carry = !on && !patos ? ' Traktör artık çuval taşımaz.' : on && patos ? ' Çuval taşımak için römorku tak ya da patpatı seç.' : '';
            this.shopNote = { text: `${v.name} ${on ? 'takıldı' : 'çıkarıldı'}.${off}${pick}${carry}`, kind: on ? 'good' : '' };
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
          const towed = this.save.patosOn && owned.includes('patos') ? 'patos' : owned.includes('romork') && !this.save.trailerOff ? 'römork' : '';
          this.shopNote = {
            text: isTractor(v.id) ? `${v.name} seçildi.${towed ? ` Arkasında ${towed} takılı.` : ' Arkasında bir şey takılı değil.'}` : `${v.name} seçildi.${owned.includes('traktor') ? ' Römork ve patos traktörde kalır.' : ''}`,
            kind: 'good',
          };
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
      // The chainsaw (Odun İşi): bought once; on sale once its job is open.
      const sw = WOOD.saw;
      const hasSaw = eq.owned.includes(sw.id);
      const sawWait = hasSaw ? null : this.lockedUntil(WOOD.needs);
      if (sawWait) lockedCard(pic('testere', 'i-engine'), sw.name, sw.desc, sawWait);
      else
        card(pic('testere', 'i-engine'), sw.name, sw.desc, '', hasSaw ? 'ALINDI' : `${sw.price.toLocaleString('tr-TR')} TL`, !hasSaw && this.save.money >= sw.price, () => {
          if (hasSaw || this.save.money < sw.price) return;
          this.save.money -= sw.price;
          eq.owned.push(sw.id);
          this.audio.coin();
          this.shopNote = { text: this.shopInGame ? 'Motorlu testere alındı: tırpanı kasaya bırak, devrik ağacın yanına git, KES' : 'Motorlu testere alındı. Karadere’de fırtınanın devirdiği ağaçları kesebilirsin; kütükler senin', kind: 'good' };
        }, hasSaw);
      // The backpack blower: bought once; on sale once its job is open.
      const bl = BURN.tool;
      const hasBlower = eq.owned.includes(bl.id);
      const blowWait = hasBlower ? null : this.lockedUntil(BURN.needs);
      if (blowWait) lockedCard(pic('ufleyici', 'i-engine'), bl.name, bl.desc, blowWait);
      else
        card(pic('ufleyici', 'i-engine'), bl.name, bl.desc, '', hasBlower ? 'ALINDI' : `${bl.price.toLocaleString('tr-TR')} TL`, !hasBlower && this.save.money >= bl.price, () => {
          if (hasBlower || this.save.money < bl.price) return;
          this.save.money -= bl.price;
          eq.owned.push(bl.id);
          this.audio.coin();
          this.shopNote = { text: 'Üfleme makinesi alındı: patpatın kasasında. Bahçe sahibi otu yakmanı isteyince kasadan ÜFLEYİCİYİ AL', kind: 'good' };
        }, hasBlower);
      // The motor çapa: bought once; on sale once its job is open.
      const tl = TILL.tool;
      const hasTill = eq.owned.includes(tl.id);
      const tillWait = hasTill ? null : this.lockedUntil(TILL.needs);
      if (tillWait) lockedCard(pic('capa', 'i-engine'), tl.name, tl.desc, tillWait);
      else
        card(pic('capa', 'i-engine'), tl.name, tl.desc, '', hasTill ? 'ALINDI' : `${tl.price.toLocaleString('tr-TR')} TL`, !hasTill && this.save.money >= tl.price, () => {
          if (hasTill || this.save.money < tl.price) return;
          this.save.money -= tl.price;
          eq.owned.push(tl.id);
          this.audio.coin();
          this.shopNote = { text: 'Motor çapa alındı: patpatın kasasında. Bahçe sahibi çapa isteyince kasadan ÇAPAYI AL', kind: 'good' };
        }, hasTill);
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
    document.querySelectorAll<HTMLButtonElement>('#set-quality button').forEach((b) => b.classList.toggle('on', b.dataset.q === (this.save.quality ?? 'auto')));
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
    on('btn-wallet-plus', () => this.openStore());
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
    on('btn-shop', () => {
      this.shopNote = null;
      this.shopBack = null;
      this.openShop();
    });
    on('btn-shop-close', () => {
      // From the yard: back to the job (resume closes it); from the harvest's card: back to it; from the menu: back to the menu.
      const back = this.shopBack;
      this.shopBack = null;
      if (this.shopInGame) this.resume();
      else if (back) back();
      else this.show('menu');
    });
    on('btn-harvest', () => this.openHarvest());
    on('btn-evening', () => {
      if (this.save.eveningDay === today()) {
        this.notice('Akşam', 'Bugünün inekleri ahırda. Yarın akşam yine gel.');
        return;
      }
      this.levelTab = 2;
      void this.startRoam('evening');
    });
    // The messages sit under the objective and right of the buttons on the left: placed again when either changes size.
    new ResizeObserver(() => this.placeToasts()).observe($('objective'));
    new ResizeObserver(() => this.placeToasts()).observe($('actions'));
    on('btn-harvest-close', () => $('harvest-offer').classList.remove('show'));
    // The menu's harvest button counts down (and its card, open, with it).
    window.setInterval(() => {
      if (this.mode !== 'menu') return;
      this.updateHarvestBtn();
      // The card's clock; at nought the card shows what comes next.
      for (const el of document.querySelectorAll<HTMLElement>('#harvest-body [data-until]')) {
        const left = Number(el.dataset.until) - this.now();
        el.textContent = clock(left);
        if (left <= 0) this.drawHarvest($('harvest-body'));
      }
    }, 1000);
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
        const q = b.dataset.q as Quality | 'auto';
        if (q === 'auto') {
          delete this.save.quality;
          this.autoCeiling = 'high';
          this.view.setQuality(this.defaultQuality());
        } else {
          this.save.quality = q;
          this.view.setQuality(q);
        }
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
        $('tut-left').innerHTML = `${move} Sol: yürü, sağa sola dön<br>Sağ: sürükle, yukarı aşağı bak · GAZ: tetiğin üstü tam gaz`;
        $('tut-right').innerHTML = '';
      } else {
        $('tut-left').innerHTML = `${move} Sol: sürükle, yürü`;
        $('tut-right').innerHTML = `Sağ: sürükle, etrafa bak ${drag}`;
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
      const d = Math.max(0, Math.min(PULL_PX, e.clientY - y0));
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
      const len = max / (PULL_PX * 0.87);
      const speed = max / Math.max(1, tMax - t0); // px per ms
      const strength = Math.min(1, len) * Math.max(0.3, Math.min(1, speed / (PULL_PX * 0.003)));
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
    const ok = await this.rewarded('Motor soğutuldu!');
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
    const ok = await this.rewarded('Depo doldu!');
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
    const ok = await this.rewarded(`+${r.total} TL kazandın!`);
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

  /** A tool with its own engine in hand and not running (the chainsaw, the tiller): the starter is its. */
  private get toolStarting(): boolean {
    const off = (this.view.sawInHand && !this.sawRunning) || (this.tillerInHand && !this.tillRunning) || (this.blowerInHand && !this.blowerRunning);
    return off && !!this.session && !this.session.driving && this.mode === 'playing';
  }

  /** The starter of the tool in hand, and its name. */
  private get toolStarter(): Starter {
    return this.tillerInHand ? this.tillStarter : this.blowerInHand ? this.blowerStarter : this.sawStarter;
  }
  private get toolName(): string {
    return this.tillerInHand ? 'Çapa' : this.blowerInHand ? 'Üfleyici' : 'Testere';
  }

  private prime(): void {
    const s = this.session;
    if (!s || s.running || this.mode !== 'playing' || this.toolStarting) return;
    this.audio.unlock();
    s.starter.prime();
    this.audio.prime();
    haptic('light');
    this.updateStarterUi();
  }

  private choke(): void {
    const s = this.session;
    if (this.toolStarting) {
      this.toolStarter.setChoke(!this.toolStarter.choke);
      this.audio.choke();
      haptic('light');
      this.updateStarterUi();
      return;
    }
    if (!s || s.running || this.mode !== 'playing') return;
    s.starter.setChoke(!s.starter.choke);
    this.audio.choke();
    haptic('light');
    this.updateStarterUi();
  }

  private pullCord(strength: number): void {
    const s = this.session;
    if (this.toolStarting) {
      this.pullSaw(strength);
      return;
    }
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

  /** The tool's cord pulled (the chainsaw's, the tiller's): it coughs, starts (then the trigger and STOP), or not. */
  private pullSaw(strength: number): void {
    const st = this.toolStarter;
    const name = this.toolName;
    const r = st.pull(strength);
    haptic(strength > 0.6 ? 'medium' : 'light');
    this.audio.crank(r === 'weak' ? strength * 0.5 : strength);
    if (r === 'weak') this.toast('Daha uzun ve hızlı çek!', '', 'weak', 1.5);
    else if (r === 'cough') {
      this.audio.cough(3);
      this.toast('Öksürdü! Jikleyi bırak, tekrar çek', 'good');
    } else if (r === 'flooded') {
      this.audio.cough(1, true);
      this.toast(`${name} boğuldu! Jikle kapalı birkaç kez çek`, 'warn', 'flood', 2);
    } else if (r === 'start') {
      haptic('heavy');
      if (this.blowerInHand) {
        this.blowerRunning = true;
        this.toast('Üfleyici çalıştı! Gaz tetiğine bas, otu yığına doğru üfle. Çok gaz daha uzağa', 'good');
      } else if (this.tillerInHand) {
        this.tillRunning = true;
        this.toast('Çapa çalıştı! Gaz tetiğine bas, yürü: bıçaklar toprağı kabartır. Çok gaz daha hızlı', 'good');
      } else {
        this.sawRunning = true;
        this.toast('Testere çalıştı! Gaz tetiğine bas, kes. Az gaz yavaş, çok gaz hızlı keser', 'good');
      }
    }
    this.updateStarterUi();
  }

  private updateStarterUi(): void {
    const s = this.session;
    // (The chainsaw in hand, not running: its starter, without the primer.)
    const saw = this.toolStarting;
    document.body.classList.toggle('saw-start', saw);
    const off = !!s && !s.running && !s.intro && !s.driving && (s.hasTrimmer || saw) && this.mode === 'playing' && !this.travelTo;
    document.body.classList.toggle('engine-off', off);
    if (!s || !off) return;
    const st = saw ? this.toolStarter : s.starter;
    // (The bulb's lower third is its base: the dome above it fills, a third with each press.)
    const primed = Math.min(1, st.primes / PRIMES_NEEDED);
    $('bulb-fill').style.height = `${primed > 0 ? 35 + primed * 65 : 0}%`;
    $('btn-choke').classList.toggle('on', st.choke);
    $('choke-text').textContent = st.choke ? 'JİKLE ÇEKİLİ' : 'JİKLE';
    let hint: string;
    let focus: 'prime' | 'choke' | 'cord';
    if (saw) {
      if (st.flooded) {
        hint = st.choke ? "Boğuldu: JİKLE'yi bırak" : 'Boğuldu: ipi birkaç kez çek';
        focus = st.choke ? 'choke' : 'cord';
      } else if (!st.warm && !st.popped && !st.choke) {
        hint = `${this.toolName} soğuk: JİKLE'yi çek`;
        focus = 'choke';
      } else if ((st.popped || st.warm) && st.choke) {
        hint = st.popped ? "Öksürdü! JİKLE'yi bırak" : "Motor sıcak: JİKLE'yi bırak";
        focus = 'choke';
      } else {
        hint = `${this.toolName} çalıştır: İPİ sertçe çek`;
        focus = 'cord';
      }
    } else if (s.overheated) {
      hint = 'Motor hararet yaptı: soğumasını bekle';
      focus = 'cord';
    } else if (s.fuel <= 0) {
      hint = 'Depo boş! Sarı halkaya, bidonun yanına git';
      focus = 'cord';
    } else if (st.dry) {
      hint = `POMPA'ya bas ${st.primes}/${PRIMES_NEEDED}`;
      focus = 'prime';
    } else if (st.flooded) {
      hint = st.choke ? "Boğuldu: JİKLE'yi bırak" : 'Boğuldu: ipi birkaç kez çek';
      focus = st.choke ? 'choke' : 'cord';
    } else if (!st.warm && !st.popped && !st.choke) {
      hint = "Soğuk motor: JİKLE'yi çek";
      focus = 'choke';
    } else if (st.popped && st.choke) {
      hint = "Öksürdü! JİKLE'yi bırak";
      focus = 'choke';
    } else if (st.warm && st.choke) {
      hint = "Sıcak motor: JİKLE'yi bırak";
      focus = 'choke';
    } else {
      hint = st.popped || st.warm ? 'İPİ sertçe çek!' : 'İPİ hızlıca aşağı çek';
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
  private async startRoam(job: '' | 'harvest' | 'evening' = ''): Promise<void> {
    const tab = this.levelTab ?? 1;
    const def = LEVELS.find((l) => (l.region ?? 1) === tab) ?? LEVELS[0];
    const place = job === 'harvest' ? 'Fındık Harmanı' : job === 'evening' ? 'Akşam' : (REGIONS.find((r) => r.id === tab)?.name ?? 'Köy');
    this.eveningRun = job === 'evening';
    this.eveningDone = false;
    this.roaming = true;
    this.harvesting = job === 'harvest';
    this.wooding = false;
    this.harvestTab = job !== '';
    this.guideKey = '';
    // (Coming in by the road keeps where: see leaveVillage.)
    if (!this.arrival) this.lastJob = null;
    await this.startWithLoader(def, `${place} hazırlanıyor…`);
  }

  start(def: LevelDef): void {
    // Today's events may raise the pay.
    // (The evening's cows: Serbest gez of a late afternoon, the dark falling.)
    if (!this.roaming) this.eveningRun = false;
    const lv = { ...def, weather: this.eveningRun ? ('evening' as const) : this.weatherOf(def), pay: eventPay(def, new Date()) };
    this.view.herd = this.eveningRun ? EVENING.cows : 0;
    this.view.duskLevel = this.eveningRun ? 0.15 : null;
    this.level = def;
    // Every job starts on the pat pat by the house at the top of the slope, the trimmer in the trailer without line.
    // (Development: ?tirpan in the address starts every job in the field with the trimmer in hand.)
    const from = this.roaming ? 'home' : DEV_TRIMMER ? 'ready' : !this.save.introDone && def.id === LEVELS[0].id ? 'home' : 'patpat';
    // On from the last job's field if the day goes on; from home after the menu.
    this.session = new Session(lv, this.save.upgrades, this.input.easy ? 1.5 : 1, this.save.equipment, from, this.roaming && !this.arrival ? undefined : (this.lastJob ?? undefined));
    // Roaming: nothing to do first (no trimmer to take for a job).
    if (this.roaming) {
      this.session.intro = null;
      this.session.roaming = true;
    } else if (this.fromRoam) {
      // On from Serbest gez where it was: the trimmer in the vehicle without line, as a job's start.
      const s = this.session;
      s.intro = 'take';
      s.hasTrimmer = false;
      s.line = 0;
      s.broken = true;
    }
    this.fromRoam = false;
    // In from the other village by its road: at the wheel, the trimmer in the vehicle.
    if (this.arrival) {
      this.session.hasTrimmer = false;
      this.session.board();
      this.arrival = false;
    }
    if (!this.roaming) this.harvesting = this.wooding = this.harvestTab = false;
    document.body.classList.toggle('roam', this.roaming);
    this.travelTo = null;
    document.body.classList.remove('travel');
    // The vehicle bought and chosen in the shop.
    this.session.field.tractor = isTractor(this.save.vehicle);
    this.session.field.bigTractor = this.save.vehicle === 'buyuk';
    this.session.field.trailer = this.trailerOn ? { yaw: NaN } : null;
    this.audio.setTractor(this.session.field.tractor, this.session.field.bigTractor);
    this.lastJob = null;
    // The coffee-house jobs stand in the neighbours' gardens.
    this.refreshIlanlar();
    // The other fields' boards show a padlock beyond the jobs open to the player, or how long until
    // a field mown not long ago has grown back.
    // The fields still locked by the player's own progress show it (chain and padlock), even while
    // development lets every job be played from the list.
    WorldView.unlockedUpTo = this.save.unlocked;
    WorldView.exitTo = this.otherRegion(this.session)?.name ?? null;
    this.applyLook();
    WorldView.waitText = Object.fromEntries(LEVELS.map((l) => [l.id, this.readyIn(l) ? `Ot uzuyor: ${formatWait(this.readyIn(l))}` : 'Hazır']));
    // The harvest, in Yeşilyamaç once its gardens are done.
    const hv = this.harvest();
    this.harvestHere = this.session.field.region.id === HARVEST_REGION && !!hv && hv.stage !== 'idle';
    // Serbest gez with a harvest of the player's left half done: its steps told as from its tab.
    if (this.roaming && this.harvestHere && harvestOn(hv)) this.harvesting = true;
    // A new harvest's sacks: two places by the village's tracks, picked afresh for each harvest.
    if (this.harvestHere && hv && hv.stage === 'collect' && !hv.piles) {
      const p = pickPiles(this.session.field, Math.random);
      if (p) {
        hv.piles = p;
        void writeSave(this.save);
      }
    }
    this.session.field.harvestPiles = hv?.piles;
    WorldView.harvest = this.harvestHere;
    // The storm's wood in Karadere: now and then a tree down in the garden (the first time it can be, always;
    // in rain more often); the logs waiting by the gates (the ones fetched dropped).
    const wd = this.session.field.region.id === WOOD.region ? this.wood() : null;
    this.woodHere = !!wd;
    this.woodTree = null;
    this.woodCut = this.woodT = this.sawT = 0;
    this.sawStarter = sawStarter();
    this.sawRunning = this.sawWasInHand = false;
    if (wd) {
      wd.piles = wd.piles.filter((q) => q.n > 0);
      if (!this.roaming && def.id >= WOOD.from && def.id < 100 && (!wd.intro || Math.random() < (lv.weather === 'rain' ? WOOD.rainChance : WOOD.chance))) {
        const t = pickFieldTree(this.session.field, Math.random);
        if (t) {
          layTree(this.session.field, t);
          this.woodTree = t;
          wd.intro = true;
          void writeSave(this.save);
        }
      }
      if (this.roaming && (wd.load > 0 || logsWaiting(wd) > 0)) this.wooding = true;
    }
    WorldView.wood = wd ? { tree: this.woodTree, piles: wd.piles } : null;
    // Now and then a cow wanders into the garden: in a job whose owner tips (left in, no tip).
    const cowGarden = (def.theme === 'findik' || def.theme === 'yayla') && def.client.request !== 'none';
    this.view.cowIntruder = !this.roaming && !this.eveningRun && def.id >= COW.from && def.id < 100 && cowGarden && Math.random() < COW.chance ? { after: 40 + Math.random() * 50 } : null;
    // Now and then the owner wants some tilling too: the bostan in a corner, or the ocaks' feet.
    this.tillTask = null;
    this.tillerInHand = this.tillWasInHand = this.tillRunning = false;
    this.tillStarter = sawStarter();
    this.tillQuarter = 0;
    if (!this.roaming && def.id >= TILL.from && def.id < 100 && (def.theme === 'findik' || def.theme === 'yayla') && Math.random() < TILL.chance) {
      const f = this.session.field;
      const kind = Math.random() < 0.5 ? 'bostan' : 'ocak';
      const t = pickTillTask(f, kind, Math.random) ?? pickTillTask(f, kind === 'bostan' ? 'ocak' : 'bostan', Math.random);
      if (t) layBostan(f, t);
      this.tillTask = t;
    }
    WorldView.till = this.tillTask;
    // Now and then the owner wants the cut grass blown together and burned.
    this.burnTask = null;
    this.blowerInHand = this.blowerWasInHand = this.blowerRunning = this.burnReady = false;
    this.blowerStarter = sawStarter();
    this.burnReveal = 0;
    if (!this.roaming && def.id >= BURN.from && def.id < 100 && (def.theme === 'findik' || def.theme === 'yayla') && Math.random() < BURN.chance) this.burnTask = pickBurnTask(this.session.field, Math.random);
    WorldView.burn = this.burnTask;
    this.patosRunning = this.hoseInHand = false;
    this.view.load(this.session, this.models);
    // After the first few jobs the objective is one line (where, how far): its how-to line only for the harvest.
    document.body.classList.toggle('obj-brief', Object.keys(this.save.best).length >= 3 && !this.harvesting && !this.wooding);
    // Every job starts in first person, at the worker's eyes on the harman (the eye button still
    // switches to the camera behind him for the job).
    this.save.camera = 'fpv';
    this.input.fpv = true;
    this.updateTutorialText();
    this.view.mode = this.cameraMode;
    this.lookYaw = this.session.yaw;
    this.pitchHands = this.session.hasTrimmer;
    this.pitchEase = null;
    this.view.pitch = this.session.hasTrimmer ? TRIMMER_PITCH : -0.06;
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
    // (The harvest: its objective says what to do, nothing more on top of it.)
    if (this.roaming && this.harvesting) {
      this.guideKey = this.harvestGuide(this.session).key;
      if (!this.harvestTab) this.toast('Serbest gez: yarım kalan hasadın var, sıradaki adım üstte yazıyor', 'good');
    } else if (this.roaming && this.wooding) {
      this.guideKey = this.woodGuide(this.session).key;
      this.toast('Serbest gez: kütüklerin seni bekliyor, eve taşımak için sıradaki adım üstte yazıyor', 'good');
    } else if (this.roaming && this.eveningRun) this.toast(`Akşam oluyor: ${EVENING.cows} inek yollarda otluyor. Arkalarına geç, ahıra doğru sür${this.view.dog ? ' (Karabaş yardım eder)' : ''}`, 'good', 'evening', 5, 6000);
    else if (this.roaming) this.toast('Serbest gez: tırpan evde, köy senin. Bir tarlanın kapısında BU İŞE GEÇ ile iş başlar', 'good');
    else {
      // (What else there is to do in this garden: a storm's tree, some tilling.)
      const t = this.tillTask;
      const tool = this.save.equipment.owned.includes(TILL.tool.id) ? '' : ' (Motor Çapa: Dükkân › Donanım)';
      const extras = [
        this.woodTree ? 'Fırtına bahçeye ağaç devirmiş! Testeren varsa kes: kütükler senin' : '',
        t ? `${lv.client.name} ${t.kind === 'bostan' ? `bostanı da çapalamanı istiyor (+${TILL.pay.bostan} TL)` : `${t.ocaks?.length} ocağın dibini çapalamanı istiyor (+${(t.ocaks?.length ?? 0) * TILL.pay.ocak} TL)`}${tool}` : '',
        this.burnTask ? `${lv.client.name} biçilen otu ortaya üfleyip yakmanı istiyor (+${BURN.pay} TL)${this.save.equipment.owned.includes(BURN.tool.id) ? '' : ' (Üfleme Makinesi: Dükkân › Donanım)'}` : '',
      ].filter(Boolean);
      this.toast(`Bugünkü iş: ${lv.name}${extras.length ? '. ' + extras.join('. ') : ''}`, 'good', 'job', 6, extras.length ? 7000 : 3000);
    }
  }

  /** A shop item for later on not yet on sale: the job it waits for (null: on sale). */
  private lockedUntil(needs?: number): number | null {
    return needs && this.save.unlocked < needs ? needs : null;
  }

  /** The harvest is open: Yeşilyamaç's gardens done (or every job open while developing). */
  private get harvestOpen(): boolean {
    return UNLOCK_ALL || this.save.unlocked > HARVEST.gardens[HARVEST.gardens.length - 1];
  }

  /** What the player has for the patos. */
  private get harvestHas(): { patos: boolean; tractor: boolean } {
    const v = this.save.vehicles ?? [];
    return { patos: v.includes('patos'), tractor: v.includes('traktor') || v.includes('buyuk') };
  }

  /** The harvest's state (null: never started; the player starts one from its tab). */
  private harvest(): HarvestState | null {
    if (!this.harvestOpen) return null;
    const h = this.save.harvest;
    // (Earlier versions put a harvest out by themselves: one nobody has touched is taken back.)
    if (h && !h.started && h.stage === 'collect' && !h.load && !h.spread) this.save.harvest = undefined;
    return this.save.harvest ?? null;
  }

  /**
   * Every frame of a job in Yeşilyamaç: the harvest's time passing, the load on the vehicle, the held
   * ÇUVAL YÜKLE / BOŞALT VE SER (a sack every SACK_PACE), the patos's hose sucking the harman's nuts up,
   * and the scene drawn from it.
   */
  private harvestStep(s: Session, dt: number): void {
    const h = this.harvestHere ? this.harvest() : null;
    if (!h) return;
    const now = this.now();
    if (tickHarvest(h, now)) {
      void writeSave(this.save);
      if (h.stage === 'idle') this.toast('Fındık harmanı hazır! Ana menüde FINDIK HARMANI\'ndan başlat', 'good');
      else if (this.harvesting) this.toast(harvestHint(h, now, this.harvestHas), 'good');
    }
    if (this.harvesting) {
      const g = this.harvestGuide(s);
      if (g.key !== this.guideKey) {
        this.guideKey = g.key;
        // A step that needs it (stop and get off): the objective itself flashes red, no message more.
        if (g.alert) {
          const el = $('objective');
          el.classList.remove('alert');
          void el.offsetWidth;
          el.classList.add('alert');
          haptic('medium');
        }
      }
    }
    const f = s.field;
    f.cargo = h.load;
    f.cargoCap = Math.round(capacityOf(f.tractor, !!f.trailer && !this.patosHitched) * (f.bigTractor ? BIG_PULL.carry : 1));
    // A held action: a sack a beat.
    const held = this.actionHeld ? this.heldId : '';
    this.harvestT = held === 'sack' || held === 'spread' ? this.harvestT + dt : this.hoseInHand ? this.harvestT : 0;
    if ((held === 'sack' || held === 'spread') && this.harvestT >= SACK_PACE) {
      this.harvestT = 0;
      const g = this.harvestGarden(s);
      const ok = held === 'sack' ? g !== null && loadSack(h, g, f.cargoCap) : spreadSack(h, now);
      if (ok) {
        haptic('light');
        this.audio.ui();
        void writeSave(this.save);
        if (h.stage === 'drying') this.toast(`Bütün fındık harmanda. Yaş fındık kurumadan patosa verilmez: ${HARVEST.dryHours / 24} gün (ya da ${HARVEST.dryAds} reklamla hemen)`, 'good');
        else if (held === 'sack' && h.load >= f.cargoCap) this.toast(`Araç doldu (${h.load} çuval): bin, harmana götür`, 'warn');
        else if (held === 'sack' && g !== null && !h.waiting[g]) this.toast(h.load < f.cargoCap && Object.values(h.waiting).some((n) => n > 0) ? 'Buradaki çuvallar bitti: öteki bahçeye git ya da harmana götür' : 'Çuvalların hepsi araçta: harmana götür', 'good');
        else if (held === 'spread' && !h.load) this.toast('Araç boşaldı: kalan çuvallar için bahçelere dön', 'good');
      }
    }
    // Driving off: the patos stops, the hose is put back.
    if (s.driving || !this.patosHitched || h.stage !== 'thresh') this.patosRunning = this.hoseInHand = false;
    if (this.view.world) this.view.world.patosRunning = this.patosRunning;
    this.sucking = Math.max(0, this.sucking - dt);
    let hand: THREE.Vector3 | null = null;
    if (this.hoseInHand) {
      // The hose's mouth: in the hands, a little ahead and low.
      const mx = s.x + Math.sin(s.yaw) * 0.9;
      const mz = s.z + Math.cos(s.yaw) * 0.9;
      hand = new THREE.Vector3(mx, f.height(mx, mz) + 0.35, mz);
      const p = this.patosPos(s);
      if (p && Math.hypot(p.x - s.x, p.z - s.z) > HOSE_REACH) this.toast('Hortum o kadar uzanmıyor: patosa yaklaş', 'warn', 'hose', 4);
      else if (this.patosRunning) {
        this.harvestT += dt;
        if (this.harvestT >= SUCK_PACE) {
          this.harvestT = 0;
          const done = new Set(h.sucked ?? []);
          let best = -1;
          // (From the heap's middle: its foot, smaller as it goes, and the reach beyond it.)
          let bd = HEAP_R * 0.6 + SUCK_REACH;
          harmanCells(f).forEach((c, i) => {
            const d = Math.hypot(c.x - mx, c.z - mz);
            if (!done.has(i) && d < bd) {
              bd = d;
              best = i;
            }
          });
          if (best >= 0 && suckCell(h, best, now)) {
            this.sucking = 0.5;
            if (h.stage === 'beans') {
              this.patosRunning = this.hoseInHand = false;
              void writeSave(this.save);
              this.toast(`Bitti! ${beansKg(h)} kg tane fındık brandada. Kuruması ${HARVEST.dryHours / 24} gün (ya da ${HARVEST.dryAds} reklamla hemen)`, 'good');
            } else if (done.size % 8 === 0) void writeSave(this.save);
          }
        }
      }
    }
    this.audio.setPatos(this.patosRunning ? 1 : 0, this.sucking > 0 ? 1 : 0);
    if (this.view.world?.harvest) this.view.world.harvest.patosOwned = this.harvestHas.patos;
    this.view.world?.updateHarvest(h, hand, this.sucking > 0, performance.now() / 1000);
  }

  /** The garden whose sacks the worker stands by (field coordinates), with sacks still there. */
  private harvestGarden(s: Session): number | null {
    const h = this.save.harvest;
    if (!h || h.stage !== 'collect') return null;
    for (const g of HARVEST.gardens) {
      // By the pile, or by the vehicle's place on the track beside it (either side of the vehicle).
      const p = sackPile(s.field, g);
      const sp = loadSpot(s.field, g);
      if (p && sp && (h.waiting[g] ?? 0) > 0 && (Math.hypot(p.x - s.x, p.z - s.z) < 4 || Math.hypot(sp.x - s.x, sp.z - s.z) < 4)) return g;
    }
    return null;
  }

  /** The middle of the vehicle's load (the trailer behind the tractor, the pat pat's box behind its seat). */
  private loadBed(s: Session): { x: number; z: number } {
    const f = s.field;
    const ax = f.trailerAxle();
    if (ax) return { x: ax.x + Math.sin(ax.yaw) * 0.3, z: ax.z + Math.cos(ax.yaw) * 0.3 };
    const v = f.vehicle;
    return { x: v.x - Math.sin(v.yaw) * 0.5, z: v.z - Math.cos(v.yaw) * 0.5 };
  }

  /** The patos backed into its place: its middle in the PATOS mark, facing the way the mark does (its tow bar out). */
  private patosParked(s: Session): boolean {
    const a = this.patosPos(s) as { x: number; z: number; yaw?: number } | null;
    if (!a) return false;
    const sp = harvestSpots(s.field).patos;
    const turn = Math.atan2(Math.sin((a.yaw ?? 0) - sp.yaw), Math.cos((a.yaw ?? 0) - sp.yaw));
    return inSpot(sp, a.x, a.z, 0.4) && Math.abs(turn) < 0.45;
  }

  /** The patos (its axle) where it stands, field coordinates (null: not hitched). */
  private patosPos(s: Session): { x: number; z: number } | null {
    return this.patosHitched ? s.field.trailerAxle() : null;
  }

  /** The harvest's buttons where the worker stands. */
  private harvestActions(s: Session, acts: Parameters<Game['renderActions']>[0]): void {
    const h = this.harvestHere ? this.harvest() : null;
    if (!h || s.driving || !harvestOn(h)) return;
    const f = s.field;
    const atHarman = Math.hypot(s.x - f.harman.x, s.z - f.harman.z) < f.harman.r + 4;
    const t = tarpSpot(f);
    const atTarp = Math.hypot(s.x - t.x, s.z - t.z) < 4;
    const garden = this.harvestGarden(s);
    if (garden !== null) {
      const p = sackPile(f, garden)!;
      // The vehicle's bed in the yellow ÇUVAL YÜKLE mark beside the pile.
      void p;
      const bed = this.loadBed(s);
      if (!inSpot(loadSpot(f, garden)!, bed.x, bed.z, 0.6)) acts.push({ id: 'sack-far', icon: 'i-tractor', label: 'ARACI YANAŞTIR', sub: 'kasası sarı alana', run: () => this.toast('Patpatın kasasını ya da römorku çuvalların yanındaki sarı ÇUVAL YÜKLE alanına getir', 'warn') });
      else if (!f.cargoCap) acts.push({ id: 'sack-no', icon: 'i-tractor', label: 'RÖMORK LAZIM', sub: 'traktöre römork tak', run: () => this.toast('Traktör çuvalı römorkla taşır: Dükkân › Araç › Römork', 'warn') });
      else acts.push({ id: 'sack', icon: 'i-hand', label: 'ÇUVAL YÜKLE', sub: `${h.load}/${f.cargoCap} · basılı tut`, hold: true, progress: h.load / f.cargoCap });
    }
    const ta = f.trailerAxle();
    const byLoad = s.nearVehicle || (!!ta && Math.hypot(ta.x - s.x, ta.z - s.z) < 3.5);
    const bed = this.loadBed(s);
    const spots = harvestSpots(f);
    // (Only by the harman: at a garden the held ÇUVAL YÜKLE must not be rebuilt under the finger.)
    if (h.stage === 'collect' && h.load > 0 && byLoad && atHarman && !inSpot(spots.unload, bed.x, bed.z, 0.6))
      acts.push({ id: 'unload-far', icon: 'i-tractor', label: 'BOŞALTMA YERİNE ÇEK', sub: 'harmanın yanındaki sarı alan', run: () => this.toast('Kasayı harmanın yanındaki sarı BOŞALTMA alanına getir', 'warn') });
    if (h.stage === 'collect' && h.load > 0 && byLoad && inSpot(spots.unload, bed.x, bed.z, 0.6))
      acts.push({ id: 'spread', icon: 'i-hand', label: 'BOŞALT VE SER', sub: `${h.spread}/${harvestSacks()} çuval · basılı tut`, hold: true, progress: h.spread / harvestSacks() });
    if ((h.stage === 'drying' && atHarman) || (h.stage === 'beans' && (atTarp || atHarman)))
      acts.push({ id: 'dry-ad', icon: 'i-play', label: 'HEMEN KURUT', sub: `reklam ${(h.ads ?? 0) + 1}/${HARVEST.dryAds}`, run: () => void this.dryByAd() });
    if (h.stage === 'thresh' && this.patosHitched) {
      const p = this.patosPos(s);
      const near = !!p && Math.hypot(p.x - s.x, p.z - s.z) < 3.5;
      const placed = this.patosParked(s);
      if (near && !placed) acts.push({ id: 'patos-far', icon: 'i-tractor', label: 'PATOSU YERİNE ÇEK', sub: 'geri geri sarı PATOS alanına', run: () => this.toast('Patosu harmanın yanındaki sarı PATOS alanına geri geri park et', 'warn') });
      if (near && placed) acts.push({ id: 'patos', icon: 'i-power', label: this.patosRunning ? 'PATOSU DURDUR' : 'PATOSU ÇALIŞTIR', sub: 'traktör kuyruk mili', run: () => (this.patosRunning = !this.patosRunning) });
      if (this.patosRunning && near && !this.hoseInHand) acts.push({ id: 'hose', icon: 'i-hand', label: 'HORTUMU AL', sub: 'fındığın üstünde gez', run: () => (this.hoseInHand = true) });
      if (this.hoseInHand) acts.push({ id: 'hose-off', icon: 'i-hand', label: 'HORTUMU BIRAK', sub: `çekilen %${Math.round(((h.sucked?.length ?? 0) / HARVEST.cells) * 100)}`, run: () => (this.hoseInHand = false) });
    }
    if (h.stage === 'sell' && (atTarp || atHarman))
      acts.push({ id: 'sell', icon: 'i-coins', label: 'TÜCCARA SAT', sub: `${beansKg(h)} kg · ${(beansKg(h) * HARVEST.pricePerKg).toLocaleString('tr-TR')} TL`, run: () => this.sellHarvest() });
  }

  /** The menu's Fındık Harmanı button: its chip counts down to the next harvest (or the drying), or says what waits for the player (HAZIR, PATOS, SATIŞ). */
  private updateHarvestBtn(): void {
    const b = $('btn-harvest');
    b.style.display = this.harvestOpen ? '' : 'none';
    if (!this.harvestOpen) return;
    b.classList.toggle('up', $('btn-starter').style.display === 'none');
    const h = this.harvest();
    const now = this.now();
    if (h) tickHarvest(h, now);
    let chip = 'HAZIR';
    let ready = true;
    if (h && h.stage !== 'idle') {
      ready = h.stage === 'thresh' || h.stage === 'sell';
      chip =
        h.stage === 'rest' ? clock((h.next ?? now) - now)
        : h.stage === 'collect' ? `${h.spread}/${harvestSacks()}`
        : h.stage === 'drying' || h.stage === 'beans' ? clock((h.until ?? now) - now)
        : h.stage === 'thresh' ? 'PATOS'
        : 'SATIŞ';
    }
    $('harvest-badge').textContent = chip;
    b.classList.toggle('ready', ready);
  }

  /** On the menu: the harvest's card, once each time a new harvest can be started. */
  private offerHarvest(): void {
    if (!this.harvestOpen || $('daily').classList.contains('show')) return;
    const h = this.harvest();
    if (h) tickHarvest(h, this.now());
    const round = this.save.harvestRound ?? 0;
    if ((h && h.stage !== 'idle') || this.save.harvestOffered === round) return;
    this.save.harvestOffered = round;
    void writeSave(this.save);
    this.openHarvest();
  }

  private openHarvest(): void {
    $('harvest-offer').classList.add('show');
    this.drawHarvest($('harvest-body'));
  }

  /** Off to the harvest (the card closed). */
  private goHarvest(): void {
    $('harvest-offer').classList.remove('show');
    this.levelTab = HARVEST_REGION;
    void this.startRoam('harvest');
  }

  /**
   * Fındık Harmanı's card (the side job, from the menu): before a harvest, what it needs (the tractor and
   * the patos) and HASADI BAŞLAT; between harvests, how long until the next one, or start it at once
   * (bought); under way, its steps, what to do and HASADA DEVAM; the drying sped up by ads.
   */
  private drawHarvest(box: HTMLElement): void {
    box.innerHTML = '';
    const h = this.harvest();
    const now = this.now();
    if (h) tickHarvest(h, now);
    const add = (html: string, cls: string, run: () => void, disabled = false) => {
      const b = document.createElement('button');
      b.className = cls;
      b.innerHTML = html;
      b.disabled = disabled;
      b.onclick = () => {
        this.audio.unlock();
        this.audio.ui();
        run();
      };
      box.appendChild(b);
      return b;
    };
    if (!h || !harvestOn(h)) {
      const need = harvestNeeds(this.harvestHas);
      const has = (n: string) => !need.includes(n);
      const resting = h?.stage === 'rest';
      box.insertAdjacentHTML(
        'beforeend',
        (need.length
          ? `<ol class="hv-steps">
          <li class="${has('Traktör') ? 'done' : 'now'}">Traktör</li>
          <li class="${has('Patos') ? 'done' : 'now'}">Patos${has('Patos') ? '' : ` · ${HARVEST.patosPrice.toLocaleString('tr-TR')} TL`}</li>
          <li class="done">Patpat ya da römork</li>
        </ol>`
          : '') +
          (resting ? this.clockHtml('Yeni hasada', h.next ?? now) : '') +
          `<p class="hv-hint">${
            need.length ? `Hasattan önce ${need.join(' ve ')} lazım: kurumuş fındık patossuz harmanda kalır`
            : resting ? 'Beklemek istemezsen hemen başlat'
            : `Hazır! ${harvestSacks()} çuval köyün yollarından birinin kenarında seni bekliyor (her hasatta başka yerde)`
          }</p>`,
      );
      if (need.length) {
        add(`ÖNCE ${need[0].toLocaleUpperCase('tr')} AL`, 'btn hv-go', () => {
          $('harvest-offer').classList.remove('show');
          this.shopTab = 'arac';
          this.shopNote = { text: `Fındık harmanı için ${need.join(' ve ')} lazım`, kind: 'warn' };
          this.shopBack = () => {
            this.show('menu');
            this.openHarvest();
          };
          this.openShop();
        });
        return;
      }
      const start = () => {
        this.save.harvest = newHarvest();
        void writeSave(this.save);
        this.goHarvest();
      };
      if (!resting) {
        add('HASADI BAŞLAT', 'btn hv-go', start);
        return;
      }
      // Waiting for the next: or started at once, bought.
      const buy = add(`HEMEN BAŞLAT <b class="hv-price">${this.harvestPrice || HARVEST_NOW.devPrice}</b>`, 'btn gold', () => {
        void buyProduct(HARVEST_NOW.id, true).then((ok) => {
          if (ok) start();
          else this.notice('Satın alma olmadı', 'Ödeme tamamlanmadı, para çekilmedi. İnternetini kontrol edip yeniden dene.');
        });
      });
      if (!this.harvestPrice)
        void productPrices([HARVEST_NOW.id]).then((p) => {
          this.harvestPrice = p[HARVEST_NOW.id] ?? '';
          const el = buy.querySelector('.hv-price');
          if (el && this.harvestPrice) el.textContent = this.harvestPrice;
        });
      return;
    }
    const steps: [string, string][] = [
      ['collect', 'Çuvallar'],
      ['drying', 'Kuruma'],
      ['thresh', 'Patos'],
      ['beans', 'Branda'],
      ['sell', 'Satış'],
    ];
    const at = steps.findIndex(([k]) => k === h.stage);
    box.insertAdjacentHTML(
      'beforeend',
      `<ol class="hv-steps">${steps.map(([, t], i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}">${t}</li>`).join('')}</ol>` +
        (h.stage === 'drying' || h.stage === 'beans' ? this.clockHtml(h.stage === 'drying' ? 'Yaş fındık kuruyor' : 'Tane fındık kuruyor', h.until ?? now) : '') +
        `<p class="hv-hint">${h.stage === 'drying' || h.stage === 'beans' ? 'Kurumadan patosa verilmez' : harvestHint(h, now, this.harvestHas)}</p>`,
    );
    add('HASADA DEVAM', 'btn hv-go', () => this.goHarvest());
    if (h.stage === 'drying' || h.stage === 'beans')
      add(`<span class="ad-play">${icon('i-play')}</span><span class="ad-text">Hemen kurut: reklam ${(h.ads ?? 0) + 1}/${HARVEST.dryAds}</span><span class="ad-tag">REKLAM</span>`, 'btn ad', () => void this.dryByAd());
  }

  /** A round clock counting down to `until` (ticked by the menu's timer), under a line saying what it waits for. */
  private clockHtml(what: string, until: number): string {
    return `<div class="hv-clock"><i>⏱</i><span>${what}<b data-until="${until}">${clock(until - this.now())}</b></span></div>`;
  }

  /**
   * The way along the village's tracks from the worker to `to` (on a track): the metres left, and a point
   * some 12 m on to aim at. Null when either is off the tracks (then as the crow flies).
   */
  private trackTo(s: Session, to: { x: number; z: number }): { x: number; z: number; left: number } | null {
    const f = s.field;
    const O = f.origin;
    let pts: { x: number; z: number }[] | null = null;
    let ti = 0;
    let td = 6;
    for (const r of Object.values(village(f.region).routes))
      r.forEach((q, i) => {
        const d = Math.hypot(q.x - O.x - to.x, q.z - O.z - to.z);
        if (d < td) {
          td = d;
          pts = r;
          ti = i;
        }
      });
    const route = pts as { x: number; z: number }[] | null;
    if (!route) return null;
    let vi = 0;
    let vd = 25;
    route.forEach((q, i) => {
      const d = Math.hypot(q.x - O.x - s.x, q.z - O.z - s.z);
      if (d < vd) {
        vd = d;
        vi = i;
      }
    });
    if (vd >= 25) return null;
    const step = ti >= vi ? 1 : -1;
    let left = vd;
    for (let i = vi; i !== ti; i += step) left += Math.hypot(route[i + step].x - route[i].x, route[i + step].z - route[i].z);
    const ai = step > 0 ? Math.min(ti, vi + 12) : Math.max(ti, vi - 12);
    return { x: route[ai].x - O.x, z: route[ai].z - O.z, left: Math.round(left) };
  }

  /** A rewarded ad for the drying (a third of the time off; the third one dries it). */
  private async dryByAd(): Promise<void> {
    const h = this.save.harvest;
    if (!h) return;
    if (!(await this.rewarded('Kuruma hızlandı!'))) return;
    dryWithAd(h, this.now());
    tickHarvest(h, this.now());
    void writeSave(this.save);
    this.toast(harvestHint(h, this.now(), this.harvestHas), 'good');
    if ($('harvest-offer').classList.contains('show')) this.drawHarvest($('harvest-body'));
  }

  /** The merchant buys the clean nuts. */
  private sellHarvest(): void {
    const h = this.save.harvest;
    if (!h) return;
    const pay = sellNuts(h, this.now());
    if (!pay) return;
    this.save.money += pay;
    this.save.harvestRound = (this.save.harvestRound ?? 0) + 1;
    this.audio.coin();
    this.audio.success();
    haptic('medium');
    this.updateMoney();
    void writeSave(this.save);
    this.toast(`Hasat bitti! Tüccar fındığı aldı: +${pay.toLocaleString('tr-TR')} TL. Yeni hasat ${HARVEST.everyDays} gün sonra (ana menüde FINDIK HARMANI)`, 'good');
  }

  /** The storm's wood is open: Karadere's job WOOD.needs reached (or every job open while developing). */
  private get woodOpen(): boolean {
    return UNLOCK_ALL || this.save.unlocked >= WOOD.needs;
  }

  /** The chainsaw bought. */
  private get hasSaw(): boolean {
    return this.save.equipment.owned.includes(WOOD.saw.id);
  }

  /** The player's wood (piles by the gates, the load, the yard's stock); made the first time it is asked for once open. */
  private wood(): WoodState | null {
    if (!this.woodOpen) return null;
    const w = this.save.wood;
    // (A save from before the logs were the player's: started afresh.)
    if (!w || !Array.isArray(w.piles)) this.save.wood = newWood();
    return this.save.wood!;
  }

  /** On foot by the next cut of the tree in this garden. */
  private atCut(s: Session): boolean {
    const t = this.woodTree;
    if (!t || this.woodCut >= WOOD.pieces || s.driving) return false;
    const c = treePoint(t, cutAt(this.woodCut));
    return Math.hypot(c.x - s.x, c.z - s.z) < cutStand(this.woodCut) + 1.6;
  }

  /** The pile by a gate the worker (or the vehicle's bed) is at, with logs left (its index; -1: none). */
  private pileAt(s: Session, w: WoodState): number {
    const bed = this.loadBed(s);
    return w.piles.findIndex((p) => {
      if (p.n <= 0) return false;
      const sp = pileSpots(s.field, p);
      return Math.hypot(sp.pile.x - s.x, sp.pile.z - s.z) < 4 || Math.hypot(sp.load.x - s.x, sp.load.z - s.z) < 4 || inSpot(sp.load, bed.x, bed.z, 0.6);
    });
  }

  /**
   * Every frame of a job in Karadere: the chainsaw in hand by the storm's tree, the held KES (a piece
   * every CUT_PACE, the sawdust flying), KÜTÜK YÜKLE and İSTİFLE (a log every LOG_PACE), the load on the
   * vehicle, and the scene drawn from it.
   */
  private woodStep(s: Session, dt: number): void {
    const w = this.woodHere ? this.wood() : null;
    this.view.sawInHand = false;
    this.view.sawing = 0;
    if (!w) return;
    if (this.wooding) {
      const g = this.woodGuide(s);
      if (g.key !== this.guideKey) {
        this.guideKey = g.key;
        if (g.alert) {
          const el = $('objective');
          el.classList.remove('alert');
          void el.offsetWidth;
          el.classList.add('alert');
          haptic('medium');
        }
      }
    }
    const f = s.field;
    if (!this.harvestHere) {
      f.cargo = w.load;
      f.cargoCap = Math.round(woodCapacity(f.tractor, !!f.trailer && !this.patosHitched) * (f.bigTractor ? BIG_PULL.carry : 1));
    }
    const t = this.woodTree;
    // By the tree with cutting to do: the chainsaw in hand (the trimmer put away first).
    if (t && this.woodCut < WOOD.pieces && !s.driving && Math.hypot(t.x - s.x, t.z - s.z) < TREE_NEAR) {
      if (this.hasSaw && !s.hasTrimmer && !this.tillerInHand && !this.blowerInHand) this.view.sawInHand = true;
      else if (this.atCut(s)) this.toast(this.hasSaw ? 'Ağaç testereyle kesilir: tırpanı kasaya bırak (TIRPANI BIRAK), gel, gaza bas' : 'Ağacı kesmek için motorlu testere lazım (Dükkân › Donanım). Kesersen kütükler senin', 'warn', 'tree-how', 25);
    }
    // Put away (walked off, the trimmer taken, driving): it stops. Taken up or put away: its starter shown or hidden.
    if (!this.view.sawInHand) this.sawRunning = false;
    if (this.view.sawInHand !== this.sawWasInHand) {
      this.sawWasInHand = this.view.sawInHand;
      this.updateStarterUi();
    }
    if (this.view.sawInHand && this.atCut(s) && this.sawRunning) this.toast('Sarı çizginin yanındasın: gaz tetiğine bas, kes. Az gaz yavaş, çok gaz hızlı keser', 'good', 'saw-how', 40);
    this.view.sawOn = this.sawRunning;
    // The chainsaw on the trimmer's own trigger: as much throttle as it is given, it revs and cuts.
    const gas = this.view.sawInHand && this.sawRunning ? this.input.throttleLevel : 0;
    this.view.sawing = gas;
    const cutting = gas > 0.08 && this.atCut(s);
    const held = this.actionHeld ? this.heldId : '';
    this.woodT = held === 'log' || held === 'stack' ? this.woodT + dt : 0;
    if (cutting && t) {
      // Sawdust from the cut, more the harder it is worked.
      const c = treePoint(t, cutAt(this.woodCut), 0.3);
      if (Math.random() < dt * 25 * gas) this.view.emit(c.x, c.z, 2, 'dust', 0.9);
      // (Ticking over it hardly bites: the cut goes with the throttle, more than in proportion.)
      this.sawT += (dt / CUT_PACE) * gas * gas;
      if (this.sawT >= 1) {
        this.sawT = 0;
        // (The crown's pieces drop their leaves.)
        if (inCrown(this.woodCut)) this.view.emit(c.x, c.z, 16, 'leaf', 1.4);
        this.woodCut++;
        haptic('medium');
        this.audio.trunk();
        f.blocks = treeBlocks(t, this.woodCut);
        f.shade = underTree(t, this.woodCut);
        if (this.woodCut < WOOD.pieces) this.toast(`${this.woodCut}/${WOOD.pieces} parça kesildi`, 'good', 'saw-piece');
        if (this.woodCut >= WOOD.pieces) this.toast(`Ağaç kesildi! ${WOOD.pieces} kütük senin: iş bitince bahçe sahibi kapının önüne yığar, sonra araçla eve taşırsın. Tırpanı kasadan al, altındaki otu da biç`, 'good');
      }
    }
    if ((held === 'log' || held === 'stack') && this.woodT >= LOG_PACE) {
      this.woodT = 0;
      if (held === 'log') {
        const i = this.pileAt(s, w);
        if (i >= 0 && loadLog(w, i, f.cargoCap)) {
          haptic('light');
          this.audio.ui();
          void writeSave(this.save);
          if (w.load >= f.cargoCap && logsWaiting(w)) this.toast(`Araç doldu (${w.load} kütük): eve götür, harmanın yanındaki sarı İSTİF alanına`, 'warn');
          else if (w.piles[i].n <= 0) this.toast(logsWaiting(w) && w.load < f.cargoCap ? 'Buradaki kütükler bitti: öteki yığına git ya da eve götür' : 'Kütükler araçta: eve götür, odunluğa istifle', 'good');
        }
      } else if (stackLog(w)) {
        haptic('light');
        this.audio.ui();
        void writeSave(this.save);
        if (!w.load) this.toast(`Odunlukta ${w.stock} kütük. Satmak için rafın önünde ODUN SAT${logsWaiting(w) ? ' · kapıların önünde daha kütük var' : ''}`, 'good');
      }
    }
    this.audio.setSaw(this.view.sawInHand && this.sawRunning, this.view.sawing, cutting);
    this.view.world?.updateWood(this.woodCut, w);
  }

  /** The woodpile sold to the baker. */
  private sellWood(): void {
    const w = this.wood();
    if (!w) return;
    const pay = sellStock(w);
    if (!pay) return;
    this.save.money += pay;
    this.audio.coin();
    this.audio.success();
    haptic('medium');
    this.updateMoney();
    void writeSave(this.save);
    this.toast(`Odun satıldı! Köyün fırıncısı hepsini aldı: +${pay.toLocaleString('tr-TR')} TL`, 'good');
  }

  /** The wood's buttons where the worker stands. */
  private woodActions(s: Session, acts: Parameters<Game['renderActions']>[0]): void {
    const w = this.woodHere ? this.wood() : null;
    if (!w || s.driving) return;
    const f = s.field;
    if (this.atCut(s)) {
      if (!this.hasSaw) acts.push({ id: 'cut-nosaw', icon: 'i-coins', label: 'TESTERE LAZIM', sub: 'Dükkân › Donanım', run: () => this.toast('Ağacı kesmek için motorlu testere lazım: evin önünde DÜKKAN › Donanım', 'warn') });
      else if (s.hasTrimmer) acts.push({ id: 'cut-trimmer', icon: 'i-hand', label: 'TIRPANLA OLMAZ', sub: 'tırpanı kasaya bırak', run: () => this.toast('Ağaç testereyle kesilir: tırpanı kasaya bırak, gel', 'warn') });
    }
    const bed = this.loadBed(s);
    const pi = this.pileAt(s, w);
    if (pi >= 0) {
      const sp = pileSpots(f, w.piles[pi]);
      if (!inSpot(sp.load, bed.x, bed.z, 0.6)) acts.push({ id: 'log-far', icon: 'i-tractor', label: 'ARACI YANAŞTIR', sub: 'kasası sarı alana', run: () => this.toast('Patpatın kasasını ya da römorku kütüklerin yanındaki sarı KÜTÜK YÜKLE alanına getir', 'warn') });
      else if (!f.cargoCap) acts.push({ id: 'log-no', icon: 'i-tractor', label: 'RÖMORK LAZIM', sub: 'traktöre römork tak', run: () => this.toast('Traktör kütüğü römorkla taşır: Dükkân › Araç › Römork', 'warn') });
      else acts.push({ id: 'log', icon: 'i-hand', label: 'KÜTÜK YÜKLE', sub: `${w.load}/${f.cargoCap} · basılı tut`, hold: true, progress: w.load / f.cargoCap });
    }
    const sp = woodSpots(f);
    const ta = f.trailerAxle();
    const byLoad = s.nearVehicle || (!!ta && Math.hypot(ta.x - s.x, ta.z - s.z) < 3.5);
    if (w.load > 0 && byLoad && Math.hypot(s.x - sp.unload.x, s.z - sp.unload.z) < 9) {
      if (!inSpot(sp.unload, bed.x, bed.z, 0.6)) acts.push({ id: 'stack-far', icon: 'i-tractor', label: 'İSTİF YERİNE ÇEK', sub: 'odunluğun yanındaki sarı alan', run: () => this.toast('Kasayı harmanın yanındaki, odunluğun önündeki sarı İSTİF alanına getir', 'warn') });
      else acts.push({ id: 'stack', icon: 'i-hand', label: 'İSTİFLE', sub: `odunlukta ${w.stock} · araçta ${w.load} · basılı tut`, hold: true, progress: 1 - w.load / Math.max(1, f.cargoCap) });
    }
    // At the rack on foot, the vehicle emptied: the stack sold. (Not while stacking: a button coming up
    // beside the held İSTİFLE would rebuild the row under the finger.)
    if (w.stock > 0 && !w.load && Math.hypot(s.x - sp.rack.x, s.z - sp.rack.z) < 4.5)
      acts.push({ id: 'sell-wood', icon: 'i-coins', label: 'ODUN SAT', sub: `${w.stock} kütük · ${(w.stock * WOOD.pricePerLog).toLocaleString('tr-TR')} TL`, run: () => this.sellWood() });
  }

  /**
   * The wood's next step in Serbest gez (logs waiting by a gate, or on the vehicle): the objective's
   * line (an arrow to `to`), and a warning (`alert`) the moment one is needed (stop and get off).
   */
  private woodGuide(s: Session): { key: string; head: string; sub: string; to?: { x: number; z: number }; alert?: string } {
    const w = this.wood();
    if (!w || (!w.load && !logsWaiting(w))) return { key: 'none', head: '', sub: '' };
    const f = s.field;
    const bed = this.loadBed(s);
    const dist = (q: { x: number; z: number }) => Math.round(Math.hypot(q.x - s.x, q.z - s.z));
    const tr = f.tractor;
    const board = (key: string, why: string) =>
      s.nearVehicle
        ? { key: `${key}-b`, head: tr ? 'Traktöre bin' : 'Patpata bin', sub: why }
        : { key: `${key}-w`, head: `${tr ? 'Traktörüne' : 'Patpatına'} git (${dist(f.vehicle)} m)`, sub: why, to: f.vehicle };
    const ta = f.trailerAxle();
    const byLoad = s.nearVehicle || (!!ta && Math.hypot(ta.x - s.x, ta.z - s.z) < 3.5);
    const cap = woodCapacity(tr, !!f.trailer && !this.patosHitched);
    const waiting = logsWaiting(w);
    // Home with what is on the vehicle: full, or nothing more waiting.
    if (w.load > 0 && (w.load >= cap || !waiting)) {
      const u = woodSpots(f).unload;
      if (inSpot(u, bed.x, bed.z, 0.6)) {
        if (s.driving) return { key: 'y-off', head: 'Dur ve araçtan in', sub: 'Kütükleri odunluğa elle istifleyeceksin: İN butonuna bas', alert: 'İstif yerindesin! Dur ve araçtan in' };
        if (!byLoad) return { key: 'y-walk', head: 'Kasanın yanına yürü', sub: 'Yanına gidince İSTİFLE çıkar', to: bed };
        return { key: 'y-stack', head: 'İSTİFLE butonuna basılı tut', sub: `Araçta ${w.load} kütük · odunlukta ${w.stock}` };
      }
      if (s.driving) {
        const r = this.trackTo(s, f.harman);
        return { key: 'y-drive', head: `Eve götür (${r && dist(f.harman) > 15 ? r.left : dist(u)} m)`, sub: 'Kasayı harmanın yanında, odunluğun önündeki sarı İSTİF alanına getir', to: r && dist(f.harman) > 15 ? r : u };
      }
      return board('y', `${w.load} kütük araçta: eve götür, odunluğun önündeki sarı İSTİF alanına`);
    }
    if (!cap) return { key: 'l-trailer', head: `${waiting} kütük kapıların önünde: römork lazım`, sub: 'Traktör kütüğü römorkla taşır: evin önünde DÜKKAN › Araç: römorku TAK ya da patpatı SEÇ', alert: 'Traktörde römork yok' };
    // To the nearest pile.
    const near = (p: LogPile) => {
      const sp = pileSpots(f, p).load;
      return Math.hypot(sp.x - bed.x, sp.z - bed.z);
    };
    const p = w.piles.filter((q) => q.n > 0).reduce((a, b) => (near(b) < near(a) ? b : a));
    const sp = pileSpots(f, p);
    if (inSpot(sp.load, bed.x, bed.z, 0.6)) {
      if (s.driving) return { key: 'l-off', head: 'Dur ve araçtan in', sub: 'Kütükleri elle yükleyeceksin: İN butonuna bas', alert: 'Yerindesin! Dur ve araçtan in, kütükleri yükle' };
      if (Math.hypot(sp.pile.x - s.x, sp.pile.z - s.z) >= 4 && Math.hypot(sp.load.x - s.x, sp.load.z - s.z) >= 4) return { key: 'l-walk', head: `Kütüklerin yanına yürü (${dist(sp.pile)} m)`, sub: 'Yanlarına gidince KÜTÜK YÜKLE çıkar', to: sp.pile };
      return { key: 'l-load', head: 'KÜTÜK YÜKLE butonuna basılı tut', sub: `Araçta ${w.load}/${cap} · burada ${p.n} kütük` };
    }
    if (s.driving) {
      const r = this.trackTo(s, sp.load);
      return { key: 'l-drive', head: `Kütüklerine git (${r?.left ?? dist(sp.load)} m)`, sub: `Bahçe kapısının önünde · kasayı sarı KÜTÜK YÜKLE alanına getir · ${waiting} kütük bekliyor`, to: r ?? sp.load };
    }
    return board('l', `${waiting} kütüğün bahçe kapılarının önünde bekliyor: araçla gidip kasayı sarı alana getir`);
  }

  /**
   * Fındık Harmanı's next step for where the player stands, what they drive and what is on its hitch:
   * the objective's line (an arrow to `to`), and a warning (`alert`) the moment one is needed, as
   * stopping to get off and load by hand.
   */
  private harvestGuide(s: Session): { key: string; head: string; sub: string; to?: { x: number; z: number }; alert?: string } {
    const h = this.save.harvest;
    const now = this.now();
    if (!h || !harvestOn(h)) return { key: h?.stage ?? 'none', head: '', sub: '' };
    const f = s.field;
    const bed = this.loadBed(s);
    const dist = (p: { x: number; z: number }) => Math.round(Math.hypot(p.x - s.x, p.z - s.z));
    const shop = 'Evin önünde DÜKKAN › Araç';
    const tr = f.tractor;
    // On foot, away from the vehicle: to it first.
    const board = (key: string, why: string) =>
      s.nearVehicle
        ? { key: `${key}-b`, head: tr ? 'Traktöre bin' : 'Patpata bin', sub: why }
        : { key: `${key}-w`, head: `${tr ? 'Traktörüne' : 'Patpatına'} git (${dist(f.vehicle)} m)`, sub: why, to: f.vehicle };
    const ta = f.trailerAxle();
    const byLoad = s.nearVehicle || (!!ta && Math.hypot(ta.x - s.x, ta.z - s.z) < 3.5);
    switch (h.stage) {
      case 'collect': {
        const cap = capacityOf(tr, !!f.trailer && !this.patosHitched);
        // No room for sacks (the patos or nothing on the tractor's hitch): how far the harman is, and what to change.
        const rest = harvestSacks() - h.spread;
        const head = `Harmanda ${h.spread}/${harvestSacks()} çuval: ${rest} çuval daha getir`;
        if (!cap)
          return this.patosHitched
            ? { key: 'c-patos', head, sub: `Yaş fındık hepsi serilince kurur. Çuvallar patosa yüklenmez: ${shop}: römorku TAK ya da patpatı SEÇ`, alert: 'Traktörde patos var: çuval için römork ya da patpat lazım' }
            : { key: 'c-trailer', head, sub: `Yaş fındık hepsi serilince kurur. Traktörde römork yok: ${shop}: römorku TAK ya da patpatı SEÇ`, alert: 'Traktör çuvalı römorkla taşır' };
        const waiting = HARVEST.gardens.filter((g) => (h.waiting[g] ?? 0) > 0);
        if (h.load < cap && waiting.length) {
          // The nearest pile with sacks left.
          const near = (id: number) => {
            const sp = loadSpot(f, id)!;
            return Math.hypot(sp.x - bed.x, sp.z - bed.z);
          };
          const g = waiting.reduce((a, b) => (near(b) < near(a) ? b : a));
          const sp = loadSpot(f, g)!;
          const left = waiting.reduce((a, id) => a + (h.waiting[id] ?? 0), 0);
          if (inSpot(sp, bed.x, bed.z, 0.6)) {
            if (s.driving) return { key: `c-off-${g}`, head: 'Dur ve araçtan in', sub: 'Çuvalları elle yükleyeceksin: İN butonuna bas', alert: 'Yerindesin! Dur ve araçtan in, çuvalları elle yükle' };
            const pile = sackPile(f, g)!;
            if (Math.hypot(pile.x - s.x, pile.z - s.z) >= 4 && Math.hypot(sp.x - s.x, sp.z - s.z) >= 4) return { key: `c-walk-${g}`, head: `Çuvalların yanına yürü (${dist(pile)} m)`, sub: 'Yanlarına gidince ÇUVAL YÜKLE çıkar', to: pile };
            return { key: `c-load-${g}`, head: 'ÇUVAL YÜKLE butonuna basılı tut', sub: `Araçta ${h.load}/${cap} çuval · burada ${h.waiting[g]} çuval var` };
          }
          if (s.driving) {
            const r = this.trackTo(s, sp);
            return { key: `c-drive-${g}`, head: `Çuvallara git (${r?.left ?? dist(sp)} m)`, sub: `Yolu takip et · kasayı yol kenarındaki sarı ÇUVAL YÜKLE alanına getir · ${left} çuval bekliyor`, to: r ?? sp };
          }
          return board(`c-${g}`, `${left} çuval yol kenarında bekliyor: araçla gidip kasayı sarı alana getir`);
        }
        // Loaded (full, or the last sacks): to the harman's BOŞALTMA mark.
        const u = harvestSpots(f).unload;
        const more = waiting.length ? ' · sonra kalan çuvallara dön' : '';
        if (inSpot(u, bed.x, bed.z, 0.6)) {
          if (s.driving) return { key: 'u-off', head: 'Dur ve araçtan in', sub: 'Çuvalları harmana elle boşaltacaksın: İN butonuna bas', alert: 'Boşaltma yerindesin! Dur ve araçtan in' };
          if (!byLoad) return { key: 'u-walk', head: 'Kasanın yanına yürü', sub: 'Yanına gidince BOŞALT VE SER çıkar', to: bed };
          return { key: 'u-spread', head: 'BOŞALT VE SER butonuna basılı tut', sub: `Araçta ${h.load} çuval · harmanda ${h.spread}/${harvestSacks()}${more}` };
        }
        if (s.driving) {
          const r = this.trackTo(s, f.harman);
          return { key: 'u-drive', head: `Harmana götür (${r && dist(f.harman) > 15 ? r.left : dist(u)} m)`, sub: `Kasayı harmanın yanındaki sarı BOŞALTMA alanına getir${more}`, to: r && dist(f.harman) > 15 ? r : u };
        }
        return board('u', `${h.load} çuval araçta: harmana götür, kasayı sarı BOŞALTMA alanına getir`);
      }
      case 'drying':
        return { key: 'dry', head: `Yaş fındık kuruyor: ${formatWait(Math.max(0, (h.until ?? now) - now))}`, sub: `Kurumadan patosa verilmez · harmanda HEMEN KURUT (${HARVEST.dryAds} reklam)` };
      case 'thresh': {
        if (!this.harvestHas.tractor) return { key: 't-notr', head: 'Fındık kurudu: patos için traktör lazım', sub: `${shop}: Traktör` };
        if (!this.harvestHas.patos) return { key: 't-nopatos', head: 'Fındık kurudu: patos lazım', sub: `${shop}: Patos (sadece traktöre takılır)` };
        if (!tr) return { key: 't-pick', head: 'Patos traktörle çalışır: traktöre geç', sub: `${shop}: Traktörü SEÇ, Patosu TAK` };
        if (!this.patosHitched) return { key: 't-hitch', head: 'Patosu traktöre tak', sub: `${shop}: Patos › TAK (römork çıkar)` };
        const ps = harvestSpots(f).patos;
        if (!this.patosParked(s)) {
          if (s.driving) return { key: 't-park', head: `Fındığı patosa ver: patosu geri geri park et (${dist(ps)} m)`, sub: 'Sarı PATOS alanına, patosun çeki kolu dışarı bakacak', to: ps };
          return board('t-park', 'Patosu harmanın yanındaki sarı PATOS alanına geri geri park et');
        }
        if (s.driving) return { key: 't-off', head: 'Patos yerinde: traktörden in', sub: 'Sonra PATOSU ÇALIŞTIR', alert: 'Patos yerinde! Dur ve traktörden in' };
        const p = this.patosPos(s)!;
        if (Math.hypot(p.x - s.x, p.z - s.z) >= 3.5 && !this.hoseInHand)
          return { key: 't-walk', head: `Patosun yanına yürü (${dist(p)} m)`, sub: this.patosRunning ? 'Yanında HORTUMU AL çıkar' : 'Yanında PATOSU ÇALIŞTIR çıkar', to: p };
        if (!this.patosRunning) return { key: 't-run', head: 'PATOSU ÇALIŞTIR butonuna bas', sub: 'Traktörün kuyruk mili döndürür' };
        if (!this.hoseInHand) return { key: 't-hose', head: 'HORTUMU AL butonuna bas', sub: 'Sonra hortumla yığına yürü' };
        return { key: 't-suck', head: `Hortumla yığının etrafında gez: %${Math.round(((h.sucked?.length ?? 0) / HARVEST.cells) * 100)}`, sub: 'Tane fındık brandaya akar, kabuklar savrulur', to: f.harman };
      }
      case 'beans':
        return { key: 'beans', head: `Tane fındık brandada kuruyor: ${formatWait(Math.max(0, (h.until ?? now) - now))}`, sub: `Harmanda ya da brandanın yanında HEMEN KURUT (${HARVEST.dryAds} reklam)` };
      case 'sell':
        return { key: 'sell', head: 'Tüccar geldi: TÜCCARA SAT', sub: `${beansKg(h)} kg · harmanda ya da brandanın yanında`, to: tarpSpot(f) };
    }
    return { key: 'none', head: '', sub: '' };
  }

  /** The shop from the yard: the job waits (paused, without the pause card) until it is closed. */
  private openShopInGame(): void {
    if (this.mode !== 'playing') return;
    this.pauseForShop();
    this.shopTab = this.woodTree && !this.hasSaw ? 'donanim' : this.harvesting || (harvestOn(this.save.harvest) && this.save.harvest?.stage === 'thresh') ? 'arac' : 'koy';
    this.shopNote = null;
    this.shopBack = null;
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
    this.travelTo = null;
    document.body.classList.remove('roam', 'travel');
    this.audio.resume();
    this.audio.stopEngine();
    this.audio.patpat(false);
    this.audio.stopAmbience();
    this.audio.stopPatos();
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
    // A cow still in the garden: the owner gives no tip.
    const cowIn = !!this.view.cows?.intruding;
    if (cowIn) s.cowLeftIn();
    const r = s.finish();
    this.lastResult = r;
    const logs = this.pileLogs(s);
    const till = this.tillTask;
    const tillMoney = till && r.total > 0 ? tillPay(till) : 0;
    if (tillMoney) this.save.money += tillMoney;
    const burn = this.burnTask;
    const burnMoney = burn && r.total > 0 ? burnPay(burn) : 0;
    if (burnMoney) this.save.money += burnMoney;
    this.lastJob = s.carryOver();
    this.audio.stopEngine();
    this.audio.patpat(false);
    this.audio.stopAmbience();
    this.audio.stopPatos();
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
    if (c.request !== 'none') rows.push([`Bahşiş · ${c.name}`, r.requestMet ? `+${r.tip} TL` : cowIn ? 'yok (inek bahçede kaldı)' : 'yok (istek tutmadı)', r.requestMet ? '' : 'neg']);
    if (logs) rows.push(['Devrik ağaç', `${logs} kütük kapının önünde, senin`]);
    if (burn) rows.push(['Ot yakma', burnMoney ? `+${burnMoney} TL` : `yapılmadı (yığında %${Math.round(heaped(burn) * 100)})`, burnMoney ? '' : 'neg']);
    if (till) rows.push([till.kind === 'bostan' ? 'Bostan çapası' : 'Ocak dibi çapası', tillMoney ? `+${tillMoney} TL` : `yapılmadı (%${Math.round(tilled(till) * 100)})`, tillMoney ? '' : 'neg']);
    $('result-table').innerHTML =
      rows.map(([a, b, c]) => `<tr><td>${a}</td><td class="${c ?? ''}">${b}</td></tr>`).join('') +
      `<tr class="total"><td>Eline geçen</td><td>${r.total + tillMoney + burnMoney} TL</td></tr>`;
    const hasNext = LEVELS.some((l) => l.id === this.level.id + 1) && r.total > 0;
    $('btn-next').style.display = hasNext ? '' : 'none';
    this.doubled = false;
    $('btn-ad-double').style.display = r.total > 0 ? '' : 'none';
    $('ad-double-text').textContent = `+${r.total} TL daha al`;
    this.show('result');
  }

  /**
   * Karabaş and the snakes: a snake still hidden where the dog comes sniffing is found before the worker
   * steps on it: it barks, runs at it, and the snake slithers off (no fright for the worker).
   */
  private dogStep(s: Session, dt: number): void {
    const d = this.view.dog;
    if (!d) return;
    this.barkT -= dt;
    for (const sn of s.field.snakes) {
      if (sn.state !== 'hidden' || d.distanceTo(sn.x, sn.z) > DOG_NOSE) continue;
      sn.state = 'flee';
      sn.t = SNAKE.flee;
      sn.yaw = Math.atan2(sn.x - d.x, sn.z - d.z);
      d.chase = { x: sn.x, z: sn.z, t: 2.6 };
      this.toast('Karabaş yılanı buldu, kaçırdı!', 'good', 'dog-snake', 4);
      this.barkT = 0;
    }
    // Barking while it is after one: a bark or two at a time.
    if (d.chase) {
      if (this.barkT <= 0) {
        this.audio.bark(Math.hypot(d.x - s.x, d.z - s.z));
        this.barkT = 0.45 + Math.random() * 0.6;
      }
    }
  }

  /**
   * The motor çapa each frame: put back in the vehicle when the worker drives off; in hand and running,
   * its tines (ahead of it) turn over the cells under them as hard as the throttle says, the grass there
   * going with them; how far the work has got told by the quarter.
   */
  private tillStep(s: Session, dt: number): void {
    const t = this.tillTask;
    this.view.tillerInHand = this.view.tillerOn = false;
    this.view.tillerGas = 0;
    if (!t) return;
    if (s.driving && this.tillerInHand) {
      this.tillerInHand = this.tillRunning = false;
      this.toast('Çapa kasaya kondu', '', 'till-put', 3);
    }
    const inHand = this.tillerInHand && !s.driving;
    if (inHand !== this.tillWasInHand) {
      this.tillWasInHand = inHand;
      this.updateStarterUi();
    }
    let working = false;
    let gas = 0;
    if (inHand) {
      gas = this.tillRunning ? this.input.throttleLevel : 0;
      this.view.tillerInHand = true;
      this.view.tillerOn = this.tillRunning;
      this.view.tillerGas = gas;
      const ahead = TILLER_AHEAD + (this.view.tiller?.tinesAhead ?? 0.18);
      const x = s.x + Math.sin(s.yaw) * ahead;
      const z = s.z + Math.cos(s.yaw) * ahead;
      const before = tilled(t);
      tillAt(t, x, z, s.yaw, gas, dt);
      working = gas > 0.2 && t.cells.some((c) => c.t < 1 && Math.hypot(c.x - x, c.z - z) < 0.7);
      if (gas > 0.2) {
        // The grass under the tines goes too; the soil flies.
        const ax = Math.cos(s.yaw) * 0.32;
        const az = -Math.sin(s.yaw) * 0.32;
        s.field.cutSegment(x - ax, z - az, x + ax, z + az, 0.25);
        if (working && Math.random() < dt * 18 * gas) this.view.emit(x, z, 3, 'dust', 0.2);
      }
      const after = tilled(t);
      const q = Math.floor(after * 4);
      if (after >= TILL.done && before < TILL.done) this.toast(`Çapa tamam! ${this.level.client.name} iş sonunda +${tillPay(t)} TL verecek`, 'good');
      else if (q > this.tillQuarter && q < 4) this.toast(`Çapa: %${q * 25}`, 'good', 'till-q', 1);
      this.tillQuarter = Math.max(this.tillQuarter, q);
    }
    this.audio.setTiller(inHand && this.tillRunning, gas, working);
    this.view.world?.updateTill(t, dt);
  }

  /** The tiller taken out of the vehicle (the trimmer put away first) and put back. */
  private tillActions(s: Session, acts: Parameters<Game['renderActions']>[0]): void {
    const t = this.tillTask;
    if (!t || s.driving || !s.nearVehicle) return;
    const what = `${t.kind === 'bostan' ? 'bostan' : 'ocak dipleri'} %${Math.round(tilled(t) * 100)}`;
    if (this.tillerInHand)
      acts.push({ id: 'tiller-off', icon: 'i-hand', label: 'ÇAPAYI KOY', sub: `kasaya · ${what}`, run: () => {
        this.tillerInHand = this.tillRunning = false;
        this.updateStarterUi();
      } });
    else if (!s.hasTrimmer && !this.blowerInHand && this.save.equipment.owned.includes(TILL.tool.id))
      acts.push({ id: 'tiller', icon: 'i-hand', label: 'ÇAPAYI AL', sub: what, run: () => {
        this.tillerInHand = true;
        this.updateStarterUi();
      } });
  }

  /**
   * The cut grass each frame: the tufts showing as the grass under them is mown; the blower, worn and
   * running, blowing them along on the throttle from its tube (ahead on the right); the heap, once lit,
   * burning down with its smoke and crackle.
   */
  private burnStep(s: Session, dt: number): void {
    const t = this.burnTask;
    this.view.blowerInHand = this.view.blowerOn = false;
    this.view.blowerGas = 0;
    if (!t) return;
    const f = s.field;
    this.burnReveal = revealTufts(t, f, this.burnReveal, 30);
    if (s.driving && this.blowerInHand) {
      this.blowerInHand = this.blowerRunning = false;
      this.toast('Üfleyici kasaya kondu', '', 'blow-put', 3);
    }
    const inHand = this.blowerInHand && !s.driving;
    if (inHand !== this.blowerWasInHand) {
      this.blowerWasInHand = inHand;
      this.updateStarterUi();
    }
    let gas = 0;
    if (inHand) {
      gas = this.blowerRunning ? this.input.throttleLevel : 0;
      this.view.blowerInHand = true;
      this.view.blowerOn = this.blowerRunning;
      this.view.blowerGas = gas;
      // The tube's mouth: ahead of him, a little to the right, low.
      const mx = s.x + Math.sin(s.yaw) * 1.0 + Math.cos(s.yaw) * -0.25;
      const mz = s.z + Math.cos(s.yaw) * 1.0 - Math.sin(s.yaw) * -0.25;
      if (t.lit === undefined) blow(t, f, mx, mz, s.yaw, gas, dt);
      if (gas > 0.3 && Math.random() < dt * 20 * gas) this.view.emit(mx + Math.sin(s.yaw) * 1.5, mz + Math.cos(s.yaw) * 1.5, 2, 'grass', 0.15);
    } else if (t.lit === undefined) blow(t, f, 0, 0, 0, 0, dt);
    const k = heaped(t);
    if (k >= BURN.done && !this.burnReady && t.lit === undefined) {
      this.burnReady = true;
      this.toast('Yığın hazır! Yanına git, YAK', 'good');
    }
    if (t.lit !== undefined && t.lit < BURN.burns) {
      t.lit += dt;
      if (t.lit >= BURN.burns) this.toast(`Yığın yandı. ${this.level.client.name} iş sonunda +${BURN.pay} TL verecek`, 'good');
    }
    this.audio.setBlower(inHand && this.blowerRunning, gas);
    const fire = this.view.world?.updateBurn(t, performance.now() / 1000) ?? null;
    if (fire && Math.random() < dt * 14) this.view.smoke(fire.x + (Math.random() - 0.5) * 0.8, fire.y, fire.z + (Math.random() - 0.5) * 0.8, 3);
    if (fire && Math.random() < dt * 6) this.view.emit(fire.x, fire.z, 2, 'spark', 1.0);
    this.audio.setFire(fire ? Math.max(0, 1 - Math.hypot(fire.x - s.x, fire.z - s.z) / 35) : 0);
  }

  /** The blower taken out of the vehicle (the trimmer put away first) and put back; the heap lit. */
  private burnActions(s: Session, acts: Parameters<Game['renderActions']>[0]): void {
    const t = this.burnTask;
    if (!t || s.driving) return;
    const k = heaped(t);
    const what = t.lit !== undefined ? 'yandı' : `yığında %${Math.round(k * 100)}`;
    if (s.nearVehicle) {
      if (this.blowerInHand)
        acts.push({ id: 'blower-off', icon: 'i-hand', label: 'ÜFLEYİCİYİ KOY', sub: `kasaya · ${what}`, run: () => {
          this.blowerInHand = this.blowerRunning = false;
          this.updateStarterUi();
        } });
      else if (!s.hasTrimmer && !this.tillerInHand && t.lit === undefined && this.save.equipment.owned.includes(BURN.tool.id))
        acts.push({ id: 'blower', icon: 'i-hand', label: 'ÜFLEYİCİYİ AL', sub: what, run: () => {
          this.blowerInHand = true;
          this.updateStarterUi();
        } });
    }
    // By the heap, enough of the grass in it: set it alight.
    if (t.lit === undefined && k >= BURN.done && Math.hypot(s.x - t.heap.x, s.z - t.heap.z) < BURN.heapR + 2.5)
      acts.push({ id: 'burn', icon: 'i-power', label: 'YAK', sub: 'yığını tutuştur', run: () => {
        t.lit = 0;
        haptic('medium');
        this.toast('Yığın tutuştu', 'good', 'lit', 3);
      } });
  }

  /**
   * The evening's cows each frame: the dark falling and the crickets with it; Karabaş going round behind
   * the nearest cow still out (pushing it towards the barn's door, barking now and then); each one home
   * told; all of them home, the pay.
   */
  private eveningStep(s: Session, dt: number): void {
    if (!this.eveningRun) {
      this.audio.setCrickets(0);
      return;
    }
    const dusk = Math.min(0.92, 0.15 + s.time / 220);
    this.view.duskLevel = dusk;
    this.audio.setCrickets(Math.max(0, (dusk - 0.25) / 0.6));
    const c = this.view.cows;
    if (!c?.door) return;
    const n = c.herdCount();
    if (c.events.home && n.home < n.all) this.toast(`${n.home}/${n.all} inek ahırda`, 'good', 'herd', 1);
    if (n.all && n.home >= n.all && !this.eveningDone) {
      this.eveningDone = true;
      this.save.money += EVENING.pay;
      this.save.eveningDay = today();
      void writeSave(this.save);
      this.audio.coin();
      this.audio.success();
      this.updateMoney();
      this.toast(`Bütün inekler ahırda! +${EVENING.pay} TL. İyi akşamlar`, 'good');
    }
    // Karabaş behind the nearest cow still out, on the far side from the door.
    const d = this.view.dog;
    const out = c.herdOut();
    if (!d || !out.length) return;
    const near = out.reduce((a, b) => (Math.hypot(b.x - s.x, b.z - s.z) < Math.hypot(a.x - s.x, a.z - s.z) ? b : a));
    if (Math.hypot(near.x - s.x, near.z - s.z) > 35) return;
    const dx = near.x - c.door.x;
    const dz = near.z - c.door.z;
    const l = Math.hypot(dx, dz) || 1;
    d.chase = { x: near.x + (dx / l) * 4, z: near.z + (dz / l) * 4, t: 0.5 };
    this.barkT -= dt;
    if (this.barkT <= 0 && Math.hypot(d.x - near.x, d.z - near.z) < 6) {
      this.audio.bark(Math.hypot(d.x - s.x, d.z - s.z));
      this.barkT = 2 + Math.random() * 3;
    }
  }

  /** The evening's next step: to the nearest cow still out (round behind it), or all home. */
  private eveningGuide(s: Session): { key: string; head: string; sub: string; to?: { x: number; z: number } } {
    const c = this.view.cows;
    if (!c?.door) return { key: 'none', head: '', sub: '' };
    const n = c.herdCount();
    if (n.home >= n.all) return { key: 'e-done', head: 'Bütün inekler ahırda', sub: 'İyi akşamlar. Menüye dönebilirsin' };
    const out = c.herdOut();
    const near = out.reduce((a, b) => (Math.hypot(b.x - s.x, b.z - s.z) < Math.hypot(a.x - s.x, a.z - s.z) ? b : a));
    const dist = Math.round(Math.hypot(near.x - s.x, near.z - s.z));
    return { key: `e-${n.home}`, head: `İnekleri ahıra getir: ${n.home}/${n.all}`, sub: dist > 10 ? `En yakını ${dist} m · arkasına geç, ahırın kapısına doğru sür` : 'Ahırın öbür yanından yürü: inek senden kaçar, kapıya gider', to: dist > 10 ? near : c.door };
  }

  /** The menu's Akşam button: once Karadere is open; ready once a day. */
  private updateEveningBtn(): void {
    const b = $('btn-evening');
    const open = UNLOCK_ALL || this.save.unlocked >= EVENING.needs;
    b.style.display = open ? '' : 'none';
    if (!open) return;
    b.classList.toggle('up', $('btn-starter').style.display === 'none');
    const done = this.save.eveningDay === today();
    $('evening-badge').textContent = done ? 'YARIN' : 'HAZIR';
    b.classList.toggle('ready', !done);
  }

  /** The cows: in the worker's way, their moos and bells, the garden's one told about. */
  private cowStep(s: Session): void {
    const c = this.view.cows;
    if (!c) return;
    s.field.movers = c.blocks();
    const ev = c.events;
    if (ev.moo) this.audio.moo(Math.hypot(ev.moo.x - s.x, ev.moo.z - s.z));
    if (ev.entered) this.toast(`Bahçeye inek girdi! ${this.level.client.name} kızar: kovala, yoksa bahşiş yok`, 'warn', 'cow-in', 10);
    if (ev.chased) this.toast('İnek kaçtı, bahçeden çıktı', 'good', 'cow-out', 5);
    this.audio.setCowBell(c.bellDistance(s.x, s.z));
  }

  /** The job done: the logs cut from the storm's tree piled by the track outside the gate (how many; 0: none). */
  private pileLogs(s: Session): number {
    const w = this.woodHere ? this.wood() : null;
    const n = this.woodTree ? this.woodCut : 0;
    if (!w || !n) return 0;
    const p = gatePile(s.field);
    if (!p) return 0;
    // (Another lot already there from this garden: added to it.)
    const same = w.piles.find((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1);
    if (same) same.n += n;
    else w.piles.push({ ...p, n });
    this.woodTree = null;
    this.woodCut = 0;
    void writeSave(this.save);
    return n;
  }

  /** A message under the objective (one at a time); `ms`: how long it stays (else by its length). */
  private toast(text: string, kind: '' | 'warn' | 'good' = '', key?: string, every = 0, ms?: number): void {
    const now = performance.now();
    if (key && now - (this.toastAt[key] ?? -1e9) < every * 1000) return;
    if (key) this.toastAt[key] = now;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    const box = $('toasts');
    box.appendChild(el);
    this.placeToasts();
    // One message at a time (the same one again only refreshes it).
    for (const old of [...box.children]) if (old !== el) old.remove();
    // Long enough to read: by its length (warnings a little longer).
    ms ??= Math.max(2600, 1200 + text.length * 70) * (kind === 'warn' ? 1.3 : 1);
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
          // (Said the first few times only.)
          if (!this.harvesting && !this.wooding && (this.save.driveTips ?? 0) < 3) {
            this.save.driveTips = (this.save.driveTips ?? 0) + 1;
            this.toast('Direksiyonu çevir, GAZ ve FREN pedallarıyla sür', 'good', 'board', 120);
          }
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
          this.toast('Ayağın kayıyor! Bayırda yavaş yürü', 'warn', 'slip', 4);
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
          // (Not again on the way to the next job.)
          if (this.travelTo) break;
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
  }

  /**
   * When fuel or line runs out (or, the first job, to the pat pat with the trimmer): the objective's pill
   * points the way instead of its usual line (the big box in the middle it was is gone).
   */
  private guideLine = '';
  private updateGuide(s: Session): void {
    const lineOut = (s.broken && s.spool < TRIMMER.rethreadUse) || (s.line < TRIMMER.lineMin && s.spool < 0.01);
    const fuelOut = s.fuel < s.gear.tank * 0.15;
    // First job: the arrow shows the way to the pat pat with the trimmer in its trailer.
    const toTrailer = s.intro === 'take' && !s.nearVehicle;
    const show = toTrailer || ((lineOut || fuelOut) && !s.atDepot && !s.intro);
    $('guide').classList.remove('show');
    this.guideLine = '';
    // (To the pat pat the objective says already.)
    if (!show || toTrailer || s.driving) return;
    const goal = toTrailer ? s.field.vehicle : s.field.depot;
    const dx = goal.x - s.x;
    const dz = goal.z - s.z;
    const what = fuelOut && lineOut ? 'Benzin ve misina' : fuelOut ? 'Benzin' : 'Misina';
    const d = Math.round(Math.hypot(dx, dz));
    this.guideLine = `${this.arrowTo(s, goal.x, goal.z)}${toTrailer ? `Patpat ${d} m` : `${what} bitiyor: bidon ${d} m`}`;
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
    // (At most FPS_CAP frames a second; MENU_FPS on the menu and the screens over it.)
    const fps = this.mode === 'playing' ? FPS_CAP : this.mode === 'menu' && document.querySelector('.screen.show:not(#menu)') ? OVERLAY_FPS : MENU_FPS;
    if (t - this.last < 1000 / fps - 2) return;
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
          this.pitchEase = hands ? TRIMMER_PITCH : -0.06;
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
      // On the pat pat or the tractor: the steering wheel and the pedals (FREN brakes, then backs up);
      // else the keys (W gas, S brake / back up, A D steer).
      this.input.driving = s.driving;
      const wheel = this.input.drive;
      wheel.update(dt);
      const drive = s.driving ? (wheel.active ? { throttle: wheel.throttle, steer: wheel.steer } : { throttle: -m.y, steer: m.x }) : undefined;
      if (drive) {
        moveX = moveZ = 0;
        this.lookYaw = s.yaw;
        // Dragging turns the camera round the vehicle, and it stays where it was turned; only driving on
        // (faster than a walk) without a finger on the screen for a few seconds brings it slowly back behind.
        this.view.driveOrbit -= look.dx * 0.006;
        this.orbitIdle = this.input.looking || look.dx !== 0 ? 0 : this.orbitIdle + dt;
        if (this.orbitIdle > ORBIT_HOLD && Math.abs(s.field.vehicle.speed) > 2) this.view.driveOrbit *= Math.exp(-dt * 0.5);
        this.view.driveOrbit = Math.max(-Math.PI, Math.min(Math.PI, this.view.driveOrbit));
        // The engine revs with the speed in the gear it is in (high near its top, low after a shift up).
        // (A heavy load up a slope: the engine works hard and slow.)
        this.audio.patpat(true, Math.min(1, Math.abs(s.field.vehicle.speed) / 4 + Math.max(0, drive.throttle) * 0.3 + s.cargoStrain * 0.45), Math.min(1, Math.abs(s.field.vehicle.speed) / s.field.dims.forward));
        // The gear: into first or reverse as a pedal is pressed from standing, or across from one to
        // the other; back to neutral once stopped with the pedals let go.
        const dir = Math.abs(drive.throttle) > 0.15 ? Math.sign(drive.throttle) : 0;
        if (dir && dir !== this.patGear) {
          this.audio.patpatGear();
          this.patGear = dir;
        } else if (!dir && Math.abs(s.field.vehicle.speed) < 0.1) this.patGear = 0;
      }
      // (STOP with the chainsaw or the tiller in hand stops it.)
      const sawInHand = this.view.sawInHand && !s.driving;
      const tillerInHand = this.tillerInHand && !s.driving;
      const blowerInHand = this.blowerInHand && !s.driving;
      const stopNow = this.input.takeStop();
      if (stopNow && ((sawInHand && this.sawRunning) || (tillerInHand && this.tillRunning) || (blowerInHand && this.blowerRunning))) {
        if (tillerInHand) this.tillRunning = false;
        else if (blowerInHand) this.blowerRunning = false;
        else this.sawRunning = false;
        this.toast(`${this.toolName} durdu`, '', 'saw-stop', 1);
        this.updateStarterUi();
      }
      s.advance(dt, {
        drive,
        moveX,
        moveZ,
        throttle,
        bump,
        yaw: fpv ? this.lookYaw : undefined,
        sweep: this.input.sweep,
        stop: stopNow && !sawInHand && !tillerInHand && !blowerInHand,
        rethread: this.input.rethreading || this.actionHeld,
        lift,
      });
      // The throttle lever: shown with the trimmer in hand and the engine running; back to idle when it
      // stops (it starts again ticking over, not flat out).
      const trimmerInHand = s.hasTrimmer && !s.driving && !s.intro;
      // (The chainsaw in hand, running, works the same trigger.)
      document.body.classList.toggle('gas-on', (trimmerInHand && s.running) || (sawInHand && this.sawRunning) || (tillerInHand && this.tillRunning) || (blowerInHand && this.blowerRunning));
      document.body.classList.toggle('saw-hand', sawInHand || tillerInHand || blowerInHand);
      document.body.classList.toggle('trimmer-hand', trimmerInHand);
      // Trimmer in hand the right thumb is on the trigger: the left one walks and turns (looking).
      if (this.input.trimmer !== (trimmerInHand || sawInHand || tillerInHand || blowerInHand)) {
        this.input.trimmer = trimmerInHand || sawInHand || tillerInHand || blowerInHand;
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
      if (!s.running && !sawInHand && !tillerInHand && !blowerInHand && this.input.throttleOn) this.input.setGas(0);
      if (throttle && s.cold) this.toast('Motor ısınıyor, birkaç saniye tam güç vermez', '', 'cold', 8);
      this.handleEvents(s);
      this.cutRate += (this.cutAcc / Math.max(dt, 1e-3) - this.cutRate) * 0.2;
      this.cutAcc = 0;
      this.audio.update(dt, s.rpm, s.cutting ? s.loadRatio : 0, true, s.temp, s.cutting ? this.cutRate : 0, s.strain, this.cutTall);
      this.input.renderPad(s.sweep / PLAYER.sweepMax, s.rpm);
      // (Heard only near it: from 12 m off, rising by the bank.)
      this.audio.setWater(Math.max(0, 1 - streamDistance(s.field, s.x, s.z) / 12));
      this.ambientSounds(s, dt);
      // Face shield: the standard one comes down with the trimmer in hand (in first person), dirtied by
      // the cut grass; not while roaming, driving or walking without the trimmer.
      this.visor.visible = this.view.mode === 'fpv' && s.hasTrimmer && !s.roaming && !s.driving;
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
      this.harvestStep(s, dt);
      this.woodStep(s, dt);
      this.dogStep(s, dt);
      this.tillStep(s, dt);
      this.burnStep(s, dt);
      this.cowStep(s);
      this.eveningStep(s, dt);
      this.updateIntro(s);
      document.body.classList.toggle('tangled', s.tangle > 0.3);
      const rl = s.tangle > 0.3 ? 'TEMİZLE' : 'MİSİNA TAK';
      if (rl !== this.rethreadLabel) $('rethread-label').textContent = this.rethreadLabel = rl;
      this.updateGuide(s);
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.2;
        this.updateHud(s);
      }
      if (this.travelTo) this.travelStep(s);
      else if (s.field.coverage >= 0.995) this.finish();
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
          if (a.hold) {
            this.actionHeld = true;
            this.heldId = a.id;
          }
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
    // The top bar: the gauges with the trimmer in hand; the progress once the job's field is begun.
    document.body.classList.toggle('bare', !s.hasTrimmer);
    document.body.classList.toggle('no-progress', s.roaming || (!s.hasTrimmer && s.field.coverage < 0.005));
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
      if (s.canTake && !s.roaming && !this.tillerInHand && !this.blowerInHand) acts.push({ id: 'take', icon: 'i-hand', label: 'TIRPANI AL', sub: 'kasadan al', run: () => s.takeTrimmer() });
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
    const away = this.exitNear(s);
    if (away) acts.push({ id: 'exit', icon: 'i-map', label: 'KÖYE GİT', sub: away.name, run: () => this.leaveVillage(away) });
    this.harvestActions(s, acts);
    this.woodActions(s, acts);
    this.tillActions(s, acts);
    this.burnActions(s, acts);
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
    // On the way to the next job: the trimmer into the vehicle, then the way to its gate.
    if (this.travelTo) {
      const lv = this.travelTo;
      const v = s.field.vehicle;
      const to = s.field.tractor ? 'Traktöre' : 'Patpata';
      const dv = Math.round(Math.hypot(v.x - s.x, v.z - s.z));
      const g = this.gatePoint(s, lv);
      const e = s.field.exit;
      if (s.driving && !g && e) text = `${this.arrowTo(s, e.x, e.z)}${this.otherRegion(s)?.name ?? 'Köy'} yolu: ${Math.round(Math.hypot(e.x - v.x, e.z - v.z))} m<small>Köyün çıkışındaki tabelaya sür, KÖYE GİT'e bas</small>`;
      else if (s.driving && g) text = `${this.arrowTo(s, g.x, g.z)}${lv.name}: ${Math.round(Math.hypot(g.x - v.x, g.z - v.z))} m<small>Bahçenin kapısına gel</small>`;
      else if (s.hasTrimmer) text = s.nearVehicle ? 'TIRPANI BIRAK: kasaya koy' : `${this.arrowTo(s, v.x, v.z)}${to} git (${dv} m)<small>Tırpanı kasaya koy, ${lv.name} bahçesine sür</small>`;
      else text = s.nearVehicle ? `${to} bin, ${lv.name} bahçesine sür` : `${this.arrowTo(s, v.x, v.z)}${to} git (${dv} m)`;
    }
    // (Roaming: no job to point to; the harvest's next step if there is one.)
    if (this.roaming) {
      const g = this.eveningRun ? this.eveningGuide(s) : this.harvesting ? this.harvestGuide(s) : this.wooding ? this.woodGuide(s) : null;
      text = g?.head ? `${g.to ? this.arrowTo(s, g.to.x, g.to.z) : ''}${g.head}${g.sub ? `<small>${g.sub}</small>` : ''}` : '';
    }
    document.body.classList.toggle('harvest-hint', this.roaming && !!text);
    // Running out: the way to the fuel can first.
    if (this.guideLine) text = this.guideLine;
    // (Only when it changes, and never read back from the page: that, and placing the messages under it
    // every frame, made the browser lay the page out again each frame. The messages follow its size: see
    // the ResizeObserver.)
    if (text !== this.objText) {
      this.objText = text;
      $('objective').innerHTML = text;
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
    // (The harvest from its tab has its own steps, and by the sacks they are the harvest's: the fields' gates say nothing then.)
    if (this.harvestTab || this.harvestGarden(s) !== null) return null;
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
    // From Serbest gez: the job starts from here as any job does, the trimmer brought in the vehicle
    // (none was carried round the village): take it out and fit line.
    this.fromRoam = this.roaming;
    this.roaming = false;
    document.body.classList.remove('roam');
    void this.startWithLoader(lv);
  }

  private routeAhead(s: Session): { x: number; z: number; left: number } {
    const l = s.field.lane;
    const v = s.field.vehicle;
    let n = 0;
    for (let i = 1; i < l.length; i++) if ((l[i].x - v.x) ** 2 + (l[i].z - v.z) ** 2 < (l[n].x - v.x) ** 2 + (l[n].z - v.z) ** 2) n = i;
    // (Off the way, as come in by the village's road beyond its end: to its nearest point first.)
    const off = Math.hypot(l[n].x - v.x, l[n].z - v.z);
    let left = off;
    for (let i = n + 1; i < l.length; i++) left += Math.hypot(l[i].x - l[i - 1].x, l[i].z - l[i - 1].z);
    const p = off > 15 ? l[n] : l[Math.min(l.length - 1, n + 15)];
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

  /**
   * Automatic quality (none chosen in the settings): a step down when the game is clearly struggling
   * (under 40 fps over 4 s), and that level is the most it goes to from then on; a step up after three
   * smooth spells in a row (57 fps or more), up to that.
   */
  private trackFps(dt: number): void {
    if (this.mode !== 'playing' || params.has('quality') || this.save.quality) return;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc < 4) return;
    const fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    const order: Quality[] = ['low', 'medium', 'high'];
    const at = order.indexOf(this.view.quality);
    if (fps < 40 && at > 0) {
      this.autoCeiling = order[at - 1];
      this.view.setQuality(this.autoCeiling);
      this.fpsSmooth = 0;
    } else if (fps >= 57 && at < order.indexOf(this.autoCeiling)) {
      if (++this.fpsSmooth >= 3) {
        this.view.setQuality(order[at + 1]);
        this.fpsSmooth = 0;
      }
    } else this.fpsSmooth = 0;
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

/**
 * A tablet held sideways: the menu and the cards over it laid out as on a phone (its screen about 874 by
 * 402) and scaled up to fill it (the game's own controls are left as they are: they place themselves at
 * the finger).
 */
function fitTablet(): void {
  const z = innerWidth > innerHeight && innerHeight > 520 ? Math.min(innerHeight / 402, innerWidth / 874) : 1;
  document.documentElement.style.setProperty('--ui-zoom', z.toFixed(3));
}
fitTablet();
addEventListener('resize', fitTablet);

const game = new Game();
(window as unknown as { __game: Game }).__game = game;
void game.boot();
