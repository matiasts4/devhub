#!/usr/bin/env node

const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

if (!process.env.DEVHUB_HOME) {
  process.env.DEVHUB_HOME = path.join(os.homedir(), '.devhub-dev');
}
if (!process.env.DEVHUB_RUNTIME) {
  process.env.DEVHUB_RUNTIME = 'development';
}

// Keep dev runtime ports disjoint from the installed app so both can run at the
// same time without fighting over the same TTY WebSocket port.
if (!process.env.DEVHUB_TTY_PORT) {
  process.env.DEVHUB_TTY_PORT = '4078';
}
if (!process.env.DEVHUB_WS_PORT) {
  process.env.DEVHUB_WS_PORT = '3402';
}

const nextBin = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
const result = spawnSync(process.execPath, [nextBin, 'dev', '--port', '3100'], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(typeof result.status === 'number' ? result.status : 1);
