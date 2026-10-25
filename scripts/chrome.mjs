import { existsSync } from 'node:fs';
import { constants, setPriority } from 'node:os';

// The test scripts run at low priority (the Chrome they start inherits it): the computer's own work comes
// first, the tests take what is left. (SwiftShader drawing the 3D on the processor froze the machine.)
try {
  setPriority(constants.priority.PRIORITY_LOW);
} catch {
  // (Not allowed here: run as is.)
}

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
