'use strict';

/**
 * Touch the update signal file so a running DevHub desktop app checks the
 * update feed immediately (instead of waiting for the 30-minute interval).
 *
 * Usage: pnpm electron:update-ping
 * Typical agent flow:
 *   pnpm electron:build -c.extraMetadata.version=X.Y.Z && pnpm electron:update-ping
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function userDataDir() {
  // Mirrors Electron's app.getPath('userData') for productName "DevHub".
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'DevHub');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'DevHub');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'DevHub');
}

const dir = userDataDir();
const signalPath = path.join(dir, 'update-check.signal');

try {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(signalPath, `${new Date().toISOString()}\n`);
  console.log('[update-ping] touched', signalPath);
} catch (err) {
  console.error('[update-ping] failed:', err?.message || err);
  process.exitCode = 1;
}
