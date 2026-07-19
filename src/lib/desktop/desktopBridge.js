/**
 * Unified desktop invoke adapter.
 * Routes to Electron IPC, Tauri invoke, or structured fail-closed results.
 */

import { detectDesktopRuntime, isElectronDesktop } from './desktopRuntime';

function normalizeReason(error, fallback) {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error?.message || fallback;
}

/**
 * Invoke a desktop command with Tauri-compatible command names.
 * Electron: payload is sent as-is (no `{ request }` wrapper).
 * Tauri: payload is wrapped as `{ request: payload }` for native browser commands
 *        unless `tauriWrapRequest` is false.
 *
 * @param {string} command
 * @param {object} [payload]
 * @param {object} [options]
 * @param {object} [options.failureShape]
 * @param {boolean} [options.tauriWrapRequest=true]
 */
export async function invokeDesktop(command, payload = {}, options = {}) {
  const failureShape = options.failureShape || { reason: 'desktop-unavailable' };
  const tauriWrapRequest = options.tauriWrapRequest !== false;
  const runtime = detectDesktopRuntime();

  if (runtime === 'electron') {
    try {
      const api = window.devhubDesktop;
      if (!api?.invoke) {
        return { ...failureShape, reason: 'electron-bridge-missing' };
      }
      return await api.invoke(command, payload);
    } catch (error) {
      return {
        ...failureShape,
        reason: normalizeReason(error, failureShape.reason || 'bridge-failed'),
      };
    }
  }

  if (runtime === 'tauri') {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const args = tauriWrapRequest ? { request: payload } : payload;
      return await invoke(command, args);
    } catch (error) {
      return {
        ...failureShape,
        reason: normalizeReason(error, failureShape.reason || 'bridge-failed'),
      };
    }
  }

  return { ...failureShape };
}

/**
 * Subscribe to desktop events. Returns unsubscribe.
 * Electron: `devhubDesktop.on('native-browser-event')`
 * Tauri: listen('native-browser-event')
 */
export async function subscribeDesktopEvent(eventName, handler) {
  if (isElectronDesktop()) {
    const unsub = window.devhubDesktop.on(eventName, handler);
    return typeof unsub === 'function' ? unsub : () => {};
  }

  if (detectDesktopRuntime() === 'tauri') {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen(eventName, (event) => {
      handler(event?.payload);
    });
    return () => {
      unlisten?.();
    };
  }

  return () => {};
}

export { detectDesktopRuntime, isElectronDesktop };
