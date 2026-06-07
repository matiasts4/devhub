import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createSharedSurfaceRegistry } from './useSharedSurfaceRegistry';

export const LiveSurfaceRegistryContext = createContext(null);

/**
 * Legacy shim for the one-way `useLiveSurfaceRegistry` hook.
 *
 * Phase 5 of pizarra-shared-view-state promotes this to
 * `useSharedSurfaceRegistry` (bidirectional). This shim
 * preserves the old API for callers that have not migrated
 * yet. It delegates to the new pure registry and emits a
 * `console.warn` on first use so callers can be migrated
 * during a follow-up cleanup pass.
 */
export function useLiveSurfaceRegistry(projectId, workspaceId) {
  if (typeof console !== 'undefined') {
    console.warn(
      '[useLiveSurfaceRegistry] legacy one-way API; prefer useSharedSurfaceRegistry for the bidirectional contract. Shim will be removed in a future release.'
    );
  }
  // The shim is intentionally a no-React hook that returns
  // a minimal "live" view backed by the new registry's list.
  // The legacy contract: { surfaces, isLoaded, addSurface,
  // removeSurface, updatePizarraLayout, resetSurfaces }.
  const [surfaces, setSurfaces] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const getStorageKey = useCallback(() => {
    return `devhub_pizarra_surfaces_${projectId || 'default'}_${workspaceId || 'default'}`;
  }, [projectId, workspaceId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = getStorageKey();
      const saved = window.localStorage.getItem(key);
      if (saved) {
        setSurfaces(JSON.parse(saved));
      } else {
        setSurfaces([]);
      }
    } catch (e) {
      console.error('[useLiveSurfaceRegistry] failed to load surfaces:', e);
      setSurfaces([]);
    } finally {
      setIsLoaded(true);
    }
  }, [getStorageKey]);

  const saveSurfaces = useCallback(
    (nextSurfaces) => {
      if (typeof window === 'undefined') return;
      try {
        const key = getStorageKey();
        window.localStorage.setItem(key, JSON.stringify(nextSurfaces));
      } catch (e) {
        console.error('[useLiveSurfaceRegistry] failed to save surfaces:', e);
      }
    },
    [getStorageKey]
  );

  const addSurface = useCallback(
    (surface) => {
      setSurfaces((prev) => {
        const exists = prev.find(
          (s) => s.id === surface.id || (surface.panelId && s.panelId === surface.panelId)
        );
        if (exists) {
          const next = prev.map((s) =>
            s.id === surface.id || (surface.panelId && s.panelId === surface.panelId)
              ? { ...s, ...surface, pizarra: { ...s.pizarra, ...surface.pizarra } }
              : s
          );
          saveSurfaces(next);
          return next;
        }
        const next = [...prev, surface];
        saveSurfaces(next);
        return next;
      });
    },
    [saveSurfaces]
  );

  const removeSurface = useCallback(
    (id) => {
      setSurfaces((prev) => {
        const next = prev.filter((s) => s.id !== id);
        saveSurfaces(next);
        return next;
      });
    },
    [saveSurfaces]
  );

  const updatePizarraLayout = useCallback(
    (id, layoutChanges) => {
      setSurfaces((prev) => {
        const next = prev.map((s) => {
          if (s.id === id) {
            const rootChanges = {};
            const pizarraChanges = {};
            Object.keys(layoutChanges).forEach((key) => {
              if (['x', 'y', 'width', 'height', 'visible'].includes(key)) {
                pizarraChanges[key] = layoutChanges[key];
              } else {
                rootChanges[key] = layoutChanges[key];
              }
            });
            return {
              ...s,
              ...rootChanges,
              pizarra: {
                ...s.pizarra,
                ...pizarraChanges,
              },
            };
          }
          return s;
        });
        saveSurfaces(next);
        return next;
      });
    },
    [saveSurfaces]
  );

  const resetSurfaces = useCallback(
    (nextSurfaces) => {
      setSurfaces(nextSurfaces);
      saveSurfaces(nextSurfaces);
    },
    [saveSurfaces]
  );

  return {
    surfaces,
    isLoaded,
    addSurface,
    removeSurface,
    updatePizarraLayout,
    resetSurfaces,
  };
}

export function useLiveSurfaceRegistryContext() {
  const context = useContext(LiveSurfaceRegistryContext);
  if (!context) {
    throw new Error(
      'useLiveSurfaceRegistryContext must be used within a LiveSurfaceRegistryContext.Provider'
    );
  }
  return context;
}

// Re-export the new API from useSharedSurfaceRegistry for
// convenience. Consumers can now import either:
export {
  createSharedSurfaceRegistry,
  useSharedSurfaceRegistry,
  SharedSurfaceRegistryProvider,
  surfaceWriteRejected,
} from './useSharedSurfaceRegistry';
