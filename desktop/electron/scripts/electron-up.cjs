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
 *   DEVHUB_DB_PATH          pin an explicit SQLite DB. When unset and this runs
 *                           from a terminal hosted by the installed app (which
 *                           exports DEVHUB_HOME=~/.devhub + production runtime),
 *                           the dev stack is isolated to ~/.devhub-dev so it
 *                           never shares the live production DB ("database is
 *                           locked" from two writers on one WAL).
 *   DEVHUB_ELECTRON_NO_SIDECAR=1  skip sidecar
 *   DEVHUB_ELECTRON_UP_TIMEOUT_MS  wait budget (default 120000)
 *   DEVHUB_ELECTRON_UP_MAX_RESTARTS  auto-restart budget for next/sidecar
 *                                    crashes (default 5, 0 = shutdown as before)
 *   DEVHUB_NEXT_BUNDLER=webpack  run `next dev --webpack` instead of Turbopack.
 *                                Turbopack's native code crashes silently on
 *                                Windows (vercel/next.js#95015); webpack avoids it.
 */

const { spawn, spawnSync } = require('child_process');
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
const maxRestarts = Number(process.env.DEVHUB_ELECTRON_UP_MAX_RESTARTS ?? 5);
const nextBundler = process.env.DEVHUB_NEXT_BUNDLER === 'webpack' ? 'webpack' : 'turbopack';
const crashLogDir = path.join(repoRoot, 'data', 'logs');

/** @type {{ name: string, child: import('child_process').ChildProcess }[]} */
const children = [];
let shuttingDown = false;
let exitCode = 0;

function buildDevEnv() {
  const env = { ...process.env };

  // When launched from a terminal hosted by the *installed* DevHub app, the
  // env inherits DEVHUB_HOME=~/.devhub + DEVHUB_RUNTIME=production. Keeping
  // that home makes the dev stack share the live production DB with the app
  // (two writers, one WAL) → SQLITE_BUSY ("database is locked") for both.
  // Unless the caller pinned a DB via DEVHUB_DB_PATH, treat that inherited
  // home as unset and fall back to the isolated dev home.
  const prodHome = path.join(os.homedir(), '.devhub');
  const inheritedProdHome =
    !process.env.DEVHUB_DB_PATH &&
    process.env.DEVHUB_RUNTIME === 'production' &&
    typeof process.env.DEVHUB_HOME === 'string' &&
    path.resolve(process.env.DEVHUB_HOME) === prodHome;
  env.DEVHUB_HOME = inheritedProdHome
    ? path.join(os.homedir(), '.devhub-dev')
    : env.DEVHUB_HOME || path.join(os.homedir(), '.devhub-dev');
  if (inheritedProdHome) {
    console.log(
      '[electron-up] host-app DEVHUB_HOME (~/.devhub, production) detected — ' +
        'isolating dev stack to ~/.devhub-dev. Set DEVHUB_DB_PATH to pin a specific DB.'
    );
  }
  if (process.env.DEVHUB_DB_PATH) {
    env.DEVHUB_DB_PATH = process.env.DEVHUB_DB_PATH;
  } else {
    delete env.DEVHUB_DB_PATH;
  }
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

function prefixPipe(stream, name, isErr = false, ringBuffer = null) {
  if (!stream) return;
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    for (const line of lines) {
      if (ringBuffer) {
        ringBuffer.push(`[${new Date().toISOString()}] ${line}`);
        if (ringBuffer.length > 300) ringBuffer.shift();
      }
      const out = isErr ? console.error : console.log;
      out(`[${name}] ${line}`);
    }
  });
  stream.on('end', () => {
    if (buf) {
      if (ringBuffer) ringBuffer.push(`[${new Date().toISOString()}] ${buf}`);
      const out = isErr ? console.error : console.log;
      out(`[${name}] ${buf}`);
    }
  });
}

// Persist the last lines a crashed child printed so native (Turbopack/Rust)
// crashes — which die silently in the terminal — can be diagnosed later.
function writeCrashLog(name, code, signal, ringBuffer) {
  try {
    fs.mkdirSync(crashLogDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(crashLogDir, `electron-up-${name}-crash-${stamp}.log`);
    const body = [
      `# ${name} exited unexpectedly`,
      `# exit code: ${code} (${code >>> 0}) signal: ${signal}`,
      `# at: ${new Date().toISOString()}`,
      `# bundler: ${nextBundler} node: ${process.version}`,
      '',
      ...(ringBuffer || []),
      '',
    ].join('\n');
    fs.writeFileSync(file, body);
    console.error(`[electron-up] crash log: ${path.relative(repoRoot, file)}`);
  } catch (err) {
    console.warn('[electron-up] could not write crash log:', err?.message || err);
  }
}

/** Restart bookkeeping for auto-respawn of next/sidecar. */
const restartCounts = { next: 0, sidecar: 0 };
/** @type {Record<string, { command: string, args: string[], env: NodeJS.ProcessEnv }>} */
const respawnSpecs = {};

function spawnChild(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const ringBuffer = [];
  prefixPipe(child.stdout, name, false, ringBuffer);
  prefixPipe(child.stderr, name, true, ringBuffer);
  if (name === 'next' || name === 'sidecar') {
    respawnSpecs[name] = { command, args, env };
  }
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (name === 'electron') {
      exitCode = typeof code === 'number' ? code : 0;
      shutdown(`electron exited (${code ?? signal})`);
      return;
    }
    // Next or sidecar died unexpectedly
    console.error(`[electron-up] ${name} exited unexpectedly (code=${code}, signal=${signal})`);
    writeCrashLog(name, code, signal, ringBuffer);
    const used = restartCounts[name] ?? 0;
    const spec = respawnSpecs[name];
    if (spec && used < maxRestarts) {
      restartCounts[name] = used + 1;
      console.error(
        `[electron-up] restarting ${name} (${used + 1}/${maxRestarts}) in 1.5s — ` +
          'reload the Electron window (Ctrl+R) once it is back.' +
          (name === 'next' && nextBundler === 'turbopack'
            ? ' If this repeats, try DEVHUB_NEXT_BUNDLER=webpack (Turbopack crashes natively on Windows).'
            : '')
      );
      setTimeout(() => {
        if (shuttingDown) return;
        const idx = children.findIndex((c) => c.name === name && c.child === child);
        if (idx !== -1) children.splice(idx, 1);
        // An orphaned dev server may hold .next/dev/lock and make the respawn
        // exit instantly ("Another next dev server is already running").
        if (name === 'next') clearStaleNextDevLock();
        const respawned = spawnChild(name, spec.command, spec.args, spec.env);
        // Surviving 10 min clears the restart budget (crash loops keep it).
        const resetTimer = setTimeout(() => {
          restartCounts[name] = 0;
        }, 10 * 60 * 1000);
        resetTimer.unref?.();
        respawned.once('exit', () => clearTimeout(resetTimer));
      }, 1500);
      return;
    }
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

function fireAndForgetDevServerWarm(baseUrl) {
  // NOTE: the SPA uses hash routing (`/#/project/.../terminales`) — there is no
  // server-side `/terminales` route. Warming `/` compiles the app-shell page
  // chunk; warming `/api/terminal/session` compiles the session API route and
  // boots the TTY sidecar path. The dynamic `@xterm/*` client chunk is compiled
  // when the browser prefetches it at App mount (src/App.js), overlapping the
  // project fetch — server-side HTTP cannot trigger that compile.
  const routes = ['/api/terminal/session', '/'];
  const base = baseUrl.replace(/\/$/, '');
  for (const r of routes) {
    try {
      const req = http.get(`${base}${r}`, { timeout: 3000 }, (res) => {
        res.resume();
      });
      req.on('error', () => {});
      req.on('timeout', () => req.destroy());
    } catch {
      // fire-and-forget
    }
  }
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

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// A previous `next dev` can survive a crashed/torn-down session (orphan) and
// keeps holding .next/dev/lock. While it lives, every new `next dev` refuses
// to start ("Another next dev server is already running", exit 1) and the app
// stays half-served by a server with the wrong env. Kill it before spawning.
function clearStaleNextDevLock() {
  const lockPath = path.join(repoRoot, '.next', 'dev', 'lock');
  let info;
  try {
    info = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return; // no lock or unreadable — nothing to do
  }
  const pid = Number(info && info.pid);
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return;
  if (!isPidAlive(pid)) {
    try {
      fs.rmSync(lockPath, { force: true });
    } catch {}
    return;
  }
  console.warn(
    `[electron-up] previous next dev still alive (pid ${pid}, ${info.appUrl || 'unknown url'}) — stopping it…`
  );
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch (err) {
    console.warn(`[electron-up] failed to stop stale next dev (pid ${pid}):`, err?.message || err);
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && isPidAlive(pid)) {
    sleepSync(100);
  }
  if (isPidAlive(pid)) {
    console.warn(`[electron-up] stale next dev (pid ${pid}) did not die; startup may fail.`);
  }
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {}
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
  console.log(`  Bundler:  ${nextBundler}${maxRestarts > 0 ? ` · auto-restart on crash (x${maxRestarts})` : ''}`);
  console.log('');

  // 1) Next
  clearStaleNextDevLock();
  console.log(`[start] Next dev (${nextBundler})…`);
  const nextArgs = [nextBin, 'dev', '--port', uiPort, '--hostname', '127.0.0.1'];
  if (nextBundler === 'webpack') nextArgs.push('--webpack');
  spawnChild('next', process.execPath, nextArgs, env);

  // 2) Sidecar
  if (!skipSidecar) {
    console.log('[start] Rebuilding sidecar agent detection bundle…');
    try {
      spawnSync(
        process.execPath,
        [path.join(repoRoot, 'scripts', 'build-sidecar-agent-detection.mjs')],
        { cwd: repoRoot, stdio: 'inherit', shell: false }
      );
    } catch (err) {
      console.warn('[electron-up] sidecar detection rebuild failed, continuing with existing bundle:', err?.message);
    }
    console.log('[start] Sidecar…');
    spawnChild('sidecar', process.execPath, [sidecarEntry], env);
  }

  // 3) Next readiness + compile warm run in the BACKGROUND: the Electron
  // window (spawned below) shows its splash immediately and loads the SPA
  // with retry as soon as the server responds — the window no longer waits
  // for the dev server to finish booting/compiling.
  void waitFor('Next UI', uiUrl.replace(/\/$/, '') + '/', timeoutMs).then((uiOk) => {
    if (!uiOk) {
      console.error(`[error] Next did not become ready at ${uiUrl} within ${timeoutMs}ms`);
      exitCode = 1;
      shutdown('ui timeout');
      return;
    }
    console.log('[warm] Triggering dev-server Turbopack compile warm for terminal routes…');
    fireAndForgetDevServerWarm(uiUrl);
  });

  // Sidecar health wait runs in PARALLEL with the Electron spawn below: the
  // window (and its module-compile/prefetch work via the App-mount warm) must
  // not block behind this poll — on cold-cache boots every second of compile
  // head start shaves time off the "Iniciando terminales" phase.
  if (!skipSidecar) {
    void waitFor(
      'Sidecar',
      `http://127.0.0.1:${sidecarPort}/health`,
      Math.min(timeoutMs, 60_000)
    ).then((sideOk) => {
      if (!sideOk) {
        console.warn('[warn] Sidecar not healthy — continuing; terminals may fail.');
      }
    });
  }

  // 4) Electron
  console.log('[start] Electron…');
  console.log('        SPA / React: Next Fast Refresh (leave Electron open — no full restart)');
  console.log('        Soft reload SPA: Ctrl+R or F5 · Hard reload: Ctrl+Shift+R · DevTools: F12');
  console.log('        Host main/preload (desktop/electron): auto-restarts Electron only');
  console.log('        Ctrl+C stops Next + sidecar + Electron');
  console.log('');

  /** @type {import('child_process').ChildProcess | null} */
  let electronChild = null;
  let electronRestarting = false;

  // If Electron exits on its own (user closed window), shut down the stack.
  // If we are intentionally restarting main after a host file change, respawn only Electron.
  function spawnElectronTracked() {
    if (shuttingDown) return;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      if (children[i].name === 'electron') children.splice(i, 1);
    }
    const child = spawn(electronBin, [electronMain], {
      cwd: repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    prefixPipe(child.stdout, 'electron', false);
    prefixPipe(child.stderr, 'electron', true);
    electronChild = child;
    children.push({ name: 'electron', child });
    child.on('exit', (code, signal) => {
      if (shuttingDown) return;
      if (electronRestarting) {
        electronRestarting = false;
        console.log('[electron-up] Electron host restarted after desktop/ change');
        spawnElectronTracked();
        return;
      }
      exitCode = typeof code === 'number' ? code : 0;
      shutdown(`electron exited (${code ?? signal})`);
    });
  }

  spawnElectronTracked();

  // Watch host sources — restart Electron only (Next/sidecar stay warm).
  // Grace period avoids Windows fs.watch noise right after spawn killing a fresh window.
  const hostWatchRoot = path.join(repoRoot, 'desktop', 'electron');
  const hostWatchGraceMs = Number(process.env.DEVHUB_ELECTRON_WATCH_GRACE_MS || 5000);
  const hostWatchReadyAt = Date.now() + hostWatchGraceMs;
  let hostRestartTimer = null;
  function scheduleElectronRestart(reason) {
    if (shuttingDown || electronRestarting) return;
    if (Date.now() < hostWatchReadyAt) {
      return;
    }
    if (hostRestartTimer) clearTimeout(hostRestartTimer);
    hostRestartTimer = setTimeout(() => {
      hostRestartTimer = null;
      if (shuttingDown || !electronChild || electronChild.killed || electronChild.exitCode != null) {
        return;
      }
      console.log(`[electron-up] host change detected (${reason}) — restarting Electron…`);
      electronRestarting = true;
      killChild({ name: 'electron', child: electronChild });
    }, 600);
  }

  // Cache modification times to prevent Windows fs.watch noise from restarting Electron on mere access/scans
  const watchMtimes = new Map();
  function populateMtimes(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          populateMtimes(fullPath);
        } else if (entry.isFile()) {
          if (/\.(js|cjs|mjs|json|yml|yaml)$/i.test(entry.name) && !/\.(test|spec)\./i.test(entry.name)) {
            const stat = fs.statSync(fullPath);
            watchMtimes.set(fullPath, stat.mtimeMs);
          }
        }
      }
    } catch (err) {
      // ignore
    }
  }

  try {
    if (fs.existsSync(hostWatchRoot) && typeof fs.watch === 'function') {
      populateMtimes(hostWatchRoot);
      fs.watch(hostWatchRoot, { recursive: true }, (_eventType, filename) => {
        const name = String(filename || '');
        if (!name) return;
        if (/\.(test|spec)\./i.test(name)) return;
        if (!/\.(js|cjs|mjs|json|yml|yaml)$/i.test(name)) return;
        // Ignore editor junk, lock files, and Electron runtime state files (e.g. windowState.js)
        if (/~$|\.swp$|\.tmp$|windowState|state\.json|desktop-state/i.test(name)) return;

        const filePath = path.join(hostWatchRoot, name);
        try {
          if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            const lastMtime = watchMtimes.get(filePath);
            if (lastMtime === stat.mtimeMs) {
              return; // File wasn't actually modified (e.g. read access / scan)
            }
            watchMtimes.set(filePath, stat.mtimeMs);
          } else {
            // File deleted
            if (!watchMtimes.has(filePath)) {
              return; // Already untracked
            }
            watchMtimes.delete(filePath);
          }
        } catch (err) {
          // If we fail to stat, proceed with restart to be safe
        }

        scheduleElectronRestart(name);
      });
      console.log(
        `[watch] desktop/electron → auto-restart Electron on host edits (grace ${hostWatchGraceMs}ms)`
      );
    }
  } catch (err) {
    console.warn('[electron-up] host file watch unavailable:', err?.message || err);
  }

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
