'use strict';

const http = require('http');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  isPackagedMode,
  sidecarPort,
  locateSidecarEntry,
  resolveStandaloneDir,
} = require('./packaging/runtime');

function healthUrl(port = sidecarPort()) {
  return `http://127.0.0.1:${port}/health`;
}

function checkSidecarHealth(port = sidecarPort(), timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(healthUrl(port), { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function resolveNodeBin() {
  const candidates = [
    process.env.DEVHUB_NODE_BIN,
    process.execPath.endsWith('node.exe') || process.execPath.endsWith('node')
      ? process.execPath
      : null,
    process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\node.exe' : '/usr/bin/node',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['node'], {
      encoding: 'utf8',
    });
    if (which.status === 0) {
      const resolved = which.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (resolved && fs.existsSync(resolved)) return resolved;
    }
  } catch {
    /* ignore */
  }

  return 'node';
}

/**
 * Ensure sidecar is reachable. Optionally spawn if DEVHUB_ELECTRON_SPAWN_SIDECAR=1 or if packaged.
 * @returns {Promise<{ mode: 'external'|'spawned'|'missing', port: number, pid?: number }>}
 */
async function ensureSidecar({
  repoRoot,
  spawnIfMissing = isPackagedMode() || process.env.DEVHUB_ELECTRON_SPAWN_SIDECAR === '1',
} = {}) {
  const port = sidecarPort();
  const healthy = await checkSidecarHealth(port);
  if (healthy) {
    return { mode: 'external', port };
  }

  if (!spawnIfMissing) {
    console.warn(
      `[DevHub Electron] Sidecar not healthy on :${port}. Start it manually or set DEVHUB_ELECTRON_SPAWN_SIDECAR=1.`
    );
    return { mode: 'missing', port };
  }

  const entry = locateSidecarEntry({ repoRoot });
  if (!entry) {
    console.warn('[DevHub Electron] No sidecar entry found to spawn.');
    return { mode: 'missing', port };
  }

  const nodeBin = resolveNodeBin();
  const standaloneDir = resolveStandaloneDir({ repoRoot });
  const nodeModulesPath = path.join(standaloneDir, 'node_modules');
  console.log(`[DevHub Electron] Spawning sidecar using node: ${nodeBin} from entry: ${entry}`);
  const child = spawn(nodeBin, [entry], {
    env: (function () {
      const e = { ...process.env, SIDECAR_PORT: String(port), NODE_PATH: nodeModulesPath };
      if (!entry.endsWith('devhub-server.cjs')) {
        e.PORT = String(port);
      }
      return e;
    })(),
    stdio: 'ignore',
    detached: false,
    windowsHide: true,
  });

  // Brief wait for boot with progressive backoff: fast initial checks, ~5s total
  // budget so slow machines still have room before we give up polling.
  const checkIntervals = [50, 100, 150, 250, 250, 500, 500, 1000, 1000, 1000];
  for (const interval of checkIntervals) {
    if (await checkSidecarHealth(port)) {
      return { mode: 'spawned', port, pid: child.pid };
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  console.warn('[DevHub Electron] Spawned sidecar but health check still failing.');
  return { mode: 'spawned', port, pid: child.pid };
}

module.exports = {
  sidecarPort,
  healthUrl,
  checkSidecarHealth,
  ensureSidecar,
};
