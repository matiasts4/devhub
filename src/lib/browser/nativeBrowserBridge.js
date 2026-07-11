'use client';
/* global require */

let nativeBrowserUnlisten = null;

const NATIVE_BROWSER_EVENT_NAME = 'native-browser-event';

function emitNativeBrowserEvent(detail) {
  if (!hasWindow()) return;
  const BrowserEvent = window.CustomEvent || CustomEvent;
  window.dispatchEvent(new BrowserEvent('devhub:native-browser-event', { detail }));
}

function hasWindow() {
  return typeof window !== 'undefined';
}

export function isNativeBrowserRuntimeAvailable() {
  return hasWindow() && Boolean(window.__TAURI_INTERNALS__);
}

async function getTauriCore() {
  if (!isNativeBrowserRuntimeAvailable()) {
    throw new Error('tauri-unavailable');
  }

  if (typeof require === 'function') {
    return require('@tauri-apps/api/core');
  }

  return import('@tauri-apps/api/core');
}

async function getTauriEvent() {
  if (!isNativeBrowserRuntimeAvailable()) {
    throw new Error('tauri-unavailable');
  }

  if (typeof require === 'function') {
    return require('@tauri-apps/api/event');
  }

  return import('@tauri-apps/api/event');
}

function normalizeNativeBrowserReason(reason, fallbackReason) {
  if (!reason) return fallbackReason;
  return String(reason);
}

export function isTransientNativeBrowserProbeFailure(reason) {
  if (!reason) return false;
  const r = String(reason);
  if (
    r === 'probe-failed' ||
    r === 'probe-missing-main-window' ||
    r === 'probe-missing-default-vbox' ||
    r === 'probe-missing-webview-handle' ||
    r === 'probe-missing-host-primitives' ||
    r === 'missing-bounds' ||
    r === 'open-failed' ||
    r.includes('host-primitives') ||
    r.includes('open-failed')
  ) {
    return true;
  }
  return false;
}

async function invokeNativeBrowser(command, payload = {}, failureShape = {}) {
  if (!isNativeBrowserRuntimeAvailable()) {
    return failureShape;
  }

  try {
    const { invoke } = await getTauriCore();
    return await invoke(command, { request: payload });
  } catch (error) {
    return {
      ...failureShape,
      reason: normalizeNativeBrowserReason(error?.message, failureShape.reason || 'bridge-failed'),
    };
  }
}

export async function probeNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_probe', payload, {
    ready: false,
    reason: 'tauri-unavailable',
  });
}

export async function openNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_open', payload, {
    opened: false,
    reason: 'tauri-unavailable',
  });
}

export async function loadNativeBrowserUrl(payload = {}) {
  return invokeNativeBrowser('native_browser_load_url', payload, {
    loaded: false,
    reason: 'tauri-unavailable',
  });
}

export async function reloadNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_reload', payload, {
    reloaded: false,
    reason: 'tauri-unavailable',
  });
}

export async function resizeNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_resize', payload, {});
}

const pendingResizeByPanelId = new Map();

/**
 * Coalesce rapid browser resize updates (e.g. during a pizarra drag) into a
 * single next-animation-frame call to the native bridge.
 */
export function scheduleNativeBrowserResize({ panelId, bounds }) {
  if (!isNativeBrowserRuntimeAvailable()) return Promise.resolve();
  const pending = pendingResizeByPanelId.get(panelId);
  if (pending) {
    pending.bounds = bounds;
    return pending.promise;
  }
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const schedule =
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
  const rafId = schedule(() => {
    pendingResizeByPanelId.delete(panelId);
    resizeNativeBrowser({ panelId, bounds }).then(resolve).catch(reject);
  });
  pendingResizeByPanelId.set(panelId, { rafId, bounds, promise, resolve, reject });
  return promise;
}

/**
 * Cancel any pending scheduled resize for the panel and execute it immediately.
 */
export function flushNativeBrowserResize({ panelId, bounds }) {
  if (!isNativeBrowserRuntimeAvailable()) return Promise.resolve();
  const pending = pendingResizeByPanelId.get(panelId);
  if (pending) {
    const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
    cancel(pending.rafId);
    pendingResizeByPanelId.delete(panelId);
  }
  return resizeNativeBrowser({ panelId, bounds });
}

export async function focusNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_focus', payload, {});
}

export async function raiseNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_raise', payload, {});
}

export async function setNativeBrowserVisibility(payload = {}) {
  return invokeNativeBrowser('native_browser_set_visibility', payload, {});
}

export async function nativeBrowserSelectorCommand(payload = {}) {
  return invokeNativeBrowser('native_browser_selector_command', payload, {
    supported: false,
    reason: 'tauri-unavailable',
  });
}

export async function selectAllNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_select_all', payload, {
    supported: false,
    reason: 'tauri-unavailable',
  });
}

export async function copyNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_copy', payload, {
    supported: false,
    reason: 'tauri-unavailable',
  });
}

export async function closeNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_close', payload, {});
}

export async function subscribeNativeBrowserEvents() {
  if (!isNativeBrowserRuntimeAvailable()) {
    return () => {};
  }

  if (nativeBrowserUnlisten) {
    return nativeBrowserUnlisten;
  }

  const { listen } = await getTauriEvent();
  nativeBrowserUnlisten = await listen(NATIVE_BROWSER_EVENT_NAME, (event) => {
    const payload = event?.payload || {};
    if (!payload?.type) return;
    emitNativeBrowserEvent(payload);
  });

  return () => {
    nativeBrowserUnlisten?.();
    nativeBrowserUnlisten = null;
  };
}
