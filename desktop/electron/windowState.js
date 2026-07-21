'use strict';

/**
 * Persist / restore window bounds and recover from renderer crashes.
 * Clamps saved bounds onto a visible display so multi-monitor disconnects
 * cannot leave the app "running but invisible".
 */

const fs = require('fs');
const path = require('path');
const { app, screen } = require('electron');

const STATE_FILE = 'window-state.json';
const DEFAULT_BOUNDS = { width: 1440, height: 900, x: undefined, y: undefined, isMaximized: false };

function statePath() {
  try {
    return path.join(app.getPath('userData'), STATE_FILE);
  } catch {
    return path.join(process.cwd(), '.devhub-electron-window-state.json');
  }
}

/**
 * Ensure width/height/x/y land on a visible display work area.
 * @param {{ width?: number, height?: number, x?: number, y?: number, isMaximized?: boolean }} raw
 */
function sanitizeWindowState(raw = {}) {
  const width = Number(raw.width) > 200 ? Math.round(Number(raw.width)) : DEFAULT_BOUNDS.width;
  const height = Number(raw.height) > 200 ? Math.round(Number(raw.height)) : DEFAULT_BOUNDS.height;
  let x = Number.isFinite(raw.x) ? Math.round(Number(raw.x)) : undefined;
  let y = Number.isFinite(raw.y) ? Math.round(Number(raw.y)) : undefined;
  const isMaximized = Boolean(raw.isMaximized);

  try {
    const displays = screen.getAllDisplays?.() || [];
    if (!displays.length) {
      return { width, height, x, y, isMaximized };
    }

    const visibleEnough = (px, py, w, h) => {
      // At least 80×80 of the window must intersect some display work area.
      const margin = 80;
      for (const d of displays) {
        const a = d.workArea || d.bounds;
        if (!a) continue;
        const ix = Math.max(px, a.x);
        const iy = Math.max(py, a.y);
        const ix2 = Math.min(px + w, a.x + a.width);
        const iy2 = Math.min(py + h, a.y + a.height);
        if (ix2 - ix >= margin && iy2 - iy >= margin) return true;
      }
      return false;
    };

    if (x == null || y == null || !visibleEnough(x, y, width, height)) {
      // Center on primary work area.
      const primary = screen.getPrimaryDisplay?.() || displays[0];
      const area = primary.workArea || primary.bounds;
      x = Math.round(area.x + Math.max(0, (area.width - width) / 2));
      y = Math.round(area.y + Math.max(0, (area.height - height) / 2));
    }
  } catch {
    /* screen not ready — keep defaults */
  }

  return { width, height, x, y, isMaximized };
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return sanitizeWindowState(DEFAULT_BOUNDS);
    return sanitizeWindowState(parsed);
  } catch {
    return sanitizeWindowState(DEFAULT_BOUNDS);
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const isMaximized = win.isMaximized();
    const bounds =
      isMaximized && typeof win.getNormalBounds === 'function'
        ? win.getNormalBounds()
        : win.getBounds();
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
 * @param {import('electron').BaseWindow | import('electron').BrowserWindow} win
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
  sanitizeWindowState,
  attachWindowLifecycle,
  DEFAULT_BOUNDS,
};
