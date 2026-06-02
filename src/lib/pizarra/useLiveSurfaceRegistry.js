import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const LiveSurfaceRegistryContext = createContext(null);

export function useLiveSurfaceRegistry(projectId, workspaceId) {
  const [surfaces, setSurfaces] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const getStorageKey = useCallback(() => {
    return `devhub_pizarra_surfaces_${projectId || 'default'}_${workspaceId || 'default'}`;
  }, [projectId, workspaceId]);

  // Load from localStorage on mount / workspaceId change
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

  // Save to localStorage when surfaces changes
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
        // Avoid duplicate registrations
        const exists = prev.find(
          (s) => s.id === surface.id || (surface.panelId && s.panelId === surface.panelId)
        );
        if (exists) {
          // Merge attributes if already exists, updating layout or other fields if needed
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
            return {
              ...s,
              pizarra: {
                ...s.pizarra,
                ...layoutChanges,
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
