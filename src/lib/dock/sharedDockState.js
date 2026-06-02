/* global module */
/**
 * sharedDockState.js — Pure helpers for the shared dock state.
 *
 * Phase 2 of pizarra-shared-view-state. Promotes the legacy
 * right-dock state into a single, TWM-owned slice keyed by
 * (projectId, workspaceId) with first-class `tabs` and
 * `activeTabId`. Both workspace and pizarra browser mounts read
 * from the same key so a tab added in one mode is visible in
 * the other.
 *
 * Side effects (localStorage I/O) are confined to functions
 * that take an explicit `storage` argument so the module is
 * trivially unit-testable. The hook layer (see
 * useSharedDockState.js) wires this to React state + cross-tab
 * `storage` events.
 *
 * Migration: on first read, legacy keys
 *   - `pizarra.dockState.v1_{projectId}_{workspaceId}`
 *   - `devhub.twm.dockState.v1_{projectId}_{workspaceId}`
 * are recognized, the raw value is copied to `<key>.bak` first,
 * then the merged state is written under the new key
 *   - `devhub_shared_dock_state_{projectId}_{workspaceId}`
 * and the legacy key is removed. The `.bak` is kept for 30 days
 * (cleanup is a later pass, out of scope for this change).
 *
 * Module shape follows the existing `rightDockState.js`
 * convention (CommonJS, JSDoc types, no React imports).
 */

const SHARED_DOCK_STATE_VERSION = 1;
const MAX_TABS_PER_SURFACE = 20;

const LEGACY_KEY_PREFIXES = [
  // Phase 1 spec draft: pizarra.dockState.v1_{p}_{w} — accept BOTH
  // the dot and underscore forms because both have been used
  // historically and we don't want a real user data loss.
  (projectId, workspaceId) =>
    `pizarra_dockState_v1_${projectId || 'global'}_${workspaceId || 'global'}`,
  (projectId, workspaceId) =>
    `pizarra.dockState.v1_${projectId || 'global'}_${workspaceId || 'global'}`,
  // Internal TWM prototype key from the WIP reconciliation.
  (projectId, workspaceId) =>
    `devhub_twm_dockState_v1_${projectId || 'global'}_${workspaceId || 'global'}`,
  (projectId, workspaceId) =>
    `devhub.twm.dockState.v1_${projectId || 'global'}_${workspaceId || 'global'}`,
];

const DEFAULT_SHARED_DOCK_STATE = Object.freeze({
  // Tab list lives at the top level (single browser surface per
  // workspace for now; multi-surface is a future concern). Both
  // workspace and pizarra browser mounts read this same array.
  tabs: [],
  activeTabId: null,
  // The `tabCap` is exposed for UI to disable the "+" button.
  tabCap: MAX_TABS_PER_SURFACE,
  // The most recent URL the user navigated to. Persists across
  // the brief RAF that follows a tab close (the next openTab can
  // seed the address bar with the prior URL).
  browserUrl: 'http://localhost:3200/',
  browserHistory: ['http://localhost:3200/'],
  // version is bumped whenever the on-disk shape changes
  // incompatibly; migrateDockState uses it to short-circuit.
  version: SHARED_DOCK_STATE_VERSION,
});

function buildSharedDockStorageKey(projectId, workspaceId) {
  // When neither is provided, fall back to a single "global"
  // suffix. When only one is provided, omit the second separator.
  if (!projectId && !workspaceId) return 'devhub_shared_dock_state_global';
  if (!workspaceId) return `devhub_shared_dock_state_${projectId}`;
  return `devhub_shared_dock_state_${projectId}_${workspaceId}`;
}

function buildSharedDockBakKey(projectId, workspaceId) {
  return `${buildSharedDockStorageKey(projectId, workspaceId)}.bak`;
}

function generateTabId() {
  // RFC 4122 v4 UUID-ish — collision-resistant without bringing
  // in a dependency. We use `Math.random` for entropy because this
  // runs in the browser, not Node crypto.
  return 'tab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function sanitizeTab(rawTab, index = 0) {
  if (!rawTab || typeof rawTab !== 'object') return null;
  const id = String(rawTab.id || `tab-${index}`).slice(0, 128);
  const url = String(rawTab.url || '').slice(0, 2048);
  const label = String(rawTab.label || url).slice(0, 256);
  return {
    id,
    url,
    label,
    favicon: typeof rawTab.favicon === 'string' ? rawTab.favicon.slice(0, 2048) : '',
    loadingState:
      rawTab.loadingState === 'loading' || rawTab.loadingState === 'failed'
        ? rawTab.loadingState
        : 'idle',
    isActive: rawTab.isActive === true,
    canClose: rawTab.canClose !== false,
  };
}

function sanitizeSharedDockState(rawState = {}) {
  const source = rawState && typeof rawState === 'object' ? rawState : {};
  const rawTabs = Array.isArray(source.tabs) ? source.tabs : [];
  const sanitizedTabs = rawTabs
    .map((t, i) => sanitizeTab(t, i))
    .filter(Boolean)
    .slice(0, MAX_TABS_PER_SURFACE);
  const activeTabId =
    typeof source.activeTabId === 'string' && sanitizedTabs.find((t) => t.id === source.activeTabId)
      ? source.activeTabId
      : null;
  // Re-derive isActive from activeTabId to keep the two fields
  // consistent. If the stored activeTabId doesn't match any tab
  // and there are tabs, mark the first one active.
  const tabsWithActive = sanitizedTabs.map((t) => ({ ...t, isActive: t.id === activeTabId }));
  if (!activeTabId && tabsWithActive.length > 0) {
    tabsWithActive[0].isActive = true;
  }
  const browserUrl =
    typeof source.browserUrl === 'string' && source.browserUrl
      ? source.browserUrl.slice(0, 2048)
      : DEFAULT_SHARED_DOCK_STATE.browserUrl;
  const browserHistory = Array.isArray(source.browserHistory)
    ? source.browserHistory.filter((u) => typeof u === 'string').slice(0, 50)
    : [browserUrl];
  return {
    tabs: tabsWithActive,
    activeTabId: activeTabId || (tabsWithActive[0] ? tabsWithActive[0].id : null),
    tabCap: MAX_TABS_PER_SURFACE,
    browserUrl,
    browserHistory: browserHistory.length ? browserHistory : [browserUrl],
    version: SHARED_DOCK_STATE_VERSION,
  };
}

function readSharedDockState(storage, projectId, workspaceId) {
  if (!storage || typeof storage.getItem !== 'function') {
    return sanitizeSharedDockState(DEFAULT_SHARED_DOCK_STATE);
  }
  try {
    const raw = storage.getItem(buildSharedDockStorageKey(projectId, workspaceId));
    if (!raw) return sanitizeSharedDockState(DEFAULT_SHARED_DOCK_STATE);
    return sanitizeSharedDockState(JSON.parse(raw));
  } catch {
    return sanitizeSharedDockState(DEFAULT_SHARED_DOCK_STATE);
  }
}

function writeSharedDockState(storage, projectId, workspaceId, state) {
  if (!storage || typeof storage.setItem !== 'function') return;
  const sanitized = sanitizeSharedDockState(state);
  try {
    storage.setItem(buildSharedDockStorageKey(projectId, workspaceId), JSON.stringify(sanitized));
  } catch {
    // localStorage quota or serialization failure — silent.
    // Caller can re-read on next mount.
  }
}

function mergeDockState(pizarra, rightDock) {
  // When both legacy payloads are present, pizarra wins on the
  // tab list (pizarra is the consumer that needed the upgrade).
  // When only one is present, use it. When neither, defaults.
  const pizarraSanitized = pizarra ? sanitizeSharedDockState(pizarra) : null;
  const rightSanitized = rightDock ? sanitizeSharedDockState(rightDock) : null;
  if (pizarraSanitized && (pizarraSanitized.tabs.length > 0 || pizarraSanitized.activeTabId)) {
    return pizarraSanitized;
  }
  if (rightSanitized) return rightSanitized;
  return sanitizeSharedDockState(DEFAULT_SHARED_DOCK_STATE);
}

function migrateDockState(storage, projectId, workspaceId) {
  if (!storage || typeof storage.getItem !== 'function') {
    return sanitizeSharedDockState(DEFAULT_SHARED_DOCK_STATE);
  }
  const newKey = buildSharedDockStorageKey(projectId, workspaceId);
  // If the new key already exists, this is a re-mount — short-circuit.
  if (storage.getItem(newKey)) {
    return readSharedDockState(storage, projectId, workspaceId);
  }

  // Gather legacy payloads. We tolerate the "v1" and the dot
  // notation interchangeably; both shapes are equivalent for our
  // purposes (same JSON inside).
  const legacyPayloads = [];
  for (const prefix of LEGACY_KEY_PREFIXES) {
    const key = prefix(projectId, workspaceId);
    const raw = storage.getItem(key);
    if (raw == null) continue;
    legacyPayloads.push({ key, raw });
  }
  if (legacyPayloads.length === 0) {
    return sanitizeSharedDockState(DEFAULT_SHARED_DOCK_STATE);
  }

  // 1) Back up every legacy payload before any write.
  for (const { key, raw } of legacyPayloads) {
    try {
      storage.setItem(`${key}.bak`, raw);
    } catch {
      // ignore backup failure — we'll still attempt the migration.
    }
  }

  // 2) Parse each payload, fall back to {} on corruption.
  const parsed = legacyPayloads.map(({ key, raw }) => {
    try {
      return { key, value: JSON.parse(raw) };
    } catch (err) {
      console.error(
        '[sharedDockState] corrupt legacy payload at',
        key,
        '— preserving raw .bak and falling back to defaults. Error:',
        err && err.message
      );
      return { key, value: null };
    }
  });

  // 3) Merge all parsed payloads (last wins on tab list, pizarra wins on conflict).
  let merged = sanitizeSharedDockState(DEFAULT_SHARED_DOCK_STATE);
  for (const { value } of parsed) {
    if (value && typeof value === 'object') {
      merged = mergeDockState(merged, value);
    }
  }

  // 4) Write the new key, verify, then purge legacy.
  writeSharedDockState(storage, projectId, workspaceId, merged);
  const rehydrated = readSharedDockState(storage, projectId, workspaceId);
  if (rehydrated) {
    for (const { key } of legacyPayloads) {
      try {
        storage.removeItem(key);
      } catch {
        // ignore — keep the legacy around if the platform can't
        // remove it; the next mount will short-circuit because
        // the new key exists.
      }
    }
  }
  return rehydrated;
}

module.exports = {
  DEFAULT_SHARED_DOCK_STATE,
  MAX_TABS_PER_SURFACE,
  SHARED_DOCK_STATE_VERSION,
  buildSharedDockStorageKey,
  buildSharedDockBakKey,
  generateTabId,
  sanitizeTab,
  sanitizeSharedDockState,
  readSharedDockState,
  writeSharedDockState,
  mergeDockState,
  migrateDockState,
};
