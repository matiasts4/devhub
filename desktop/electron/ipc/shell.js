'use strict';

/**
 * E1 shell / OS integration IPC handlers.
 * Commands use Tauri-compatible names from channels.SHELL_COMMANDS.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { clipboard, dialog, Notification, BrowserWindow } = require('electron');
const { SHELL_COMMANDS } = require('../channels');
const { runtimeStatus, ensureRuntime, resolveUiUrl } = require('../packaging/runtime');

/** @typedef {{ getMainWindow: () => import('electron').BrowserWindow | null }} ShellContext */

/**
 * @param {import('electron').IpcMainInvokeEvent | null | undefined} event
 * @param {ShellContext} ctx
 * @returns {import('electron').BrowserWindow | null}
 */
function resolveTargetWindow(event, ctx) {
  // Prefer host main window (BaseWindow + SPA WebContentsView). BrowserWindow.fromWebContents
  // does not resolve BaseWindow-hosted webContents.
  const main = ctx.getMainWindow?.();
  if (main && !main.isDestroyed()) return main;
  if (event && event.sender) {
    try {
      const fromSender = BrowserWindow.fromWebContents(event.sender);
      if (fromSender && !fromSender.isDestroyed()) return fromSender;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function windowMinimize(win) {
  if (!win) return { ok: false, reason: 'no-window' };
  win.minimize();
  return { ok: true };
}

function windowMaximize(win) {
  if (!win) return { ok: false, reason: 'no-window' };
  win.maximize();
  return { ok: true, maximized: true };
}

function windowUnmaximize(win) {
  if (!win) return { ok: false, reason: 'no-window' };
  if (win.isMaximized()) win.unmaximize();
  return { ok: true, maximized: false };
}

function windowToggleMaximize(win) {
  if (!win) return { ok: false, reason: 'no-window' };
  if (win.isMaximized()) {
    win.unmaximize();
    return { ok: true, maximized: false };
  }
  win.maximize();
  return { ok: true, maximized: true };
}

function windowClose(win) {
  if (!win) return { ok: false, reason: 'no-window' };
  win.close();
  return { ok: true };
}

function windowIsMaximized(win) {
  if (!win) return { ok: false, reason: 'no-window', maximized: false };
  return { ok: true, maximized: win.isMaximized() };
}

function windowShow(win) {
  if (!win) return { ok: false, reason: 'no-window' };
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return { ok: true };
}

function windowHide(win) {
  if (!win) return { ok: false, reason: 'no-window' };
  win.hide();
  return { ok: true };
}

function readClipboardText() {
  try {
    const text = clipboard.readText();
    if (text == null || text === '') return null;
    return text;
  } catch (err) {
    return { reason: 'clipboard-read-failed', message: err?.message || String(err) };
  }
}

function writeClipboardText(payload = {}) {
  const text =
    typeof payload === 'string'
      ? payload
      : (payload.text ?? payload.value ?? payload.content ?? '');
  try {
    clipboard.writeText(String(text ?? ''));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'clipboard-write-failed', message: err?.message || String(err) };
  }
}

/**
 * @returns {{ base64: string, mimeType: string } | null | { reason: string, message?: string }}
 */
function readClipboardImage() {
  try {
    const img = clipboard.readImage();
    if (!img || img.isEmpty()) return null;
    const png = img.toPNG();
    if (!png || !png.length) return null;
    return {
      base64: png.toString('base64'),
      mimeType: 'image/png',
      // Tauri-shaped aliases for SPA adapters that still expect them
      data: png.toString('base64'),
      mime_type: 'image/png',
    };
  } catch (err) {
    return { reason: 'clipboard-image-read-failed', message: err?.message || String(err) };
  }
}

/**
 * Write clipboard image (or payload base64) to a temp file.
 * Payload: { dataBase64?, data?, base64?, extension? }
 * @returns {string | { reason: string, message?: string }}
 */
function writeClipboardImageToTempFile(payload = {}) {
  try {
    let base64 =
      payload.dataBase64 || payload.data_base64 || payload.base64 || payload.data || null;

    if (!base64) {
      const img = clipboard.readImage();
      if (!img || img.isEmpty()) {
        return { reason: 'no-image', message: 'clipboard has no image and no base64 provided' };
      }
      base64 = img.toPNG().toString('base64');
    }

    const extRaw = payload.extension || payload.ext || 'png';
    const ext =
      String(extRaw)
        .replace(/^\./, '')
        .replace(/[^a-zA-Z0-9]/g, '') || 'png';
    const bytes = Buffer.from(String(base64), 'base64');
    const fileName = `devhub-paste-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
    const outPath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(outPath, bytes);
    return outPath;
  } catch (err) {
    return { reason: 'clipboard-image-temp-failed', message: err?.message || String(err) };
  }
}

/**
 * @param {object} payload
 * @param {import('electron').BrowserWindow | null} win
 */
async function dialogOpen(payload = {}, win = null) {
  try {
    const properties = [];
    if (payload.directory || payload.folder) {
      properties.push('openDirectory');
    } else {
      properties.push('openFile');
    }
    if (payload.multiple || payload.multiSelections) {
      properties.push('multiSelections');
    }

    /** @type {import('electron').FileFilter[]} */
    const filters = Array.isArray(payload.filters)
      ? payload.filters.map((f) => ({
          name: f.name || 'Files',
          extensions: Array.isArray(f.extensions)
            ? f.extensions.map((e) => String(e).replace(/^\./, ''))
            : ['*'],
        }))
      : undefined;

    const result = await dialog.showOpenDialog(win || undefined, {
      title: payload.title || undefined,
      defaultPath: payload.defaultPath || payload.default_path || undefined,
      filters,
      properties,
    });

    return {
      canceled: Boolean(result.canceled),
      paths: Array.isArray(result.filePaths) ? result.filePaths : [],
    };
  } catch (err) {
    return {
      canceled: true,
      paths: [],
      reason: 'dialog-failed',
      message: err?.message || String(err),
    };
  }
}

function notifyShow(payload = {}) {
  try {
    const title = payload.title || 'DevHub';
    const body = payload.body || payload.message || '';

    if (!Notification.isSupported()) {
      return { ok: false, reason: 'notifications-unsupported' };
    }

    // Windows: Notification works without explicit permission API.
    // macOS: request permission when needed.
    if (process.platform === 'darwin' && Notification.permission) {
      // Electron exposes requestPermission on Notification constructor (macOS).
    }

    const n = new Notification({
      title: String(title),
      body: String(body),
      silent: Boolean(payload.silent),
    });
    n.show();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'notify-failed', message: err?.message || String(err) };
  }
}

async function notifyRequestPermission() {
  try {
    if (!Notification.isSupported()) {
      return { ok: true, permission: 'denied', supported: false };
    }

    // Electron Notification on Windows does not require runtime permission.
    if (process.platform === 'win32' || process.platform === 'linux') {
      return { ok: true, permission: 'granted', supported: true };
    }

    if (typeof Notification.requestPermission === 'function') {
      const permission = await Notification.requestPermission();
      return { ok: true, permission, supported: true };
    }

    return { ok: true, permission: 'granted', supported: true };
  } catch (err) {
    return {
      ok: false,
      permission: 'denied',
      reason: 'permission-failed',
      message: err?.message || String(err),
    };
  }
}

function desktopPing() {
  let version = null;
  try {
    version = require('electron').app.getVersion();
  } catch {
    /* keep null — SPA falls back to build-time version */
  }
  return { ok: true, host: 'electron', uiUrl: resolveUiUrl(), version };
}

/**
 * @param {string} command
 * @param {object} payload
 * @param {ShellContext & { event?: import('electron').IpcMainInvokeEvent }} ctx
 */
async function handleShellCommand(command, payload = {}, ctx = { getMainWindow: () => null }) {
  const win = resolveTargetWindow(ctx.event, ctx);

  switch (command) {
    case SHELL_COMMANDS.PING:
      return desktopPing();

    case SHELL_COMMANDS.WINDOW_MINIMIZE:
      return windowMinimize(win);
    case SHELL_COMMANDS.WINDOW_MAXIMIZE:
      return windowMaximize(win);
    case SHELL_COMMANDS.WINDOW_UNMAXIMIZE:
      return windowUnmaximize(win);
    case SHELL_COMMANDS.WINDOW_TOGGLE_MAXIMIZE:
      return windowToggleMaximize(win);
    case SHELL_COMMANDS.WINDOW_CLOSE:
      return windowClose(win);
    case SHELL_COMMANDS.WINDOW_IS_MAXIMIZED:
      return windowIsMaximized(win);
    case SHELL_COMMANDS.WINDOW_SHOW:
      return windowShow(win);
    case SHELL_COMMANDS.WINDOW_HIDE:
      return windowHide(win);

    case SHELL_COMMANDS.CLIPBOARD_READ_TEXT:
      return readClipboardText();
    case SHELL_COMMANDS.CLIPBOARD_WRITE_TEXT:
      return writeClipboardText(payload);
    case SHELL_COMMANDS.CLIPBOARD_READ_IMAGE:
      return readClipboardImage();
    case SHELL_COMMANDS.CLIPBOARD_WRITE_IMAGE_TEMP:
      return writeClipboardImageToTempFile(payload);

    case SHELL_COMMANDS.DIALOG_OPEN:
      return dialogOpen(payload, win);

    case SHELL_COMMANDS.NOTIFY_SHOW:
      return notifyShow(payload);
    case SHELL_COMMANDS.NOTIFY_PERMISSION:
      return notifyRequestPermission();

    case SHELL_COMMANDS.RUNTIME_STATUS:
      return runtimeStatus();
    case SHELL_COMMANDS.RUNTIME_ENSURE:
      return ensureRuntime({ force: Boolean(payload.force) });

    case SHELL_COMMANDS.LOG_CLIENT_ERROR:
      console.error(`[Client Error Log] panel:${payload.panelId} message:${payload.message}\nstack:${payload.stack}`);
      try {
        fs.appendFileSync(
          'D:/devhub/debug_terminal_client.log',
          `[${new Date().toISOString()}] panel:${payload.panelId} msg:${payload.message}\nstack:${payload.stack}\n\n`,
          'utf8'
        );
      } catch (_e) {
        // ignore
      }
      return { ok: true };

    default:
      return { reason: 'not-implemented', command };
  }
}

function isShellCommand(command) {
  return Object.values(SHELL_COMMANDS).includes(command);
}

module.exports = {
  handleShellCommand,
  isShellCommand,
  // exported for unit-style smoke without full Electron window
  readClipboardText,
  writeClipboardText,
  readClipboardImage,
  writeClipboardImageToTempFile,
  dialogOpen,
  notifyShow,
  notifyRequestPermission,
  desktopPing,
};
