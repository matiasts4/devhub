'use strict';

/**
 * DevHub Electron host — E0/E1 entry.
 * Loads the Next/React SPA, hosts WebContentsView native browser panels,
 * shell IPC (window/clipboard/dialog/notify/runtime), tray, single-instance.
 * Soft-wires voice (E3) and multi-window extras when modules exist.
 */

const path = require('path');
const os = require('os');
const { app, ipcMain, Menu } = require('electron');

// Set isolated user data directory and app name BEFORE requestSingleInstanceLock
try {
  app.setName('DevHub');
  if (!app.isPackaged) {
    const devhubHome = process.env.DEVHUB_HOME || path.join(os.homedir(), '.devhub-dev');
    app.setPath('userData', path.join(devhubHome, 'electron-user-data'));
  }
} catch {
  /* ignore */
}

const { createMainWindow, resolveUiUrl } = require('./window');
const { ensureSidecar } = require('./sidecar');
const { createBrowserRegistry } = require('./browser/registry');
const { CHANNELS } = require('./channels');
const { routeInvoke, initOptionalHandlers, disposeOptionalHandlers } = require('./ipc');
const { createTray, destroyTray } = require('./tray');
const { ensureRuntime, runtimeStatus } = require('./packaging/runtime');

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;
/** @type {ReturnType<typeof createBrowserRegistry> | null} */
let browserRegistry = null;

const repoRoot = path.resolve(__dirname, '..', '..');

function sendBrowserEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.NATIVE_BROWSER_EVENT, payload);
  }
}

function sendVoiceEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.VOICE_EVENT, payload);
  }
}

function sendWindowEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.WINDOW_EVENT, payload);
  }
}

function getMainWindow() {
  return mainWindow;
}

function wireWindowEvents(win) {
  if (!win) return;
  win.on('maximize', () => sendWindowEvent({ type: 'maximize', maximized: true }));
  win.on('unmaximize', () => sendWindowEvent({ type: 'unmaximize', maximized: false }));
  win.on('minimize', () => sendWindowEvent({ type: 'minimize' }));
  win.on('restore', () => sendWindowEvent({ type: 'restore' }));
  win.on('show', () => sendWindowEvent({ type: 'show' }));
  win.on('hide', () => sendWindowEvent({ type: 'hide' }));
  win.on('focus', () => sendWindowEvent({ type: 'focus' }));
  win.on('blur', () => sendWindowEvent({ type: 'blur' }));
}

function registerIpc() {
  initOptionalHandlers({
    getMainWindow,
    sendVoiceEvent,
  });

  ipcMain.handle(CHANNELS.INVOKE, async (event, message = {}) => {
    const command = message.command;
    const payload = message.payload || {};

    try {
      return await routeInvoke({
        command,
        payload,
        event,
        getMainWindow,
        browserRegistry,
      });
    } catch (err) {
      console.error('[DevHub Electron] invoke failed', command, err);
      return {
        reason: 'invoke-error',
        command,
        message: err?.message || String(err),
      };
    }
  });
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
  } catch {
    /* ignore */
  }
  try {
    mainWindow.show();
    if (typeof mainWindow.moveTop === 'function') mainWindow.moveTop();
    mainWindow.focus();
  } catch (err) {
    console.warn('[DevHub Electron] focusMainWindow failed', err?.message || err);
  }
}

function attachMainWindow(win) {
  mainWindow = win;
  wireWindowEvents(win);
  browserRegistry = createBrowserRegistry({
    getMainWindow,
    sendEvent: sendBrowserEvent,
  });

  win.on('closed', () => {
    browserRegistry?.disposeAll();
    browserRegistry = null;
    disposeOptionalHandlers();
    // re-init multi/voice for next window if activate recreates
    initOptionalHandlers({ getMainWindow, sendVoiceEvent });
    mainWindow = null;
  });
}

async function boot() {
  // Product name (avoids generic "Electron" chrome when a title is shown).
  try {
    app.setName('DevHub');
  } catch {
    /* ignore */
  }

  // Single-instance lock — second launch focuses existing window.
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    focusMainWindow();
  });

  await app.whenReady();
  // Ensure no default File/Edit/View menu on any platform.
  try {
    Menu.setApplicationMenu(null);
  } catch {
    /* ignore */
  }
  registerIpc();

  // Create the window FIRST — it paints the local splash immediately while the
  // runtime and sidecar boot in the background (the SPA loads with retry and
  // swaps in whenever the UI server is ready).
  console.log('[DevHub Electron] UI URL:', resolveUiUrl());
  attachMainWindow(createMainWindow());

  // Runtime locate/extract → sidecar, chained: on packaged first-launch the
  // sidecar entry can live inside the extracted standalone, so the sidecar
  // must not race ahead of extraction. Everything runs in the background.
  ensureRuntime()
    .then((runtime) => {
      console.log('[DevHub Electron] Runtime:', {
        mode: runtime.mode,
        uiUrl: runtime.uiUrl,
        standaloneReady: runtime.standalone?.ready,
        sidecarEntry: runtime.sidecar?.entry,
      });
    })
    .catch((err) => {
      console.warn('[DevHub Electron] runtime ensure failed:', err?.message || err);
      console.log('[DevHub Electron] Runtime status:', runtimeStatus());
    })
    .finally(() => {
      ensureSidecar({ repoRoot })
        .then((sidecar) => {
          console.log('[DevHub Electron] Sidecar:', sidecar);
        })
        .catch((err) => {
          console.warn('[DevHub Electron] ensureSidecar background error:', err?.message || err);
        });
    });

  createTray({
    getMainWindow,
    onQuit: () => {
      app.quit();
    },
  });

  app.on('activate', () => {
    // macOS dock click — recreate or focus primary window (fixed BrowserWindowGet bug).
    if (getMainWindow() === null) {
      attachMainWindow(createMainWindow());
    } else {
      focusMainWindow();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  browserRegistry?.disposeAll();
  disposeOptionalHandlers();
  destroyTray();
});

boot().catch((err) => {
  console.error('[DevHub Electron] boot failed', err);
  app.quit();
});
