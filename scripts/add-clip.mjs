// Add a Mixamo clip to public/models/isci.glb (via dev/add-clip.html), e.g. the pat pat driving pose.
// Needs the dev server running. Usage: node scripts/add-clip.mjs fbxPath clipName [baseUrl]
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';
const [, , fbx, name, baseArg] = process.argv;
const base = baseArg ?? 'http://localhost:5173/';
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(m.type(), m.text()));
await p.goto(`${base}dev/add-clip.html?fbx=${encodeURIComponent(fbx)}&name=${encodeURIComponent(name)}`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction('window.__done === true', { timeout: 180000 });
console.log(JSON.stringify(await p.evaluate(() => window.__info), null, 1));
const glb = Buffer.from(await p.evaluate(() => window.__glb), 'base64');
writeFileSync('public/models/isci.glb', glb);
console.log('wrote public/models/isci.glb', (glb.length / 1024).toFixed(0), 'KB');
await b.close();
