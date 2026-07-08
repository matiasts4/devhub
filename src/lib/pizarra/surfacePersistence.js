/**
 * surfacePersistence — compact localStorage read/write for pizarra surfaces.
 *
 * Keeps only layout + identity fields, skips unchanged writes, and recovers
 * from QuotaExceededError by pruning stale workspace keys.
 */

export const SURFACE_STORAGE_KEY_PREFIX = 'devhub_pizarra_surfaces_';
export const MAX_SURFACES_PER_WORKSPACE = 32;

const PERSISTABLE_ROOT_KEYS = [
  'id',
  'type',
  'panelId',
  'label',
  'url',
  'cwd',
  'initialCommand',
  'requestedRendererMode',
];

// pizarra-editing-ux Phase 4: zIndex (layer order) + locked (no
// move/resize/delete) are persistable per-surface. Optional fields with
// hydrate defaults below, so old storage entries hydrate without migration.
const PERSISTABLE_PIZARRA_KEYS = [
  'x',
  'y',
  'width',
  'height',
  'visible',
  'maximized',
  'viewId',
  'zIndex',
  'locked',
];

const DEFAULT_PIZARRA_LAYOUT = {
  x: null,
  y: null,
  width: 640,
  height: 400,
  visible: true,
  zIndex: 0,
  locked: false,
};

export function buildSurfaceStorageKey(projectId, workspaceId) {
  return `${SURFACE_STORAGE_KEY_PREFIX}${projectId || 'default'}_${workspaceId || 'default'}`;
}

export function compactSurfaceForStorage(surface) {
  if (!surface || typeof surface !== 'object' || !surface.id) return null;

  const compact = {};
  for (const key of PERSISTABLE_ROOT_KEYS) {
    const value = surface[key];
    if (value !== undefined && value !== null && value !== '') {
      compact[key] = value;
    }
  }

  if (surface.pizarra && typeof surface.pizarra === 'object') {
    const pizarra = {};
    for (const key of PERSISTABLE_PIZARRA_KEYS) {
      if (surface.pizarra[key] !== undefined) {
        pizarra[key] = surface.pizarra[key];
      }
    }
    if (Object.keys(pizarra).length > 0) {
      compact.pizarra = pizarra;
    }
  }

  return compact;
}

export function compactSurfacesForStorage(surfaces) {
  if (!Array.isArray(surfaces)) return [];
  return surfaces
    .map(compactSurfaceForStorage)
    .filter(Boolean)
    .slice(0, MAX_SURFACES_PER_WORKSPACE);
}

export function serializeSurfacesForStorage(surfaces) {
  return JSON.stringify(compactSurfacesForStorage(surfaces));
}

export function hydrateSurfaceFromStorage(surface) {
  if (!surface || typeof surface !== 'object') return null;
  return {
    ...surface,
    pizarra: {
      ...DEFAULT_PIZARRA_LAYOUT,
      ...(surface.pizarra || {}),
    },
  };
}

export function readSurfacesFromStorage(storage, projectId, workspaceId) {
  if (!storage || typeof storage.getItem !== 'function') return [];
  try {
    const raw = storage.getItem(buildSurfaceStorageKey(projectId, workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(hydrateSurfaceFromStorage).filter(Boolean);
  } catch {
    return [];
  }
}

export function listSurfaceStorageKeys(storage) {
  if (!storage || typeof storage.length !== 'number') return [];
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(SURFACE_STORAGE_KEY_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
}

export function pruneStaleSurfaceStorageKeys(
  storage,
  { projectId, workspaceId, maxKeysToRemove = 16 } = {}
) {
  if (!storage || typeof storage.removeItem !== 'function') return 0;

  const keepKey = buildSurfaceStorageKey(projectId, workspaceId);
  const staleKeys = listSurfaceStorageKeys(storage).filter((key) => key !== keepKey);

  staleKeys.sort((leftKey, rightKey) => {
    const leftSize = (storage.getItem(leftKey) || '').length;
    const rightSize = (storage.getItem(rightKey) || '').length;
    return rightSize - leftSize;
  });

  let removed = 0;
  for (const key of staleKeys.slice(0, maxKeysToRemove)) {
    try {
      storage.removeItem(key);
      removed += 1;
    } catch {
      // ignore individual key removal failures
    }
  }

  return removed;
}

function isQuotaError(error) {
  if (!error) return false;
  if (error.name === 'QuotaExceededError') return true;
  return /quota/i.test(String(error.message || error));
}

export function writeSurfacesToStorage(
  storage,
  projectId,
  workspaceId,
  surfaces,
  { previousSerialized = null } = {}
) {
  if (!storage || typeof storage.setItem !== 'function') {
    return { ok: false, reason: 'no-storage' };
  }

  const serialized = serializeSurfacesForStorage(surfaces);
  if (previousSerialized === serialized) {
    return { ok: true, skipped: true, serialized };
  }

  const storageKey = buildSurfaceStorageKey(projectId, workspaceId);

  const attemptWrite = (payload) => {
    storage.setItem(storageKey, payload);
  };

  try {
    attemptWrite(serialized);
    return { ok: true, serialized };
  } catch (error) {
    if (!isQuotaError(error)) {
      return { ok: false, reason: 'error', error };
    }

    pruneStaleSurfaceStorageKeys(storage, { projectId, workspaceId });

    try {
      attemptWrite(serialized);
      return { ok: true, serialized, recovered: true };
    } catch (retryError) {
      const reduced = compactSurfacesForStorage(surfaces).slice(
        0,
        Math.max(4, Math.floor(MAX_SURFACES_PER_WORKSPACE / 2))
      );
      const reducedSerialized = JSON.stringify(reduced);

      try {
        attemptWrite(reducedSerialized);
        return {
          ok: true,
          serialized: reducedSerialized,
          recovered: true,
          truncated: true,
        };
      } catch {
        return { ok: false, reason: 'quota', error: retryError };
      }
    }
  }
}
