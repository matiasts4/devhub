import { useState, useLayoutEffect, useCallback, useMemo, useEffect } from 'react';
import { isPizarraSharedViewEnabled } from './featureFlag';
import { createSharedSurfaceRegistry } from './useSharedSurfaceRegistry';

// pizarra-editing-ux Phase 4: zIndex + locked live under `pizarra` and
// are routed there by splitPizarraLayout so updatePizarraLayout({ zIndex,
// locked }) merges into surface.pizarra on both the legacy + shared paths.
const PIZARRA_LAYOUT_KEYS = ['x', 'y', 'width', 'height', 'visible', 'zIndex', 'locked'];

function buildStorageKey(projectId, workspaceId) {
  return `devhub_pizarra_surfaces_${projectId || 'default'}_${workspaceId || 'default'}`;
}

function splitPizarraLayout(layoutChanges) {
  const rootChanges = {};
  const pizarraChanges = {};
  Object.keys(layoutChanges).forEach((key) => {
    if (PIZARRA_LAYOUT_KEYS.includes(key)) {
      pizarraChanges[key] = layoutChanges[key];
    } else {
      rootChanges[key] = layoutChanges[key];
    }
  });
  return { rootChanges, pizarraChanges };
}

/** Legacy localStorage-backed registry (flag OFF). */
export function useLegacyLiveSurfaceRegistry(projectId, workspaceId) {
  const [surfaces, setSurfaces] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const getStorageKey = useCallback(
    () => buildStorageKey(projectId, workspaceId),
    [projectId, workspaceId]
  );

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    setIsLoaded(false);
    setSurfaces([]);
    try {
      const saved = window.localStorage.getItem(getStorageKey());
      if (saved) setSurfaces(JSON.parse(saved));
    } catch (e) {
      console.error('[useWorkspaceSurfaceRegistry] failed to load surfaces:', e);
      setSurfaces([]);
    } finally {
      setIsLoaded(true);
    }
  }, [getStorageKey]);

  const saveSurfaces = useCallback(
    (nextSurfaces) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(getStorageKey(), JSON.stringify(nextSurfaces));
      } catch (e) {
        console.error('[useWorkspaceSurfaceRegistry] failed to save surfaces:', e);
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
        const next = exists
          ? prev.map((s) =>
              s.id === surface.id || (surface.panelId && s.panelId === surface.panelId)
                ? { ...s, ...surface, pizarra: { ...s.pizarra, ...surface.pizarra } }
                : s
            )
          : [...prev, surface];
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
          if (s.id !== id) return s;
          const { rootChanges, pizarraChanges } = splitPizarraLayout(layoutChanges);
          return { ...s, ...rootChanges, pizarra: { ...s.pizarra, ...pizarraChanges } };
        });
        saveSurfaces(next);
        return next;
      });
    },
    [saveSurfaces]
  );

  const updateSurface = useCallback(
    (id, patch) => {
      if (!patch || typeof patch !== 'object') return;
      setSurfaces((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
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
    updateSurface,
    resetSurfaces,
  };
}

/**
 * Unified TWM surface registry. Flag OFF → legacy localStorage hook;
 * flag ON → inline `createSharedSurfaceRegistry` with the same API.
 */
export function useWorkspaceSurfaceRegistry(projectId, workspaceId) {
  const sharedEnabled = isPizarraSharedViewEnabled();

  const registry = useMemo(
    () => (sharedEnabled ? createSharedSurfaceRegistry({ projectId, workspaceId }) : null),
    [sharedEnabled, projectId, workspaceId]
  );

  const [surfaces, setSurfaces] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const getStorageKey = useCallback(
    () => buildStorageKey(projectId, workspaceId),
    [projectId, workspaceId]
  );

  const syncFromRegistry = useCallback(() => {
    if (registry) setSurfaces(registry.list());
  }, [registry]);

  useLayoutEffect(() => {
    setIsLoaded(false);
    setSurfaces([]);
    if (sharedEnabled && registry) {
      syncFromRegistry();
      setIsLoaded(true);
      return;
    }
    if (typeof window === 'undefined') {
      setIsLoaded(true);
      return;
    }
    try {
      const saved = window.localStorage.getItem(getStorageKey());
      if (saved) setSurfaces(JSON.parse(saved));
    } catch (e) {
      console.error('[useWorkspaceSurfaceRegistry] failed to load surfaces:', e);
    } finally {
      setIsLoaded(true);
    }
  }, [sharedEnabled, registry, getStorageKey, syncFromRegistry]);

  useEffect(() => {
    if (!sharedEnabled || !registry) return undefined;
    const origRegister = registry.register;
    const origUnregister = registry.unregister;
    const origUpdate = registry.update;
    const bump = () => syncFromRegistry();

    registry.register = (surface, opts) => {
      const ok = origRegister.call(registry, surface, opts);
      if (ok) bump();
      return ok;
    };
    registry.unregister = (id, opts) => {
      const ok = origUnregister.call(registry, id, opts);
      if (ok) bump();
      return ok;
    };
    registry.update = (id, patch, opts) => {
      const ok = origUpdate.call(registry, id, patch, opts);
      if (ok) bump();
      return ok;
    };

    return () => {
      registry.register = origRegister;
      registry.unregister = origUnregister;
      registry.update = origUpdate;
    };
  }, [sharedEnabled, registry, syncFromRegistry]);

  const saveSurfacesLegacy = useCallback(
    (nextSurfaces) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(getStorageKey(), JSON.stringify(nextSurfaces));
      } catch (e) {
        console.error('[useWorkspaceSurfaceRegistry] failed to save surfaces:', e);
      }
    },
    [getStorageKey]
  );

  const addSurface = useCallback(
    (surface) => {
      if (sharedEnabled && registry) {
        const existing = registry
          .list()
          .find((s) => s.id === surface.id || (surface.panelId && s.panelId === surface.panelId));
        const payload = existing
          ? {
              ...existing,
              ...surface,
              source: 'workspace',
              pizarra: { ...existing.pizarra, ...surface.pizarra },
            }
          : { ...surface, source: 'workspace' };
        registry.register(payload, { writer: 'workspace' });
        return;
      }
      setSurfaces((prev) => {
        const exists = prev.find(
          (s) => s.id === surface.id || (surface.panelId && s.panelId === surface.panelId)
        );
        const next = exists
          ? prev.map((s) =>
              s.id === surface.id || (surface.panelId && s.panelId === surface.panelId)
                ? { ...s, ...surface, pizarra: { ...s.pizarra, ...surface.pizarra } }
                : s
            )
          : [...prev, surface];
        saveSurfacesLegacy(next);
        return next;
      });
    },
    [sharedEnabled, registry, saveSurfacesLegacy]
  );

  const removeSurface = useCallback(
    (id) => {
      if (sharedEnabled && registry) {
        registry.unregister(id, { writer: 'workspace' });
        return;
      }
      setSurfaces((prev) => {
        const next = prev.filter((s) => s.id !== id);
        saveSurfacesLegacy(next);
        return next;
      });
    },
    [sharedEnabled, registry, saveSurfacesLegacy]
  );

  const updatePizarraLayout = useCallback(
    (id, layoutChanges) => {
      if (sharedEnabled && registry) {
        const existing = registry.get(id);
        if (!existing) return;
        const { rootChanges, pizarraChanges } = splitPizarraLayout(layoutChanges);
        registry.update(
          id,
          { ...rootChanges, pizarra: { ...existing.pizarra, ...pizarraChanges } },
          { writer: 'workspace' }
        );
        return;
      }
      setSurfaces((prev) => {
        const next = prev.map((s) => {
          if (s.id !== id) return s;
          const { rootChanges, pizarraChanges } = splitPizarraLayout(layoutChanges);
          return { ...s, ...rootChanges, pizarra: { ...s.pizarra, ...pizarraChanges } };
        });
        saveSurfacesLegacy(next);
        return next;
      });
    },
    [sharedEnabled, registry, saveSurfacesLegacy]
  );

  const updateSurface = useCallback(
    (id, patch) => {
      if (!patch || typeof patch !== 'object') return;
      if (sharedEnabled && registry) {
        registry.update(id, patch, { writer: 'workspace' });
        return;
      }
      setSurfaces((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
        saveSurfacesLegacy(next);
        return next;
      });
    },
    [sharedEnabled, registry, saveSurfacesLegacy]
  );

  const resetSurfaces = useCallback(
    (nextSurfaces) => {
      if (sharedEnabled && registry) {
        registry.reset();
        for (const surface of nextSurfaces) {
          registry.register(
            { ...surface, source: surface.source || 'workspace' },
            { writer: 'workspace' }
          );
        }
        syncFromRegistry();
        return;
      }
      setSurfaces(nextSurfaces);
      saveSurfacesLegacy(nextSurfaces);
    },
    [sharedEnabled, registry, saveSurfacesLegacy, syncFromRegistry]
  );

  return {
    surfaces,
    isLoaded,
    addSurface,
    removeSurface,
    updatePizarraLayout,
    updateSurface,
    resetSurfaces,
    /** Raw createSharedSurfaceRegistry instance when flag ON (B.2b provider bridge). */
    registryInstance: sharedEnabled ? registry : null,
  };
}

export default useWorkspaceSurfaceRegistry;
