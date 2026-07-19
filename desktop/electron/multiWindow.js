'use strict';

/**
 * Extra BrowserWindow helpers for URL pop-outs (E3).
 * Commands: window_open_url, window_close_url, window_list_url
 *
 * Also re-exports shell registration helpers so main.js can wire OS integration
 * through a single require('./multiWindow') soft-edit (see registerDesktopExtras).
 */

const path = require('path');
const { BrowserWindow } = require('electron');
const { MULTI_WINDOW_COMMANDS } = require('./channels');
const { createShellHandler, isShellCommand } = require('./shell');

const MULTI_SET = new Set(Object.values(MULTI_WINDOW_COMMANDS));

function isMultiWindowCommand(command) {
  return MULTI_SET.has(command);
}

function resolvePreloadPath() {
  return path.join(__dirname, 'preload.js');
}

/**
 * @param {{ getMainWindow?: () => import('electron').BrowserWindow | null }} [ctx]
 */
function createMultiWindowManager(_ctx = {}) {
  /** @type {Map<string, import('electron').BrowserWindow>} */
  const windows = new Map();

  function dispose(id) {
    const win = windows.get(id);
    if (!win) return false;
    windows.delete(id);
    if (!win.isDestroyed()) {
      win.destroy();
    }
    return true;
  }

  function disposeAll() {
    for (const id of [...windows.keys()]) {
      dispose(id);
    }
  }

  function handle(command, payload = {}) {
    switch (command) {
      case MULTI_WINDOW_COMMANDS.OPEN_URL_WINDOW: {
        const id = String(payload?.id || '').trim();
        const url = String(payload?.url || '').trim();
        if (!id) return { ok: false, reason: 'missing-id' };
        if (!url) return { ok: false, reason: 'missing-url' };

        // Replace existing window with same id.
        if (windows.has(id)) {
          dispose(id);
        }

        const width = Number(payload?.width) > 0 ? Number(payload.width) : 1024;
        const height = Number(payload?.height) > 0 ? Number(payload.height) : 768;

        const win = new BrowserWindow({
          width,
          height,
          show: false,
          backgroundColor: '#0b0f14',
          webPreferences: {
            preload: resolvePreloadPath(),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false,
          },
        });

        windows.set(id, win);

        win.on('closed', () => {
          windows.delete(id);
        });

        win.loadURL(url).catch((err) => {
          console.error('[DevHub Electron] multiWindow loadURL failed', id, err?.message || err);
        });

        win.once('ready-to-show', () => {
          if (!win.isDestroyed()) {
            win.show();
            win.focus();
          }
        });

        return { ok: true, id };
      }

      case MULTI_WINDOW_COMMANDS.CLOSE_URL_WINDOW: {
        const id = String(payload?.id || '').trim();
        if (!id) return { ok: false, reason: 'missing-id' };
        const closed = dispose(id);
        return { ok: true, closed };
      }

      case MULTI_WINDOW_COMMANDS.LIST_URL_WINDOWS: {
        // Drop destroyed entries.
        for (const [id, win] of windows.entries()) {
          if (win.isDestroyed()) windows.delete(id);
        }
        return { ids: [...windows.keys()] };
      }

      default:
        return { reason: 'not-implemented', command };
    }
  }

  return {
    handle,
    isMultiWindowCommand,
    disposeAll,
    listIds: () => [...windows.keys()],
  };
}

/**
 * Combined extras: multi-window URL pop-outs + shell (window/clipboard/dialog/notify).
 * main.js soft-wires this via require('./multiWindow').
 *
 * @param {{ getMainWindow?: () => import('electron').BrowserWindow | null }} [ctx]
 */
function createDesktopExtras(ctx = {}) {
  const multi = createMultiWindowManager(ctx);
  const shell = createShellHandler(ctx);

  function isCommand(command) {
    return isMultiWindowCommand(command) || isShellCommand(command);
  }

  async function handle(command, payload = {}) {
    if (isMultiWindowCommand(command)) {
      return multi.handle(command, payload);
    }
    if (isShellCommand(command)) {
      return shell.handle(command, payload);
    }
    return { reason: 'not-implemented', command };
  }

  return {
    handle,
    isCommand,
    multi,
    shell,
    disposeAll: () => multi.disposeAll(),
  };
}

/**
 * Optional register helper for future ipcRouter pattern.
 * @param {{ handle: Function, isCommand?: Function } | null} ipcRouter
 * @param {{ getMainWindow?: Function }} [ctx]
 */
function register(ipcRouter, ctx = {}) {
  const extras = createDesktopExtras(ctx);
  if (ipcRouter && typeof ipcRouter.use === 'function') {
    ipcRouter.use((command, payload) => {
      if (!extras.isCommand(command)) return null;
      return extras.handle(command, payload);
    });
  }
  return extras;
}

module.exports = {
  createMultiWindowManager,
  createDesktopExtras,
  register,
  isMultiWindowCommand,
  MULTI_WINDOW_COMMANDS,
};
