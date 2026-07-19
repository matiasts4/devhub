/**
 * Native open dialog helper.
 * Electron: invokeDesktop('dialog_open', …)
 * Tauri: @tauri-apps/plugin-dialog
 * Web: fail-closed → null (canceled)
 *
 * Return shape matches Tauri plugin-dialog `open`:
 *   string | string[] | null
 */

import { invokeDesktop, isElectronDesktop, detectDesktopRuntime } from './desktopBridge';

/**
 * @param {object} [options]
 * @param {boolean} [options.directory]
 * @param {boolean} [options.multiple]
 * @param {Array<{ name?: string, extensions?: string[] }>} [options.filters]
 * @param {string} [options.title]
 * @returns {Promise<string|string[]|null>}
 */
export async function openDialog(options = {}) {
  const { directory = false, multiple = false, filters, title } = options;
  const payload = { directory, multiple, filters, title };

  if (isElectronDesktop()) {
    const result = await invokeDesktop('dialog_open', payload, {
      failureShape: { canceled: true, reason: 'desktop-unavailable' },
      tauriWrapRequest: false,
    });

    if (result == null) return null;
    if (result.canceled === true || result.reason) return null;

    // Prefer Tauri-compatible top-level path(s).
    if (typeof result === 'string') return result;
    if (Array.isArray(result)) return result.length ? result : null;
    if (typeof result.path === 'string') return result.path;
    if (Array.isArray(result.paths)) {
      if (!result.paths.length) return null;
      return multiple ? result.paths : result.paths[0];
    }
    if (Array.isArray(result.filePaths)) {
      if (!result.filePaths.length) return null;
      return multiple ? result.filePaths : result.filePaths[0];
    }
    return null;
  }

  if (detectDesktopRuntime() === 'tauri') {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open(payload);
      if (selected == null || selected === false) return null;
      return selected;
    } catch {
      return null;
    }
  }

  // Web: no native filesystem picker for absolute paths.
  return null;
}
