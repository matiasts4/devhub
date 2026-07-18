// useWorkspacePanelLifecycle — panel lifecycle, focus, navigation, split/close.
// Extracted from TerminalWorkspacesManager.jsx (Slice 7).

import { useCallback, useRef, useEffect } from 'react';
import { createClient } from '@/lib/db/localClient';
import { closeTerminalSessions } from '@/components/terminal/workspaceStateHelpers';
import {
  resolveSplitCreatedPanelProps,
  spawnFirstTerminalPanelColumns,
} from '@/components/terminal/utils/panelHelpers';
import {
  createPanelWithDisplayNameFactory,
  getPanelIdsFromColumns,
  resolveWorkspacePanelId,
} from '@/components/terminal/models/workspaceStateModel';
import {
  LIFECYCLE_BURST_PHASES,
  PANEL_LIFECYCLE_REASONS,
  schedulePostSplitLayoutViewportSync,
  scheduleTerminalLifecycleSync,
} from '@/lib/terminal/terminalLifecycleSync';

import { dispatchTerminalWindowVisible } from '@/components/terminal/nativeLayoutSync';
import { resolveActiveWorkspaceWindowId } from '@/lib/terminal/workspaceWindowRender';
import { resolveWorkspaceWindowAfterPanelClose } from '@/lib/terminal/swarmLaunchWorkspace';
import { countPanelsInColumns } from '@/lib/terminal/workspaceSurfaceReconcile';
import {
  MAX_WORKSPACE_TERMINAL_PANELS,
  isWorkspaceTerminalPanelLimitReached,
} from '@/lib/terminal/workspaceTerminalLimits';
import {
  setPanelRendererPreference,
  TERMINAL_RENDERER_INHERIT_MODE,
} from '@/components/terminal/terminalRendererPreferences';
import {
  getAdjacentWorkspaceId,
  resolveHorizontalNavigation,
  resolvePanelNavigationDirection,
  resolveVerticalNavigation,
  CLOSE_PANEL_SHORTCUT_ARM_MS,
} from '@/components/terminal/workspaceShortcuts';
import { shouldDeferRightDockSizePersist } from '@/components/terminal/rightDockLayerSync';
import { logPizarraBrowser } from '@/lib/debug/pizarraBrowserDebug';

export default function useWorkspacePanelLifecycle({
  workspacesRef,
  activeWsIdRef,
  activePanelIdsRef,
  activeWindowIdsRef,
  workspaceWindowsRef,
  focusedPanelByWorkspaceRef,
  panelsClosingRef,
  colCounterRef,
  panelCounterRef,
  setWorkspaces,
  setActiveWsId,
  setActivePanelIds,
  setFocusedPanelByWorkspace,
  setWorkspaceWindows,
  setActiveWindowIds,
  setTerminalRendererPreferences,
  setPanelNavPulseId,
  setShortcutHint,
  setIsDraggingInternalSplit,
  setIsDraggingDock,
  workspaces,
  activeWsId,
  activeWorkspace,
  activePanelId,
  activeWindowIds,
  workspaceWindows,
  focusedPanelByWorkspace,
  isVisible,
  isClientLoaded,
  isDraggingInternalSplit,
  isDraggingDock,
  pizarraOwnsLiveSurfaces,
  cwd,
  projectId,
  notifyNativeLayoutSettled,
  notifyNativeWorkspaceSurfaceSync,
  syncActiveWindowSnapshot,
  collectSiblingPanelNames,
  isDraggingDockRef,
  pendingDockSizeRef,
  applyLiveRightDockBoundsRef,
  syncRightDockMeasuredBoundsRef,
  updateRightDockState,
}) {
  const panelNavPulseTimeoutRef = useRef(null);
  const panelLayoutDebounceRef = useRef(null);
  const closePanelShortcutArmedRef = useRef(null);
  const closePanelShortcutArmTimerRef = useRef(null);
  const prevActiveWsIdRef = useRef('');
  const prevActiveWorkspaceWindowIdRef = useRef(undefined);
  const isFirstActiveWindowIdsRunRef = useRef(true);

  const markPanelsClosing = useCallback(
    (panelIds = [], clearAfterMs = 2000) => {
      const ids = Array.isArray(panelIds) ? panelIds.filter(Boolean) : [];
      ids.forEach((id) => panelsClosingRef.current.add(id));
      if (clearAfterMs > 0 && typeof window !== 'undefined') {
        ids.forEach((id) => {
          window.setTimeout(() => panelsClosingRef.current.delete(id), clearAfterMs);
        });
      }
    },
    [panelsClosingRef]
  );

  const syncPanelLifecycleLayout = useCallback(
    (reason, workspaceId, panelIds, { phases, notifyNative = true } = {}) => {
      return scheduleTerminalLifecycleSync({
        reason,
        workspaceId,
        panelIds,
        phases: phases || LIFECYCLE_BURST_PHASES[reason] || undefined,
        notifyNative: notifyNative ? notifyNativeLayoutSettled : undefined,
      });
    },
    [notifyNativeLayoutSettled]
  );

  const resolveActiveWindowPanelIds = useCallback(
    (wsId) => {
      if (!wsId) return [];
      const windowId = resolveActiveWorkspaceWindowId(wsId, workspaceWindows, activeWindowIds);
      const windows = workspaceWindows?.[wsId] || [];
      const activeWindow = windows.find((win) => win.id === windowId);
      if (activeWindow) {
        return getPanelIdsFromColumns(activeWindow.columns || []);
      }
      const ws = workspaces.find((entry) => entry.id === wsId);
      return getPanelIdsFromColumns(ws?.columns || []);
    },
    [activeWindowIds, workspaceWindows, workspaces]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !isClientLoaded) return undefined;

    const wsId = activeWsId;
    const isInitialMount = prevActiveWsIdRef.current === '';
    const workspaceChanged = prevActiveWsIdRef.current !== wsId;
    prevActiveWsIdRef.current = wsId || '';
    if (isInitialMount || !workspaceChanged || !wsId) return undefined;

    const focusedPanelId = focusedPanelByWorkspaceRef.current?.[wsId];
    if (focusedPanelId) {
      const windowId = resolveActiveWorkspaceWindowId(wsId, workspaceWindows, activeWindowIds);
      const windows = workspaceWindows?.[wsId] || [];
      const activeWindow = windows.find((win) => win.id === windowId);
      const activeWindowPanelIds = getPanelIdsFromColumns(activeWindow?.columns || []);
      if (!activeWindowPanelIds.includes(focusedPanelId)) {
        setFocusedPanelByWorkspace((prev) => {
          if (!prev[wsId]) return prev;
          const next = { ...prev };
          delete next[wsId];
          return next;
        });
      }
    }

    const panelIds = resolveActiveWindowPanelIds(wsId);
    const cleanupSplitSync =
      panelIds.length > 1
        ? schedulePostSplitLayoutViewportSync({
            workspaceId: wsId,
            panelIds,
          })
        : undefined;

    notifyNativeWorkspaceSurfaceSync('workspace-switch');

    return () => {
      cleanupSplitSync?.();
    };
  }, [
    activeWindowIds,
    activeWsId,
    isClientLoaded,
    notifyNativeWorkspaceSurfaceSync,
    resolveActiveWindowPanelIds,
    workspaceWindows,
  ]);

  useEffect(() => {
    if (!isClientLoaded) return undefined;
    const isInitialMount = isFirstActiveWindowIdsRunRef.current;
    isFirstActiveWindowIdsRunRef.current = false;
    const activeWorkspaceWindowIdChanged =
      !isInitialMount && prevActiveWorkspaceWindowIdRef.current !== activeWindowIds[activeWsId];
    prevActiveWorkspaceWindowIdRef.current = activeWindowIds[activeWsId];
    if (isInitialMount) return undefined;
    // Closing/opening OTHER workspaces also mutates this map (keys get added or
    // removed), which would otherwise re-fire this effect and double up with
    // removeWorkspace's own survivor-recover burst for the same close. Only the
    // currently active workspace's own window selection changing warrants a
    // window-switch recovery here.
    if (!activeWorkspaceWindowIdChanged) return undefined;

    const wsId = activeWsId;
    if (!wsId) return undefined;

    const focusedPanelId = focusedPanelByWorkspaceRef.current?.[wsId];
    if (focusedPanelId) {
      const windowId = resolveActiveWorkspaceWindowId(wsId, workspaceWindows, activeWindowIds);
      const windows = workspaceWindows?.[wsId] || [];
      const activeWindow = windows.find((win) => win.id === windowId);
      const activeWindowPanelIds = getPanelIdsFromColumns(activeWindow?.columns || []);
      if (!activeWindowPanelIds.includes(focusedPanelId)) {
        setFocusedPanelByWorkspace((prev) => {
          if (!prev[wsId]) return prev;
          const next = { ...prev };
          delete next[wsId];
          return next;
        });
      }
    }

    const panelIds = resolveActiveWindowPanelIds(wsId);
    const cleanupSplitSync =
      panelIds.length > 1
        ? schedulePostSplitLayoutViewportSync({
            workspaceId: wsId,
            panelIds,
          })
        : undefined;

    notifyNativeWorkspaceSurfaceSync('workspace-window-switch');

    // Soft reveal for panels that just became layout-visible (same golden path as
    // pre-mount parity); does not replace layout-show on isVisibleInLayout flip.
    if (typeof window !== 'undefined' && panelIds.length > 0) {
      requestAnimationFrame(() => {
        dispatchTerminalWindowVisible({
          panelIds,
          workspaceId: wsId,
          reason: PANEL_LIFECYCLE_REASONS.WORKSPACE_WINDOW_SWITCH,
        });
      });
    }

    return () => {
      cleanupSplitSync?.();
    };
  }, [
    activeWindowIds,
    activeWsId,
    isClientLoaded,
    notifyNativeWorkspaceSurfaceSync,
    resolveActiveWindowPanelIds,
    setFocusedPanelByWorkspace,
    workspaceWindows,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isClientLoaded) return undefined;
    const reason = pizarraOwnsLiveSurfaces ? 'pizarra-mode-enter' : 'pizarra-mode-exit';
    notifyNativeLayoutSettled(reason);
    return undefined;
  }, [isClientLoaded, notifyNativeLayoutSettled, pizarraOwnsLiveSurfaces]);

  const handlePanelGroupLayout = useCallback(() => {
    if (isDraggingInternalSplit || isDraggingDock) return;

    if (panelLayoutDebounceRef.current) {
      clearTimeout(panelLayoutDebounceRef.current);
    }

    panelLayoutDebounceRef.current = setTimeout(() => {
      panelLayoutDebounceRef.current = null;
      const panelIds = activeWsId ? resolveActiveWindowPanelIds(activeWsId) : [];
      const multiPanelGrid = panelIds.length > 1 && !focusedPanelByWorkspace[activeWsId];

      if (multiPanelGrid) {
        syncPanelLifecycleLayout('panel-group-layout', activeWsId, panelIds);
        return;
      }

      notifyNativeLayoutSettled('panel-group-layout');
    }, 32);
  }, [
    activeWsId,
    focusedPanelByWorkspace,
    isDraggingDock,
    isDraggingInternalSplit,
    notifyNativeLayoutSettled,
    resolveActiveWindowPanelIds,
    syncPanelLifecycleLayout,
  ]);

  useEffect(
    () => () => {
      if (panelLayoutDebounceRef.current) {
        clearTimeout(panelLayoutDebounceRef.current);
        panelLayoutDebounceRef.current = null;
      }
    },
    []
  );

  const handleInternalSplitDragging = useCallback(
    (dragging) => {
      setIsDraggingInternalSplit(dragging);
      if (!dragging) {
        notifyNativeLayoutSettled('internal-split-drag-end');
      }
    },
    [notifyNativeLayoutSettled, setIsDraggingInternalSplit]
  );

  const handleDockDragging = useCallback(
    (dragging) => {
      isDraggingDockRef.current = dragging;
      setIsDraggingDock(dragging);
      if (dragging) {
        applyLiveRightDockBoundsRef.current?.();
        return;
      }

      const pendingSize = pendingDockSizeRef.current;
      if (pendingSize != null) {
        updateRightDockState({ size: pendingSize });
        pendingDockSizeRef.current = null;
      }
      syncRightDockMeasuredBoundsRef.current?.();
      notifyNativeLayoutSettled('right-dock-drag-end');
    },
    [
      applyLiveRightDockBoundsRef,
      isDraggingDockRef,
      notifyNativeLayoutSettled,
      pendingDockSizeRef,
      setIsDraggingDock,
      syncRightDockMeasuredBoundsRef,
      updateRightDockState,
    ]
  );

  const schedulePanelFocusLayoutSync = useCallback(
    (workspaceId, panelIds) => {
      syncPanelLifecycleLayout(PANEL_LIFECYCLE_REASONS.PANEL_FOCUS, workspaceId, panelIds);
    },
    [syncPanelLifecycleLayout]
  );

  const pulsePanelNavigation = useCallback(
    (panelId) => {
      if (!panelId) return;
      if (panelNavPulseTimeoutRef.current) {
        window.clearTimeout(panelNavPulseTimeoutRef.current);
      }
      setPanelNavPulseId(panelId);
      panelNavPulseTimeoutRef.current = window.setTimeout(() => {
        setPanelNavPulseId((current) => (current === panelId ? null : current));
      }, 150);
    },
    [setPanelNavPulseId]
  );

  const activateWorkspacePanel = useCallback(
    (workspaceId, panelId) => {
      if (!workspaceId || !panelId) return;

      setActiveWsId((prev) => (prev === workspaceId ? prev : workspaceId));
      setActivePanelIds((prev) =>
        prev[workspaceId] === panelId ? prev : { ...prev, [workspaceId]: panelId }
      );

      const focusedPanelId = focusedPanelByWorkspaceRef.current?.[workspaceId];
      if (focusedPanelId) {
        const activeWindowId = activeWindowIdsRef.current?.[workspaceId];
        const windows = workspaceWindowsRef.current?.[workspaceId] || [];
        const activeWindow = windows.find((win) => win.id === activeWindowId);
        const activeWindowPanelIds = getPanelIdsFromColumns(activeWindow?.columns || []);
        if (!activeWindowPanelIds.includes(panelId)) {
          setFocusedPanelByWorkspace((prev) => {
            if (!prev[workspaceId]) return prev;
            const next = { ...prev };
            delete next[workspaceId];
            return next;
          });
        }
      }

      setWorkspaceWindows((prev) => {
        const windows = prev[workspaceId] || [];
        const activeWindowId = activeWindowIdsRef.current?.[workspaceId];
        if (!activeWindowId || windows.length === 0) return prev;

        let changed = false;
        const nextWindows = windows.map((windowView) => {
          if (windowView.id !== activeWindowId || windowView.activePanelId === panelId) {
            return windowView;
          }

          changed = true;
          return {
            ...windowView,
            activePanelId: panelId,
          };
        });

        return changed ? { ...prev, [workspaceId]: nextWindows } : prev;
      });
    },
    [
      activeWindowIdsRef,
      focusedPanelByWorkspaceRef,
      setActivePanelIds,
      setActiveWsId,
      setFocusedPanelByWorkspace,
      setWorkspaceWindows,
      workspaceWindowsRef,
    ]
  );

  const clearPanelFocusMode = useCallback(
    (workspaceId) => {
      if (!workspaceId) return;
      setFocusedPanelByWorkspace((prev) => {
        if (!prev[workspaceId]) return prev;
        const next = { ...prev };
        delete next[workspaceId];
        return next;
      });
      const workspace = workspacesRef.current.find((entry) => entry.id === workspaceId);
      const panelIds = workspace ? getPanelIdsFromColumns(workspace.columns || []) : [];
      schedulePanelFocusLayoutSync(workspaceId, panelIds);
    },
    [schedulePanelFocusLayoutSync, setFocusedPanelByWorkspace, workspacesRef]
  );

  const navigateToPanel = useCallback(
    (workspaceId, panelId) => {
      if (!workspaceId || !panelId) return;
      const hadFocusMode = Boolean(focusedPanelByWorkspaceRef.current[workspaceId]);
      activateWorkspacePanel(workspaceId, panelId);
      if (hadFocusMode) {
        const activeWindowId = activeWindowIdsRef.current?.[workspaceId];
        const windows = workspaceWindowsRef.current?.[workspaceId] || [];
        const activeWindow = windows.find((win) => win.id === activeWindowId);
        const activeWindowPanelIds = getPanelIdsFromColumns(activeWindow?.columns || []);
        if (!activeWindowPanelIds.includes(panelId)) {
          setFocusedPanelByWorkspace((prev) => {
            if (!prev[workspaceId]) return prev;
            const next = { ...prev };
            delete next[workspaceId];
            return next;
          });
        } else {
          setFocusedPanelByWorkspace((prev) => ({ ...prev, [workspaceId]: panelId }));
          const workspace = workspacesRef.current.find((entry) => entry.id === workspaceId);
          const panelIds = workspace ? getPanelIdsFromColumns(workspace.columns || []) : [panelId];
          schedulePanelFocusLayoutSync(workspaceId, panelIds);
        }
      }
      pulsePanelNavigation(panelId);
    },
    [
      activateWorkspacePanel,
      activeWindowIdsRef,
      focusedPanelByWorkspaceRef,
      pulsePanelNavigation,
      schedulePanelFocusLayoutSync,
      setFocusedPanelByWorkspace,
      workspaceWindowsRef,
      workspacesRef,
    ]
  );

  const switchWorkspace = useCallback(
    (nextWorkspaceId) => {
      if (!nextWorkspaceId || nextWorkspaceId === activeWsIdRef.current) return;

      const nextWorkspace = workspacesRef.current.find(
        (workspace) => workspace.id === nextWorkspaceId
      );
      const nextPanelId = resolveWorkspacePanelId(
        nextWorkspace,
        activePanelIdsRef.current[nextWorkspaceId]
      );

      const focusedPanelId = focusedPanelByWorkspaceRef.current?.[nextWorkspaceId];
      if (focusedPanelId) {
        const windowId = resolveActiveWorkspaceWindowId(
          nextWorkspaceId,
          workspaceWindowsRef.current,
          activeWindowIdsRef.current
        );
        const windows = workspaceWindowsRef.current?.[nextWorkspaceId] || [];
        const activeWindow = windows.find((win) => win.id === windowId);
        const activeWindowPanelIds = getPanelIdsFromColumns(activeWindow?.columns || []);
        if (!activeWindowPanelIds.includes(focusedPanelId)) {
          setFocusedPanelByWorkspace((prev) => {
            if (!prev[nextWorkspaceId]) return prev;
            const next = { ...prev };
            delete next[nextWorkspaceId];
            return next;
          });
        }
      }

      if (nextPanelId) {
        setActivePanelIds((prev) =>
          prev[nextWorkspaceId] === nextPanelId ? prev : { ...prev, [nextWorkspaceId]: nextPanelId }
        );
        pulsePanelNavigation(nextPanelId);
      }

      setActiveWsId(nextWorkspaceId);
      // Post-commit activeWsId effect emits workspace-switch layout-settled for canvas/webgl.
      // In-workspace V1/V2 switches: panels stay isVisibleInLayout=true; only the window
      // shell toggles opacity (see resolveWorkspaceWindowVisibilityStyle).
    },
    [
      activePanelIdsRef,
      activeWindowIdsRef,
      activeWsIdRef,
      focusedPanelByWorkspaceRef,
      pulsePanelNavigation,
      setActivePanelIds,
      setActiveWsId,
      setFocusedPanelByWorkspace,
      workspaceWindowsRef,
      workspacesRef,
    ]
  );

  const togglePanelFocus = useCallback(
    (workspaceId, panelId) => {
      if (!workspaceId || !panelId) return;
      setFocusedPanelByWorkspace((prev) => {
        if (prev[workspaceId] === panelId) {
          const next = { ...prev };
          delete next[workspaceId];
          return next;
        }
        return { ...prev, [workspaceId]: panelId };
      });
      setActivePanelIds((prev) => ({ ...prev, [workspaceId]: panelId }));

      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      const panelIds = workspace ? getPanelIdsFromColumns(workspace.columns || []) : [panelId];
      schedulePanelFocusLayoutSync(workspaceId, panelIds);
    },
    [schedulePanelFocusLayoutSync, setActivePanelIds, setFocusedPanelByWorkspace, workspaces]
  );

  const applyTerminalNavigationAction = useCallback(
    (navAction) => {
      if (!navAction || !isVisible) return false;

      const currentWorkspaceId = activeWsIdRef.current;
      const currentWorkspace = workspacesRef.current.find(
        (workspace) => workspace.id === currentWorkspaceId
      );
      const currentPanelId = resolveWorkspacePanelId(
        currentWorkspace,
        activePanelIdsRef.current[currentWorkspaceId]
      );

      if (navAction === 'togglePanelFocus') {
        if (!currentPanelId) return false;
        togglePanelFocus(currentWorkspaceId, currentPanelId);
        return true;
      }

      if (navAction === 'previousWorkspace' || navAction === 'nextWorkspace') {
        const nextWorkspaceId = getAdjacentWorkspaceId(
          workspacesRef.current,
          currentWorkspaceId,
          navAction === 'previousWorkspace' ? 'previous' : 'next'
        );
        if (!nextWorkspaceId || nextWorkspaceId === currentWorkspaceId) return false;
        const nextWorkspace = workspacesRef.current.find(
          (workspace) => workspace.id === nextWorkspaceId
        );
        const nextPanelId = resolveWorkspacePanelId(
          nextWorkspace,
          activePanelIdsRef.current[nextWorkspaceId]
        );
        switchWorkspace(nextWorkspaceId);
        return true;
      }

      if (!currentWorkspace || !currentPanelId) return false;

      const panelDirection = resolvePanelNavigationDirection(navAction);
      if (!panelDirection) return false;

      const isHorizontal = panelDirection === 'left' || panelDirection === 'right';
      const navDirection =
        panelDirection === 'left' || panelDirection === 'up' ? 'previous' : 'next';
      const navigationTarget = isHorizontal
        ? resolveHorizontalNavigation(
            workspacesRef.current,
            currentWorkspace,
            currentPanelId,
            navDirection
          )
        : resolveVerticalNavigation(
            workspacesRef.current,
            currentWorkspace,
            currentPanelId,
            navDirection
          );

      if (!navigationTarget) return false;

      if (navigationTarget.type === 'panel') {
        if (!navigationTarget.panelId || navigationTarget.panelId === currentPanelId) return false;
        navigateToPanel(currentWorkspaceId, navigationTarget.panelId);
        return true;
      }

      const nextWorkspaceId = navigationTarget.workspaceId;
      if (!nextWorkspaceId || nextWorkspaceId === currentWorkspaceId) return false;
      const nextWorkspace = workspacesRef.current.find(
        (workspace) => workspace.id === nextWorkspaceId
      );
      const nextPanelId = resolveWorkspacePanelId(
        nextWorkspace,
        activePanelIdsRef.current[nextWorkspaceId]
      );
      switchWorkspace(nextWorkspaceId);
      return true;
    },
    [
      activePanelIdsRef,
      activeWsIdRef,
      isVisible,
      navigateToPanel,
      switchWorkspace,
      togglePanelFocus,
      workspacesRef,
    ]
  );

  const handleSplit = useCallback(
    (
      direction,
      sourcePanelId = null,
      initialCommand = null,
      panelCwd = null,
      explicitPanelId = null,
      kind = null
    ) => {
      const targetWorkspaceId = activeWsIdRef.current || activeWsId;
      if (!targetWorkspaceId) return null;
      const panelKindMeta = kind ? { kind } : null;

      const targetWorkspace = workspacesRef.current.find((ws) => ws.id === targetWorkspaceId);
      const activeWindowId = resolveActiveWorkspaceWindowId(
        targetWorkspaceId,
        workspaceWindowsRef.current,
        activeWindowIdsRef.current
      );
      const activeWindow = (workspaceWindowsRef.current?.[targetWorkspaceId] || []).find(
        (win) => win.id === activeWindowId
      );
      const columnsForLayout =
        activeWindow?.columns?.length > 0 ? activeWindow.columns : targetWorkspace?.columns || [];
      const currentPanelCount = countPanelsInColumns(columnsForLayout);
      if (isWorkspaceTerminalPanelLimitReached(currentPanelCount)) {
        console.warn(
          `[DevHub] Terminal panel limit reached (${currentPanelCount}/${MAX_WORKSPACE_TERMINAL_PANELS})`
        );
        return null;
      }

      // Empty workspace: spawn the first panel (pizarra "Add Terminal", Zed, etc.).
      if (currentPanelCount === 0) {
        const spawned = spawnFirstTerminalPanelColumns({
          createPanel: createPanelWithDisplayNameFactory(targetWorkspaceId, () =>
            collectSiblingPanelNames(targetWorkspaceId)
          ),
          allocateColumnId: () => {
            colCounterRef.current += 1;
            return `c${colCounterRef.current}`;
          },
          allocatePanelId: () => {
            panelCounterRef.current += 1;
            return `p${panelCounterRef.current}`;
          },
          initialCommand:
            panelKindMeta?.kind && panelKindMeta.kind !== 'terminal' ? null : initialCommand,
          panelCwd,
          explicitPanelId,
          kind: panelKindMeta?.kind || null,
        });
        const { columns: newColumns, panelId: newPanelId } = spawned;
        setWorkspaces((prev) =>
          prev.map((ws) => (ws.id === targetWorkspaceId ? { ...ws, columns: newColumns } : ws))
        );
        setActivePanelIds((prev) => ({ ...prev, [targetWorkspaceId]: newPanelId }));
        setTerminalRendererPreferences((prev) =>
          setPanelRendererPreference(
            prev,
            targetWorkspaceId,
            newPanelId,
            TERMINAL_RENDERER_INHERIT_MODE
          )
        );
        syncActiveWindowSnapshot(targetWorkspaceId, newColumns, newPanelId);
        logPizarraBrowser('spawn-first-panel', {
          workspaceId: targetWorkspaceId,
          panelId: newPanelId,
        });
        syncPanelLifecycleLayout(
          PANEL_LIFECYCLE_REASONS.PANEL_SPLIT,
          targetWorkspaceId,
          getPanelIdsFromColumns(newColumns)
        );
        return newPanelId;
      }

      const targetId =
        sourcePanelId || activePanelIdsRef.current[activeWsIdRef.current] || activePanelId;
      if (!targetId) return null;

      // T-029b: if the caller supplies an explicitPanelId (e.g. Zed's
      // open_terminal tool result, which returns the ttyServer session id),
      // reuse it as the new panel id. This makes TerminalTTY's
      // `?sessionId=${id}` query resolve to the same PTY session the model
      // is talking to, so the visual panel shows the same output the model
      // sees. Falls back to the counter when no explicit id is provided
      // (e.g. user-driven splits).
      const newPanelId =
        typeof explicitPanelId === 'string' && explicitPanelId.length > 0
          ? explicitPanelId
          : `p${panelCounterRef.current + 1}`;
      if (newPanelId === `p${panelCounterRef.current + 1}`) {
        panelCounterRef.current += 1;
      } else {
        const explicitNumeric = /^p(\d+)$/.exec(newPanelId);
        if (explicitNumeric) {
          const n = Number(explicitNumeric[1]);
          if (Number.isFinite(n) && n > panelCounterRef.current) {
            panelCounterRef.current = n;
          }
        }
      }
      const makePanel = createPanelWithDisplayNameFactory(targetWorkspaceId, () =>
        collectSiblingPanelNames(targetWorkspaceId)
      );
      let splitSyncPanelIds = [];
      setWorkspaces((prev) =>
        prev.map((ws) => {
          if (ws.id !== targetWorkspaceId) return ws;

          const windowId = resolveActiveWorkspaceWindowId(
            targetWorkspaceId,
            workspaceWindowsRef.current,
            activeWindowIdsRef.current
          );
          const windowEntry = (workspaceWindowsRef.current?.[targetWorkspaceId] || []).find(
            (win) => win.id === windowId
          );
          const sourceColumns =
            windowEntry?.columns?.length > 0 ? windowEntry.columns : ws.columns || [];

          const nextColumnsSnapshot = sourceColumns.map((col) => ({
            ...col,
            panels: [...(col.panels || [])],
          }));

          const colIndex = nextColumnsSnapshot.findIndex((col) =>
            col.panels.some((p) => p.id === targetId)
          );
          if (colIndex === -1) return ws;

          const sourcePanel =
            nextColumnsSnapshot[colIndex]?.panels?.find((panel) => panel.id === targetId) || null;
          const { initialCommand: splitInitialCommand, panelCwd: splitPanelCwd } =
            resolveSplitCreatedPanelProps({
              sourcePanel,
              workspaceCwd: cwd,
              explicitInitialCommand:
                panelKindMeta?.kind && panelKindMeta.kind !== 'terminal' ? null : initialCommand,
              explicitPanelCwd: panelCwd,
            });
          const newPanel = makePanel(newPanelId, splitInitialCommand, splitPanelCwd, panelKindMeta);

          if (direction === 'horizontal') {
            // Split Right: Agregar una nueva columna a la derecha
            colCounterRef.current += 1;
            const newColId = `c${colCounterRef.current}`;
            nextColumnsSnapshot.splice(colIndex + 1, 0, {
              id: newColId,
              panels: [newPanel],
            });
          } else {
            // Split Down: Agregar un nuevo panel debajo en la misma columna
            const panelIndex = nextColumnsSnapshot[colIndex].panels.findIndex(
              (p) => p.id === targetId
            );
            const newPanels = [...nextColumnsSnapshot[colIndex].panels];
            newPanels.splice(panelIndex + 1, 0, newPanel);
            nextColumnsSnapshot[colIndex] = { ...nextColumnsSnapshot[colIndex], panels: newPanels };
          }

          splitSyncPanelIds = getPanelIdsFromColumns(nextColumnsSnapshot);
          syncActiveWindowSnapshot(targetWorkspaceId, nextColumnsSnapshot, newPanelId);
          return { ...ws, columns: nextColumnsSnapshot };
        })
      );

      setActivePanelIds((prev) => ({ ...prev, [targetWorkspaceId]: newPanelId }));
      setTerminalRendererPreferences((prev) =>
        setPanelRendererPreference(
          prev,
          targetWorkspaceId,
          newPanelId,
          TERMINAL_RENDERER_INHERIT_MODE
        )
      );
      if (splitSyncPanelIds.length > 0) {
        syncPanelLifecycleLayout(
          PANEL_LIFECYCLE_REASONS.PANEL_SPLIT,
          targetWorkspaceId,
          splitSyncPanelIds
        );
      }
      return newPanelId;
    },
    [
      activePanelId,
      activePanelIdsRef,
      activeWsId,
      activeWsIdRef,
      colCounterRef,
      collectSiblingPanelNames,
      cwd,
      panelCounterRef,
      setActivePanelIds,
      setTerminalRendererPreferences,
      setWorkspaces,
      syncActiveWindowSnapshot,
      syncPanelLifecycleLayout,
      workspacesRef,
    ]
  );

  const handleClosePanel = useCallback(
    async (panelIdToClose = null) => {
      const targetId = panelIdToClose || activePanelId;
      if (!targetId || !activeWorkspace) return;

      markPanelsClosing([targetId]);

      await closeTerminalSessions([targetId]);

      const nextColumnsSnapshot = activeWorkspace.columns
        .map((col) => ({
          ...col,
          panels: col.panels.filter((p) => p.id !== targetId),
        }))
        .filter((col) => col.panels.length > 0); // Eliminar columnas vacías

      const survivorPanelIds = getPanelIdsFromColumns(nextColumnsSnapshot);
      const windowResolution = resolveWorkspaceWindowAfterPanelClose({
        windows: workspaceWindows[activeWsId] || [],
        activeWindowId: activeWindowIds[activeWsId],
        remainingPanelIds: survivorPanelIds,
      });

      if (windowResolution.action === 'remove') {
        setWorkspaceWindows((prev) => ({
          ...prev,
          [activeWsId]: windowResolution.windows,
        }));
        setActiveWindowIds((prev) => ({
          ...prev,
          [activeWsId]: windowResolution.activeWindowId,
        }));

        const switchedColumns = windowResolution.nextActiveWindow?.columns || [];
        setWorkspaces((prev) =>
          prev.map((ws) => (ws.id === activeWsId ? { ...ws, columns: switchedColumns } : ws))
        );

        const switchedPanelIds = getPanelIdsFromColumns(switchedColumns);
        if (switchedPanelIds.length > 0) {
          syncPanelLifecycleLayout(
            PANEL_LIFECYCLE_REASONS.PANEL_CLOSED,
            activeWsId,
            switchedPanelIds
          );
        }

        if (activePanelId === targetId) {
          setActivePanelIds((p) => ({
            ...p,
            [activeWsId]: windowResolution.nextPanelId,
          }));
        }
      } else {
        setWorkspaces((prev) =>
          prev.map((ws) => (ws.id === activeWsId ? { ...ws, columns: nextColumnsSnapshot } : ws))
        );

        if (survivorPanelIds.length > 0) {
          syncPanelLifecycleLayout(
            PANEL_LIFECYCLE_REASONS.PANEL_CLOSED,
            activeWsId,
            survivorPanelIds
          );
        }

        const fallbackPanel = nextColumnsSnapshot.flatMap((col) => col.panels || [])[0]?.id || null;
        if (activePanelId === targetId) {
          setActivePanelIds((p) => ({ ...p, [activeWsId]: fallbackPanel }));
        }
        syncActiveWindowSnapshot(activeWsId, nextColumnsSnapshot, fallbackPanel);
      }
      setFocusedPanelByWorkspace((prev) => {
        if (prev[activeWsId] !== targetId) return prev;
        const next = { ...prev };
        delete next[activeWsId];
        return next;
      });

      setTerminalRendererPreferences((prev) => {
        const workspacePref = prev.workspaces?.[activeWsId];
        if (!workspacePref) return prev;

        const nextPanels = { ...(workspacePref.panels || {}) };
        delete nextPanels[targetId];

        return {
          ...prev,
          workspaces: {
            ...prev.workspaces,
            [activeWsId]: {
              ...workspacePref,
              panels: nextPanels,
            },
          },
        };
      });

      // When a panel closes, mark any associated OC session as terminated
      // so Agent Room Activity updates correctly on next poll (5s)
      try {
        const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
        const matchingRunKey = Object.keys(runs).find((k) => runs[k]?.panelId === targetId);
        if (matchingRunKey) {
          const run = runs[matchingRunKey];
          // If it was an OpenCode session, write to terminated list
          if (run?.opencodeSessionId) {
            const terminated = JSON.parse(localStorage.getItem('devhub_oc_terminated') || '{}');
            terminated[run.opencodeSessionId] = Date.now();
            localStorage.setItem('devhub_oc_terminated', JSON.stringify(terminated));
          }
          // Also mark in agent_registry if projectId available
          if (projectId) {
            const db = createClient();
            await db
              .from('agent_registry')
              .update({ status: 'idle', updated_at: new Date().toISOString() })
              .eq('agent_id', matchingRunKey);
          }
        }
      } catch {
        // Non-critical
      }
    },
    [
      activePanelId,
      activeWindowIds,
      activeWorkspace,
      activeWsId,
      markPanelsClosing,
      projectId,
      setActivePanelIds,
      setActiveWindowIds,
      setFocusedPanelByWorkspace,
      setTerminalRendererPreferences,
      setWorkspaceWindows,
      setWorkspaces,
      syncActiveWindowSnapshot,
      syncPanelLifecycleLayout,
      workspaceWindows,
    ]
  );

  const clearClosePanelShortcutArm = useCallback(() => {
    if (closePanelShortcutArmTimerRef.current) {
      window.clearTimeout(closePanelShortcutArmTimerRef.current);
      closePanelShortcutArmTimerRef.current = null;
    }
    closePanelShortcutArmedRef.current = null;
    setShortcutHint(null);
  }, [setShortcutHint]);

  const tryClosePanelWithDoubleShortcut = useCallback(
    (panelId) => {
      if (!panelId) return false;

      const now = Date.now();
      const armed = closePanelShortcutArmedRef.current;
      if (armed && armed.panelId === panelId && armed.expiresAt > now) {
        clearClosePanelShortcutArm();
        handleClosePanel(panelId);
        return true;
      }

      if (closePanelShortcutArmTimerRef.current) {
        window.clearTimeout(closePanelShortcutArmTimerRef.current);
      }

      closePanelShortcutArmedRef.current = {
        panelId,
        expiresAt: now + CLOSE_PANEL_SHORTCUT_ARM_MS,
      };
      setShortcutHint('Pulsa Ctrl+Shift+W de nuevo para cerrar esta terminal');
      closePanelShortcutArmTimerRef.current = window.setTimeout(() => {
        if (closePanelShortcutArmedRef.current?.panelId === panelId) {
          clearClosePanelShortcutArm();
        }
      }, CLOSE_PANEL_SHORTCUT_ARM_MS);

      return true;
    },
    [clearClosePanelShortcutArm, handleClosePanel, setShortcutHint]
  );

  useEffect(() => () => clearClosePanelShortcutArm(), [clearClosePanelShortcutArm]);

  return {
    markPanelsClosing,
    syncPanelLifecycleLayout,
    resolveActiveWindowPanelIds,
    activateWorkspacePanel,
    navigateToPanel,
    switchWorkspace,
    togglePanelFocus,
    clearPanelFocusMode,
    pulsePanelNavigation,
    applyTerminalNavigationAction,
    handleSplit,
    handleClosePanel,
    tryClosePanelWithDoubleShortcut,
    clearClosePanelShortcutArm,
    handlePanelGroupLayout,
    handleInternalSplitDragging,
    handleDockDragging,
  };
}
