/**
 * Desktop window controls (minimize / maximize / close).
 * Electron: IPC via desktopBridge.
 * Tauri: @tauri-apps/api/window getCurrentWindow.
 * Web: fail-closed no-ops.
 */

import { invokeDesktop, isElectronDesktop, detectDesktopRuntime } from './desktopBridge';

const FAIL = { ok: false, reason: 'desktop-unavailable' };

async function getTauriWindow() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow();
  } catch {
    return null;
  }
}

async function electronInvoke(command, payload = {}) {
  return invokeDesktop(command, payload, {
    failureShape: { ...FAIL },
    tauriWrapRequest: false,
  });
}

export async function minimize() {
  if (isElectronDesktop()) {
    return electronInvoke('window_minimize');
  }
  if (detectDesktopRuntime() === 'tauri') {
    const win = await getTauriWindow();
    if (!win) return { ...FAIL, reason: 'tauri-window-unavailable' };
    await win.minimize().catch(() => {});
    return { ok: true };
  }
  return { ...FAIL, reason: 'web-no-window-controls' };
}

export async function maximize() {
  if (isElectronDesktop()) {
    return electronInvoke('window_maximize');
  }
  if (detectDesktopRuntime() === 'tauri') {
    const win = await getTauriWindow();
    if (!win) return { ...FAIL, reason: 'tauri-window-unavailable' };
    await win.maximize().catch(() => {});
    return { ok: true };
  }
  return { ...FAIL, reason: 'web-no-window-controls' };
}

export async function unmaximize() {
  if (isElectronDesktop()) {
    return electronInvoke('window_unmaximize');
  }
  if (detectDesktopRuntime() === 'tauri') {
    const win = await getTauriWindow();
    if (!win) return { ...FAIL, reason: 'tauri-window-unavailable' };
    await win.unmaximize().catch(() => {});
    return { ok: true };
  }
  return { ...FAIL, reason: 'web-no-window-controls' };
}

export async function toggleMaximize() {
  if (isElectronDesktop()) {
    return electronInvoke('window_toggle_maximize');
  }
  if (detectDesktopRuntime() === 'tauri') {
    const win = await getTauriWindow();
    if (!win) return { ...FAIL, reason: 'tauri-window-unavailable' };
    // Explicit maximize/unmaximize avoids Tauri v2 toggleMaximize races.
    const current = await win.isMaximized().catch(() => false);
    if (current) {
      await win.unmaximize().catch(() => {});
    } else {
      await win.maximize().catch(() => {});
    }
    return { ok: true, maximized: !current };
  }
  return { ...FAIL, reason: 'web-no-window-controls' };
}

export async function close() {
  if (isElectronDesktop()) {
    return electronInvoke('window_close');
  }
  if (detectDesktopRuntime() === 'tauri') {
    const win = await getTauriWindow();
    if (!win) return { ...FAIL, reason: 'tauri-window-unavailable' };
    await win.close().catch(() => {});
    return { ok: true };
  }
  return { ...FAIL, reason: 'web-no-window-controls' };
}

/**
 * @returns {Promise<boolean>}
 */
export async function isMaximized() {
  if (isElectronDesktop()) {
    const result = await electronInvoke('window_is_maximized');
    if (typeof result === 'boolean') return result;
    if (result && typeof result.maximized === 'boolean') return result.maximized;
    return false;
  }
  if (detectDesktopRuntime() === 'tauri') {
    const win = await getTauriWindow();
    if (!win) return false;
    return win.isMaximized().catch(() => false);
  }
  return false;
}
