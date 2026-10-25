// Build public/models/isci.glb from the Mixamo FBX files in assets-src/isci (via dev/build-worker.html).
// Needs the dev server running. Usage: node scripts/build-worker.mjs [baseUrl]
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';
const base = process.argv[2] ?? 'http://localhost:5190/';
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(m.type(), m.text()));
await p.goto(`${base}dev/build-worker.html`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction('window.__done === true', { timeout: 180000 });
console.log(JSON.stringify(await p.evaluate(() => window.__info), null, 1));
const glb = Buffer.from(await p.evaluate(() => window.__glb), 'base64');
writeFileSync('public/models/isci.glb', glb);
console.log('wrote public/models/isci.glb', (glb.length / 1024).toFixed(0), 'KB');
await b.close();
