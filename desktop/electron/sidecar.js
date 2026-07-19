'use strict';

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function sidecarPort() {
  const raw = process.env.SIDECAR_PORT;
  if (raw && Number.isFinite(Number(raw))) return Number(raw);
  // Match Tauri dev convention when possible.
  return process.env.NODE_ENV === 'production' ? 4000 : 4001;
}

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

/**
 * Resolve a candidate sidecar entry for local monorepo layouts.
 * E0: may return null — external sidecar is OK.
 */
function resolveSidecarEntry(repoRoot) {
  const candidates = [
    path.join(repoRoot, 'sidecar-backend', 'server.js'),
    path.join(repoRoot, '.next', 'standalone', 'server.js'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/**
 * Ensure sidecar is reachable. Optionally spawn if DEVHUB_ELECTRON_SPAWN_SIDECAR=1.
 * @returns {Promise<{ mode: 'external'|'spawned'|'missing', port: number, pid?: number }>}
 */
async function ensureSidecar({
  repoRoot,
  spawnIfMissing = process.env.DEVHUB_ELECTRON_SPAWN_SIDECAR === '1',
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

  const entry = resolveSidecarEntry(repoRoot);
  if (!entry) {
    console.warn('[DevHub Electron] No sidecar entry found to spawn.');
    return { mode: 'missing', port };
  }

  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, SIDECAR_PORT: String(port), PORT: String(port) },
    stdio: 'inherit',
    detached: false,
  });

  // Brief wait for boot.
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    if (await checkSidecarHealth(port)) {
      return { mode: 'spawned', port, pid: child.pid };
    }
  }

  console.warn('[DevHub Electron] Spawned sidecar but health check still failing.');
  return { mode: 'spawned', port, pid: child.pid };
}

module.exports = {
  sidecarPort,
  healthUrl,
  checkSidecarHealth,
  resolveSidecarEntry,
  ensureSidecar,
};
