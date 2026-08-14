'use strict';

/**
 * System tray for DevHub Electron host (E1).
 * Menu: Show / Quit. Icon from Tauri icons or public logo.
 */

const fs = require('fs');
const path = require('path');
const { Tray, Menu, nativeImage, app } = require('electron');

const repoRoot = path.resolve(__dirname, '..', '..');

/** @type {import('electron').Tray | null} */
let trayInstance = null;

/**
 * Resolve a tray icon path (PNG preferred for cross-platform Electron).
 * @returns {string | null}
 */
function resolveTrayIconPath() {
  const candidates = [
    path.join(repoRoot, 'src-tauri', 'icons', '32x32.png'),
    path.join(repoRoot, 'src-tauri', 'icons', 'icon.png'),
    path.join(repoRoot, 'public', 'logo-square.png'),
    path.join(repoRoot, 'src-tauri', 'icons', 'icon.ico'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/**
 * @param {string | null} iconPath
 * @returns {import('electron').NativeImage}
 */
function loadTrayImage(iconPath) {
  if (iconPath) {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) {
      // Windows tray looks better at ~16–32px
      if (process.platform === 'win32' && img.getSize().width > 32) {
        return img.resize({ width: 16, height: 16 });
      }
      return img;
    }
  }
  // 1x1 placeholder so Tray still constructs
  return nativeImage.createEmpty();
}

/**
 * Create (or replace) the app tray.
 * @param {{
 *   getMainWindow: () => import('electron').BrowserWindow | null,
 *   onCheckUpdates?: (() => void) | null,
 *   onQuit?: () => void,
 * }} opts
 * @returns {import('electron').Tray | null}
 */
function createTray(opts) {
  const { getMainWindow, onCheckUpdates, onQuit } = opts;

  destroyTray();

  const iconPath = resolveTrayIconPath();
  const image = loadTrayImage(iconPath);

  try {
    trayInstance = new Tray(
      image.isEmpty()
        ? nativeImage.createFromDataURL(
            // tiny transparent PNG
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
          )
        : image
    );
  } catch (err) {
    console.warn('[DevHub Electron] Tray create failed:', err?.message || err);
    trayInstance = null;
    return null;
  }

  trayInstance.setToolTip('DevHub');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        const win = getMainWindow?.();
        if (!win || win.isDestroyed()) return;
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Check for updates',
      enabled: typeof onCheckUpdates === 'function',
      click: () => {
        if (typeof onCheckUpdates === 'function') onCheckUpdates();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        if (typeof onQuit === 'function') {
          onQuit();
        } else {
          app.quit();
        }
      },
    },
  ]);

  trayInstance.setContextMenu(contextMenu);

  trayInstance.on('double-click', () => {
    const win = getMainWindow?.();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  if (iconPath) {
    console.log('[DevHub Electron] Tray icon:', iconPath);
  } else {
    console.warn('[DevHub Electron] No tray icon file found; using placeholder');
  }

  return trayInstance;
}

function destroyTray() {
  if (trayInstance) {
    try {
      trayInstance.destroy();
    } catch {
      // ignore
    }
    trayInstance = null;
  }
}

function getTray() {
  return trayInstance;
}

module.exports = {
  createTray,
  destroyTray,
  getTray,
  resolveTrayIconPath,
};
