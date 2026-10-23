// Cuts the pat pat's sounds out of one recording (assets-src/audio/patpat_video3.mp4: an old pat pat
// started for the first time in three months, then left running): the start, a steady idle loop, a
// revving loop and the gear going in, as mono WAV files in public/audio (and other gear candidates
// in assets-src/audio/vites to listen to). The loops are crossfaded end into start so they
// repeat without a click. Needs the dev server (the browser decodes the audio).
// Usage: node scripts/cut-patpat-audio.mjs [baseUrl]
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const SRC = '/assets-src/audio/patpat_video3.mp4';
// [file, start s, end s, loop], measured from the loudness and the firing rate: the starter turns at
// 168.0 s and the engine catches straight away, revving up to 171 s; 694–783 s is a steady idle
// (≈9.5 firings a second), 592–668 s steady running at ≈18–20.
const CUTS = [
  ['public/audio/patpat_start.wav', 167.8, 171.5, false],
  ['public/audio/patpat_idle.wav', 740.0, 741.9, true],
  ['public/audio/patpat_rev.wav', 612.0, 613.9, true],
  // The gear going in: the sharpest knocks while it runs (≈510 s strongest), the others to listen to.
  ['public/audio/patpat_gear.wav', 509.72, 510.3, false],
  ...[532.85, 498.82, 547.54, 236.34, 263.73].map((t) => [`assets-src/audio/vites/aday_${Math.round(t)}s.wav`, t - 0.13, t + 0.45, false]),
].map(([f, t0, t1, loop]) => [f, SRC, t0, t1, loop]);
mkdirSync('assets-src/audio/vites', { recursive: true });
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage();
await page.goto(`${base}dev/viewer.html?m=patpat_tum.glb`);
const out = await page.evaluate(async (cuts) => {
  const sources = {};
  for (const src of new Set(cuts.map((c) => c[1]))) {
    const a = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(src)).arrayBuffer());
    const mono = new Float32Array(a.length);
    for (let c = 0; c < a.numberOfChannels; c++) a.getChannelData(c).forEach((v, i) => (mono[i] += v / a.numberOfChannels));
    sources[src] = { mono, sr: a.sampleRate };
  }
  return cuts.map(([name, src, t0, t1, loop]) => {
    const { mono, sr } = sources[src];
    let s = mono.slice(Math.round(t0 * sr), Math.round(t1 * sr));
    const fade = Math.round(sr * 0.15);
    if (loop) {
      // Crossfade the tail into the head, then drop the tail: the end runs straight into the start.
      const n = s.length - fade;
      const o = s.slice(0, n);
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        o[i] = s[i] * k + s[n + i] * (1 - k);
      }
      s = o;
    } else {
      const f = Math.round(sr * 0.02);
      for (let i = 0; i < f; i++) s[i] *= i / f;
      for (let i = 0; i < fade; i++) s[s.length - 1 - i] *= i / fade;
    }
    // Normalise to a peak of 0.9 (the recording clips in places).
    let peak = 0;
    for (const v of s) peak = Math.max(peak, Math.abs(v));
    const g = 0.9 / (peak || 1);
    const bytes = new Uint8Array(44 + s.length * 2);
    const dv = new DataView(bytes.buffer);
    const str = (o, t) => [...t].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
    str(0, 'RIFF');
    dv.setUint32(4, 36 + s.length * 2, true);
    str(8, 'WAVEfmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    str(36, 'data');
    dv.setUint32(40, s.length * 2, true);
    s.forEach((v, i) => dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v * g)) * 32767, true));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return [name, btoa(bin), s.length / sr];
  });
}, CUTS);
for (const [name, b64, dur] of out) {
  writeFileSync(name, Buffer.from(b64, 'base64'));
  console.log(name, dur.toFixed(2) + 's');
}
await browser.close();
