'use client';

let nativeVteUnlisten = null;

function normalizeNativeVteReason(reason, fallbackReason) {
  if (reason === 'panel-not-active' || reason === 'missing-bounds') {
    return reason;
  }

  if (
    reason === 'probe-missing-main-window' ||
    reason === 'probe-missing-default-vbox' ||
    reason === 'probe-missing-webview-handle' ||
    reason === 'probe-missing-host-primitives'
  ) {
    return reason;
  }

  if (reason === 'unsupported-platform' || reason === 'tauri-unavailable') {
    return reason;
  }

  if (reason === 'probe-failed') {
    return reason;
  }

  return fallbackReason;
}

function hasWindow() {
  return typeof window !== 'undefined';
}

export function isNativeVteRuntimeAvailable() {
  return hasWindow() && Boolean(window.__TAURI_INTERNALS__);
}

async function getTauriCore() {
  if (!isNativeVteRuntimeAvailable()) {
    throw new Error('tauri-unavailable');
  }

  return import('@tauri-apps/api/core');
}

function emitBrowserEvent(type, detail) {
  if (!hasWindow()) return;
  window.dispatchEvent(new CustomEvent(`devhub:${type}`, { detail }));
}

export async function probeNativeVte(payload = {}) {
  if (!isNativeVteRuntimeAvailable()) {
    return { ready: false, reason: 'tauri-unavailable' };
  }

  try {
    const { invoke } = await getTauriCore();
    return await invoke('native_vte_probe', { request: payload });
  } catch (error) {
    return { ready: false, reason: normalizeNativeVteReason(error?.message, 'probe-failed') };
  }
}

export async function openNativeVtePanel(payload = {}) {
  if (!isNativeVteRuntimeAvailable()) {
    return { opened: false, reason: 'tauri-unavailable' };
  }

  try {
    const { invoke } = await getTauriCore();
    return await invoke('native_vte_open', { request: payload });
  } catch (error) {
    return { opened: false, reason: normalizeNativeVteReason(error?.message, 'open-failed') };
  }
}

export async function focusNativeVtePanel(payload = {}) {
  if (!isNativeVteRuntimeAvailable()) return;
  const { invoke } = await getTauriCore();
  await invoke('native_vte_focus', { request: payload });
}

export async function resizeNativeVtePanel(payload = {}) {
  if (!isNativeVteRuntimeAvailable()) return;
  const { invoke } = await getTauriCore();
  await invoke('native_vte_resize', { request: payload });
}

export async function setNativeVtePanelVisibility(payload = {}) {
  if (!isNativeVteRuntimeAvailable()) return;
  const { invoke } = await getTauriCore();
  await invoke('native_vte_set_visibility', { request: payload });
}

export async function closeNativeVtePanel(payload = {}) {
  if (!isNativeVteRuntimeAvailable()) return;
  const { invoke } = await getTauriCore();
  await invoke('native_vte_close', { request: payload });
}

export async function subscribeNativeVteEvents() {
  if (!isNativeVteRuntimeAvailable()) {
    return () => {};
  }

  if (nativeVteUnlisten) {
    return nativeVteUnlisten;
  }

  const { listen } = await getTauriCore();
  nativeVteUnlisten = await listen('native-vte-event', (event) => {
    const payload = event?.payload || {};
    const type = payload.type;
    if (!type) return;

    if (type === 'terminal-exit') {
      emitBrowserEvent(type, {
        ...payload,
        id: payload.id || payload.panelId,
      });
      return;
    }

    if (type === 'opencode-session-detected' || type === 'hermes-session-detected') {
      emitBrowserEvent(type, payload);
      return;
    }

    emitBrowserEvent('terminal-native-vte-event', payload);
  });

  return () => {
    nativeVteUnlisten?.();
    nativeVteUnlisten = null;
  };
}
