// Generates the app icon and splash images for Android and iOS from the icon painting,
// rendering them with the local Chrome (no image libraries needed).
// Usage: node scripts/gen-assets.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

// Artwork: the crowned worker with his brush cutter in a hazelnut orchard (assets-src/icon/ikon.png, square).
// Green used around it where needed (the grass at the edges).
const ICON = `data:image/png;base64,${readFileSync('assets-src/icon/ikon.png').toString('base64')}`;
const BG = '#4f8f2f';
const art = () => `<img src="${ICON}" style="display:block;width:100%;height:100%">`;

// Launch screen: the icon painting with the game title over it, on the green of the loading screen.
const splash = (w, h) => {
  const s = Math.min(w, h * 0.46) * 0.8;
  return `<div style="width:${w}px;height:${h}px;background:radial-gradient(circle at 50% 40%, #8cc35a, #3f7a2a 75%);position:relative;font-family:system-ui,sans-serif">
    <img src="${ICON}" style="position:absolute;left:50%;top:44%;width:${s}px;height:${s}px;border-radius:${s * 0.18}px;transform:translate(-50%,-50%);box-shadow:0 ${s * 0.04}px ${s * 0.12}px rgba(0,0,0,.35)">
    <div style="position:absolute;left:0;right:0;top:calc(44% + ${s * 0.58}px);text-align:center;font-weight:900;font-size:${s * 0.2}px;line-height:1;color:#fff;text-shadow:0 ${s * 0.02}px 0 #2a5a1c">KRAL <span style="color:#f07a1a;text-shadow:0 ${s * 0.02}px 0 #7a3a06">TIRPAN</span></div></div>`;
};
// Android 12+ system splash: only an icon, masked to a circle of 2/3 of its 288 dp canvas.
const splashIcon = (s) =>
  `<div style="width:${s}px;height:${s}px;display:grid;place-items:center"><img src="${ICON}" style="width:${s * 0.6}px;height:${s * 0.6}px;border-radius:50%"></div>`;

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage();

async function render(svg, w, h, file, transparent = false) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  mkdirSync(dirname(file), { recursive: true });
  const buf = await page.screenshot({ type: 'png', omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  writeFileSync(file, buf);
}

const full = (s) => `<div style="width:${s}px;height:${s}px">${art()}</div>`;
// Round icon: the painting slightly smaller and lower so the crown stays inside the circle.
const round = (s) => `<div style="width:${s}px;height:${s}px;border-radius:50%;overflow:hidden;background:${BG}"><img src="${ICON}" style="display:block;width:${s * 0.92}px;height:${s * 0.92}px;margin:${s * 0.1}px 0 0 ${s * 0.04}px"></div>`;
// Adaptive icon foreground (108 dp canvas): the painting fills the 72 dp area every launcher
// mask fits in, so circles, squircles and teardrops all show the whole tray; the turquoise
// background layer shows around it only during the launcher's parallax effects.
const fg = (s) => `<div style="width:${s}px;height:${s}px;display:grid;place-items:center"><div style="width:${(s * 72) / 108}px;height:${(s * 72) / 108}px">${art()}</div></div>`;

const RES = 'android/app/src/main/res';
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  await render(full(48 * k), 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher.png`);
  await render(round(48 * k), 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher_round.png`, true);
  await render(fg(108 * k), 108 * k, 108 * k, `${RES}/mipmap-${d}/ic_launcher_foreground.png`, true);
  await render(splash(320 * k, 480 * k), 320 * k, 480 * k, `${RES}/drawable-port-${d}/splash.png`);
  await render(splash(480 * k, 320 * k), 480 * k, 320 * k, `${RES}/drawable-land-${d}/splash.png`);
}
await render(splash(480, 800), 480, 800, `${RES}/drawable/splash.png`);
await render(splashIcon(1152), 1152, 1152, `${RES}/drawable-nodpi/splash_logo.png`, true);
writeFileSync(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
);

// iOS is not set up yet (no ios/ project); add it with `npx cap add ios` and re-enable the iOS images.
// Store listing icon (Play Console needs 512x512).
await render(full(512), 512, 512, 'store/icon-512.png');
await browser.close();
console.log('assets generated');
