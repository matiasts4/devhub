'use strict';

/**
 * DevHub Electron host — E0/E1 entry.
 * Loads the Next/React SPA, hosts WebContentsView native browser panels,
 * shell IPC (window/clipboard/dialog/notify/runtime), tray, single-instance.
 * Soft-wires voice (E3) and multi-window extras when modules exist.
 */

const path = require('path');
const { app, ipcMain, Menu } = require('electron');
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
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
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

  // Runtime locate/extract (dev returns mode:'dev' without requiring standalone).
  try {
    const runtime = await ensureRuntime();
    console.log('[DevHub Electron] Runtime:', {
      mode: runtime.mode,
      uiUrl: runtime.uiUrl,
      standaloneReady: runtime.standalone?.ready,
      sidecarEntry: runtime.sidecar?.entry,
    });
  } catch (err) {
    console.warn('[DevHub Electron] runtime ensure failed:', err?.message || err);
    console.log('[DevHub Electron] Runtime status:', runtimeStatus());
  }

  const sidecar = await ensureSidecar({ repoRoot });
  console.log('[DevHub Electron] Sidecar:', sidecar);
  console.log('[DevHub Electron] UI URL:', resolveUiUrl());

  attachMainWindow(createMainWindow());

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
