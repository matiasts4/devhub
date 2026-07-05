import { useCallback, useEffect, useMemo } from 'react';
import { useWorkspaceSurfaceRegistry as useBaseSurfaceRegistry } from '@/lib/pizarra/useWorkspaceSurfaceRegistry';
import {
  buildTerminalSurfacesFromWindows,
  countPanelsInColumns,
} from '@/lib/terminal/workspaceSurfaceReconcile';
import { resolveRequestedRenderer } from '@/components/terminal/terminalRendererPreferences';
import {
  getPanelDisplayNameFromStore,
  resolvePanelSurfaceLabel,
} from '@/lib/terminal/panelDisplayName';
import { logPizarraBrowser } from '@/lib/debug/pizarraBrowserDebug';

export default function useWorkspaceSurfaceRegistry({
  activeWorkspace,
  activeWindowIds,
  browserWindowStates,
  closeWorkspaceBrowserWindow,
  effectiveRightDockState,
  handleClosePanel,
  handleSetPanelRenderer,
  handleSplit,
  projectId,
  terminalRendererPreferences,
  workspaceWindows,
}) {
  const registry = useBaseSurfaceRegistry(projectId, activeWorkspace?.id);

  const isDedicatedBrowserSurface = useCallback(
    (s) => {
      if (!activeWorkspace?.id) return false;
      const wid = activeWorkspace.id;
      return s.id === `shape-browser-${wid}` || s.panelId === `browser-${wid}`;
    },
    [activeWorkspace?.id]
  );

  const registryAddSurface = useCallback(
    (surface) => {
      if (!activeWorkspace) return null;

      if (surface.type === 'terminal' && !surface.panelId) {
        const newPanelId = handleSplit('horizontal');
        logPizarraBrowser('registry-add-terminal', {
          workspaceId: activeWorkspace.id,
          newPanelId,
          panelCount: countPanelsInColumns(activeWorkspace.columns || []),
        });
        if (newPanelId) {
          const panelLabel = resolvePanelSurfaceLabel(
            {
              id: newPanelId,
              displayName: getPanelDisplayNameFromStore(newPanelId, activeWorkspace.id),
            },
            activeWorkspace.id
          );
          const finalSurface = {
            ...surface,
            id: `shape-term-${newPanelId}`,
            panelId: newPanelId,
            label: panelLabel,
            pizarra: {
              ...surface.pizarra,
              visible: true,
            },
          };
          registry.addSurface(finalSurface);
          if (
            effectiveRightDockState?.maximized &&
            effectiveRightDockState?.maximizedView === 'pizarra' &&
            typeof window !== 'undefined'
          ) {
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent('pizarra:arrange-fit'));
            }, 400);
          }
          return finalSurface;
        }
        logPizarraBrowser('registry-add-terminal:failed', {
          workspaceId: activeWorkspace.id,
        });
        return null;
      } else if (surface.type === 'browser' && !surface.panelId) {
        const unique = `piz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const finalSurface = {
          ...surface,
          id: `shape-browser-${unique}`,
          panelId: `pizarra-browser-${unique}`,
          label: surface.label || 'Browser',
          url: surface.url || 'http://localhost:3000/',
          pizarra: {
            ...surface.pizarra,
            visible: true,
          },
        };
        registry.addSurface(finalSurface);
        return finalSurface;
      } else {
        registry.addSurface(surface);
        return surface;
      }
    },
    [activeWorkspace, handleSplit, registry.addSurface, effectiveRightDockState]
  );

  const registryRemoveSurface = useCallback(
    (id) => {
      if (!activeWorkspace) return;
      const surface = registry.surfaces.find((s) => s.id === id);
      if (!surface) return;

      if (surface.type === 'terminal') {
        handleClosePanel(surface.panelId);
      } else if (surface.type === 'browser') {
        if (isDedicatedBrowserSurface(surface)) {
          closeWorkspaceBrowserWindow(activeWorkspace.id);
        }
      }
      registry.removeSurface(id);
    },
    [
      activeWorkspace,
      registry.surfaces,
      registry.removeSurface,
      handleClosePanel,
      isDedicatedBrowserSurface,
    ]
  );

  const registryUpdateSurface = useCallback(
    (id, patch) => {
      if (!patch || typeof patch !== 'object') return;

      if (patch.requestedRendererMode && activeWorkspace) {
        const surface = registry.surfaces.find((s) => s.id === id);
        if (surface && surface.type === 'terminal' && surface.panelId) {
          handleSetPanelRenderer(activeWorkspace.id, surface.panelId, patch.requestedRendererMode);
        }
      }

      registry.updateSurface(id, patch);
    },
    [activeWorkspace, registry.surfaces, registry.updateSurface, handleSetPanelRenderer]
  );

  const registryValue = useMemo(
    () => ({
      surfaces: registry.surfaces,
      isLoaded: registry.isLoaded,
      addSurface: registryAddSurface,
      removeSurface: registryRemoveSurface,
      updatePizarraLayout: registry.updatePizarraLayout,
      updateSurface: registryUpdateSurface,
      resetSurfaces: registry.resetSurfaces,
    }),
    [
      registry.surfaces,
      registry.isLoaded,
      registryAddSurface,
      registryRemoveSurface,
      registry.updatePizarraLayout,
      registryUpdateSurface,
      registry.resetSurfaces,
    ]
  );

  useEffect(() => {
    if (!registry.isLoaded || !activeWorkspace) return;

    const wsId = activeWorkspace.id;
    const windows = workspaceWindows[wsId] || [];
    const activeWindowId = activeWindowIds[wsId] || windows[0]?.id || null;

    const { terminals: builtTerminals } = buildTerminalSurfacesFromWindows({
      workspaceId: wsId,
      windows,
      activeWindowId,
      liveColumns: activeWorkspace.columns,
      resolveRequestedRenderer: ({ workspaceId, panelId, prefs }) =>
        resolveRequestedRenderer({ workspaceId, panelId, prefs }),
      terminalRendererPreferences,
      resolveLabel: (panel) => resolvePanelSurfaceLabel(panel, wsId),
    });

    const terminals = builtTerminals;

    const browserOpen = browserWindowStates?.[activeWorkspace.id]?.open === true;
    const browsers = [];
    if (browserOpen) {
      const browserState = browserWindowStates?.[activeWorkspace.id] || {};
      const layoutPriority = browserState?.pizarraLayoutPriority === true;
      browsers.push({
        id: `shape-browser-${activeWorkspace.id}`,
        type: 'browser',
        panelId: `browser-${activeWorkspace.id}`,
        label: browserState?.label || `Browser ${activeWorkspace.id}`,
        url: browserState?.url || 'http://localhost:3000/',
        pizarra: {
          x: null,
          y: null,
          width: 1024,
          height: 700,
          visible: true,
          ...(layoutPriority ? { layoutPriority: true } : {}),
        },
      });
    }

    const activeSurfaces = [...terminals, ...browsers];

    let changed = false;
    const nextSurfaces = [...registry.surfaces];

    activeSurfaces.forEach((as) => {
      const existing = nextSurfaces.find(
        (s) => s.id === as.id || (as.panelId && s.panelId === as.panelId)
      );
      if (!existing) {
        nextSurfaces.push(as);
        changed = true;
      } else {
        let itemChanged = false;
        if (existing.label !== as.label) {
          existing.label = as.label;
          itemChanged = true;
        }
        if (as.type === 'browser' && existing.url !== as.url) {
          existing.url = as.url;
          itemChanged = true;
        }
        if (as.type === 'browser' && as.pizarra) {
          const prevPizarra = existing.pizarra || {};
          const nextPizarra = {
            ...prevPizarra,
            ...as.pizarra,
            visible: as.pizarra.visible !== false ? true : prevPizarra.visible,
          };
          const pizarraChanged =
            prevPizarra.visible !== nextPizarra.visible ||
            prevPizarra.layoutPriority !== nextPizarra.layoutPriority;
          if (pizarraChanged) {
            existing.pizarra = nextPizarra;
            itemChanged = true;
          }
        }
        if (
          as.requestedRendererMode &&
          existing.requestedRendererMode !== as.requestedRendererMode
        ) {
          existing.requestedRendererMode = as.requestedRendererMode;
          itemChanged = true;
        }
        const nextViewId = as.pizarra?.viewId;
        if (nextViewId && existing.pizarra?.viewId !== nextViewId) {
          existing.pizarra = { ...(existing.pizarra || {}), viewId: nextViewId };
          itemChanged = true;
        }
        if (itemChanged) {
          changed = true;
        }
      }
    });

    const finalSurfaces = nextSurfaces.filter((s) => {
      const stillExists = activeSurfaces.some(
        (as) => as.id === s.id || (s.panelId && as.panelId === s.panelId)
      );
      if (stillExists) return true;

      if (s.type === 'browser' && !isDedicatedBrowserSurface(s)) {
        return true;
      }

      changed = true;
      return false;
    });

    if (changed) {
      try {
        registry.resetSurfaces(finalSurfaces);
      } catch (err) {
        console.error('[TerminalWorkspacesManager] registry reconcile failed:', err);
      }
    }

    const browserSurfaces = finalSurfaces.filter((s) => s.type === 'browser');
    if (browserWindowStates?.[activeWorkspace.id]?.open === true) {
      logPizarraBrowser('registry-reconcile', {
        workspaceId: activeWorkspace.id,
        terminalCount: terminals.length,
        browserCount: browserSurfaces.length,
        browsers: browserSurfaces.map((b) => ({
          id: b.id,
          panelId: b.panelId,
          visible: b.pizarra?.visible,
          layoutPriority: b.pizarra?.layoutPriority,
        })),
      });
    }
  }, [
    activeWorkspace,
    activeWindowIds,
    workspaceWindows,
    browserWindowStates,
    registry.isLoaded,
    registry.surfaces,
    registry.resetSurfaces,
    isDedicatedBrowserSurface,
    terminalRendererPreferences,
  ]);

  return {
    registry,
    registryValue,
  };
}
