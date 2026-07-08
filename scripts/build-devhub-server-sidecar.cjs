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

function statMtimeMs(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  return fs.statSync(targetPath).mtimeMs;
}

function newestInputMtime(paths) {
  return paths.reduce((latest, targetPath) => Math.max(latest, statMtimeMs(targetPath)), 0);
}

function collectWindowsLauncherInputs() {
  const launcherRoot = path.join(ROOT, 'packaging', 'windows', 'devhub-server-launcher');
  const inputs = [
    NODE_WRAPPER,
    path.join(launcherRoot, 'Cargo.toml'),
    path.join(launcherRoot, 'Cargo.lock'),
  ];
  const srcDir = path.join(launcherRoot, 'src');
  if (fs.existsSync(srcDir)) {
    for (const entry of fs.readdirSync(srcDir)) {
      if (entry.endsWith('.rs')) {
        inputs.push(path.join(srcDir, entry));
      }
    }
  }
  return inputs;
}

function syncLinuxSidecar() {
  if (!fs.existsSync(LINUX_SOURCE)) {
    throw new Error(`Linux sidecar source missing at ${LINUX_SOURCE}`);
  }
  fs.mkdirSync(BINARIES_DIR, { recursive: true });

  if (fs.existsSync(LINUX_TARGET) && statMtimeMs(LINUX_TARGET) >= statMtimeMs(LINUX_SOURCE)) {
    console.log('[sidecar:build] Linux wrapper up to date, skipping copy');
    return;
  }

  fs.copyFileSync(LINUX_SOURCE, LINUX_TARGET);
  fs.chmodSync(LINUX_TARGET, 0o755);
  console.log('[sidecar:build] Synced Linux devhub-server wrapper');
}

function syncWindowsSidecar({ force = false } = {}) {
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
  const builtLauncher = path.join(
    ROOT,
    'packaging',
    'windows',
    'devhub-server-launcher',
    'target',
    'release',
    'devhub-server-launcher.exe'
  );
  const inputs = collectWindowsLauncherInputs();
  const inputMtime = newestInputMtime(inputs);
  const builtMtime = statMtimeMs(builtLauncher);
  const targetMtime = statMtimeMs(WINDOWS_TARGET);

  const needsCargo =
    force || !fs.existsSync(builtLauncher) || inputMtime > builtMtime;
  const needsCopy =
    !fs.existsSync(WINDOWS_TARGET) || statMtimeMs(builtLauncher) > targetMtime;

  if (!needsCargo) {
    if (needsCopy && fs.existsSync(builtLauncher)) {
      fs.copyFileSync(builtLauncher, WINDOWS_TARGET);
    }
    console.log('[sidecar:build] Windows launcher up to date, skipping cargo');
    return;
  }

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

module.exports = {
  main,
  syncLinuxSidecar,
  syncWindowsSidecar,
  collectWindowsLauncherInputs,
  newestInputMtime,
};