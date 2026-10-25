// Dev: a village's plan from above (the map drawn plain: roads, the stream, fields, buildings, trees; no
// labels), for the artist to paint over: test-output/koy<region>-plan.png. The painting goes back as
// public/harita/koy<region>-ust.webp, laid exactly over the same part of the village.
// Usage: node scripts/village-plan.mjs [region] [width] (default 1, 2400; the dev server on :5173)
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_ARGS, findChrome } from './chrome.mjs';

const region = Number(process.argv[2] ?? 1);
const width = Number(process.argv[3] ?? 2400);
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { timeout: 120000 });
const data = await page.evaluate(async (region, width) => {
  const { villagePlan } = await import('/src/ui/villageMap.ts');
  return villagePlan(region, width).toDataURL('image/png');
}, region, width);
writeFileSync(`test-output/koy${region}-plan.png`, Buffer.from(data.split(',')[1], 'base64'));
console.log(`test-output/koy${region}-plan.png`);
await browser.close();
