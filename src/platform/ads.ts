import { AdMob, AdmobConsentStatus, InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

/**
 * Ads. On Android/iOS: AdMob (rewarded + interstitial). In the browser: a 5 second fake rewarded ad,
 * and no interstitials.
 *
 * Until the real AdMob units exist the ids below are Google's public test units (they always fill
 * and never pay). To go live: put your units here, set TESTING to false, and replace the test
 * APPLICATION_ID in android/app/src/main/AndroidManifest.xml (and GADApplicationIdentifier in
 * ios/App/App/Info.plist) with your AdMob app id.
 */
const TESTING = true;
const UNITS = {
  android: { rewarded: 'ca-app-pub-3940256099942544/5224354917', interstitial: 'ca-app-pub-3940256099942544/1033173712' },
  ios: { rewarded: 'ca-app-pub-3940256099942544/1712485313', interstitial: 'ca-app-pub-3940256099942544/4411468910' },
};
const FAKE_SECONDS = 5;
/**
 * Interstitials: not after the very first job, then on leaving each result screen (on to the next
 * job), but never two within M seconds.
 */
const INTERSTITIAL_GRACE = 1;
const INTERSTITIAL_EVERY = 1;
const INTERSTITIAL_GAP_S = 90;

const platform = Capacitor.getPlatform();
const native = platform === 'android' || platform === 'ios';
const units = platform === 'ios' ? UNITS.ios : UNITS.android;

let ready = false;
/** "Reklamları kaldır" bought: no interstitials (rewarded ads stay, the player chooses those). */
let removed = false;

export function setAdsRemoved(v: boolean): void {
  removed = v;
}
let jobs = 0;
let lastInterstitial = -1e9;

/** Start AdMob and ask for consent where the law needs it (EU / UK). Safe to call once at startup. */
export async function initAds(): Promise<void> {
  if (!native) return;
  try {
    await AdMob.initialize({ initializeForTesting: TESTING });
    const info = await AdMob.requestConsentInfo();
    if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
    ready = true;
  } catch (e) {
    console.warn('AdMob init failed', e);
  }
}

/** Show a rewarded ad; resolves true if the player earned the reward. */
export function showRewarded(text = 'Ödül'): Promise<boolean> {
  if (!native) return showFake(text);
  if (!ready) return Promise.resolve(false);
  return new Promise((resolve) => {
    let earned = false;
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    const done = () => {
      for (const h of handles) void h.then((x) => x.remove());
      resolve(earned);
    };
    handles.push(AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (earned = true)));
    handles.push(AdMob.addListener(RewardAdPluginEvents.Dismissed, done));
    handles.push(AdMob.addListener(RewardAdPluginEvents.FailedToShow, done));
    AdMob.prepareRewardVideoAd({ adId: units.rewarded, isTesting: TESTING, immersiveMode: true })
      .then(() => AdMob.showRewardVideoAd())
      .catch((e) => {
        console.warn('rewarded ad failed', e);
        done();
      });
  });
}

/**
 * Call when a job is finished and the player leaves the result screen. Now and then shows an
 * interstitial; resolves when it is closed (or at once when none is shown).
 */
export async function maybeInterstitial(): Promise<void> {
  jobs++;
  if (removed || !native || !ready || jobs <= INTERSTITIAL_GRACE || (jobs - INTERSTITIAL_GRACE - 1) % INTERSTITIAL_EVERY !== 0) return;
  const now = performance.now() / 1000;
  if (now - lastInterstitial < INTERSTITIAL_GAP_S) return;
  try {
    await AdMob.prepareInterstitial({ adId: units.interstitial, isTesting: TESTING, immersiveMode: true });
    // showInterstitial resolves once the ad is up, not when it is closed: wait for that, so the game
    // does not go on (the next call ringing) behind it.
    const closed = new Promise<void>((resolve) => {
      const done = () => {
        for (const h of handles) void h.then((x) => x.remove());
        resolve();
      };
      const handles = [AdMob.addListener(InterstitialAdPluginEvents.Dismissed, done), AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, done)];
    });
    await AdMob.showInterstitial();
    lastInterstitial = now;
    await closed;
  } catch (e) {
    console.warn('interstitial failed', e);
  }
}

/** Browser stand-in for a rewarded ad: a progress bar and always a reward. */
function showFake(text: string): Promise<boolean> {
  const screen = document.getElementById('ad');
  const fill = document.getElementById('ad-fill');
  const label = document.getElementById('ad-text');
  if (!screen || !fill || !label) return Promise.resolve(false);
  screen.classList.add('show');
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      fill.style.width = `${Math.min(100, (t / FAKE_SECONDS) * 100)}%`;
      label.textContent = t < FAKE_SECONDS ? `Ödül ${Math.ceil(FAKE_SECONDS - t)} sn sonra` : text;
      if (t < FAKE_SECONDS + 0.6) requestAnimationFrame(tick);
      else {
        screen.classList.remove('show');
        resolve(true);
      }
    };
    tick();
  });
}
