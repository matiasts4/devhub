'use strict';

/**
 * Persist / restore BrowserWindow bounds and recover from renderer crashes.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const STATE_FILE = 'window-state.json';
const DEFAULT_BOUNDS = { width: 1440, height: 900, x: undefined, y: undefined, isMaximized: false };

function statePath() {
  try {
    return path.join(app.getPath('userData'), STATE_FILE);
  } catch {
    return path.join(process.cwd(), '.devhub-electron-window-state.json');
  }
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_BOUNDS };
    return {
      width: Number(parsed.width) > 200 ? Number(parsed.width) : DEFAULT_BOUNDS.width,
      height: Number(parsed.height) > 200 ? Number(parsed.height) : DEFAULT_BOUNDS.height,
      x: Number.isFinite(parsed.x) ? Number(parsed.x) : undefined,
      y: Number.isFinite(parsed.y) ? Number(parsed.y) : undefined,
      isMaximized: Boolean(parsed.isMaximized),
    };
  } catch {
    return { ...DEFAULT_BOUNDS };
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
    const payload = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(statePath(), JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('[DevHub Electron] failed to save window state', err?.message || err);
  }
}

/**
 * Attach persist + crash recovery listeners.
 * @param {import('electron').BrowserWindow} win
 */
function attachWindowLifecycle(win) {
  if (!win) return;

  const persist = () => saveWindowState(win);
  win.on('resize', persist);
  win.on('move', persist);
  win.on('close', persist);
  win.on('maximize', persist);
  win.on('unmaximize', persist);

  // Renderer crash recovery: reload SPA once (avoid loops).
  // BaseWindow host exposes SPA via win.webContents polyfill or __devhubSpaView.
  const wc = win.webContents || win.__devhubSpaView?.webContents || null;
  if (!wc) return;

  let crashReloads = 0;
  wc.on('render-process-gone', (_event, details) => {
    console.error('[DevHub Electron] render-process-gone', details);
    if (crashReloads >= 2) return;
    crashReloads += 1;
    setTimeout(() => {
      if (!win.isDestroyed() && !wc.isDestroyed()) {
        wc.reloadIgnoringCache();
      }
    }, 500);
  });

  wc.on('unresponsive', () => {
    console.warn('[DevHub Electron] window unresponsive');
  });

  wc.on('responsive', () => {
    console.log('[DevHub Electron] window responsive again');
  });
}

module.exports = {
  loadWindowState,
  saveWindowState,
  attachWindowLifecycle,
  DEFAULT_BOUNDS,
};
