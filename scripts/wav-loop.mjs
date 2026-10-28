// Dev: a seamless loop cut from a recording: the stretch [from, to] seconds, mixed to mono, brought down
// to `rate` (averaged, an integer step), its last `fade` seconds laid over its start (equal-power) and cut
// there, levelled to `peak`; written as 16-bit PCM WAV.
// node scripts/wav-loop.mjs <in.wav> <out.wav> <from> <to> [rate=24000] [fade=0.3] [peak=0.9]
import fs from 'fs';

const [inp, out, from, to, rate = '24000', fade = '0.3', peak = '0.9'] = process.argv.slice(2);
const b = fs.readFileSync(inp);
let o = 12;
let fmt;
let data;
while (o < b.length) {
  const id = b.toString('ascii', o, o + 4);
  const sz = b.readUInt32LE(o + 4);
  if (id === 'fmt ') fmt = { code: b.readUInt16LE(o + 8), ch: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
  if (id === 'data') {
    data = { off: o + 8, sz };
    break;
  }
  o += 8 + sz + (sz & 1);
}
const bps = (fmt.bits / 8) * fmt.ch;
const read = (i, c) => {
  const p = data.off + i * bps + c * (fmt.bits / 8);
  return fmt.code === 3 ? b.readFloatLE(p) : fmt.bits === 16 ? b.readInt16LE(p) / 32768 : fmt.bits === 24 ? b.readIntLE(p, 3) / 8388608 : b.readInt32LE(p) / 2147483648;
};
const step = Math.max(1, Math.round(fmt.rate / Number(rate)));
const outRate = fmt.rate / step;
const i0 = Math.floor(Number(from) * fmt.rate);
const i1 = Math.min(data.sz / bps, Math.floor(Number(to) * fmt.rate));
const s = [];
for (let i = i0; i + step <= i1; i += step) {
  let v = 0;
  for (let k = 0; k < step; k++) for (let c = 0; c < fmt.ch; c++) v += read(i + k, c);
  s.push(v / (step * fmt.ch));
}
// Seamless: the tail faded over the head (equal power), then dropped.
const F = Math.floor(Number(fade) * outRate);
for (let k = 0; k < F; k++) {
  const t = k / F;
  s[k] = s[k] * Math.sin((t * Math.PI) / 2) + s[s.length - F + k] * Math.cos((t * Math.PI) / 2);
}
s.length -= F;
// No DC; levelled.
const mean = s.reduce((a, v) => a + v, 0) / s.length;
let m = 0;
for (let k = 0; k < s.length; k++) m = Math.max(m, Math.abs((s[k] -= mean)));
const g = Number(peak) / (m || 1);
const pcm = Buffer.alloc(44 + s.length * 2);
pcm.write('RIFF', 0);
pcm.writeUInt32LE(36 + s.length * 2, 4);
pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(outRate, 24);
pcm.writeUInt32LE(outRate * 2, 28);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt16LE(16, 34);
pcm.write('data', 36);
pcm.writeUInt32LE(s.length * 2, 40);
s.forEach((v, k) => pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * g * 32767))), 44 + k * 2));
fs.writeFileSync(out, pcm);
console.log(out, `${(s.length / outRate).toFixed(2)} s at ${outRate} Hz, ${(pcm.length / 1024).toFixed(0)} KB, gain ${g.toFixed(2)}`);
