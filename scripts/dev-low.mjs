// Dev: the dev server at low priority (the computer's own work first), watching only the game's files
// (vite.config.ts). Usage: npm run dev:low
import { spawn } from 'node:child_process';
import { constants, setPriority } from 'node:os';

try {
  setPriority(constants.priority.PRIORITY_LOW);
} catch {
  // (Not allowed here: run as is.)
}
spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '--port', '5173'], { stdio: 'inherit' }).on('exit', (c) => process.exit(c ?? 0));
