// useWorkspaceBootstrapEffect — mount-time bootstrap, hydration, and persistence effects.
// Extracted from TerminalWorkspacesManager.jsx (Slice 5).

import { useCallback, useEffect } from 'react';
import {
  NEXT_DEV_OVERLAY_HIDE_STYLE_ID,
  createDefaultWorkspaceState,
  normalizeWorkspaceState,
  normalizeWorkspaceWindows,
} from '@/components/terminal/models/workspaceStateModel';
import { readAgentRunsByPanel } from '@/components/terminal/models/swarmRoleModel';
import {
  getDisplayName as getPanelDisplayNameFromStore,
  setDisplayName as setPanelDisplayNameInStore,
  nextDisplayNameForPanel as nextPoolNameForWorkspace,
} from '@/lib/terminal/panelDisplayName';
import { syncWorkspaceCountersMonotonic } from '@/components/terminal/workspaceStateHelpers';
import { hydrateSwarmLaunchWrapperFlags } from '@/lib/terminal/swarmLaunchWrapperLifecycle';
import {
  normalizeWorkspacesOpenCodeCommands,
  readWorkspaceRestorePreferences,
} from '@/lib/terminal/restorePolicyResolver';
import {
  readTerminalRendererPreferences,
  writeTerminalRendererPreferences,
} from '@/components/terminal/terminalRendererPreferences';
import { readRightDockState } from '@/components/workspace/rightDockState';
import { readBrowserWindowStates } from '@/components/workspace/browserWindowState';
import {
  buildRestoreManifestFromWorkspaceState,
  collectWorkspacePanelIds,
} from '@/lib/terminal/startupRestoreCoordinator';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';
import {
  buildCleanTerminalStatePayload,
  flushTerminalSessionPersistence,
} from '@/lib/terminal/terminalSessionFlush';
import {
  createWorkspaceRestoreCoordinator,
  seedSuspendedOpenCodePanels,
} from '@/components/workspace/WorkspaceRestoreCoordinator';
import {
  markStartupRestoreCompletedForSession,
  shouldRunStartupRestoreThisPageLoad,
} from '@/lib/terminal/startupRestoreRunner';
import { writeBrowserWindowStates } from '@/components/workspace/browserWindowState';
import { pruneOrphanWorkspaceScopedStorage } from '@/components/workspace/workspaceScopedStorage';

export default function useWorkspaceBootstrapEffect({
  projectId,
  storage,
  isVisible,
  terminalStateStorageKey,
  restoreManifestStorageKey,
  isClientLoaded,
  setIsClientLoaded,
  isMaximized,
  deferHeavySurfacesUntilPaint,
  heavySurfacesReady,
  setHeavySurfacesReady,
  workspaces,
  setWorkspaces,
  activeWsId,
  setActiveWsId,
  activePanelIds,
  setActivePanelIds,
  workspaceWindows,
  setWorkspaceWindows,
  activeWindowIds,
  setActiveWindowIds,
  terminalRendererPreferences,
  setTerminalRendererPreferences,
  setBrowserWindowStates,
  setDockWorkspaceId,
  setRightDockState,
  browserWindowStates,
  agentRunsByPanel,
  applyPanelRelaunchCommand,
  setPanelRestoreModes,
  setReopenActionError,
  refBag,
}) {
  const {
    wsCounterRef,
    colCounterRef,
    panelCounterRef,
    windowCounterRef,
    terminalHydrationReadyRef,
    bootPanelIdsRef,
    legacyCounterRandomizeEligibleRef,
    activeWsIdRef,
    activePanelIdsRef,
    workspaceWindowsRef,
    activeWindowIdsRef,
    workspacesRef,
    hasRunStartupRestoreRef,
    startupRestoreCompletedRef,
  } = refBag;

  useEffect(() => {
    if (!deferHeavySurfacesUntilPaint || !isVisible || heavySurfacesReady) return undefined;

    let cancelled = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!cancelled) setHeavySurfacesReady(true);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [deferHeavySurfacesUntilPaint, heavySurfacesReady, isVisible, setHeavySurfacesReady]);

  useEffect(() => {
    if (!isVisible || typeof document === 'undefined') return undefined;

    const style = document.createElement('style');
    style.id = NEXT_DEV_OVERLAY_HIDE_STYLE_ID;
    style.textContent = `
      nextjs-portal,
      [data-nextjs-toast],
      [data-nextjs-dialog-overlay],
      [data-nextjs-dialog],
      [data-nextjs-errors-dialog-overlay] {
        display: none !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.getElementById(NEXT_DEV_OVERLAY_HIDE_STYLE_ID)?.remove();
    };
  }, [isVisible]);

  // Persist maximize state
  useEffect(() => {
    try {
      storage?.setItem('devhub_terminal_maximized', String(isMaximized));
    } catch {
      /* ignore */
    }
  }, [isMaximized, storage]);

  // Dispatch maximize toggle event for App.js to react
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('devhub:toggle-maximize', { detail: { isMaximized } }));
  }, [isMaximized]);

  // --- LocalStorage Persistence ---
  useEffect(() => {
    try {
      const savedState =
        storage?.getItem(terminalStateStorageKey) || storage?.getItem('devhub_terminal_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.workspaces && parsed.workspaces.length > 0) {
          const normalizedState = normalizeWorkspaceState(
            parsed.workspaces,
            parsed.activeWsId,
            parsed.activePanelIds
          );

          const hydratedAgentRuns = readAgentRunsByPanel(storage);
          const hydratedWorkspaces = hydrateSwarmLaunchWrapperFlags(
            normalizeWorkspacesOpenCodeCommands(normalizedState.workspaces, hydratedAgentRuns),
            storage
          );

          setWorkspaces(hydratedWorkspaces);
          setActiveWsId(normalizedState.activeWsId);
          setActivePanelIds(normalizedState.activePanelIds);

          const normalizedWindows = normalizeWorkspaceWindows(
            parsed.workspaceWindows || {},
            parsed.activeWindowIds || {},
            hydratedWorkspaces,
            normalizedState.activePanelIds
          );

          setWorkspaceWindows(normalizedWindows.workspaceWindows);
          setActiveWindowIds(normalizedWindows.activeWindowIds);
          setTerminalRendererPreferences(
            readTerminalRendererPreferences(storage, projectId, hydratedWorkspaces)
          );
          windowCounterRef.current = Math.max(
            windowCounterRef.current,
            normalizedWindows.windowCounter
          );

          const nextCounters = syncWorkspaceCountersMonotonic(hydratedWorkspaces, {
            workspace: wsCounterRef.current,
            column: colCounterRef.current,
            panel: panelCounterRef.current,
          });

          wsCounterRef.current = nextCounters.workspace;
          colCounterRef.current = nextCounters.column;
          panelCounterRef.current = nextCounters.panel;
          terminalHydrationReadyRef.current = true;
          if (legacyCounterRandomizeEligibleRef) {
            legacyCounterRandomizeEligibleRef.current = true;
          }
          bootPanelIdsRef.current = new Set(collectWorkspacePanelIds(hydratedWorkspaces));
          logTerminalSession('boot-hydration-complete', {
            panelIds: Array.from(bootPanelIdsRef.current),
            workspaceCount: hydratedWorkspaces.length,
          });
        }
      }
    } catch (e) {
      console.error('Failed to load terminal state:', e);
    }
    if (!terminalHydrationReadyRef.current) {
      terminalHydrationReadyRef.current = true;
      bootPanelIdsRef.current = new Set();
      logTerminalSession('boot-hydration-empty', { panelIds: [] });
    }

    // Drop zombie dock/browser/pizarra keys for sequential ids no longer live.
    const liveWorkspaces =
      workspacesRef.current?.length > 0
        ? workspacesRef.current
        : createDefaultWorkspaceState().workspaces;
    const liveWorkspaceIds = liveWorkspaces.map((ws) => ws.id).filter(Boolean);
    const pruneResult = pruneOrphanWorkspaceScopedStorage(storage, projectId, liveWorkspaceIds);
    if (pruneResult.removedKeys?.length) {
      logTerminalSession('boot-prune-orphan-workspace-storage', {
        removedCount: pruneResult.removedKeys.length,
        liveWorkspaceIds,
      });
    }

    const initialDockWorkspaceId =
      (typeof activeWsIdRef.current === 'string' && activeWsIdRef.current) ||
      createDefaultWorkspaceState().activeWsId;
    setDockWorkspaceId(initialDockWorkspaceId);
    setRightDockState(readRightDockState(storage, projectId, initialDockWorkspaceId));
    setBrowserWindowStates(readBrowserWindowStates(storage, projectId));
    setTerminalRendererPreferences(() =>
      readTerminalRendererPreferences(
        storage,
        projectId,
        workspacesRef.current.length
          ? workspacesRef.current
          : createDefaultWorkspaceState().workspaces
      )
    );
    setIsClientLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, storage, terminalStateStorageKey]); // Intentionally narrow; runs once on mount/key change.

  // T5 migration: stamp a pool name on any panel that does not have one.
  // Idempotent — re-running on a panel that already has a displayName is a
  // no-op because the per-panel localStorage entry is already written.
  useEffect(() => {
    if (!isClientLoaded) return;
    if (!workspaces || workspaces.length === 0) return;
    let mutated = false;
    const next = workspaces.map((ws) => {
      const columns = (ws.columns || []).map((col) => {
        const panels = (col.panels || []).map((panel) => {
          if (panel.displayName) return panel;
          const stored = getPanelDisplayNameFromStore(panel.id, ws.id);
          if (stored) {
            // Mirror the cached name into localStorage so a stale Map cannot
            // hide the entry from a fresh hydrate. Re-write is cheap.
            setPanelDisplayNameInStore(panel.id, ws.id, stored);
            mutated = true;
            return { ...panel, displayName: stored };
          }
          const assigned = nextPoolNameForWorkspace(ws.id);
          setPanelDisplayNameInStore(panel.id, ws.id, assigned);
          mutated = true;
          return { ...panel, displayName: assigned };
        });
        return { ...col, panels };
      });
      return { ...ws, columns };
    });
    if (mutated) {
      setWorkspaces(next);
    }
  }, [isClientLoaded, workspaces, setWorkspaces]);

  const flushTerminalPersistenceNow = useCallback(() => {
    if (!storage || !isClientLoaded) return false;

    return flushTerminalSessionPersistence(storage, {
      workspaces: workspacesRef.current,
      activeWsId: activeWsIdRef.current,
      activePanelIds: activePanelIdsRef.current,
      workspaceWindows: workspaceWindowsRef.current,
      activeWindowIds: activeWindowIdsRef.current,
      projectId,
      appSessionId: `shutdown-${Date.now()}`,
      agentRunsByPanel: readAgentRunsByPanel(storage),
    });
  }, [
    isClientLoaded,
    projectId,
    storage,
    workspacesRef,
    activeWsIdRef,
    activePanelIdsRef,
    workspaceWindowsRef,
    activeWindowIdsRef,
  ]);

  useEffect(() => {
    if (isClientLoaded) {
      const payload = buildCleanTerminalStatePayload({
        workspaces,
        activeWsId,
        activePanelIds,
        workspaceWindows,
        activeWindowIds,
      });
      storage?.setItem(terminalStateStorageKey, JSON.stringify(payload));
    }
  }, [
    workspaces,
    activeWsId,
    activePanelIds,
    workspaceWindows,
    activeWindowIds,
    isClientLoaded,
    storage,
    terminalStateStorageKey,
  ]);

  useEffect(() => {
    if (!isClientLoaded) return;
    writeTerminalRendererPreferences(storage, projectId, terminalRendererPreferences, workspaces);
  }, [isClientLoaded, projectId, storage, terminalRendererPreferences, workspaces]);

  useEffect(() => {
    if (!isClientLoaded || !storage) return;

    try {
      const manifest = buildRestoreManifestFromWorkspaceState({
        workspaces,
        activeWorkspaceId: activeWsId,
        projectId,
        appSessionId: `live-${Date.now()}`,
        agentRunsByPanel: readAgentRunsByPanel(storage),
        restorePreferences: readWorkspaceRestorePreferences(storage),
      });
      storage.setItem(restoreManifestStorageKey, JSON.stringify(manifest));
    } catch {
      // Restore manifest persistence is best-effort only.
    }
  }, [activeWsId, isClientLoaded, projectId, restoreManifestStorageKey, storage, workspaces]);

  // --- Startup restore: global prefs + queued OpenCode resume (reboot-safe via --session) ---
  useEffect(() => {
    if (!isVisible || !isClientLoaded || !storage || hasRunStartupRestoreRef.current) return;

    const sessionStorage = typeof window !== 'undefined' ? window.sessionStorage : null;

    if (!shouldRunStartupRestoreThisPageLoad(sessionStorage)) {
      hasRunStartupRestoreRef.current = true;
      return undefined;
    }

    const snapshotWorkspaces =
      workspacesRef.current.length > 0 ? workspacesRef.current : workspaces;

    let expectsHydratedWorkspaces = false;
    try {
      const savedRaw =
        storage.getItem(terminalStateStorageKey) || storage.getItem('devhub_terminal_state');
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        expectsHydratedWorkspaces =
          Array.isArray(parsed?.workspaces) && parsed.workspaces.length > 0;
      }
    } catch {
      expectsHydratedWorkspaces = false;
    }

    const hasHydratedPanels = snapshotWorkspaces.some((ws) =>
      (ws?.columns || []).some((col) => (col?.panels || []).length > 0)
    );

    if (expectsHydratedWorkspaces && !terminalHydrationReadyRef.current) {
      logTerminalSession('startup-restore-deferred', {
        reason: 'awaiting-hydration',
        expectsHydratedWorkspaces,
      });
      return;
    }

    if (expectsHydratedWorkspaces && !hasHydratedPanels) {
      logTerminalSession('startup-restore-deferred', {
        reason: 'awaiting-panels',
        expectsHydratedWorkspaces,
      });
      return;
    }

    // Fresh default workspaces (no persisted terminal state) must not run reboot
    // restore — it would terminate panels with no boot baseline (tests + first paint).
    if (!expectsHydratedWorkspaces) {
      hasRunStartupRestoreRef.current = true;
      markStartupRestoreCompletedForSession(sessionStorage);
      return undefined;
    }

    hasRunStartupRestoreRef.current = true;
    logTerminalSession('startup-restore-begin', {
      bootPanelIds: Array.from(bootPanelIdsRef.current),
      snapshotPanelIds: collectWorkspacePanelIds(snapshotWorkspaces),
      activeWsId: activeWsIdRef.current || activeWsId,
    });

    const restorePrefs = readWorkspaceRestorePreferences(storage);

    const { suspendedSeed } = seedSuspendedOpenCodePanels({
      snapshotWorkspaces,
      agentRunsByPanel,
      restorePrefs,
    });
    if (Object.keys(suspendedSeed).length > 0) {
      setPanelRestoreModes(suspendedSeed);
    }

    const { runStartupRestore, abortStartupRestore } = createWorkspaceRestoreCoordinator({
      storage,
      terminalStateStorageKey,
      projectId,
      snapshotWorkspaces,
      workspacesRef,
      activeWsIdRef,
      activeWsId,
      bootPanelIdsRef,
      agentRunsByPanel,
      restorePrefs,
      applyPanelRelaunchCommand,
      setWorkspaces,
      setPanelRestoreModes,
      setReopenActionError,
      markStartupRestoreCompleted: () => {
        startupRestoreCompletedRef.current = true;
        markStartupRestoreCompletedForSession(sessionStorage);
      },
    });

    runStartupRestore();

    return () => {
      abortStartupRestore();
    };
  }, [
    activeWsId,
    applyPanelRelaunchCommand,
    isClientLoaded,
    isVisible,
    projectId,
    storage,
    terminalStateStorageKey,
  ]);

  // Synchronous flush before app/window close so opencode --session survives reboot.
  useEffect(() => {
    if (!isClientLoaded || typeof window === 'undefined') return undefined;

    const runFlush = () => {
      flushTerminalPersistenceNow();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        runFlush();
      }
    };

    window.addEventListener('beforeunload', runFlush);
    window.addEventListener('pagehide', runFlush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('devhub:flush-terminal-persistence', runFlush);

    return () => {
      window.removeEventListener('beforeunload', runFlush);
      window.removeEventListener('pagehide', runFlush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('devhub:flush-terminal-persistence', runFlush);
    };
  }, [flushTerminalPersistenceNow, isClientLoaded]);

  useEffect(() => {
    if (!isClientLoaded) return;
    writeBrowserWindowStates(storage, projectId, browserWindowStates);
  }, [browserWindowStates, isClientLoaded, projectId, storage]);

  useEffect(() => {
    if (!workspaces.length) return;

    const nextCounters = syncWorkspaceCountersMonotonic(workspaces, {
      workspace: wsCounterRef.current,
      column: colCounterRef.current,
      panel: panelCounterRef.current,
    });

    wsCounterRef.current = nextCounters.workspace;
    colCounterRef.current = nextCounters.column;
    panelCounterRef.current = nextCounters.panel;
  }, [workspaces]);

  return { flushTerminalPersistenceNow };
}
