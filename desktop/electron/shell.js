'use strict';

/**
 * Electron shell / OS integration handlers (window, clipboard, dialog, notify).
 * Command names match channels.SHELL_COMMANDS (Tauri-compatible where applicable).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, clipboard, dialog, Notification, BrowserWindow } = require('electron');
const { SHELL_COMMANDS } = require('./channels');

const SHELL_SET = new Set(Object.values(SHELL_COMMANDS));

function isShellCommand(command) {
  return SHELL_SET.has(command);
}

/**
 * @param {{ getMainWindow?: () => import('electron').BrowserWindow | null }} [ctx]
 */
function createShellHandler(ctx = {}) {
  const getMainWindow = typeof ctx.getMainWindow === 'function' ? ctx.getMainWindow : () => null;

  function focusedOrMain() {
    return BrowserWindow.getFocusedWindow() || getMainWindow();
  }

  async function handle(command, payload = {}) {
    const win = focusedOrMain();

    switch (command) {
      case SHELL_COMMANDS.PING:
        return { ok: true, host: 'electron', version: app.getVersion() };

      case SHELL_COMMANDS.WINDOW_MINIMIZE: {
        win?.minimize();
        return { ok: true };
      }
      case SHELL_COMMANDS.WINDOW_MAXIMIZE: {
        win?.maximize();
        return { ok: true };
      }
      case SHELL_COMMANDS.WINDOW_UNMAXIMIZE: {
        win?.unmaximize();
        return { ok: true };
      }
      case SHELL_COMMANDS.WINDOW_TOGGLE_MAXIMIZE: {
        if (!win) return { ok: false, reason: 'no-window' };
        if (win.isMaximized()) {
          win.unmaximize();
          return { ok: true, maximized: false };
        }
        win.maximize();
        return { ok: true, maximized: true };
      }
      case SHELL_COMMANDS.WINDOW_CLOSE: {
        win?.close();
        return { ok: true };
      }
      case SHELL_COMMANDS.WINDOW_IS_MAXIMIZED: {
        return Boolean(win?.isMaximized());
      }
      case SHELL_COMMANDS.WINDOW_SHOW: {
        win?.show();
        return { ok: true };
      }
      case SHELL_COMMANDS.WINDOW_HIDE: {
        win?.hide();
        return { ok: true };
      }

      case SHELL_COMMANDS.CLIPBOARD_READ_TEXT: {
        try {
          const text = clipboard.readText();
          return typeof text === 'string' && text.length > 0 ? text : null;
        } catch (err) {
          return { reason: String(err?.message || err || 'clipboard-read-failed') };
        }
      }
      case SHELL_COMMANDS.CLIPBOARD_WRITE_TEXT: {
        const text = payload?.text ?? payload?.value ?? '';
        clipboard.writeText(String(text ?? ''));
        return { ok: true };
      }
      case SHELL_COMMANDS.CLIPBOARD_READ_IMAGE: {
        try {
          const image = clipboard.readImage();
          if (!image || image.isEmpty()) return null;
          const png = image.toPNG();
          return {
            data: Buffer.from(png).toString('base64'),
            mime_type: 'image/png',
          };
        } catch (err) {
          return { reason: String(err?.message || err || 'clipboard-image-failed') };
        }
      }
      case SHELL_COMMANDS.CLIPBOARD_WRITE_IMAGE_TEMP: {
        try {
          const dataBase64 = payload?.dataBase64 || payload?.data;
          if (!dataBase64) return null;
          const extension = String(payload?.extension || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
          const buf = Buffer.from(dataBase64, 'base64');
          const tmp = path.join(
            os.tmpdir(),
            `devhub-clipboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
          );
          fs.writeFileSync(tmp, buf);
          return tmp;
        } catch (err) {
          return { reason: String(err?.message || err || 'clipboard-temp-failed') };
        }
      }

      case SHELL_COMMANDS.DIALOG_OPEN: {
        const properties = [];
        if (payload.directory) {
          properties.push('openDirectory');
        } else {
          properties.push('openFile');
        }
        if (payload.multiple) properties.push('multiSelections');

        const filters = Array.isArray(payload.filters)
          ? payload.filters.map((f) => ({
              name: f.name || 'Files',
              extensions: Array.isArray(f.extensions)
                ? f.extensions.map((e) => String(e).replace(/^\./, ''))
                : ['*'],
            }))
          : undefined;

        const openOpts = {
          title: payload.title || undefined,
          properties,
          filters,
        };
        const result = win
          ? await dialog.showOpenDialog(win, openOpts)
          : await dialog.showOpenDialog(openOpts);

        if (result.canceled || !result.filePaths?.length) {
          return { canceled: true, paths: [] };
        }

        if (payload.multiple) {
          return { canceled: false, paths: result.filePaths, filePaths: result.filePaths };
        }
        return {
          canceled: false,
          path: result.filePaths[0],
          paths: result.filePaths,
          filePaths: result.filePaths,
        };
      }

      case SHELL_COMMANDS.NOTIFY_PERMISSION: {
        // Electron notifications do not use a web-style permission prompt on desktop.
        if (!Notification.isSupported()) {
          return { permission: 'unavailable' };
        }
        return { permission: 'granted' };
      }
      case SHELL_COMMANDS.NOTIFY_SHOW: {
        if (!Notification.isSupported()) {
          return { ok: false, reason: 'notifications-unsupported' };
        }
        const title = String(payload?.title || 'DevHub');
        const body = String(payload?.body || payload?.message || '');
        const n = new Notification({ title, body });
        n.show();
        return { ok: true };
      }

      case SHELL_COMMANDS.RUNTIME_STATUS:
        return { ok: true, host: 'electron', ready: true };
      case SHELL_COMMANDS.RUNTIME_ENSURE:
        return { ok: true, host: 'electron', ready: true };

      default:
        return { reason: 'not-implemented', command };
    }
  }

  return { handle, isShellCommand };
}

module.exports = {
  createShellHandler,
  isShellCommand,
  SHELL_COMMANDS,
};
