'use client';

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
  if (!isNativeBrowserRuntimeAvailable()) return;
  const { invoke } = await getTauriCore();
  await invoke('native_browser_resize', { request: payload });
}

export async function focusNativeBrowser(payload = {}) {
  if (!isNativeBrowserRuntimeAvailable()) return;
  const { invoke } = await getTauriCore();
  await invoke('native_browser_focus', { request: payload });
}

export async function setNativeBrowserVisibility(payload = {}) {
  if (!isNativeBrowserRuntimeAvailable()) return;
  const { invoke } = await getTauriCore();
  await invoke('native_browser_set_visibility', { request: payload });
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
  if (!isNativeBrowserRuntimeAvailable()) return;
  const { invoke } = await getTauriCore();
  await invoke('native_browser_close', { request: payload });
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
