/**
 * Workspace-scoped localStorage cleanup.
 *
 * Workspace IDs are sequential (`ws1`, `ws2`, …). Closing a workspace used to
 * drop only React state; right-dock / browser / pizarra keys stayed under the
 * same id. Re-creating `ws2` after restart then revived WordPress, pizarra
 * mode, old surfaces, etc. These helpers purge and prune that bleed.
 */

/* eslint-env node */
/* global require, module */

const {
  buildRightDockStorageKey,
  buildFreshRightDockState,
  writeRightDockState,
} = require('./rightDockState');
const {
  buildBrowserWindowStorageKey,
  readBrowserWindowStates,
  writeBrowserWindowStates,
} = require('./browserWindowState');

const SURFACE_STORAGE_KEY_PREFIX = 'devhub_pizarra_surfaces_';

function buildSurfaceStorageKey(projectId, workspaceId) {
  return `${SURFACE_STORAGE_KEY_PREFIX}${projectId || 'default'}_${workspaceId || 'default'}`;
}

function buildPizarraViewportKey(projectId, workspaceId) {
  return `devhub_pizarra_viewport:${projectId || 'default'}:${workspaceId || 'default'}`;
}

function safeRemoveItem(storage, key) {
  if (!storage || typeof storage.removeItem !== 'function' || !key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function listKeysWithPrefix(storage, prefix) {
  if (!storage || typeof storage.length !== 'number' || !prefix) return [];
  const keys = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
  } catch {
    // ignore
  }
  return keys;
}

/**
 * Drop every localStorage entry that belongs to one workspace id.
 * @returns {{ removedKeys: string[] }}
 */
function clearWorkspaceScopedStorage(storage, projectId, workspaceId) {
  const removedKeys = [];
  if (!storage || !workspaceId) return { removedKeys };

  const keys = [
    buildRightDockStorageKey(projectId, workspaceId),
    buildSurfaceStorageKey(projectId, workspaceId),
    buildPizarraViewportKey(projectId, workspaceId),
  ];

  for (const key of keys) {
    if (safeRemoveItem(storage, key)) removedKeys.push(key);
  }

  // Browser windows are a map keyed by workspace id under one project key.
  try {
    const states = readBrowserWindowStates(storage, projectId);
    if (states && Object.prototype.hasOwnProperty.call(states, workspaceId)) {
      const next = { ...states };
      delete next[workspaceId];
      writeBrowserWindowStates(storage, projectId, next);
      removedKeys.push(`${buildBrowserWindowStorageKey(projectId)}#${workspaceId}`);
    }
  } catch {
    // best-effort
  }

  return { removedKeys };
}

/**
 * Seed a clean right-dock + empty surfaces so a recycled workspace id cannot
 * revive a zombie pizarra/browser URL from a previous life of that id.
 */
function seedFreshWorkspaceDockState(storage, projectId, workspaceId) {
  if (!storage || !workspaceId) return buildFreshRightDockState();
  const fresh = buildFreshRightDockState();
  writeRightDockState(storage, projectId, workspaceId, fresh);
  try {
    storage.setItem(buildSurfaceStorageKey(projectId, workspaceId), '[]');
  } catch {
    // ignore
  }
  safeRemoveItem(storage, buildPizarraViewportKey(projectId, workspaceId));
  return fresh;
}

/**
 * After hydration, drop storage for workspace ids that no longer exist in the
 * live workspace list (closed in a previous session, or partial crashes).
 */
function pruneOrphanWorkspaceScopedStorage(storage, projectId, liveWorkspaceIds = []) {
  if (!storage) return { removedKeys: [] };
  const live = new Set(
    (Array.isArray(liveWorkspaceIds) ? liveWorkspaceIds : []).filter(Boolean).map(String)
  );
  const removedKeys = [];

  const dockPrefix = `devhub_right_dock_${projectId || 'global'}_`;
  for (const key of listKeysWithPrefix(storage, dockPrefix)) {
    const wsId = key.slice(dockPrefix.length);
    if (!wsId || live.has(wsId)) continue;
    if (safeRemoveItem(storage, key)) removedKeys.push(key);
  }

  const surfacePrefix = `${SURFACE_STORAGE_KEY_PREFIX}${projectId || 'default'}_`;
  for (const key of listKeysWithPrefix(storage, surfacePrefix)) {
    const wsId = key.slice(surfacePrefix.length);
    if (!wsId || live.has(wsId)) continue;
    if (safeRemoveItem(storage, key)) removedKeys.push(key);
  }

  const viewportPrefix = `devhub_pizarra_viewport:${projectId || 'default'}:`;
  for (const key of listKeysWithPrefix(storage, viewportPrefix)) {
    const wsId = key.slice(viewportPrefix.length);
    if (!wsId || live.has(wsId)) continue;
    if (safeRemoveItem(storage, key)) removedKeys.push(key);
  }

  try {
    const states = readBrowserWindowStates(storage, projectId);
    let changed = false;
    const next = {};
    Object.entries(states || {}).forEach(([wsId, state]) => {
      if (live.has(wsId)) {
        next[wsId] = state;
      } else {
        changed = true;
        removedKeys.push(`${buildBrowserWindowStorageKey(projectId)}#${wsId}`);
      }
    });
    if (changed) {
      writeBrowserWindowStates(storage, projectId, next);
    }
  } catch {
    // best-effort
  }

  return { removedKeys };
}

module.exports = {
  buildSurfaceStorageKey,
  buildPizarraViewportKey,
  clearWorkspaceScopedStorage,
  seedFreshWorkspaceDockState,
  pruneOrphanWorkspaceScopedStorage,
  buildRightDockStorageKey,
};
