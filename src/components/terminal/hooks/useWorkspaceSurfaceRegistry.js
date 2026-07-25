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
import { resolveWorkspaceBrowserCacheKey } from '@/lib/pizarra/pizarraViewLayout';
import {
  DEFAULT_BROWSER_URL,
  isLegacyDeadBrowserUrl,
  sanitizeBrowserUrl,
} from '@/components/workspace/rightDockState';

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

  const workspaceBrowserCacheKey = useMemo(
    () => resolveWorkspaceBrowserCacheKey(projectId, activeWorkspace?.id),
    [projectId, activeWorkspace?.id]
  );

  const isDedicatedBrowserSurface = useCallback(
    (s) => {
      if (!activeWorkspace?.id) return false;
      const wid = activeWorkspace.id;
      const pid = String(s?.panelId || '');
      return (
        s.id === `shape-browser-${wid}` ||
        pid === `browser-${wid}` ||
        pid === workspaceBrowserCacheKey
      );
    },
    [activeWorkspace?.id, workspaceBrowserCacheKey]
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
          url: sanitizeBrowserUrl(surface.url, DEFAULT_BROWSER_URL),
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

    const { terminals: builtTerminals, browserPanels = [] } = buildTerminalSurfacesFromWindows({
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

    // One carried browser surface per workspace for the dock/space browser guest.
    // Cache key MUST match WorkspaceBrowserPane: browser-${projectId}-${workspaceId}.
    const browserOpen = browserWindowStates?.[activeWorkspace.id]?.open === true;
    const hasBrowserSpacePanel = browserPanels.length > 0;
    const browsers = [];
    if (browserOpen || hasBrowserSpacePanel) {
      const browserState = browserWindowStates?.[activeWorkspace.id] || {};
      const layoutPriority = browserState?.pizarraLayoutPriority === true;
      // Prefer live dock URL; never seed with dead localhost:3000/3200 defaults.
      const dockUrl = sanitizeBrowserUrl(
        effectiveRightDockState?.browserUrl ||
          browserState?.url ||
          browserPanels[0]?.panel?.url ||
          DEFAULT_BROWSER_URL,
        DEFAULT_BROWSER_URL
      );
      const viewIdForBrowser = browserPanels[0]?.viewId || activeWindowId || windows[0]?.id || null;

      let dockSide = 'right';
      if (hasBrowserSpacePanel) {
        const bCol = browserPanels[0]?.colIndex ?? 0;
        const tCol = terminals[0]?.colIndex ?? 0;
        dockSide = bCol < tCol ? 'left' : 'right';
      } else if (browserState?.dockSide) {
        dockSide = browserState.dockSide;
      }

      browsers.push({
        id: `shape-browser-${activeWorkspace.id}`,
        type: 'browser',
        // Align with WorkspaceBrowserPane / ElectronWebviewBrowser cacheKey.
        panelId: workspaceBrowserCacheKey,
        label: 'Browser',
        url: dockUrl,
        pizarra: {
          x: null,
          y: null,
          width: 1024,
          height: 700,
          visible: true,
          // Always keep the workspace dock browser in pizarra adaptive layout
          // (otherwise 2+ terminals hide the carried browser → "gone" after toggles).
          layoutPriority: true,
          dockSide,
          ...(viewIdForBrowser ? { viewId: viewIdForBrowser } : {}),
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
          // Never clobber a real navigated URL with a legacy dead default (3000/3200).
          const incomingDead = isLegacyDeadBrowserUrl(as.url);
          const existingDead = isLegacyDeadBrowserUrl(existing.url);
          if (incomingDead && !existingDead) {
            // keep existing.url
          } else if (as.url) {
            existing.url = sanitizeBrowserUrl(as.url, existing.url || DEFAULT_BROWSER_URL);
            itemChanged = true;
          }
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
            prevPizarra.layoutPriority !== nextPizarra.layoutPriority ||
            prevPizarra.dockSide !== nextPizarra.dockSide;
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
    projectId,
    workspaceBrowserCacheKey,
    effectiveRightDockState?.browserUrl,
  ]);

  return {
    registry,
    registryValue,
  };
}
