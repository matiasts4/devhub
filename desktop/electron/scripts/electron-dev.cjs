#!/usr/bin/env node
'use strict';

/**
 * Launch DevHub Electron against the Next dev server.
 *
 * Prerequisites (other terminals):
 *   Prefer one command:  pnpm electron:up
 *
 *   Or manual:
 *   1) pnpm dev                 → http://127.0.0.1:3100  (same as Tauri devUrl)
 *   2) sidecar on :4001         → optional for terminals (warn only)
 *   3) pnpm electron:dev
 *
 * Flags / env:
 *   --wait / DEVHUB_ELECTRON_WAIT=1     poll until UI is up (default wait 90s)
 *   --force / DEVHUB_ELECTRON_FORCE=1   launch even if UI is down
 *   DEVHUB_ELECTRON_URL                 SPA origin (default http://127.0.0.1:3100)
 *   SIDECAR_PORT                        default 4001
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const mainJs = path.join(repoRoot, 'desktop', 'electron', 'main.js');
// Match scripts/next-dev.cjs + src-tauri tauri.conf.json devUrl (3100, not 3000).
const uiUrl =
  process.env.DEVHUB_ELECTRON_URL || process.env.DEVHUB_UI_URL || 'http://127.0.0.1:3100';
const sidecarPort = process.env.SIDECAR_PORT || '4001';

const args = new Set(process.argv.slice(2));
const force =
  args.has('--force') ||
  process.env.DEVHUB_ELECTRON_FORCE === '1' ||
  process.env.ELECTRON_DEV_FORCE === '1';
// Wait by default so a second terminal can race; use --no-wait to fail immediately.
const noWait = args.has('--no-wait') || process.env.DEVHUB_ELECTRON_NO_WAIT === '1';
const waitMs = Number(process.env.DEVHUB_ELECTRON_WAIT_MS || 90_000);
const shouldWait = !noWait && !force;

function checkUrl(url, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode > 0 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function uiProbeUrl() {
  const base = uiUrl.replace(/\/$/, '');
  return `${base}/`;
}

async function waitForUi(maxMs) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < maxMs) {
    attempt += 1;
    const ok = await checkUrl(uiProbeUrl());
    if (ok) return true;
    if (attempt === 1 || attempt % 5 === 0) {
      const left = Math.max(0, Math.ceil((maxMs - (Date.now() - start)) / 1000));
      console.log(`[wait] UI not ready at ${uiUrl} — waiting (${left}s left). Start: pnpm dev`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function printHowTo() {
  console.log('');
  console.log('Easiest — one command:');
  console.log('    pnpm electron:up');
  console.log('');
  console.log('Or 3 terminals from D:\\devhub:');
  console.log('  1) pnpm dev                         → http://127.0.0.1:3100');
  console.log('  2) $env:SIDECAR_PORT="4001"; node sidecar-backend/server.js');
  console.log('  3) pnpm electron:dev');
  console.log('');
  console.log('  Force open without UI:  pnpm electron:dev -- --force');
  console.log('');
}

async function main() {
  console.log('');
  console.log('DevHub Electron (dev)');
  console.log('─────────────────────');
  console.log(`  UI URL:        ${uiUrl}`);
  console.log(`  Sidecar port:  ${sidecarPort}`);
  console.log(`  Main:          ${mainJs}`);
  console.log('');

  let uiOk = await checkUrl(uiProbeUrl());
  if (!uiOk && shouldWait) {
    console.log(`[info] UI not up yet — waiting up to ${Math.round(waitMs / 1000)}s for \`pnpm dev\`…`);
    uiOk = await waitForUi(waitMs);
  }

  if (!uiOk) {
    console.error('');
    console.error(`[error] UI not reachable at ${uiUrl}`);
    console.error('        ERR_CONNECTION_REFUSED means Next is not running.');
    printHowTo();
    if (!force) {
      console.error('Aborting (pass --force to launch Electron anyway).');
      process.exit(1);
    }
    console.warn('[force] Launching Electron without a reachable UI…');
  } else {
    console.log(`[ok] UI responds at ${uiUrl}`);
  }

  const health = `http://127.0.0.1:${sidecarPort}/health`;
  const sidecarOk = await checkUrl(health);
  if (!sidecarOk) {
    console.warn(`[warn] Sidecar not healthy at ${health}`);
    console.warn('       Terminales may fail. In another terminal:');
    console.warn('         $env:SIDECAR_PORT = "4001"; node sidecar-backend/server.js');
  } else {
    console.log(`[ok] Sidecar health at ${health}`);
  }

  console.log('');
  console.log('Starting Electron… (browser dock defaults to native WebContentsView)');
  console.log('');

  let electronBin;
  try {
    electronBin = require('electron');
  } catch {
    console.error('[error] electron package missing. Run: pnpm install');
    console.error('        then: node node_modules/electron/install.js');
    process.exit(1);
  }

  const child = spawn(electronBin, [mainJs], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DEVHUB_ELECTRON_URL: uiUrl,
      SIDECAR_PORT: String(sidecarPort),
      // Match next-dev isolation when Electron spawns tools later
      NODE_ENV: process.env.NODE_ENV || 'development',
    },
    stdio: 'inherit',
    shell: false,
  });

  child.on('error', (err) => {
    console.error('[error] failed to spawn Electron:', err.message);
    console.error('        Try: node node_modules/electron/install.js');
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code == null ? 0 : code);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
