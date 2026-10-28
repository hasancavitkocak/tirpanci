// Dev: a compressed recording (mp3, ogg, m4a…) to a 16-bit mono WAV (no ffmpeg): decoded by Chrome's own
// audio decoder, mixed to mono at `rate`, the stretch [from, to] seconds kept (all of it if not given).
// Then cut loops from it with wav-loop.mjs. node scripts/decode-audio.mjs <in> <out.wav> [rate=22050] [from] [to]
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const [inp, out, rate = '22050', from = '0', to = ''] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const p = await b.newPage();
await p.goto('about:blank');
const pcm = await p.evaluate(
  async (data, rate, from, to) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const ctx = new OfflineAudioContext(1, 1, rate);
    const buf = await ctx.decodeAudioData(bytes.buffer);
    const i0 = Math.floor(from * rate);
    const i1 = Math.min(buf.length, to ? Math.floor(to * rate) : buf.length);
    const n = Math.max(0, i1 - i0);
    const mono = new Int16Array(n);
    const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (const ch of chans) v += ch[i0 + i];
      v /= chans.length;
      mono[i] = Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
    }
    let s = '';
    const u8 = new Uint8Array(mono.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64: btoa(s), dur: buf.duration };
  },
  fs.readFileSync(inp).toString('base64'),
  Number(rate),
  Number(from),
  to ? Number(to) : 0,
);
await b.close();
const data = Buffer.from(pcm.b64, 'base64');
const h = Buffer.alloc(44);
h.write('RIFF', 0);
h.writeUInt32LE(36 + data.length, 4);
h.write('WAVEfmt ', 8);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(1, 22);
h.writeUInt32LE(Number(rate), 24);
h.writeUInt32LE(Number(rate) * 2, 28);
h.writeUInt16LE(2, 32);
h.writeUInt16LE(16, 34);
h.write('data', 36);
h.writeUInt32LE(data.length, 40);
fs.writeFileSync(out, Buffer.concat([h, data]));
console.log(out, `${(data.length / 2 / Number(rate)).toFixed(1)} s of ${pcm.dur.toFixed(1)} s`);
