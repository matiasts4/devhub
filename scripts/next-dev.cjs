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
if (!process.env.DEVHUB_NEXT_DEV) {
  process.env.DEVHUB_NEXT_DEV = '1';
}
if (!process.env.SIDECAR_PORT) {
  process.env.SIDECAR_PORT = '4001';
}

// Keep dev runtime ports disjoint from the installed app so both can run at the
// same time without fighting over the same TTY WebSocket port.
if (!process.env.DEVHUB_TTY_PORT) {
  process.env.DEVHUB_TTY_PORT = '4078';
}
if (!process.env.DEVHUB_WS_PORT) {
  process.env.DEVHUB_WS_PORT = '3402';
}

function mergeNodeOptions(existing, extra) {
  const parts = String(existing || '')
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!parts.some((value) => value.startsWith('--max-old-space-size='))) {
    parts.push('--max-old-space-size=4096');
  }
  if (extra) parts.push(extra);
  return parts.join(' ');
}

process.env.NODE_OPTIONS = mergeNodeOptions(process.env.NODE_OPTIONS);

const nextBin = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
// Pass heap on the node argv — NODE_OPTIONS is often ignored for nested spawns on Windows.
// ponytail: Next 16 Turbopack dev misses nested app/api/*/route.js handlers (404 on
// /api/db/query, /api/terminal/*, etc.). Webpack dev matches production routing.
const nodeArgs = ['--max-old-space-size=8192', nextBin, 'dev', '--port', '3100', '--webpack'];

if (!process.env.NEXT_TELEMETRY_DISABLED) {
  process.env.NEXT_TELEMETRY_DISABLED = '1';
}

console.log('[next-dev] Starting Next on :3100 (webpack) with --max-old-space-size=8192');

const result = spawnSync(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env: process.env,
});

process.exit(typeof result.status === 'number' ? result.status : 1);
