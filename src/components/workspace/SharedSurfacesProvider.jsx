/**
 * SharedSurfacesProvider — singleton surface registry.
 *
 * Phase 4 of pizarra-shared-view-state. Owns the lifecycle of
 * every terminal and browser surface mounted in the workspace
 * AND pizarra. Lives at the TWM root (above `SharedDockStoreProvider`).
 *
 * Architecture:
 *   - `registerSurface(id, ownerHandle)` increments a refcount
 *     keyed by surfaceId. Multiple owners (workspace dock +
 *     pizarra canvas) can hold the same surface. The surface
 *     stays alive while refcount > 0.
 *   - `releaseSurface(id, { keepAlive })` decrements the
 *     refcount. With `keepAlive: true` (default), the surface
 *     is preserved. With `keepAlive: false`, the surface is
 *     hard-destroyed (calls `onSurfaceDestroy(id)` so the
 *     consumer can close the WebSocket and dispose XTerm).
 *   - `registerSurfaceTarget(id, hostId, domElement)` lets
 *     a `SurfacePortal` host register its DOM target. The
 *     provider then renders the active surface's children
 *     into the most recently registered target via React
 *     `createPortal`.
 *   - `setActiveSurfaceId(id)` updates the shared "active
 *     surface" pointer. Used by focus management to move
 *     focus between surfaces when the user clicks one.
 *   - `getActiveTarget(id)` returns the registered DOM
 *     target for the surface (or undefined if none).
 *   - `useSurfaceContent(surfaceId, content)` is a render
 *     hook that mounts the surface's content tree once in
 *     the provider's hidden layer. The provider portals
 *     this tree into the active target.
 *
 * The component renders its `children` (the actual workspace
 * tree) and overlays a `<SurfaceMountLayer>` that hosts every
 * registered surface's render tree. The portal targets
 * themselves live inside the consumer's children, registered
 * by `SurfacePortal` hosts.
 */

'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';

// ── Context ───────────────────────────────────────────────────────────────

const SharedSurfacesContext = createContext(null);

export { SharedSurfacesContext };

/**
 * Hook that exposes the full surface registry API to descendants.
 * Returns null when the consumer is not mounted inside a
 * <SharedSurfacesProvider>. Callers MUST null-check the return
 * value before invoking registry methods.
 */
export function useSurfaceRegistry() {
  const ctx = useContext(SharedSurfacesContext);
  return ctx || null;
}

/**
 * Strict variant: throws when no provider is mounted. Useful for
 * contexts where the absence of a provider is a programmer
 * error (e.g. a hidden-mount surface that must always be
 * registered). Kept separate from `useSurfaceRegistry` so the
 * legacy TWM path can call the lenient version.
 */
export function useSurfaceRegistryRequired() {
  const ctx = useContext(SharedSurfacesContext);
  if (!ctx) {
    throw new Error('useSurfaceRegistryRequired must be used inside a <SharedSurfacesProvider>.');
  }
  return ctx;
}

/**
 * Hook that returns the surface descriptor for a given id.
 * Re-renders when the surface's metadata changes.
 */
export function useSharedSurface(surfaceId) {
  const reg = useSurfaceRegistry();
  const getSnapshot = useCallback(() => reg.get(surfaceId), [reg, surfaceId]);
  const getServerSnapshot = getSnapshot;
  return useSyncExternalStore(reg.subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Hook that returns the current active surfaceId. Re-renders
 * the consumer when the active surface changes.
 */
export function useActiveSurfaceId() {
  const reg = useSurfaceRegistry();
  const getSnapshot = useCallback(() => reg.getActiveSurfaceId(), [reg]);
  const getServerSnapshot = getSnapshot;
  return useSyncExternalStore(reg.subscribeActive, getSnapshot, getServerSnapshot);
}

// ── Provider ──────────────────────────────────────────────────────────────

/**
 * Internal state shape:
 *   surfaces: Map<surfaceId, { id, type, refCount, lastTouchedAt, onDestroy? }>
 *   targets:  Map<hostId, Map<surfaceId, HTMLElement>> — a host can target multiple surfaces
 *   activeTargetBySurface: Map<surfaceId, hostId> — the most recent target for each surface
 *   preferredHostBySurface: Map<surfaceId, hostId> — explicit host priority when set
 *   content:   Map<surfaceId, ReactNode> — the live surface content tree
 *   activeSurfaceId: string | null
 */
function createRegistry() {
  const surfaces = new Map();
  const targets = new Map(); // hostId -> Map<surfaceId, HTMLElement>
  const activeTargetBySurface = new Map();
  const preferredHostBySurface = new Map();
  const content = new Map(); // surfaceId -> ReactNode
  let activeSurfaceId = null;
  let version = 0; // bumped on every notify
  let destroyHandler = null; // user-supplied, called on hard-destroy
  const listeners = new Set();
  const activeListeners = new Set();

  function notify() {
    version += 1;
    for (const cb of listeners) cb();
  }

  function notifyActive() {
    for (const cb of activeListeners) cb(activeSurfaceId);
  }

  function setDestroyHandler(fn) {
    destroyHandler = fn;
  }

  function getDestroyHandler() {
    return destroyHandler;
  }

  function get(id) {
    return surfaces.get(id);
  }

  function getRefCount(id) {
    const s = surfaces.get(id);
    return s ? s.refCount : 0;
  }

  function resolveTargetForHost(id, hostId) {
    if (!hostId) return undefined;
    const hostMap = targets.get(hostId);
    if (!hostMap) return undefined;
    return hostMap.get(id);
  }

  function collectTargetsForSurface(id) {
    const out = [];
    for (const [hostId, hostMap] of targets) {
      const el = hostMap.get(id);
      if (el) out.push({ hostId, el });
    }
    return out;
  }

  function isNonZeroTarget(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function getActiveTarget(id) {
    const preferredHostId = preferredHostBySurface.get(id);
    const allTargets = collectTargetsForSurface(id);
    const nonZeroTargets = allTargets.filter(({ el }) => isNonZeroTarget(el));
    const hasMeasuredLayout = nonZeroTargets.length > 0;

    if (preferredHostId) {
      const preferredTarget = resolveTargetForHost(id, preferredHostId);
      if (!preferredTarget) {
        return undefined;
      }
      if (hasMeasuredLayout) {
        if (isNonZeroTarget(preferredTarget)) {
          return preferredTarget;
        }
        if (preferredHostId === 'pizarra-canvas') {
          const pizarraTarget = nonZeroTargets.find(({ hostId }) => hostId === 'pizarra-canvas');
          if (pizarraTarget) return pizarraTarget.el;
          return undefined;
        }
        return nonZeroTargets[0]?.el;
      }
      return preferredTarget;
    }

    const hostId = activeTargetBySurface.get(id);
    const activeTarget = resolveTargetForHost(id, hostId);
    if (hasMeasuredLayout) {
      if (activeTarget && isNonZeroTarget(activeTarget)) return activeTarget;
      if (nonZeroTargets.length > 0) return nonZeroTargets[0].el;
    }
    if (activeTarget) return activeTarget;
    return allTargets[0]?.el;
  }

  function setPreferredHostForSurface(id, hostId) {
    if (!id) return;
    const current = preferredHostBySurface.get(id);
    if (hostId === null || hostId === undefined) {
      if (!preferredHostBySurface.has(id)) return;
      preferredHostBySurface.delete(id);
      notify();
      return;
    }
    if (current === hostId) return;
    preferredHostBySurface.set(id, hostId);
    notify();
  }

  function clearPreferredHostForSurface(id) {
    if (!id) return;
    if (preferredHostBySurface.delete(id)) {
      notify();
    }
  }

  function getPreferredHostForSurface(id) {
    return preferredHostBySurface.get(id);
  }

  function registerSurface(id, owner = {}) {
    if (!id) return () => {};
    const existing = surfaces.get(id);
    if (existing) {
      existing.refCount += 1;
      existing.lastTouchedAt = Date.now();
    } else {
      surfaces.set(id, {
        id,
        type: owner.type || 'terminal',
        refCount: 1,
        lastTouchedAt: Date.now(),
        onDestroy: owner.onDestroy || null,
      });
    }
    notify();
    return function release() {
      const s = surfaces.get(id);
      if (!s) return;
      s.refCount = Math.max(0, s.refCount - 1);
      s.lastTouchedAt = Date.now();
      if (s.refCount === 0) {
        // Soft release: descriptor stays. Explicit destroy
        // (releaseSurface with keepAlive:false) is the only
        // path that removes it.
      }
      notify();
    };
  }

  function releaseSurface(id, opts = {}) {
    const s = surfaces.get(id);
    if (!s) return;
    if (opts.keepAlive === false) {
      // Hard destroy: call onDestroy, then remove from map.
      // The surface's per-id handler takes precedence; fall back
      // to the provider-level destroyHandler (set via
      // setDestroyHandler) so surfaces registered AFTER the
      // provider's onSurfaceDestroy effect ran still get a
      // destroy notification.
      const handler = s.onDestroy || destroyHandler;
      try {
        handler && handler(id);
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.error('[SharedSurfacesProvider] onSurfaceDestroy threw:', err);
        }
      }
      surfaces.delete(id);
      for (const [hostId, hostMap] of targets) {
        if (hostMap.has(id)) {
          hostMap.delete(id);
          if (hostMap.size === 0) targets.delete(hostId);
        }
      }
      activeTargetBySurface.delete(id);
      preferredHostBySurface.delete(id);
      if (activeSurfaceId === id) activeSurfaceId = null;
      content.delete(id);
    } else {
      s.refCount = Math.max(0, s.refCount - 1);
      s.lastTouchedAt = Date.now();
    }
    notify();
  }

  function registerSurfaceTarget(id, hostId, domElement) {
    if (!id || !hostId || !domElement) {
      return () => {};
    }
    let hostMap = targets.get(hostId);
    if (!hostMap) {
      hostMap = new Map();
      targets.set(hostId, hostMap);
    }
    hostMap.set(id, domElement);
    activeTargetBySurface.set(id, hostId);
    notify();
    return function unregister() {
      const current = targets.get(hostId);
      if (current && current.get(id) === domElement) {
        current.delete(id);
        if (current.size === 0) targets.delete(hostId);
      }
      if (activeTargetBySurface.get(id) === hostId) {
        activeTargetBySurface.delete(id);
      }
      notify();
    };
  }

  function setActiveSurfaceId(id) {
    if (activeSurfaceId !== id) {
      activeSurfaceId = id;
      notify();
      notifyActive();
    }
  }

  function getActiveSurfaceId() {
    return activeSurfaceId;
  }

  function list() {
    return Array.from(surfaces.values());
  }

  function subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function subscribeActive(cb) {
    activeListeners.add(cb);
    cb(activeSurfaceId);
    return () => activeListeners.delete(cb);
  }

  function onDestroyFor(id, fn) {
    const s = surfaces.get(id);
    if (s) s.onDestroy = fn;
  }

  function setContent(id, node) {
    if (node === null || node === undefined) {
      content.delete(id);
    } else {
      content.set(id, node);
    }
    notify();
  }

  function getContent(id) {
    return content.get(id);
  }

  function listContent() {
    return Array.from(content.entries());
  }

  function getVersion() {
    return version;
  }

  return {
    get,
    getRefCount,
    getActiveTarget,
    getPreferredHostForSurface,
    getActiveSurfaceId,
    list,
    registerSurface,
    releaseSurface,
    registerSurfaceTarget,
    setPreferredHostForSurface,
    clearPreferredHostForSurface,
    setActiveSurfaceId,
    subscribe,
    subscribeActive,
    onDestroyFor,
    setContent,
    getContent,
    listContent,
    getVersion,
    setDestroyHandler,
    getDestroyHandler,
  };
}

/**
 * SurfaceMount — internal component used by `useSurfaceContent`
 * to register a surface's content tree ONCE in the provider's
 * hidden layer. The provider portals this content into the
 * active target via `createPortal`.
 */
function SurfaceMount({ surfaceId, content }) {
  const registry = useSurfaceRegistry();
  const fallbackRef = useRef(null);
  const version = useSyncExternalStore(
    registry.subscribe,
    () => registry.getVersion(),
    () => registry.getVersion()
  );
  const [fallbackReady, setFallbackReady] = useState(false);

  const liveTarget = registry.getActiveTarget(surfaceId);

  useLayoutEffect(() => {
    if (liveTarget) {
      setFallbackReady(false);
      return;
    }
    if (fallbackRef.current) {
      setFallbackReady(true);
    }
  }, [liveTarget, version]);

  const portalTarget = liveTarget || (fallbackReady ? fallbackRef.current : null);

  // Always portal — never wrap content in a plain div (that remounts TerminalTTY when
  // the target appears and causes double xterm / double PTY echo).
  return (
    <>
      {!liveTarget && (
        <div
          ref={fallbackRef}
          data-testid={`surface-hidden-mount-${surfaceId}`}
          style={{
            position: 'fixed',
            left: -10000,
            top: 0,
            width: 960,
            height: 540,
            visibility: 'hidden',
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        />
      )}
      {portalTarget ? createPortal(content, portalTarget) : null}
    </>
  );
}

export function SharedSurfacesProvider({ children, onSurfaceDestroy }) {
  // One registry per provider instance. Use ref + lazy init to
  // guarantee stability across re-renders.
  const registryRef = useRef(null);
  if (registryRef.current === null) {
    registryRef.current = createRegistry();
  }
  const registry = registryRef.current;

  // Wire the consumer-provided destroy handler. The registry
  // uses it whenever `releaseSurface(id, { keepAlive: false })`
  // is called. The handler applies to every surface in the
  // registry, including ones registered after this effect runs.
  useEffect(() => {
    registry.setDestroyHandler(onSurfaceDestroy || null);
  }, [registry, onSurfaceDestroy]);

  // Subscribe to the registry so the provider re-renders
  // whenever surfaces / targets / content change. This is the
  // bridge that lets the SurfaceMounts pick up new targets
  // AFTER the SurfacePortal hosts register.
  useSyncExternalStore(
    registry.subscribe,
    () => registry.getVersion(),
    () => registry.getVersion()
  );

  const value = useMemo(() => registry, [registry]);

  return (
    <SharedSurfacesContext.Provider value={value}>
      {/* Hidden mounts — one per registered surface with content. */}
      <div
        data-testid="surface-hidden-layer"
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {registry.listContent().map(([surfaceId, node]) => (
          <SurfaceMount key={surfaceId} surfaceId={surfaceId} content={node} />
        ))}
      </div>
      {children}
    </SharedSurfacesContext.Provider>
  );
}

/**
 * useSurfaceContent — render a React subtree once as the
 * "live content" for a given surfaceId. The provider portals
 * it into whichever target is currently active. Mode toggles
 * change the active target without unmounting the subtree.
 */
export function useSurfaceContent(surfaceId, factory) {
  const registry = useSurfaceRegistry();
  const contentRef = useRef(null);
  if (contentRef.current === null) {
    contentRef.current = factory();
  }
  useEffect(() => {
    if (!registry) return undefined;
    registry.setContent(surfaceId, contentRef.current);
    return () => registry.setContent(surfaceId, null);
  }, [registry, surfaceId]);
  return contentRef.current;
}

export default SharedSurfacesProvider;
