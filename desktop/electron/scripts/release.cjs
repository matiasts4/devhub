#!/usr/bin/env node
'use strict';

/**
 * One-shot release: build the installer, verify the feed is reachable, and
 * ping the running app so the "Restart to update" pill appears immediately.
 *
 * Usage: pnpm electron:release [version]
 *   version: optional semver to stamp (e.g. 0.2.0). Defaults to package.json version.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const FEED_PORT = process.env.DEVHUB_FEED_PORT || '9100';
const FEED_URL = `http://127.0.0.1:${FEED_PORT}/devhub/latest.yml`;
// Invoke electron-builder's CLI directly with the current node: spawning `npx`
// (a .cmd shim) via execFileSync fails on Windows — ENOENT without shell, and
// EINVAL on modern Node, which refuses .cmd/.bat spawns unless shell:true.
const ELECTRON_BUILDER_CLI = path.join(ROOT, 'node_modules', 'electron-builder', 'cli.js');

function run(cmd, args, opts = {}) {
  console.log(`\n[release] ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function userDataDir() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'DevHub');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'DevHub');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'DevHub');
}

function ping() {
  const dir = userDataDir();
  const signalPath = path.join(dir, 'update-check.signal');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(signalPath, `${new Date().toISOString()}\n`);
  console.log(`[release] pinged ${signalPath}`);
}

function checkFeed() {
  return new Promise((resolve) => {
    const req = http.get(FEED_URL, { timeout: 3000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  const version = process.argv[2];
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const targetVersion = version || pkg.version;

  console.log(`[release] Building DevHub v${targetVersion}…`);

  const buildArgs = [ELECTRON_BUILDER_CLI, '--win', 'nsis', '--config', 'desktop/electron/electron-builder.yml'];
  if (version) {
    buildArgs.push(`-c.extraMetadata.version=${version}`);
  }
  run(process.execPath, buildArgs);

  const feedOk = await checkFeed();
  if (!feedOk) {
    console.warn(`\n[release] ⚠ Feed not reachable at ${FEED_URL}`);
    console.warn('[release] Start it with: pnpm electron:feed');
    console.warn('[release] The app will pick up the update on its next periodic check (30 min).');
  } else {
    console.log(`[release] Feed OK at ${FEED_URL}`);
  }

  ping();
  console.log(`\n[release] Done — v${targetVersion} ready. The running app should show "Restart to update" within ~2s.`);
}

main().catch((err) => {
  console.error('[release] failed:', err?.message || err);
  process.exitCode = 1;
});
