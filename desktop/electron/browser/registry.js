'use strict';

/**
 * Native dock browser — WebContentsView siblings .
 *
 * Why not child BrowserWindow?
 * Child windows flicker on workspace switch and alt-tab (hide/show + OS focus).
 * Keeps web blocks as WebContentsView in the same BaseWindow contentView:
 * only setBounds / setVisible — no second OS window.
 *
 * Visibility rules:
 * - Never destroy on workspace switch (keep warm).
 * - Off-workspace: setVisible(false) + zero bounds (no hide/show of OS windows).
 * - showWorkspace is a pure filter — no hideAll pre-pass that blanks everything.
 * - setBounds is skipped when rect unchanged (stops thrash).
 */

const { WebContentsView } = require('electron');
const {
  normalizeBounds,
  clampBoundsToContent,
  boundsEqual,
  defaultSpikeBounds,
} = require('./bounds');
const { normalizeAvoidRects, applyAvoidRects } = require('./avoidRects');
const { ensureSpaIsBottom, layoutSpaView } = require('../window');

const DEFAULT_PARTITION = 'persist:devhub-browser-dock';
//  park: keep full size off-screen (NOT 0×0 — zero bounds cause compositor flash
// and sometimes "lost" views after alt-tab).
const OFFSCREEN = { x: -15000, y: -15000 };

function createBrowserRegistry({ getMainWindow, sendEvent }) {
  /** @type {Map<string, any>} */
  const panels = new Map();

  let bulkHidden = false;
  const visibilitySnapshot = new Map();
  let activeWorkspaceFilter = null;
  let parentSyncAttached = false;

  function emit(panelId, type, extra = {}) {
    if (typeof sendEvent === 'function') {
      sendEvent({ panelId, type, ...extra });
    }
  }

  function contentSize() {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return { width: 0, height: 0 };
    try {
      const [width, height] = win.getContentSize();
      return { width, height };
    } catch {
      return { width: 0, height: 0 };
    }
  }

  function isEffectivelyVisible(entry) {
    return Boolean(entry.visible) && !entry.workspaceHidden && !bulkHidden && !entry.avoidHidden;
  }

  function entryMatchesWorkspace(panelId, entry, workspaceId) {
    if (workspaceId == null || workspaceId === '') return true;
    const ws = String(workspaceId);
    if (entry.workspaceId != null && entry.workspaceId !== '') {
      return String(entry.workspaceId) === ws;
    }
    return String(panelId).endsWith(`-${ws}`);
  }

  function applyViewBounds(view, rect) {
    if (!view) return;
    try {
      view.setBounds(rect);
    } catch (err) {
      console.warn('[DevHub Electron] setBounds failed', err?.message || err);
    }
  }

  /** Park off-screen at full size . */
  function offscreenRect(size) {
    const w = Math.max(100, Math.round(size?.width || contentSize().width || 800));
    const h = Math.max(100, Math.round(size?.height || contentSize().height || 600));
    return { x: OFFSCREEN.x, y: OFFSCREEN.y, width: w, height: h };
  }

  /**
   * Attach once at open. Do NOT remove/add on every bounds update .
   */
  function attachBrowserViewOnce(entry) {
    const win = getMainWindow();
    if (!win || win.isDestroyed() || !entry?.view || entry._attached) return;
    try {
      ensureSpaIsBottom(win);
      win.contentView.addChildView(entry.view);
      entry._attached = true;
    } catch (err) {
      console.warn('[DevHub Electron] attachBrowserViewOnce', err?.message || err);
    }
  }

  function applyBounds(entry, bounds) {
    const clamped = clampBoundsToContent(bounds || entry.bounds, contentSize());
    if (!clamped) return entry.bounds;
    entry.bounds = clamped;

    const result = applyAvoidRects(entry.bounds, entry.avoidRects || []);
    entry.avoidHidden = Boolean(result.hide);

    const show =
      isEffectivelyVisible(entry) &&
      result.effectiveBounds &&
      result.effectiveBounds.width >= 2 &&
      result.effectiveBounds.height >= 2;

    // On-screen: dock bounds. Off-screen: park (full size, far away) — NOT 0×0.
    const nextRect = show
      ? result.effectiveBounds
      : offscreenRect(result.effectiveBounds || entry.bounds || contentSize());

    // Skip no-op .
    if (
      entry._lastApplied &&
      boundsEqual(entry._lastApplied, nextRect) &&
      entry._lastShown === show
    ) {
      return entry.bounds;
    }
    entry._lastApplied = { ...nextRect };
    entry._lastShown = show;

    applyViewBounds(entry.view, nextRect);
    // Prefer not calling setVisible(false) — off-screen is enough and alt-tab safer.
    // Only use setVisible if the API exists and we need to force compositor update once.
    try {
      if (typeof entry.view.setVisible === 'function' && entry._lastSetVisible !== true) {
        entry.view.setVisible(true);
        entry._lastSetVisible = true;
      }
    } catch {
      /* ignore */
    }

    return entry.bounds;
  }

  function syncAllPositions({ force = false } = {}) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      try {
        layoutSpaView(win, win.__devhubSpaView);
      } catch {
        /* ignore */
      }
    }
    for (const [, entry] of panels) {
      if (force) entry._lastApplied = null;
      applyBounds(entry, entry.bounds);
    }
  }

  function attachParentSync() {
    if (parentSyncAttached) return;
    const parent = getMainWindow();
    if (!parent || parent.isDestroyed()) return;
    parentSyncAttached = true;

    let lastContent = { width: 0, height: 0 };
    let timer = null;
    const scheduleSync = (force = false) => {
      if (timer != null) return;
      timer = setTimeout(() => {
        timer = null;
        const size = contentSize();
        const sizeChanged = size.width !== lastContent.width || size.height !== lastContent.height;
        lastContent = size;
        // resize only repositions; focus/show without size change = no-op.
        if (force || sizeChanged) {
          syncAllPositions({ force: true });
        }
      }, 16);
    };

    parent.on('resize', () => scheduleSync(true));
    parent.on('resized', () => scheduleSync(true));
    parent.on('maximize', () => scheduleSync(true));
    parent.on('unmaximize', () => scheduleSync(true));
    parent.on('restore', () => scheduleSync(true));
    // Alt-tab: Do nothing to views on blur/focus. Do not hide/show.
    parent.on('focus', () => {
      // Optional: re-assert on-screen bounds if compositor desynced (no hide cycle).
      scheduleSync(false);
    });
    parent.on('closed', () => {
      disposeAll();
      parentSyncAttached = false;
    });
    parent.on('devhub-content-resize', () => scheduleSync(true));
  }

  function attachListeners(panelId, view) {
    const wc = view.webContents;
    wc.on('did-navigate', (_e, url) => {
      const entry = panels.get(panelId);
      if (entry) entry.url = url;
      emit(panelId, 'navigated', { url });
    });
    wc.on('did-navigate-in-page', (_e, url) => {
      const entry = panels.get(panelId);
      if (entry) entry.url = url;
      emit(panelId, 'navigated', { url });
    });
    wc.on('page-title-updated', (_e, title) => emit(panelId, 'title', { title }));
    wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
      emit(panelId, 'fail-load', { errorCode, errorDescription, url: validatedURL });
    });
    wc.on('did-finish-load', () => emit(panelId, 'loaded', { url: wc.getURL() }));
  }

  function resolvePartition(panelId, request) {
    if (request.isolateProfile === true) return `persist:devhub-browser-${panelId}`;
    if (request.partition && typeof request.partition === 'string') return request.partition;
    return DEFAULT_PARTITION;
  }

  function storeAvoidRectsFromRequest(entry, request) {
    if (Array.isArray(request.avoidRects)) {
      entry.avoidRects = normalizeAvoidRects(request.avoidRects);
    } else if (Array.isArray(request.rects)) {
      entry.avoidRects = normalizeAvoidRects(request.rects);
    } else if (Array.isArray(request.avoid_rects)) {
      entry.avoidRects = normalizeAvoidRects(request.avoid_rects);
    }
  }

  function probe() {
    return {
      ready: true,
      reason: null,
      persistentProfile: true,
      capabilities: {
        host: 'electron-web-contents-view',
        multiPanel: true,
        goBack: true,
        goForward: true,
      },
    };
  }

  function open(request = {}) {
    const panelId = String(request.panelId || '');
    if (!panelId) return { opened: false, reason: 'missing-panel-id' };

    const win = getMainWindow();
    if (!win || win.isDestroyed()) return { opened: false, reason: 'missing-main-window' };

    attachParentSync();

    const url = request.url ? String(request.url) : 'about:blank';
    const bounds =
      normalizeBounds(request.bounds) ||
      (panels.get(panelId)?.bounds ? panels.get(panelId).bounds : defaultSpikeBounds());

    let entry = panels.get(panelId);
    if (!entry) {
      const partition = resolvePartition(panelId, request);
      const view = new WebContentsView({
        webPreferences: {
          partition,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        },
      });
      try {
        view.setBackgroundColor('#ffffff');
      } catch {
        /* ignore */
      }

      const workspaceId =
        request.workspaceId != null && request.workspaceId !== ''
          ? String(request.workspaceId)
          : null;

      entry = {
        view,
        bounds,
        visible: true,
        workspaceHidden: false,
        avoidHidden: false,
        avoidRects: [],
        workspaceId,
        partition,
        url: '',
        _lastApplied: null,
        _lastShown: null,
      };
      panels.set(panelId, entry);
      attachBrowserViewOnce(entry);
      // Start off-screen until bounds applied .
      applyViewBounds(view, offscreenRect(bounds));
      attachListeners(panelId, view);
    } else if (request.workspaceId != null && request.workspaceId !== '') {
      entry.workspaceId = String(request.workspaceId);
    }

    if (activeWorkspaceFilter != null) {
      entry.workspaceHidden = !entryMatchesWorkspace(panelId, entry, activeWorkspaceFilter);
    } else {
      entry.workspaceHidden = false;
    }

    if (bulkHidden) {
      bulkHidden = false;
      visibilitySnapshot.clear();
    }

    storeAvoidRectsFromRequest(entry, request);
    entry.visible = request.visible !== false;
    entry._lastApplied = null;
    applyBounds(entry, bounds);

    if (url && url !== entry.url) {
      entry.url = url;
      entry.view.webContents.loadURL(url).catch((err) => {
        emit(panelId, 'fail-load', {
          errorDescription: err?.message || String(err),
          url,
        });
      });
    }

    setTimeout(() => {
      if (!panels.has(panelId)) return;
      const e = panels.get(panelId);
      e._lastApplied = null;
      applyBounds(e, e.bounds);
    }, 32);

    return {
      opened: true,
      reason: null,
      bounds: entry.bounds,
      workspaceId: entry.workspaceId,
      effectivelyVisible: isEffectivelyVisible(entry),
      host: 'electron-web-contents-view',
    };
  }

  function loadUrl(request = {}) {
    const entry = panels.get(String(request.panelId || ''));
    if (!entry) return { loaded: false, reason: 'panel-not-found' };
    const url = String(request.url || '');
    if (!url) return { loaded: false, reason: 'missing-url' };
    entry.url = url;
    entry.view.webContents.loadURL(url).catch(() => {});
    return { loaded: true, reason: null };
  }

  function reload(request = {}) {
    const entry = panels.get(String(request.panelId || ''));
    if (!entry) return { reloaded: false, reason: 'panel-not-found' };
    entry.view.webContents.reload();
    return { reloaded: true, reason: null };
  }

  function goBack(request = {}) {
    const entry = panels.get(String(request.panelId || ''));
    if (!entry) return { ok: false, reason: 'panel-not-found' };
    const wc = entry.view.webContents;
    if (wc.canGoBack()) {
      wc.goBack();
      return { ok: true, navigated: true };
    }
    return { ok: true, navigated: false, reason: 'no-history-back' };
  }

  function goForward(request = {}) {
    const entry = panels.get(String(request.panelId || ''));
    if (!entry) return { ok: false, reason: 'panel-not-found' };
    const wc = entry.view.webContents;
    if (wc.canGoForward()) {
      wc.goForward();
      return { ok: true, navigated: true };
    }
    return { ok: true, navigated: false, reason: 'no-history-forward' };
  }

  function resize(request = {}) {
    const entry = panels.get(String(request.panelId || ''));
    if (!entry) return { reason: 'panel-not-found' };
    const next = normalizeBounds(request.bounds);
    if (!next) return { reason: 'missing-bounds' };
    storeAvoidRectsFromRequest(entry, request);
    applyBounds(entry, next);
    return {
      bounds: entry.bounds,
      avoidHidden: entry.avoidHidden,
      visible: isEffectivelyVisible(entry),
    };
  }

  function focus(request = {}) {
    const entry = panels.get(String(request.panelId || ''));
    if (!entry) return { reason: 'panel-not-found' };
    try {
      if (isEffectivelyVisible(entry)) {
        entry.view.webContents.focus();
      }
    } catch {
      /* ignore */
    }
    return {};
  }

  function raise(request = {}) {
    const entry = panels.get(String(request.panelId || ''));
    if (!entry) return { reason: 'panel-not-found' };
    // No remove/add z-order thrash .
    if (isEffectivelyVisible(entry)) {
      entry._lastApplied = null;
      applyBounds(entry, entry.bounds);
      try {
        entry.view.webContents.focus();
      } catch {
        /* ignore */
      }
    }
    return {};
  }

  function setVisibility(request = {}) {
    const panelId = String(request.panelId || '');
    const entry = panels.get(panelId);
    if (!entry) return { reason: 'panel-not-found' };
    storeAvoidRectsFromRequest(entry, request);
    if (request.bounds) {
      const next = normalizeBounds(request.bounds);
      if (next) entry.bounds = next;
    }
    if (request.visible !== false) {
      if (activeWorkspaceFilter != null) {
        entry.workspaceHidden = !entryMatchesWorkspace(panelId, entry, activeWorkspaceFilter);
      } else {
        entry.workspaceHidden = false;
      }
      if (bulkHidden) {
        bulkHidden = false;
        visibilitySnapshot.clear();
      }
    }
    entry.visible = request.visible !== false;
    entry._lastApplied = null;
    applyBounds(entry, entry.bounds);
    return {
      visible: isEffectivelyVisible(entry),
      desiredVisible: entry.visible,
      bounds: entry.bounds,
    };
  }

  function close(request = {}) {
    const panelId = String(request.panelId || '');
    const entry = panels.get(panelId);
    if (!entry) return {};
    const win = getMainWindow();
    try {
      if (win && !win.isDestroyed()) {
        win.contentView.removeChildView(entry.view);
      }
    } catch {
      /* ignore */
    }
    try {
      if (!entry.view.webContents.isDestroyed()) {
        entry.view.webContents.close();
      }
    } catch {
      try {
        entry.view.webContents.destroy();
      } catch {
        /* ignore */
      }
    }
    panels.delete(panelId);
    visibilitySnapshot.delete(panelId);
    return {};
  }

  function setAvoidRects(request = {}) {
    const panelId = String(request.panelId || '');
    const entry = panels.get(panelId);
    if (!entry) return { reason: 'panel-not-found' };
    const rects = Array.isArray(request.rects)
      ? request.rects
      : Array.isArray(request.avoidRects)
        ? request.avoidRects
        : [];
    entry.avoidRects = normalizeAvoidRects(rects);
    entry._lastApplied = null;
    applyBounds(entry, entry.bounds);
    return {
      panelId,
      rectCount: entry.avoidRects.length,
      avoidHidden: entry.avoidHidden,
      bounds: entry.bounds,
      visible: isEffectivelyVisible(entry),
    };
  }

  /** Soft bulk hide — setVisible false, keep views warm. */
  function hideAll(request = {}) {
    if (!bulkHidden) {
      visibilitySnapshot.clear();
      for (const [id, entry] of panels) {
        visibilitySnapshot.set(id, entry.visible);
      }
    }
    bulkHidden = true;
    for (const [, entry] of panels) {
      entry._lastApplied = null;
      applyBounds(entry, entry.bounds);
    }
    return { hidden: true, count: panels.size, reason: request.reason || null };
  }

  /**
   * Workspace filter ( show-filter):
   * - Matching → on-screen bounds
   * - Others → off-screen full-size park (no destroy, no setVisible thrash)
   * Matching panels that were already on-screen keep bounds if unchanged.
   */
  function showWorkspace(request = {}) {
    const raw = request.workspaceId;
    const workspaceId = raw == null || raw === '' ? null : String(raw);

    bulkHidden = false;

    if (workspaceId === null) {
      activeWorkspaceFilter = null;
      for (const [panelId, entry] of panels) {
        if (visibilitySnapshot.has(panelId)) {
          entry.visible = visibilitySnapshot.get(panelId);
        }
        entry.workspaceHidden = false;
        entry._lastApplied = null;
        applyBounds(entry, entry.bounds);
      }
      visibilitySnapshot.clear();
      return { workspaceId: null, shown: panels.size, restored: true };
    }

    // Coalesce: if filter already this workspace, only re-apply deltas.
    const filterChanged = activeWorkspaceFilter !== workspaceId;
    activeWorkspaceFilter = workspaceId;
    visibilitySnapshot.clear();

    let shown = 0;
    for (const [panelId, entry] of panels) {
      const match = entryMatchesWorkspace(panelId, entry, workspaceId);
      const wasHidden = entry.workspaceHidden;
      entry.workspaceHidden = !match;
      if (filterChanged || wasHidden !== entry.workspaceHidden) {
        entry._lastApplied = null;
      }
      applyBounds(entry, entry.bounds);
      if (isEffectivelyVisible(entry)) shown += 1;
    }

    return { workspaceId, shown, total: panels.size };
  }

  function selectorCommand() {
    return { supported: false, reason: 'selector-deferred' };
  }

  function selectAll(request = {}) {
    const entry = panels.get(String(request.panelId || ''));
    if (!entry) return { supported: false, reason: 'panel-not-found' };
    try {
      entry.view.webContents.selectAll();
      return { supported: true };
    } catch {
      return { supported: false, reason: 'select-all-failed' };
    }
  }

  function copy(request = {}) {
    const entry = panels.get(String(request.panelId || ''));
    if (!entry) return { supported: false, reason: 'panel-not-found' };
    try {
      entry.view.webContents.copy();
      return { supported: true };
    } catch {
      return { supported: false, reason: 'copy-failed' };
    }
  }

  function releaseFocus() {
    const win = getMainWindow();
    try {
      win?.webContents?.focus?.();
    } catch {
      /* ignore */
    }
    return { ok: true };
  }

  function disposeAll() {
    for (const panelId of [...panels.keys()]) {
      close({ panelId });
    }
  }

  return {
    probe,
    open,
    loadUrl,
    reload,
    goBack,
    goForward,
    resize,
    focus,
    raise,
    setVisibility,
    close,
    setAvoidRects,
    hideAll,
    showWorkspace,
    selectorCommand,
    selectAll,
    copy,
    releaseFocus,
    disposeAll,
    syncAllPositions,
    _debugPanelCount: () => panels.size,
  };
}

module.exports = { createBrowserRegistry, DEFAULT_PARTITION };
