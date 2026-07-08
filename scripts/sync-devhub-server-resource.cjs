#!/usr/bin/env node
/**
 * Copy packaging/devhub-server.cjs into Tauri output dirs so `tauri dev` never
 * runs a stale script from an old release build (coexistence bug with installed app).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'packaging', 'devhub-server.cjs');
const TAURI_DIR = path.join(ROOT, 'src-tauri');

function ensureCopy(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(SOURCE, targetPath);
  return targetPath;
}

function syncDevhubServerResource() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Missing sidecar wrapper source: ${SOURCE}`);
  }

  const targets = [
    path.join(TAURI_DIR, 'resources', 'devhub-server.cjs'),
    path.join(TAURI_DIR, 'target', 'debug', 'resources', 'devhub-server.cjs'),
    path.join(TAURI_DIR, 'target', 'release', 'resources', 'devhub-server.cjs'),
    path.join(TAURI_DIR, 'target', 'debug', 'devhub-server.cjs'),
    path.join(TAURI_DIR, 'target', 'release', 'devhub-server.cjs'),
  ];

  const written = [];
  for (const target of targets) {
    const parent = path.dirname(target);
    if (!fs.existsSync(parent)) continue;
    written.push(ensureCopy(target));
  }

  if (written.length === 0) {
    ensureCopy(targets[0]);
    written.push(targets[0]);
  }

  console.log(`[sync-devhub-server] Updated ${written.length} copy/copies from packaging/devhub-server.cjs`);
  return written;
}

if (require.main === module) {
  try {
    syncDevhubServerResource();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = { syncDevhubServerResource };