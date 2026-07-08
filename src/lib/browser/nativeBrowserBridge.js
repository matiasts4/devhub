'use client';
/* global require */

let nativeBrowserUnlisten = null;
let nativeBrowserStartupSweepPromise = null;

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
  return invokeNativeBrowser('native_browser_resize', payload, {
    reason: 'tauri-unavailable',
  });
}

// Live gesture path: at most one in-flight resize per panel, always applying the
// latest pending bounds. Without this, mousemove floods IPC and WebView2 only
// catches up on mouseup (feels like "reload after resize").
const liveResizePending = Object.create(null);
const liveResizeInflight = Object.create(null);
const liveResizeRaf = Object.create(null);

async function drainLiveResize(panelId) {
  if (liveResizeInflight[panelId]) return liveResizeInflight[panelId];

  liveResizeInflight[panelId] = (async () => {
    let last = {};
    try {
      while (liveResizePending[panelId]) {
        const req = liveResizePending[panelId];
        delete liveResizePending[panelId];
        // Live path: one IPC. set_visibility(bounds) already set_position/set_size
        // on the embedded WebView2; a prior resize+visibility pair doubled latency
        // and made mid-drag follow feel like mouseup-only.
        if (req.bounds) {
          last = await invokeNativeBrowser(
            'native_browser_set_visibility',
            {
              panelId,
              visible: true,
              bounds: req.bounds,
              avoidRects: req.avoidRects,
            },
            { reason: 'tauri-unavailable' }
          );
        } else {
          last = await invokeNativeBrowser('native_browser_resize', req, {
            reason: 'tauri-unavailable',
          });
        }
      }
    } finally {
      delete liveResizeInflight[panelId];
    }
    return last;
  })();

  return liveResizeInflight[panelId];
}

/**
 * Coalesce live HWND moves/resizes to ~1 IPC per animation frame (latest wins).
 * Prefer this during drag/splitter; use resizeNativeBrowser for awaited open/settle.
 */
export function scheduleNativeBrowserResize(payload = {}) {
  const panelId = payload?.panelId;
  if (!panelId || !payload?.bounds) {
    return Promise.resolve({ reason: 'missing-bounds' });
  }

  liveResizePending[panelId] = payload;

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    if (liveResizeRaf[panelId] == null) {
      liveResizeRaf[panelId] = window.requestAnimationFrame(() => {
        liveResizeRaf[panelId] = null;
        drainLiveResize(panelId).catch(() => {});
      });
    }
    return liveResizeInflight[panelId] || Promise.resolve({});
  }

  return drainLiveResize(panelId);
}

/** Cancel pending rAF and push the final bounds immediately (mouseup / drag-end). */
export async function flushNativeBrowserResize(payload = {}) {
  const panelId = payload?.panelId;
  if (!panelId) return { reason: 'missing-panel-id' };

  if (typeof window !== 'undefined' && liveResizeRaf[panelId] != null) {
    window.cancelAnimationFrame(liveResizeRaf[panelId]);
    liveResizeRaf[panelId] = null;
  }
  if (payload?.bounds) {
    liveResizePending[panelId] = payload;
  }
  return drainLiveResize(panelId);
}

export async function focusNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_focus', payload, {
    reason: 'tauri-unavailable',
  });
}

export async function raiseNativeBrowser(payload = {}) {
  return invokeNativeBrowser('native_browser_raise', payload, {
    reason: 'tauri-unavailable',
  });
}

export async function setNativeBrowserVisibility(payload = {}) {
  return invokeNativeBrowser('native_browser_set_visibility', payload, {
    reason: 'tauri-unavailable',
  });
}

/** Notify React surfaces that Rust closed a panel outside the lease (dock-not-browser, etc.). */
export function emitNativeBrowserClosed(panelId, reason = 'external-close') {
  if (!hasWindow() || !panelId) return;
  const BrowserEvent = window.CustomEvent || CustomEvent;
  window.dispatchEvent(
    new BrowserEvent('devhub:native-browser-closed', {
      detail: { panelId, reason },
    })
  );
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

export async function purgeOrphanNativeBrowsers() {
  return invokeNativeBrowser('native_browser_purge_orphans', {}, { purged: 0 });
}

// ponytail: surface may await before anyone schedules. Keep one deferred gate so open
// never races a late purge/close (TWM used to purge outside this promise → black dock).
let nativeBrowserStartupSweepStarted = false;
let nativeBrowserStartupSweepResolve = null;

function getOrCreateStartupSweepGate() {
  if (!nativeBrowserStartupSweepPromise) {
    nativeBrowserStartupSweepPromise = new Promise((resolve) => {
      nativeBrowserStartupSweepResolve = resolve;
    });
  }
  return nativeBrowserStartupSweepPromise;
}

function finishStartupSweepGate() {
  nativeBrowserStartupSweepResolve?.();
  nativeBrowserStartupSweepResolve = null;
}

/** One-shot sweep before first embedded open (orphan WebView2 from prior session). */
export function scheduleNativeBrowserStartupSweep(runSweep) {
  const gate = getOrCreateStartupSweepGate();
  if (nativeBrowserStartupSweepStarted) return gate;
  nativeBrowserStartupSweepStarted = true;

  if (!isNativeBrowserRuntimeAvailable()) {
    finishStartupSweepGate();
    return gate;
  }

  Promise.resolve()
    .then(() => runSweep?.())
    .catch(() => {})
    .finally(() => {
      finishStartupSweepGate();
    });
  return gate;
}

export async function awaitNativeBrowserStartupSweep({ timeoutMs = 0 } = {}) {
  if (!isNativeBrowserRuntimeAvailable()) return;
  // Wait even if schedule has not run yet — open must not beat the purge.
  // Default timeoutMs=0: no bypass. Tests may pass a positive timeout.
  const gate = getOrCreateStartupSweepGate();
  if (!timeoutMs || timeoutMs <= 0) {
    await gate;
    return;
  }
  await Promise.race([
    gate,
    new Promise((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
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
