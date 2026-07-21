'use strict';

/**
 * Packaged/dev runtime resolution for Electron host (E1).
 *
 * Layout (packaged):
 *   process.resourcesPath/
 *     resources/standalone.zip   (or standalone.zip at resources root)
 *     resources/devhub-server.cjs (optional sidecar entry)
 *
 * Extract target:
 *   app.getPath('userData')/standalone/
 *
 * Env:
 *   DEVHUB_ELECTRON_URL / DEVHUB_UI_URL — SPA origin (dev or override)
 *   SIDECAR_PORT — sidecar health port
 *   DEVHUB_STANDALONE_DIR — force extract/locate directory
 *   DEVHUB_STANDALONE_ZIP — force path to standalone.zip
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function tryGetApp() {
  try {
    // Lazy require so pure unit tests can load this module without Electron.
    return require('electron').app;
  } catch {
    return null;
  }
}

function isPackagedMode(app = tryGetApp()) {
  if (app && typeof app.isPackaged === 'boolean') return app.isPackaged;
  return Boolean(process.env.DEVHUB_ELECTRON_PACKAGED === '1');
}

function resolveUiUrl() {
  if (process.env.DEVHUB_ELECTRON_URL || process.env.DEVHUB_UI_URL) {
    return process.env.DEVHUB_ELECTRON_URL || process.env.DEVHUB_UI_URL;
  }
  return isPackagedMode() ? 'http://127.0.0.1:3400' : 'http://127.0.0.1:3100';
}

function sidecarPort() {
  const raw = process.env.SIDECAR_PORT;
  if (raw && Number.isFinite(Number(raw))) return Number(raw);
  return isPackagedMode() ? 4000 : 4001;
}

/**
 * Resolve process.resourcesPath or monorepo resource roots.
 * @param {{ app?: import('electron').App | null, resourcesPath?: string }} [opts]
 */
function resolveResourcesPath(opts = {}) {
  if (opts.resourcesPath) return opts.resourcesPath;
  if (process.env.DEVHUB_RESOURCES_PATH) return process.env.DEVHUB_RESOURCES_PATH;

  const app = opts.app !== undefined ? opts.app : tryGetApp();
  if (app && app.isPackaged && process.resourcesPath) {
    return process.resourcesPath;
  }
  // Dev / unpackaged: Tauri resources live here historically.
  return path.join(repoRoot, 'src-tauri', 'resources');
}

/**
 * Candidate paths for standalone.zip inside a resources root.
 * @param {string} resourcesRoot
 * @returns {string[]}
 */
function standaloneZipCandidates(resourcesRoot) {
  return [
    path.join(resourcesRoot, 'standalone.zip'),
    path.join(resourcesRoot, 'resources', 'standalone.zip'),
    path.join(resourcesRoot, 'app.asar.unpacked', 'standalone.zip'),
  ];
}

/**
 * @param {{ app?: import('electron').App | null, resourcesPath?: string, zipPath?: string }} [opts]
 * @returns {string | null}
 */
function locateStandaloneZip(opts = {}) {
  if (opts.zipPath || process.env.DEVHUB_STANDALONE_ZIP) {
    const forced = opts.zipPath || process.env.DEVHUB_STANDALONE_ZIP;
    return fs.existsSync(forced) ? forced : null;
  }

  const root = resolveResourcesPath(opts);
  for (const candidate of standaloneZipCandidates(root)) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Repo layout fallback (dev)
  const devZip = path.join(repoRoot, 'src-tauri', 'resources', 'standalone.zip');
  if (fs.existsSync(devZip)) return devZip;

  return null;
}

/**
 * Directory where standalone is extracted / expected to live.
 * @param {{ app?: import('electron').App | null, userData?: string }} [opts]
 */
function resolveStandaloneDir(opts = {}) {
  if (process.env.DEVHUB_STANDALONE_DIR) return process.env.DEVHUB_STANDALONE_DIR;
  if (opts.userData) return path.join(opts.userData, 'standalone');

  const app = opts.app !== undefined ? opts.app : tryGetApp();
  if (app && typeof app.getPath === 'function') {
    try {
      return path.join(app.getPath('userData'), 'standalone');
    } catch {
      // app not ready
    }
  }
  return path.join(repoRoot, '.devhub', 'standalone');
}

/**
 * Sidecar entry candidates (packaged resources + monorepo).
 * @param {{ app?: import('electron').App | null, resourcesPath?: string }} [opts]
 * @returns {string | null}
 */
function locateSidecarEntry(opts = {}) {
  const resourcesRoot = resolveResourcesPath(opts);
  const candidates = [
    path.join(resourcesRoot, 'devhub-server.cjs'),
    path.join(resourcesRoot, 'resources', 'devhub-server.cjs'),
    path.join(resolveStandaloneDir(opts), 'server.js'),
    path.join(repoRoot, 'sidecar-backend', 'server.js'),
    path.join(repoRoot, '.next', 'standalone', 'server.js'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/**
 * Extract a zip file to destDir (Windows: Expand-Archive; else unzip).
 * Pure-ish helper for tests via inject.
 * @param {string} zipPath
 * @param {string} destDir
 * @param {{ execFile?: typeof execFileAsync }} [deps]
 */
async function extractZip(zipPath, destDir, deps = {}) {
  const run = deps.execFile || execFileAsync;
  fs.mkdirSync(destDir, { recursive: true });

  if (process.platform === 'win32') {
    const ps = [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath '${String(zipPath).replace(/'/g, "''")}' -DestinationPath '${String(destDir).replace(/'/g, "''")}' -Force`,
    ];
    await run('powershell.exe', ps, { windowsHide: true });
    return { method: 'Expand-Archive', destDir };
  }

  await run('unzip', ['-o', zipPath, '-d', destDir]);
  return { method: 'unzip', destDir };
}

/**
 * Whether standalone dir looks usable (has server.js or package.json).
 * @param {string} dir
 */
function isStandaloneReady(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  return (
    fs.existsSync(path.join(dir, 'server.js')) ||
    fs.existsSync(path.join(dir, 'package.json')) ||
    fs.existsSync(path.join(dir, 'sidecar', 'server.js'))
  );
}

/**
 * Ensure standalone is extracted when packaged and zip is newer / missing.
 * In dev: no full Next standalone required — returns mode:'dev'.
 *
 * @param {{ app?: import('electron').App | null, force?: boolean, extract?: typeof extractZip }} [opts]
 */
async function ensureRuntime(opts = {}) {
  const app = opts.app !== undefined ? opts.app : tryGetApp();
  const packaged = isPackagedMode(app);
  const uiUrl = resolveUiUrl();
  const port = sidecarPort();
  const sidecarEntry = locateSidecarEntry({ app, resourcesPath: opts.resourcesPath });
  const standaloneDir = resolveStandaloneDir({ app, userData: opts.userData });
  const zipPath = locateStandaloneZip({
    app,
    resourcesPath: opts.resourcesPath,
    zipPath: opts.zipPath,
  });

  if (!packaged) {
    return {
      ok: true,
      mode: 'dev',
      packaged: false,
      uiUrl,
      sidecar: {
        port,
        entry: sidecarEntry,
      },
      standalone: {
        dir: standaloneDir,
        zip: zipPath,
        ready: isStandaloneReady(standaloneDir),
        extracted: false,
      },
    };
  }

  let extracted = false;
  let extractError = null;
  const needsExtract =
    opts.force ||
    !isStandaloneReady(standaloneDir) ||
    (zipPath && needsRefresh(zipPath, standaloneDir));

  if (needsExtract && zipPath) {
    try {
      const extract = opts.extract || extractZip;
      await extract(zipPath, standaloneDir);
      extracted = true;
      // Stamp mtime marker for refresh detection
      try {
        const stamp = path.join(standaloneDir, '.devhub-zip-mtime');
        const st = fs.statSync(zipPath);
        fs.writeFileSync(stamp, String(st.mtimeMs), 'utf8');
      } catch {
        // non-fatal
      }
    } catch (err) {
      extractError = err?.message || String(err);
    }
  }

  const ready = isStandaloneReady(standaloneDir);
  return {
    ok: ready || Boolean(sidecarEntry),
    mode: 'packaged',
    packaged: true,
    uiUrl,
    sidecar: {
      port,
      entry: locateSidecarEntry({ app, resourcesPath: opts.resourcesPath }),
    },
    standalone: {
      dir: standaloneDir,
      zip: zipPath,
      ready,
      extracted,
      error: extractError,
    },
  };
}

/**
 * @param {string} zipPath
 * @param {string} standaloneDir
 */
function needsRefresh(zipPath, standaloneDir) {
  try {
    const stampPath = path.join(standaloneDir, '.devhub-zip-mtime');
    if (!fs.existsSync(stampPath)) return true;
    const prev = Number(fs.readFileSync(stampPath, 'utf8'));
    const st = fs.statSync(zipPath);
    return Number.isFinite(prev) && st.mtimeMs > prev;
  } catch {
    return true;
  }
}

/**
 * Lightweight status (no extract).
 * @param {{ app?: import('electron').App | null }} [opts]
 */
function runtimeStatus(opts = {}) {
  const app = opts.app !== undefined ? opts.app : tryGetApp();
  const packaged = isPackagedMode(app);
  const standaloneDir = resolveStandaloneDir({ app, userData: opts.userData });
  const zipPath = locateStandaloneZip({
    app,
    resourcesPath: opts.resourcesPath,
    zipPath: opts.zipPath,
  });

  return {
    ok: true,
    mode: packaged ? 'packaged' : 'dev',
    packaged,
    uiUrl: resolveUiUrl(),
    platform: process.platform,
    resourcesPath: resolveResourcesPath({ app, resourcesPath: opts.resourcesPath }),
    sidecar: {
      port: sidecarPort(),
      entry: locateSidecarEntry({ app, resourcesPath: opts.resourcesPath }),
    },
    standalone: {
      dir: standaloneDir,
      zip: zipPath,
      ready: isStandaloneReady(standaloneDir),
    },
  };
}

module.exports = {
  repoRoot,
  resolveUiUrl,
  sidecarPort,
  isPackagedMode,
  resolveResourcesPath,
  standaloneZipCandidates,
  locateStandaloneZip,
  resolveStandaloneDir,
  locateSidecarEntry,
  isStandaloneReady,
  extractZip,
  needsRefresh,
  ensureRuntime,
  runtimeStatus,
};
