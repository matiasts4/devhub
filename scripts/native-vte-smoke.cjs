#!/usr/bin/env node

const path = require('path');
const { buildTauriEnv } = require('./tauri-cli.cjs');
const { spawnSync } = require('child_process');

const SRC_TAURI_DIR = path.resolve(__dirname, '..', 'src-tauri');

function buildNativeVteSmokeArgs(args = []) {
  return ['run', '--bin', 'gtk_vte_smoke', '--', ...args];
}

function runNativeVteSmoke({
  args = process.argv.slice(2),
  env = buildTauriEnv(),
  spawnSync: spawn = spawnSync,
} = {}) {
  const result = spawn('cargo', buildNativeVteSmokeArgs(args), {
    cwd: SRC_TAURI_DIR,
    env,
    stdio: 'inherit',
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
    runNativeVteSmoke();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  buildNativeVteSmokeArgs,
  runNativeVteSmoke,
  SRC_TAURI_DIR,
};
