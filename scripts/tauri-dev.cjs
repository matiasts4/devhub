#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const { applyDevIsolationEnv, buildTauriEnv } = require('./tauri-cli.cjs');

// Always force isolation (do not soft-default over production shell env).
const env = buildTauriEnv({
  env: applyDevIsolationEnv(process.env),
  forDev: true,
});

const tauriCli = path.join(__dirname, 'tauri-cli.cjs');
const result = spawnSync(process.execPath, [tauriCli, 'dev'], {
  stdio: 'inherit',
  env,
  cwd: path.join(__dirname, '..'),
});

process.exit(typeof result.status === 'number' ? result.status : 1);
