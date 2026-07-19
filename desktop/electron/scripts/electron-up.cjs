#!/usr/bin/env node
'use strict';

/**
 * One-command Electron dev stack:
 *   1) Next dev  → http://127.0.0.1:3100  (same as pnpm dev / Tauri devUrl)
 *   2) Sidecar   → http://127.0.0.1:4001/health
 *   3) Electron  → loads the UI + native browser host
 *
 * Usage:
 *   pnpm electron:up
 *   node desktop/electron/scripts/electron-up.cjs
 *
 * Env:
 *   DEVHUB_UI_PORT          default 3100
 *   SIDECAR_PORT            default 4001
 *   DEVHUB_ELECTRON_URL     override full UI URL
 *   DEVHUB_ELECTRON_NO_SIDECAR=1  skip sidecar
 *   DEVHUB_ELECTRON_UP_TIMEOUT_MS  wait budget (default 120000)
 */

const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const uiPort = String(process.env.DEVHUB_UI_PORT || '3100');
const sidecarPort = String(
  process.env.SIDECAR_PORT && process.env.SIDECAR_PORT !== '4000'
    ? process.env.SIDECAR_PORT
    : '4001'
);
const uiUrl =
  process.env.DEVHUB_ELECTRON_URL ||
  process.env.DEVHUB_UI_URL ||
  `http://127.0.0.1:${uiPort}`;
const skipSidecar = process.env.DEVHUB_ELECTRON_NO_SIDECAR === '1';
const timeoutMs = Number(process.env.DEVHUB_ELECTRON_UP_TIMEOUT_MS || 120_000);

/** @type {{ name: string, child: import('child_process').ChildProcess }[]} */
const children = [];
let shuttingDown = false;
let exitCode = 0;

function buildDevEnv() {
  const env = { ...process.env };

  env.DEVHUB_HOME = env.DEVHUB_HOME || path.join(os.homedir(), '.devhub-dev');
  env.DEVHUB_DB_PATH = env.DEVHUB_DB_PATH || path.join(repoRoot, 'data', 'devhub.db');
  env.DEVHUB_RUNTIME = 'development';
  env.DEVHUB_TTY_PORT = env.DEVHUB_TTY_PORT || '4078';
  env.DEVHUB_WS_PORT = env.DEVHUB_WS_PORT || '3402';
  env.SIDECAR_PORT = sidecarPort;
  if (!env.NODE_ENV || env.NODE_ENV === 'production') {
    env.NODE_ENV = 'development';
  }
  env.DEVHUB_ELECTRON_URL = uiUrl;

  const maxOldSpaceMb = String(env.DEVHUB_NEXT_MAX_OLD_SPACE_MB || '4096').trim() || '4096';
  const heapFlag = `--max-old-space-size=${maxOldSpaceMb}`;
  const existing = env.NODE_OPTIONS || '';
  if (/--max-old-space-size=/.test(existing)) {
    env.NODE_OPTIONS = existing.replace(/--max-old-space-size=[^\s]+/g, heapFlag).trim();
  } else {
    env.NODE_OPTIONS = existing ? `${existing} ${heapFlag}`.trim() : heapFlag;
  }

  if (env.ZED_LOG_CONSOLE == null) env.ZED_LOG_CONSOLE = '1';
  if (env.ZED_FAST_PATH == null) env.ZED_FAST_PATH = '0';

  return env;
}

function prefixPipe(stream, name, isErr = false) {
  if (!stream) return;
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    for (const line of lines) {
      const out = isErr ? console.error : console.log;
      out(`[${name}] ${line}`);
    }
  });
  stream.on('end', () => {
    if (buf) {
      const out = isErr ? console.error : console.log;
      out(`[${name}] ${buf}`);
    }
  });
}

function spawnChild(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  prefixPipe(child.stdout, name, false);
  prefixPipe(child.stderr, name, true);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (name === 'electron') {
      exitCode = typeof code === 'number' ? code : 0;
      shutdown(`electron exited (${code ?? signal})`);
      return;
    }
    // Next or sidecar died unexpectedly
    console.error(`[electron-up] ${name} exited unexpectedly (code=${code}, signal=${signal})`);
    exitCode = 1;
    shutdown(`${name} crashed`);
  });
  children.push({ name, child });
  return child;
}

function killChild(entry) {
  const { name, child } = entry;
  if (!child || child.killed || child.exitCode != null) return;

  try {
    if (process.platform === 'win32' && child.pid) {
      // Kill the whole tree (Next spawns workers).
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    } else {
      child.kill('SIGTERM');
    }
  } catch (err) {
    console.warn(`[electron-up] failed to kill ${name}:`, err?.message || err);
  }
}

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('');
  console.log(`[electron-up] shutting down (${reason})…`);
  // Electron first, then next/sidecar
  const order = ['electron', 'next', 'sidecar'];
  for (const name of order) {
    const entry = children.find((c) => c.name === name);
    if (entry) killChild(entry);
  }
  for (const entry of children) {
    if (!order.includes(entry.name)) killChild(entry);
  }
  setTimeout(() => process.exit(exitCode), 800);
}

function checkUrl(url, timeoutMs = 1200) {
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

async function waitFor(label, url, maxMs) {
  const start = Date.now();
  let n = 0;
  while (Date.now() - start < maxMs) {
    n += 1;
    if (await checkUrl(url)) {
      console.log(`[ok] ${label} → ${url}`);
      return true;
    }
    if (n === 1 || n % 6 === 0) {
      const left = Math.ceil((maxMs - (Date.now() - start)) / 1000);
      console.log(`[wait] ${label} not ready (${left}s left)…`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function main() {
  const env = buildDevEnv();
  const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const sidecarEntry = path.join(repoRoot, 'sidecar-backend', 'server.js');
  const electronMain = path.join(repoRoot, 'desktop', 'electron', 'main.js');

  if (!fs.existsSync(nextBin)) {
    console.error('[error] Next binary missing. Run: pnpm install');
    process.exit(1);
  }
  if (!skipSidecar && !fs.existsSync(sidecarEntry)) {
    console.error('[error] sidecar-backend/server.js missing');
    process.exit(1);
  }

  let electronBin;
  try {
    electronBin = require('electron');
  } catch {
    console.error('[error] electron package missing. Run: pnpm install');
    console.error('        then: node node_modules/electron/install.js');
    process.exit(1);
  }

  console.log('');
  console.log('DevHub Electron — one-command up');
  console.log('────────────────────────────────');
  console.log(`  UI:       ${uiUrl}`);
  console.log(`  Sidecar:  http://127.0.0.1:${sidecarPort}/health${skipSidecar ? ' (skipped)' : ''}`);
  console.log(`  Home:     ${env.DEVHUB_HOME}`);
  console.log('');

  // 1) Next
  console.log('[start] Next dev…');
  spawnChild('next', process.execPath, [nextBin, 'dev', '--port', uiPort, '--hostname', '127.0.0.1'], env);

  // 2) Sidecar
  if (!skipSidecar) {
    console.log('[start] Sidecar…');
    spawnChild('sidecar', process.execPath, [sidecarEntry], env);
  }

  // 3) Wait
  const uiOk = await waitFor('Next UI', uiUrl.replace(/\/$/, '') + '/', timeoutMs);
  if (!uiOk) {
    console.error(`[error] Next did not become ready at ${uiUrl} within ${timeoutMs}ms`);
    exitCode = 1;
    shutdown('ui timeout');
    return;
  }

  if (!skipSidecar) {
    const sideOk = await waitFor(
      'Sidecar',
      `http://127.0.0.1:${sidecarPort}/health`,
      Math.min(timeoutMs, 60_000)
    );
    if (!sideOk) {
      console.warn('[warn] Sidecar not healthy — continuing; terminals may fail.');
    }
  }

  // 4) Electron
  console.log('[start] Electron…');
  console.log('        Browser dock defaults to native WebContentsView');
  console.log('        Ctrl+C stops Next + sidecar + Electron');
  console.log('');
  spawnChild('electron', electronBin, [electronMain], env);

  const onSignal = (sig) => {
    exitCode = 0;
    shutdown(sig);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  exitCode = 1;
  shutdown('fatal');
});
