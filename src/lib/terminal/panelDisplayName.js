/**
 * panelDisplayName.js — per-workspace displayName persistence.
 *
 * Storage layer for the per-panel human-readable name rendered on the tab.
 * Backed by:
 *   - a module-level Map<workspaceId, Map<panelId, string>> (in-memory cache)
 *   - window.localStorage under the key `devhub:panel-names:${workspaceId}`
 *
 * SSR contract: every storage read/write guards `typeof window !== 'undefined'`.
 *
 * Validator: `^[a-zA-Z0-9_-]{1,24}$`. Lookup is case-insensitive (lowercased
 * comparison), but the stored value preserves the user-typed casing.
 *
 * No React, no I/O outside localStorage. Pool acquisition is delegated to
 * `displayNamePool.js` via `nextDisplayNameForPanel`.
 */

const { acquire: acquireFromPool } = require('./displayNamePool');

const DISPLAY_NAME_VALIDATOR_RE = /^[a-zA-Z0-9_-]{1,24}$/;

const STORAGE_KEY_PREFIX = 'devhub:panel-names:';

const workspaceMap = new Map();

function panelDisplayNameStorageKey(workspaceId) {
  return `${STORAGE_KEY_PREFIX}${workspaceId}`;
}

function safeParse(json) {
  if (typeof json !== 'string' || json.length === 0) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function loadFromStorage(workspaceId) {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(panelDisplayNameStorageKey(workspaceId));
    return safeParse(raw);
  } catch {
    return {};
  }
}

function writeToStorage(workspaceId, map) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      panelDisplayNameStorageKey(workspaceId),
      JSON.stringify(map)
    );
  } catch {
    // Best-effort — quota / private-mode failures are swallowed.
  }
}

function mapFor(workspaceId) {
  let m = workspaceMap.get(workspaceId);
  if (m) return m;
  const stored = loadFromStorage(workspaceId);
  m = new Map(Object.entries(stored));
  workspaceMap.set(workspaceId, m);
  return m;
}

function getDisplayName(panelId, workspaceId) {
  if (typeof panelId !== 'string' || typeof workspaceId !== 'string') {
    return null;
  }
  const m = mapFor(workspaceId);
  return m.get(panelId) || null;
}

function setDisplayName(panelId, workspaceId, name) {
  if (typeof panelId !== 'string' || panelId.length === 0) {
    return { ok: false, error: 'invalid-name' };
  }
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
    return { ok: false, error: 'invalid-name' };
  }
  if (typeof name !== 'string') {
    return { ok: false, error: 'empty-name' };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'empty-name' };
  }
  if (!DISPLAY_NAME_VALIDATOR_RE.test(trimmed)) {
    return { ok: false, error: 'invalid-name' };
  }

  const m = mapFor(workspaceId);
  const wanted = trimmed.toLowerCase();
  for (const [otherId, otherName] of m.entries()) {
    if (otherId !== panelId && otherName.toLowerCase() === wanted) {
      return { ok: false, error: 'name-in-use' };
    }
  }

  m.set(panelId, trimmed);
  writeToStorage(workspaceId, Object.fromEntries(m));
  return { ok: true };
}

function removeDisplayName(panelId, workspaceId) {
  if (typeof panelId !== 'string' || typeof workspaceId !== 'string') {
    return { ok: false };
  }
  const m = mapFor(workspaceId);
  m.delete(panelId);
  writeToStorage(workspaceId, Object.fromEntries(m));
  return { ok: true };
}

function usedNamesInWorkspace(workspaceId) {
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
    return new Set();
  }
  const stored = loadFromStorage(workspaceId);
  const names = Object.values(stored).filter((n) => typeof n === 'string');
  return new Set(names.map((n) => n.toLowerCase()));
}

function nextDisplayNameForPanel(workspaceId) {
  return acquireFromPool(usedNamesInWorkspace(workspaceId));
}

module.exports = {
  DISPLAY_NAME_VALIDATOR_RE,
  panelDisplayNameStorageKey,
  getDisplayName,
  setDisplayName,
  removeDisplayName,
  usedNamesInWorkspace,
  nextDisplayNameForPanel,
};
