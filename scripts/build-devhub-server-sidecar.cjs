#!/usr/bin/env node

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BINARIES_DIR = path.join(ROOT, 'src-tauri', 'binaries');
const NODE_WRAPPER = path.join(ROOT, 'packaging', 'devhub-server.cjs');
const LINUX_SOURCE = path.join(ROOT, 'packaging', 'linux', 'devhub-server');
const LINUX_TARGET = path.join(BINARIES_DIR, 'devhub-server-x86_64-unknown-linux-gnu');
const WINDOWS_TARGET = path.join(BINARIES_DIR, 'devhub-server-x86_64-pc-windows-msvc.exe');

function syncLinuxSidecar() {
  if (!fs.existsSync(LINUX_SOURCE)) {
    throw new Error(`Linux sidecar source missing at ${LINUX_SOURCE}`);
  }
  fs.mkdirSync(BINARIES_DIR, { recursive: true });
  fs.copyFileSync(LINUX_SOURCE, LINUX_TARGET);
  fs.chmodSync(LINUX_TARGET, 0o755);
  console.log('[sidecar:build] Synced Linux devhub-server wrapper');
}

function syncWindowsSidecar() {
  if (!fs.existsSync(NODE_WRAPPER)) {
    throw new Error(`Node sidecar wrapper missing at ${NODE_WRAPPER}`);
  }

  fs.mkdirSync(BINARIES_DIR, { recursive: true });

  const launcherManifest = path.join(
    ROOT,
    'packaging',
    'windows',
    'devhub-server-launcher',
    'Cargo.toml'
  );
  const launcherTargetDir = path.join(
    ROOT,
    'packaging',
    'windows',
    'devhub-server-launcher',
    'target',
    'release'
  );
  const builtLauncher = path.join(launcherTargetDir, 'devhub-server-launcher.exe');

  const result = spawnSync('cargo', ['build', '--release', '--manifest-path', launcherManifest], {
    stdio: 'inherit',
    cwd: ROOT,
    shell: process.platform === 'win32',
  });

  if (result.status !== 0 || !fs.existsSync(builtLauncher)) {
    throw new Error('Failed to build Windows devhub-server launcher with cargo');
  }

  fs.copyFileSync(builtLauncher, WINDOWS_TARGET);
  console.log('[sidecar:build] Built Windows devhub-server launcher');
}

function main() {
  if (process.platform === 'win32') {
    syncWindowsSidecar();
    return;
  }

  if (process.platform === 'linux') {
    syncLinuxSidecar();
    return;
  }

  syncLinuxSidecar();
  try {
    syncWindowsSidecar();
  } catch (error) {
    console.warn(`[sidecar:build] Windows sidecar skipped on ${process.platform}: ${error.message}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = { main, syncLinuxSidecar, syncWindowsSidecar };