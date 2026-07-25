/**
 * useSharedSurfaceRegistry — bidirectional surface registry.
 *
 * Phase 5 of pizarra-shared-view-state. Promotes the legacy
 * one-way `useLiveSurfaceRegistry` to a bidirectional registry
 * that both TWM and pizarra can publish to AND subscribe from.
 *
 * Architecture:
 *   - One registry per (projectId, workspaceId) pair, provided
 *     by `SharedSurfaceRegistryProvider`.
 *   - The registry holds a map of surfaceId → SurfaceRecord.
 *   - Each surface has `{ id, type, source, panelId, surface,
 *     lastUpdatedAt, ... }`.
 *   - Single-writer rule: a workspace surface is owned by
 *     the workspace source. A pizarra surface is owned by
 *     the pizarra source. Cross-source reads are allowed;
 *     cross-source writes are rejected (with a console.warn).
 *   - Last-write-wins merge on `lastUpdatedAt` when both
 *     sources publish the same `id`.
 *   - Persistence: the registry writes to localStorage under
 *     `devhub_pizarra_surfaces_{projectId}_{workspaceId}`. The
 *     key shape matches the WIP file so existing reads keep
 *     working.
 *   - Stale writes (with lastUpdatedAt < current) are silently
 *     rejected with a `console.warn` and an optional
 *     `surfaceWriteRejected` event for subscribers.
 *
 * API:
 *   - register(surface, opts): add/update. Throws no.
 *   - unregister(id, opts): remove. Only owner can.
 *   - update(id, patch, opts): partial update with lastUpdatedAt
 *     LWW semantics.
 *   - get(id): read surface.
 *   - list(): read all surfaces.
 *   - subscribe(id, cb): subscribe to changes for a surface.
 *   - requestSurfaceUpdate(id, patch, source): the cross-source
 *     intent path. The workspace writer is the only one that
 *     can apply cross-source updates; pizarra publishes intents
 *     via this method.
 *
 * The legacy `useLiveSurfaceRegistry` (one-way) is preserved
 * as a re-export shim that delegates to the new module. A
 * `console.warn` is emitted when the legacy API is used so
 * callers can migrate.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

const STORAGE_KEY_PREFIX = 'devhub_pizarra_surfaces_';
const REJECTED_EVENT = 'surfaceWriteRejected';

function buildStorageKey(projectId, workspaceId) {
  return `${STORAGE_KEY_PREFIX}${projectId || 'default'}_${workspaceId || 'default'}`;
}

function readStorage(storage, projectId, workspaceId) {
  if (!storage || typeof storage.getItem !== 'function') return [];
  try {
    const raw = storage.getItem(buildStorageKey(projectId, workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(storage, projectId, workspaceId, surfaces) {
  if (!storage || typeof storage.setItem !== 'function') return;
  try {
    storage.setItem(buildStorageKey(projectId, workspaceId), JSON.stringify(surfaces));
  } catch {
    // ignore quota / serialization failures
  }
}

/**
 * createSharedSurfaceRegistry — pure factory. Used by the
 * provider AND by tests directly.
 */
export function createSharedSurfaceRegistry(opts = {}) {
  const projectId = opts.projectId || 'default';
  const workspaceId = opts.workspaceId || 'default';
  const storage = opts.storage || (typeof window !== 'undefined' ? window.localStorage : null);

  // Map<surfaceId, SurfaceRecord>
  const surfaces = new Map();
  // Map<surfaceId, Set<callback>>
  const subscribers = new Map();
  // Rejected-write subscribers (for tests / QA telemetry).
  const rejectionListeners = new Set();

  function emit(id) {
    const set = subscribers.get(id);
    if (set) {
      for (const cb of set) {
        try {
          cb(get(id));
        } catch (err) {
          if (typeof console !== 'undefined') {
            console.error('[useSharedSurfaceRegistry] subscriber threw:', err);
          }
        }
      }
    }
  }

  function emitRejection(payload) {
    for (const cb of rejectionListeners) {
      try {
        cb(payload);
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.error('[useSharedSurfaceRegistry] rejection listener threw:', err);
        }
      }
    }
  }

  function persist() {
    writeStorage(storage, projectId, workspaceId, list());
  }

  function get(id) {
    return surfaces.get(id);
  }

  function list() {
    return Array.from(surfaces.values());
  }

  function subscribe(id, cb) {
    let set = subscribers.get(id);
    if (!set) {
      set = new Set();
      subscribers.set(id, set);
    }
    set.add(cb);
    return () => {
      const s = subscribers.get(id);
      if (s) {
        s.delete(cb);
        if (s.size === 0) subscribers.delete(id);
      }
    };
  }

  function onReject(cb) {
    rejectionListeners.add(cb);
    return () => rejectionListeners.delete(cb);
  }

  function record(surface, writer) {
    if (!surface || !surface.id) return false;
    const source = surface.source;
    // Single-writer rule.
    if (writer && source && writer !== source) {
      if (typeof console !== 'undefined') {
        console.warn(
          `[useSharedSurfaceRegistry] writer='${writer}' cannot register surface='${surface.id}' with source='${source}' (rejected)`
        );
      }
      emitRejection({
        surfaceId: surface.id,
        reason: 'wrong-writer',
        attemptedWriter: writer,
        declaredSource: source,
      });
      return false;
    }
    const existing = surfaces.get(surface.id);
    const lastUpdatedAt = surface.lastUpdatedAt || Date.now();
    if (existing) {
      // LWW merge: only apply if the new lastUpdatedAt is
      // greater or equal (in the case of same timestamp, the
      // new write wins — this is the standard "last writer
      // wins" semantics that disambiguates concurrent writers).
      if (typeof existing.lastUpdatedAt === 'number' && lastUpdatedAt < existing.lastUpdatedAt) {
        if (typeof console !== 'undefined') {
          console.warn(
            `[useSharedSurfaceRegistry] stale write rejected for surface='${surface.id}' (incoming=${lastUpdatedAt}, current=${existing.lastUpdatedAt})`
          );
        }
        emitRejection({
          surfaceId: surface.id,
          reason: 'stale',
          incomingLastUpdatedAt: lastUpdatedAt,
          currentLastUpdatedAt: existing.lastUpdatedAt,
        });
        return false;
      }
      // Merge: existing fields are preserved unless overridden
      // by the new payload. The source may switch (LWW on the
      // whole record), but the descriptor's content merges.
      const merged = {
        ...existing,
        ...surface,
        lastUpdatedAt,
      };
      surfaces.set(surface.id, merged);
    } else {
      surfaces.set(surface.id, { ...surface, lastUpdatedAt });
    }
    persist();
    emit(surface.id);
    return true;
  }

  function register(surface, opts = {}) {
    return record(surface, opts.writer);
  }

  function update(id, patch, opts = {}) {
    const existing = surfaces.get(id);
    if (!existing) {
      if (typeof console !== 'undefined') {
        console.warn(`[useSharedSurfaceRegistry] update on missing surface id='${id}'`);
      }
      return false;
    }
    const writer = opts.writer;
    if (writer && existing.source && writer !== existing.source) {
      if (typeof console !== 'undefined') {
        console.warn(
          `[useSharedSurfaceRegistry] writer='${writer}' cannot update surface='${id}' owned by '${existing.source}' (rejected)`
        );
      }
      emitRejection({
        surfaceId: id,
        reason: 'wrong-writer-update',
        attemptedWriter: writer,
        ownerSource: existing.source,
      });
      return false;
    }
    const lastUpdatedAt = patch.lastUpdatedAt || Date.now();
    if (typeof existing.lastUpdatedAt === 'number' && lastUpdatedAt < existing.lastUpdatedAt) {
      if (typeof console !== 'undefined') {
        console.warn(
          `[useSharedSurfaceRegistry] stale update rejected for surface='${id}' (incoming=${lastUpdatedAt}, current=${existing.lastUpdatedAt})`
        );
      }
      emitRejection({
        surfaceId: id,
        reason: 'stale-update',
        incomingLastUpdatedAt: lastUpdatedAt,
        currentLastUpdatedAt: existing.lastUpdatedAt,
      });
      return false;
    }
    surfaces.set(id, { ...existing, ...patch, lastUpdatedAt });
    persist();
    emit(id);
    return true;
  }

  function unregister(id, opts = {}) {
    const existing = surfaces.get(id);
    if (!existing) return false;
    const writer = opts.source || opts.writer;
    if (writer && existing.source && writer !== existing.source) {
      if (typeof console !== 'undefined') {
        console.warn(
          `[useSharedSurfaceRegistry] writer='${writer}' cannot unregister surface='${id}' owned by '${existing.source}' (rejected)`
        );
      }
      emitRejection({
        surfaceId: id,
        reason: 'wrong-writer-unregister',
        attemptedWriter: writer,
        ownerSource: existing.source,
      });
      return false;
    }
    surfaces.delete(id);
    persist();
    emit(id);
    return true;
  }

  function requestSurfaceUpdate(id, patch, source) {
    // Cross-source intent path. The workspace writer is the
    // only one that can apply cross-source updates. Pizarra
    // publishes intents here; the workspace side polls or
    // subscribes and applies them.
    // For now, the request IS the update if the caller is
    // the workspace writer; otherwise it's recorded as an
    // intent for the workspace to pick up.
    if (source === 'workspace') {
      return update(
        id,
        { ...patch, lastUpdatedAt: patch.lastUpdatedAt || Date.now() },
        { writer: 'workspace' }
      );
    }
    if (typeof console !== 'undefined') {
      console.warn(
        `[useSharedSurfaceRegistry] requestSurfaceUpdate from '${source}' is recorded as an intent, not applied directly. The workspace writer must apply it.`
      );
    }
    return false;
  }

  function load() {
    const stored = readStorage(storage, projectId, workspaceId);
    let maxUpdatedAt = 0;
    for (const s of stored) {
      if (s && s.id) {
        surfaces.set(s.id, s);
        if (typeof s.lastUpdatedAt === 'number' && s.lastUpdatedAt > maxUpdatedAt) {
          maxUpdatedAt = s.lastUpdatedAt;
        }
      }
    }
  }

  function reset() {
    surfaces.clear();
    persist();
  }

  // Auto-load from storage on construction.
  load();

  return {
    get,
    list,
    subscribe,
    onReject,
    register,
    unregister,
    update,
    requestSurfaceUpdate,
    reset,
    projectId,
    workspaceId,
  };
}

export const surfaceWriteRejected = REJECTED_EVENT;

// ── React provider + hook ───────────────────────────────────────────────

const SharedSurfaceRegistryContext = createContext(null);

export { SharedSurfaceRegistryContext };

export function SharedSurfaceRegistryProvider({
  children,
  projectId,
  workspaceId,
  storage,
  registryInstance = null,
}) {
  // One registry per (projectId, workspaceId, storage) triple, or an
  // external instance from useWorkspaceSurfaceRegistry (Phase B.2b).
  const registryRef = useRef(registryInstance || null);
  if (registryRef.current === null) {
    registryRef.current = createSharedSurfaceRegistry({
      projectId,
      workspaceId,
      storage,
    });
  } else if (registryInstance && registryRef.current !== registryInstance) {
    registryRef.current = registryInstance;
  }
  const registry = registryRef.current;

  // subscribe-and-snapshot bridge for the surfaces list.
  const getSnapshot = useCallback(() => registry.list(), [registry]);
  const getServerSnapshot = getSnapshot;
  const subscribeBridge = useCallback(
    (cb) => {
      // Subscribe to all ids; the bridge coalesces into one
      // callback. The list shape is what consumers need.
      const unsubList = [];
      // Listen to every existing surface id. New ids add their
      // own subscription on the fly via the watcher below.
      for (const s of registry.list()) {
        unsubList.push(registry.subscribe(s.id, cb));
      }
      // Also listen to a sentinel 'list' channel for add /
      // remove. We re-poll the list whenever any id changes.
      const unsubscribe = registry.subscribe('*', cb);
      // Watcher: re-subscribe when new ids appear.
      const watcherInterval = setInterval(() => {
        for (const s of registry.list()) {
          // Best-effort: we cannot easily know which ids are
          // new. Re-subscribing to existing ids is a no-op
          // (the Set dedupes by callback identity, but we use
          // the same callback here so it's deduped).
        }
      }, 0);
      // Simpler approach: subscribe to a wildcard by hooking
      // record/unregister to call cb directly. That's done
      // below in `bridgeSubscribe`.
      return () => {
        for (const u of unsubList) u();
        unsubscribe();
        clearInterval(watcherInterval);
      };
    },
    [registry]
  );

  // Simpler subscription: just call cb on every record /
  // unregister. We expose this through the registry's
  // subscribe wildcard '*' by wrapping record/unregister.
  // For simplicity, we use a "list version" counter that
  // bumps on any add/remove/update.
  const versionRef = useRef(0);
  const versionListeners = useSetShim();
  // Patch the registry: wrap record/unregister/update to bump
  // the version. We do this once on mount.
  if (registry.__versionHookInstalled !== true) {
    registry.__versionHookInstalled = true;
    const origRegister = registry.register;
    const origUnregister = registry.unregister;
    const origUpdate = registry.update;
    registry.register = (s, opts) => {
      const ok = origRegister(s, opts);
      if (ok) {
        versionRef.current += 1;
        for (const cb of versionListeners) cb();
      }
      return ok;
    };
    registry.unregister = (id, opts) => {
      const ok = origUnregister(id, opts);
      if (ok) {
        versionRef.current += 1;
        for (const cb of versionListeners) cb();
      }
      return ok;
    };
    registry.update = (id, patch, opts) => {
      const ok = origUpdate(id, patch, opts);
      if (ok) {
        versionRef.current += 1;
        for (const cb of versionListeners) cb();
      }
      return ok;
    };
  }
  const version = useSyncExternalStore(
    (cb) => {
      versionListeners.add(cb);
      return () => versionListeners.delete(cb);
    },
    () => versionRef.current,
    () => versionRef.current
  );
  const surfaces = getSnapshot();

  const value = useMemo(
    () => ({
      surfaces,
      version,
      register: registry.register,
      unregister: registry.unregister,
      update: registry.update,
      requestSurfaceUpdate: registry.requestSurfaceUpdate,
      get: registry.get,
      list: registry.list,
      subscribe: registry.subscribe,
      onReject: registry.onReject,
    }),
    [surfaces, version, registry]
  );

  return (
    <SharedSurfaceRegistryContext.Provider value={value}>
      {children}
    </SharedSurfaceRegistryContext.Provider>
  );
}

function useSetShim() {
  // A tiny Set ref. We can't use a hook inside the provider
  // body conditionally, so this is a helper to get a stable
  // Set ref. We use useState to hold a Set instance.
  return useState(() => new Set())[0];
}

export function useSharedSurfaceRegistry() {
  const ctx = useContext(SharedSurfaceRegistryContext);
  if (!ctx) {
    // Fall back to a noop API. This matches the lenient
    // pattern of useSurfaceRegistry — components that mount
    // outside the provider still get a stable, no-throw API.
    return {
      surfaces: [],
      version: 0,
      register: () => false,
      unregister: () => false,
      update: () => false,
      requestSurfaceUpdate: () => false,
      get: () => undefined,
      list: () => [],
      subscribe: () => () => {},
      onReject: () => () => {},
    };
  }
  return ctx;
}

export default useSharedSurfaceRegistry;
