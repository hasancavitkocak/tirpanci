import { existsSync, readdirSync, rmSync } from 'node:fs';
import { constants, setPriority, tmpdir } from 'node:os';
import { join } from 'node:path';

// The test scripts run at low priority (the Chrome they start inherits it): the computer's own work comes
// first, the tests take what is left. (SwiftShader drawing the 3D on the processor froze the machine.)
try {
  setPriority(constants.priority.PRIORITY_LOW);
} catch {
  // (Not allowed here: run as is.)
}

// Each script gives its Chrome a profile of its own in TEMP (look-<name>-<ms>): thrown away when the
// script ends, or they pile up (137 of them once filled the disk, 8.5 GB). Those made since this script
// started go when it ends (another script running alongside keeps its own); any left over an hour from
// earlier runs (a script that crashed, Chrome still holding one) go when the next one starts.
const STARTED = Date.now();
const clean = (keep) => {
  const tmp = process.env.TEMP || tmpdir();
  let names = [];
  try {
    names = readdirSync(tmp);
  } catch {
    return;
  }
  for (const n of names) {
    const m = /^look-.*-(\d{13})$/.exec(n);
    if (!m || keep(Number(m[1]))) continue;
    try {
      rmSync(join(tmp, n), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // (Chrome still holding it: left for the next clean-up.)
    }
  }
};
clean((t) => t > STARTED - 3600_000);
process.on('exit', () => clean((t) => t < STARTED));

/**
 * Chrome's flags for the test scripts: the 3D drawn on the graphics card (ANGLE over Direct3D 11), not
 * on the processor; SWIFTSHADER=1 for the software one (where there is no card, e.g. a CI box).
 */
export const CHROME_ARGS = process.env.SWIFTSHADER
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];

/** Locate a Chrome/Edge executable for puppeteer-core (override with CHROME_PATH). */
export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH.');
  return found;
}
