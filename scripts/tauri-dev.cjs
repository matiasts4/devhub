#!/usr/bin/env node

const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

if (!process.env.DEVHUB_HOME) {
  process.env.DEVHUB_HOME = path.join(os.homedir(), '.devhub-dev');
}

const tauriCli = path.join(__dirname, 'tauri-cli.cjs');
const result = spawnSync(process.execPath, [tauriCli, 'dev'], {
  stdio: 'inherit',
  env: process.env,
  cwd: path.join(__dirname, '..'),
});

process.exit(typeof result.status === 'number' ? result.status : 1);
