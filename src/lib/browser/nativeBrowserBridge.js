'use client';
/* global require */

import { detectDesktopRuntime, isElectronDesktop } from '@/lib/desktop/desktopRuntime';
import { invokeDesktop, subscribeDesktopEvent } from '@/lib/desktop/desktopBridge';

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

/** True when a desktop host can service native browser commands (Electron or Tauri). */
export function isNativeBrowserRuntimeAvailable() {
  if (!hasWindow()) return false;
  const runtime = detectDesktopRuntime();
  return runtime === 'electron' || runtime === 'tauri';
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

  return invokeDesktop(command, payload, {
    failureShape,
    tauriWrapRequest: true,
  });
}

function desktopUnavailableShape(extra = {}) {
  return { ready: false, reason: 'desktop-unavailable', ...extra };
}

export async function probeNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_probe', payload, desktopUnavailableShape());
}

export async function openNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_open', payload, {
    opened: false,
    reason: 'desktop-unavailable',
  });
}

export async function loadNativeBrowserUrl(payload = {}) {
  return invokeNativeBrowser('native_browser_load_url', payload, {
    loaded: false,
    reason: 'desktop-unavailable',
  });
}

export async function reloadNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_reload', payload, {
    reloaded: false,
    reason: 'desktop-unavailable',
  });
}

export async function goBackNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_go_back', payload, {
    ok: false,
    reason: 'desktop-unavailable',
  });
}

export async function goForwardNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_go_forward', payload, {
    ok: false,
    reason: 'desktop-unavailable',
  });
}

/** Best-effort navigation helpers used by the SPA toolbar. */
export async function navigateNativeBrowser(panelId, url) {
  return loadNativeBrowserUrl({ panelId, url });
}

/** Blur embed windows so SPA chrome can take mouse/keyboard focus. */
export async function releaseNativeBrowserFocus(payload = {}) {
  return invokeNativeBrowser('native_browser_release_focus', payload, { ok: false });
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
    reason: 'desktop-unavailable',
  });
}

export async function selectAllNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_select_all', payload, {
    supported: false,
    reason: 'desktop-unavailable',
  });
}

export async function copyNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_copy', payload, {
    supported: false,
    reason: 'desktop-unavailable',
  });
}

export async function closeNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_close', payload, {});
}

/**
 * Store avoid rects for a panel and re-apply host bounds.
 * Payload: `{ panelId, rects: [{x,y,width,height,source?}] }` (or `avoidRects`).
 * Fail-closed when no desktop runtime is available.
 */
export async function setNativeBrowserAvoidRects(payload = {}) {
  return invokeNativeBrowser('native_browser_set_avoid_rects', payload, {
    reason: 'desktop-unavailable',
  });
}

/**
 * Hide all native browser panels (keep logical bounds).
 * Payload: `{ reason? }`. Fail-closed on web.
 */
export async function hideAllNativeBrowsers(payload = {}) {
  return invokeNativeBrowser('native_browser_hide_all', payload, {
    hidden: false,
    reason: 'desktop-unavailable',
  });
}

/**
 * Show panels for a workspace; hide others. Pass `workspaceId: null` to restore all.
 * Fail-closed on web.
 */
export async function showNativeBrowsersForWorkspace(payload = {}) {
  return invokeNativeBrowser('native_browser_show_workspace', payload, {
    reason: 'desktop-unavailable',
  });
}

export async function subscribeNativeBrowserEvents() {
  if (!isNativeBrowserRuntimeAvailable()) {
    return () => {};
  }

  if (nativeBrowserUnlisten) {
    return nativeBrowserUnlisten;
  }

  if (isElectronDesktop()) {
    const unsub = await subscribeDesktopEvent(NATIVE_BROWSER_EVENT_NAME, (payload) => {
      if (!payload?.type) return;
      emitNativeBrowserEvent(payload);
    });
    nativeBrowserUnlisten = () => {
      unsub?.();
      nativeBrowserUnlisten = null;
    };
    return nativeBrowserUnlisten;
  }

  const unsub = await subscribeDesktopEvent(NATIVE_BROWSER_EVENT_NAME, (payload) => {
    if (!payload?.type) return;
    emitNativeBrowserEvent(payload);
  });
  nativeBrowserUnlisten = () => {
    unsub?.();
    nativeBrowserUnlisten = null;
  };

  return nativeBrowserUnlisten;
}
