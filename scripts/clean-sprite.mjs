// Dev: a sprite sheet with a transparent background cleaned for the game (no dev server): the reddish
// fringe its background removal left round the edges taken out (a pixel red ahead of green and blue, not
// fully solid, made clear; a solid one turned to its neighbours' colour), the edge colours bled out
// under the clear pixels (so no dark or red rim shows when it is drawn smaller), scaled to `width`, as webp.
// node scripts/clean-sprite.mjs <in.png> <out.webp> [width=1024]
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const [inp, out, width = '1024'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const p = await b.newPage();
await p.goto('about:blank');
const url = await p.evaluate(
  async (data, W) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const H = Math.round((img.height * W) / img.width);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    const a = d.data;
    const w = c.width;
    const h = c.height;
    // The red fringe: red well ahead of green and blue.
    const red = (i) => a[i] > 90 && a[i] > a[i + 1] * 1.35 && a[i] > a[i + 2] * 1.35;
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3] || !red(i)) continue;
      if (a[i + 3] < 250) a[i + 3] = 0;
      else {
        // Solid: the average of its non-red neighbours.
        let r = 0, g = 0, bl = 0, n = 0;
        const px = (i / 4) % w;
        const py = Math.floor(i / 4 / w);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const qx = px + dx, qy = py + dy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const j = (qy * w + qx) * 4;
          if (!a[j + 3] || red(j)) continue;
          r += a[j]; g += a[j + 1]; bl += a[j + 2]; n++;
        }
        if (n) { a[i] = r / n; a[i + 1] = g / n; a[i + 2] = bl / n; } else a[i + 3] = 0;
      }
    }
    // The edges bled out under the clear pixels (a few rings), alpha kept.
    for (let pass = 0; pass < 6; pass++) {
      const src = new Uint8ClampedArray(a);
      for (let y = 0; y < h; y++) for (let x2 = 0; x2 < w; x2++) {
        const i = (y * w + x2) * 4;
        if (src[i + 3] > 8 || (src[i] + src[i + 1] + src[i + 2]) > 0) continue;
        let r = 0, g = 0, bl = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const qx = x2 + dx, qy = y + dy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const j = (qy * w + qx) * 4;
          if (src[j] + src[j + 1] + src[j + 2] === 0) continue;
          r += src[j]; g += src[j + 1]; bl += src[j + 2]; n++;
        }
        if (n) { a[i] = r / n; a[i + 1] = g / n; a[i + 2] = bl / n; }
      }
    }
    x.putImageData(d, 0, 0);
    const o = document.createElement('canvas');
    o.width = W;
    o.height = H;
    const ox = o.getContext('2d');
    ox.imageSmoothingQuality = 'high';
    ox.drawImage(c, 0, 0, W, H);
    return o.toDataURL('image/webp', 0.9);
  },
  fs.readFileSync(inp).toString('base64'),
  Number(width),
);
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(out, fs.statSync(out).size, 'bytes');
await b.close();
