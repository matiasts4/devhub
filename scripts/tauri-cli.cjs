#!/usr/bin/env node

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REQUIRED_GTK_PACKAGES = ['javascriptcoregtk-4.1', 'libsoup-3.0', 'webkit2gtk-4.1'];
const SYSTEM_PKG_CONFIG = '/usr/bin/pkg-config';
const TAURI_CLI_ENTRY = path.join(__dirname, '..', 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

function pkgConfigResolves({ command, env, execFileSync: exec = execFileSync }) {
  exec(command, ['--exists', ...REQUIRED_GTK_PACKAGES], {
    env,
    stdio: 'ignore',
  });
  return true;
}

function shouldPreferSystemPkgConfig({
  env,
  platform = process.platform,
  execFileSync: exec = execFileSync,
  existsSync = fs.existsSync,
} = {}) {
  if (platform !== 'linux' || env.PKG_CONFIG) {
    return false;
  }

  try {
    pkgConfigResolves({ command: 'pkg-config', env, execFileSync: exec });
    return false;
  } catch (_error) {
    if (!existsSync(SYSTEM_PKG_CONFIG)) {
      return false;
    }
  }

  try {
    pkgConfigResolves({ command: SYSTEM_PKG_CONFIG, env, execFileSync: exec });
    return true;
  } catch (_error) {
    return false;
  }
}

function buildTauriEnv({
  env = process.env,
  platform = process.platform,
  execFileSync: exec = execFileSync,
  existsSync = fs.existsSync,
} = {}) {
  const nextEnv = { ...env };

  if (
    shouldPreferSystemPkgConfig({
      env: nextEnv,
      platform,
      execFileSync: exec,
      existsSync,
    })
  ) {
    nextEnv.PKG_CONFIG = SYSTEM_PKG_CONFIG;
  }

  return nextEnv;
}

function runTauriCli({
  args = process.argv.slice(2),
  env = buildTauriEnv(),
  spawnSync: spawn = spawnSync,
} = {}) {
  const result = spawn(process.execPath, [TAURI_CLI_ENTRY, ...args], {
    stdio: 'inherit',
    env,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number') {
    process.exitCode = result.status;
    return result.status;
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  return 1;
}

if (require.main === module) {
  try {
    runTauriCli();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  buildTauriEnv,
  pkgConfigResolves,
  REQUIRED_GTK_PACKAGES,
  runTauriCli,
  shouldPreferSystemPkgConfig,
  SYSTEM_PKG_CONFIG,
  TAURI_CLI_ENTRY,
};
