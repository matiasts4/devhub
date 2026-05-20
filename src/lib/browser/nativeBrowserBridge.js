'use client';

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

  return import('@tauri-apps/api/core');
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
