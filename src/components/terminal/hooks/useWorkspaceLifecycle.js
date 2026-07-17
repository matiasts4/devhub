// useWorkspaceLifecycle — workspace create/remove/grid/materialize lifecycle.
// Extracted from TerminalWorkspacesManager.jsx (Slice 6).

import { useCallback, useRef, useEffect } from 'react';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';
import { closeTerminalSessions } from '@/components/terminal/workspaceStateHelpers';
import { buildWorkspaceColumnsForTerminalCount } from '@/components/terminal/utils/panelHelpers';
import {
  createPanel,
  createPanelWithDisplayNameFactory,
  createWindow,
  getPanelIdsFromColumns,
} from '@/components/terminal/models/workspaceStateModel';
import {
  readWorkspaceSwarmLaunchSummary,
  buildSwarmRoleMetadata,
  shortenCommandSummary,
} from '@/components/terminal/models/swarmRoleModel';
import {
  readWorkspaceRestorePreferences,
  extractOpenCodeSessionId,
  inferPanelSessionKind,
  resolveEffectiveRestorePolicy,
} from '@/lib/terminal/restorePolicyResolver';
import {
  appendSwarmWorkerToWorkspace,
  resolveSwarmPanelStandbyFlag,
} from '@/lib/terminal/swarmLaunchWorkspace';
import { buildProvisionedWorkerKey } from '@/lib/operations/swarmLazySpawn';
import { scheduleSurvivorRecoverAfterClose } from '@/lib/terminal/legacyTerminalSurvivorRecovery';
import {
  PANEL_LIFECYCLE_REASONS,
  scheduleSwarmProjectionReadyBurst,
} from '@/lib/terminal/terminalLifecycleSync';
import {
  collectSwarmLaunchIdsForWorkspace,
  dispatchTerminatePanelCloseEvents,
  terminateSwarmLaunchesForWorkspace,
} from '@/lib/terminal/swarmWorkspaceLifecycle';
import { resolveActiveWorkspaceWindowId } from '@/lib/terminal/workspaceWindowRender';
import {
  setPanelRendererPreference,
  TERMINAL_RENDERER_INHERIT_MODE,
} from '@/components/terminal/terminalRendererPreferences';
import {
  clearWorkspaceScopedStorage,
  seedFreshWorkspaceDockState,
} from '@/components/workspace/workspaceScopedStorage';

export default function useWorkspaceLifecycle({
  wsCounterRef,
  windowCounterRef,
  colCounterRef,
  panelCounterRef,
  counterRandomizedRef,
  legacyCounterRandomizeEligibleRef,
  terminalStateStorageKey,
  workspacesRef,
  panelsClosingRef,
  workspaceCloseRecoverCleanupRef,
  swarmProjectionBurstCleanupRef,
  setWorkspaces,
  setActiveWsId,
  setActivePanelIds,
  setWorkspaceWindows,
  setActiveWindowIds,
  setTerminalRendererPreferences,
  setBrowserWindowStates,
  setSwarmControlSnapshot,
  setWorkspaceTerminalSetupOpen,
  setIsGridLauncherOpen,
  workspaces,
  activeWsId,
  workspaceWindows,
  activeWindowIds,
  storage,
  projectId,
  cwd,
  gridCommand,
  swarmControlSnapshot,
  syncPanelLifecycleLayout,
  syncActiveWindowSnapshot,
  closeWorkspaceBrowserWindow,
  notifyNativeLayoutSettled,
  getAllPanelIds,
  collectSiblingPanelNames,
}) {
  const consumedUiProvisionKeysRef = useRef(new Set());

  const maybeRandomizeCountersForFreshWorkspace = useCallback(() => {
    if (counterRandomizedRef?.current) return;
    if (!legacyCounterRandomizeEligibleRef?.current) return;
    try {
      const savedState =
        storage?.getItem(terminalStateStorageKey) || storage?.getItem('devhub_terminal_state');
      if (!savedState) return;
      if (panelCounterRef.current > 100) {
        counterRandomizedRef.current = true;
        return;
      }
      const randomizeToHigh = () => Math.floor(Math.random() * 9001) + 1000;
      panelCounterRef.current = randomizeToHigh();
      colCounterRef.current = randomizeToHigh();
      wsCounterRef.current = randomizeToHigh();
      counterRandomizedRef.current = true;
      legacyCounterRandomizeEligibleRef.current = false;
    } catch {
      // Counter randomization is best-effort (TIC-2).
    }
  }, [
    colCounterRef,
    counterRandomizedRef,
    legacyCounterRandomizeEligibleRef,
    panelCounterRef,
    storage,
    terminalStateStorageKey,
    wsCounterRef,
  ]);

  const createWorkspaceWithTerminalCount = useCallback(
    (setup = {}) => {
      maybeRandomizeCountersForFreshWorkspace();

      const setupObject = typeof setup === 'number' ? { terminalCount: setup } : setup || {};
      const safeCount = Math.max(0, Math.min(6, Number(setupObject.terminalCount) || 0));
      const rawInitialCommand = setupObject.initialCommand;
      const initialCommand =
        typeof rawInitialCommand === 'string' && rawInitialCommand.trim()
          ? rawInitialCommand.trim()
          : null;

      wsCounterRef.current += 1;
      const newWsId = `ws${wsCounterRef.current}`;
      windowCounterRef.current += 1;
      const newWindowId = `v${windowCounterRef.current}`;

      // Recycled sequential ids (ws3 after close+restart) must not inherit
      // zombie dock/browser/pizarra state from a previous life of that id.
      seedFreshWorkspaceDockState(storage, projectId, newWsId);

      let newColumns = [];
      let firstPanelId = null;

      if (safeCount > 0) {
        const built = buildWorkspaceColumnsForTerminalCount({
          terminalCount: safeCount,
          createPanel: createPanelWithDisplayNameFactory(newWsId, () =>
            collectSiblingPanelNames(newWsId)
          ),
          allocateColumnId: () => {
            colCounterRef.current += 1;
            return `c${colCounterRef.current}`;
          },
          allocatePanelId: () => {
            panelCounterRef.current += 1;
            return `p${panelCounterRef.current}`;
          },
          initialCommand,
          panelCwd: cwd,
        });
        newColumns = built.columns;
        firstPanelId = built.firstPanelId;
      }

      setWorkspaces((prev) => [
        ...prev,
        {
          id: newWsId,
          name: `Workspace ${wsCounterRef.current}`,
          columns: newColumns,
        },
      ]);
      setActiveWsId(newWsId);
      setActivePanelIds((prev) => ({ ...prev, [newWsId]: firstPanelId }));
      setWorkspaceWindows((prev) => ({
        ...prev,
        [newWsId]: [createWindow(newWindowId, 'V1', newColumns, firstPanelId)],
      }));
      setActiveWindowIds((prev) => ({ ...prev, [newWsId]: newWindowId }));

      if (firstPanelId) {
        setTerminalRendererPreferences((prev) =>
          setPanelRendererPreference(prev, newWsId, firstPanelId, TERMINAL_RENDERER_INHERIT_MODE)
        );
      }

      const newPanelIds = newColumns.flatMap((col) => col.panels?.map((p) => p.id) || []);
      if (newPanelIds.length > 0) {
        syncPanelLifecycleLayout(PANEL_LIFECYCLE_REASONS.WORKSPACE_CREATED, newWsId, newPanelIds);
        // Projection burst is for shared-surface portal recovery (pizarra/swarm).
        // Workspace docks mount TerminalTTY directly — the burst only adds redundant
        // layout-settled storms that double PS1 / echo on fresh panels.
        if (isPizarraSharedViewEnabled()) {
          if (swarmProjectionBurstCleanupRef.current) {
            swarmProjectionBurstCleanupRef.current();
            swarmProjectionBurstCleanupRef.current = null;
          }
          swarmProjectionBurstCleanupRef.current = scheduleSwarmProjectionReadyBurst({
            workspaceId: newWsId,
            panelIds: newPanelIds,
          });
        }
      }
    },
    [
      collectSiblingPanelNames,
      cwd,
      maybeRandomizeCountersForFreshWorkspace,
      projectId,
      storage,
      syncPanelLifecycleLayout,
      colCounterRef,
      panelCounterRef,
      setActivePanelIds,
      setActiveWindowIds,
      setActiveWsId,
      setTerminalRendererPreferences,
      setWorkspaceWindows,
      setWorkspaces,
      swarmProjectionBurstCleanupRef,
      windowCounterRef,
      wsCounterRef,
    ]
  );

  const addWorkspace = () => {
    setWorkspaceTerminalSetupOpen(true);
  };

  const removeWorkspace = async (e, idToRemove) => {
    e.stopPropagation();
    const workspaceToRemove = workspaces.find((workspace) => workspace.id === idToRemove);
    if (!workspaceToRemove || workspaces.length <= 1) return;

    const swarmLaunchIds = collectSwarmLaunchIdsForWorkspace(workspaceToRemove, storage);
    const workspaceSwarmSummary = readWorkspaceSwarmLaunchSummary(
      storage,
      workspaceToRemove,
      projectId,
      swarmControlSnapshot
    );
    if (
      workspaceSwarmSummary?.launchId &&
      !swarmLaunchIds.includes(workspaceSwarmSummary.launchId)
    ) {
      swarmLaunchIds.push(workspaceSwarmSummary.launchId);
    }
    // Best-effort swarm terminate — do not block tab removal on network/PTY kill.
    if (swarmLaunchIds.length > 0 && projectId) {
      void terminateSwarmLaunchesForWorkspace({
        workspace: workspaceToRemove,
        projectId,
        storage,
        workspaces,
      })
        .then((terminateResults) => {
          terminateResults.forEach((result) => {
            if (result.ok) {
              dispatchTerminatePanelCloseEvents(result.payload);
            }
          });
          setSwarmControlSnapshot(null);
        })
        .catch(() => {
          // Best-effort: workspace close still proceeds.
        });
    }

    const remainingWorkspaces = workspaces.filter((workspace) => workspace.id !== idToRemove);
    const nextActiveWsId =
      activeWsId === idToRemove
        ? remainingWorkspaces[remainingWorkspaces.length - 1]?.id
        : activeWsId;
    const survivorPanelIds = remainingWorkspaces.flatMap((ws) => {
      const windowId = resolveActiveWorkspaceWindowId(ws.id, workspaceWindows, activeWindowIds);
      const windows = workspaceWindows?.[ws.id] || [];
      const activeWindow = windows.find((win) => win.id === windowId);
      return getPanelIdsFromColumns(activeWindow?.columns || ws.columns || []);
    });

    // TIC-1: Clean devhub_agent_runs BEFORE React state removal
    // This prevents stale identity bleed into new workspaces created before React state removal
    const panelIdsToClean = getAllPanelIds(workspaceToRemove.columns);
    const activeWsWillChange = activeWsId === idToRemove;
    panelIdsToClean.forEach((panelId) => panelsClosingRef.current.add(panelId));
    try {
      const runs = JSON.parse(storage?.getItem('devhub_agent_runs') || '{}');
      const cleanedRuns = {};
      Object.entries(runs).forEach(([taskId, run]) => {
        if (!panelIdsToClean.includes(run.panelId)) {
          cleanedRuns[taskId] = run;
        }
      });
      storage?.setItem('devhub_agent_runs', JSON.stringify(cleanedRuns));
    } catch {
      // Ignore localStorage failures — cleanup is best-effort
    }

    // Purge dock / browser / pizarra keys so a later workspace reusing this
    // sequential id cannot resurrect old dock mode or browser URL.
    clearWorkspaceScopedStorage(storage, projectId, idToRemove);

    // Optimistic UI: drop the tab immediately; PTY DELETE / browser close run in background.
    setWorkspaces((prev) => {
      const newWs = prev.filter((w) => w.id !== idToRemove);
      if (newWs.length === 0) return prev;
      if (activeWsId === idToRemove) {
        setActiveWsId(newWs[newWs.length - 1].id);
      }
      return newWs;
    });
    setActivePanelIds((prev) => {
      const next = { ...prev };
      delete next[idToRemove];
      return next;
    });
    setWorkspaceWindows((prev) => {
      const next = { ...prev };
      delete next[idToRemove];
      return next;
    });
    setActiveWindowIds((prev) => {
      const next = { ...prev };
      delete next[idToRemove];
      return next;
    });
    setTerminalRendererPreferences((prev) => {
      const next = {
        ...prev,
        workspaces: { ...prev.workspaces },
      };
      delete next.workspaces[idToRemove];
      return next;
    });
    setBrowserWindowStates((prev) => {
      const next = { ...prev };
      delete next[idToRemove];
      return next;
    });

    panelIdsToClean.forEach((panelId) => {
      window.setTimeout(() => panelsClosingRef.current.delete(panelId), 2000);
    });

    if (typeof window !== 'undefined' && survivorPanelIds.length > 0) {
      // Soft-repaint all survivors (incl. engine-v2). Closing the ACTIVE workspace
      // lands on another workspace — reuse WORKSPACE_SWITCH; peer close uses
      // WORKSPACE_REMOVED soft reveal (no GPU recycle — Option B keep-alive).
      const lifecycleReason = activeWsWillChange
        ? PANEL_LIFECYCLE_REASONS.WORKSPACE_SWITCH
        : PANEL_LIFECYCLE_REASONS.WORKSPACE_REMOVED;
      const lifecycleOpts = activeWsWillChange ? { notifyNative: false } : undefined;
      workspaceCloseRecoverCleanupRef.current?.();
      workspaceCloseRecoverCleanupRef.current = scheduleSurvivorRecoverAfterClose({
        panelIds: survivorPanelIds,
        workspaceId: nextActiveWsId,
        reason: lifecycleReason,
        onLifecycleSync: () =>
          syncPanelLifecycleLayout(
            lifecycleReason,
            nextActiveWsId,
            survivorPanelIds,
            lifecycleOpts
          ),
      });
    } else if (!activeWsWillChange && typeof window !== 'undefined') {
      notifyNativeLayoutSettled('workspace-removed');
    }

    void closeTerminalSessions(panelIdsToClean);
    void closeWorkspaceBrowserWindow(idToRemove);
  };

  const handleApplyGrid = (numCols, numRows) => {
    // Close the launcher immediately. This is critical: while isGridLauncherOpen is true,
    // shouldSuspendNativeSurfaces forces suspend=true for panels (even newly created ones
    // in the just-activated ws). New grid terminals would initialize under suspend (or xterm
    // fallback), and the resume/re-inject paths for initialCommand could be skipped or
    // guards (hasSentInitialCommand) prevent the typed command (e.g. "groc"/"GROC") from
    // actually running in the launched terminals. By closing here, the batched state update
    // that creates the panels will have launcher closed => no suspend => clean native/xterm
    // open + initialCommand paste/send for *all* the selected quantity of terminals.
    setIsGridLauncherOpen(false);

    wsCounterRef.current += 1;
    const newWsId = `ws${wsCounterRef.current}`;

    const newColumns = [];
    let firstPanelId = null;

    for (let c = 0; c < numCols; c++) {
      colCounterRef.current += 1;
      const colId = `c${colCounterRef.current}`;

      const panels = [];
      for (let r = 0; r < numRows; r++) {
        panelCounterRef.current += 1;
        const panelId = `p${panelCounterRef.current}`;
        if (!firstPanelId) firstPanelId = panelId;
        panels.push(createPanel(panelId, gridCommand, cwd));
      }

      newColumns.push({
        id: colId,
        panels: panels,
      });
    }

    setWorkspaces((prev) => [
      ...prev,
      {
        id: newWsId,
        name: `Workspace ${wsCounterRef.current}`,
        columns: newColumns,
      },
    ]);
    setActiveWsId(newWsId);
    setActivePanelIds((prev) => ({ ...prev, [newWsId]: firstPanelId }));
    setTerminalRendererPreferences((prev) =>
      setPanelRendererPreference(prev, newWsId, firstPanelId, TERMINAL_RENDERER_INHERIT_MODE)
    );
    const gridPanelIds = getAllPanelIds(newColumns);
    syncPanelLifecycleLayout(PANEL_LIFECYCLE_REASONS.PANEL_SPLIT, newWsId, gridPanelIds);
  };

  const persistAgentRunMetadata = useCallback(
    async (request, panelId, commandToRun) => {
      const { taskId, selectedAgent, launchOrigin, promptSummary, taskTitle } = request || {};
      if (!taskId || !panelId) return;
      const swarmRole = buildSwarmRoleMetadata(request);
      const restorePrefs = readWorkspaceRestorePreferences(storage);
      const sessionKind = inferPanelSessionKind({
        initialCommand: commandToRun,
        agentRun: { swarmRole: swarmRole?.roleKey, launchOrigin },
      });
      const defaultRestorePolicy = resolveEffectiveRestorePolicy({
        sessionKind,
        perSessionPolicy: null,
        preferences: restorePrefs,
      });
      const opencodeSessionId = extractOpenCodeSessionId(commandToRun);

      try {
        const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
        const hints = JSON.parse(localStorage.getItem('devhub_agent_task_hints') || '{}');
        runs[taskId] = {
          panelId,
          commandSummary: hints[taskId] || shortenCommandSummary(commandToRun),
          promptSummary: promptSummary || hints[taskId] || shortenCommandSummary(commandToRun),
          selectedAgent: selectedAgent || null,
          launchOrigin: launchOrigin || null,
          roleKey: swarmRole?.roleKey || request?.roleKey || null,
          roleLabel: swarmRole?.label || request?.roleLabel || null,
          roleAbbrev: swarmRole?.abbrev || request?.roleAbbrev || null,
          taskTitle: taskTitle || null,
          workspaceId: request?.workspaceId || null,
          runId: request?.runId || null,
          sessionId: request?.sessionId || null,
          opencodeSessionId: opencodeSessionId || runs[taskId]?.opencodeSessionId || null,
          restorePolicy: runs[taskId]?.restorePolicy || defaultRestorePolicy,
          launchedAt: Date.now(),
        };
        localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
      } catch {
        // Ignore localStorage failures.
      }

      // Keep launch metadata local-only here; registry lifecycle is managed by control-plane flows.
    },
    [storage]
  );

  const materializeSwarmWorkerInPlace = useCallback(
    async (runtimeRequest) => {
      const launchId = String(runtimeRequest?.launchId || '').trim();
      const roleKey = String(runtimeRequest?.roleKey || '').trim();
      if (!launchId || !roleKey) return false;

      const provisionKey = buildProvisionedWorkerKey(launchId, roleKey);
      if (consumedUiProvisionKeysRef.current.has(provisionKey)) return false;

      const buildPanel = (request, panelId, panelCwd) =>
        createPanel(panelId, request.commandToRun, panelCwd, {
          swarmRole: request.swarmRole,
          swarmContext: {
            isSwarmRole: Boolean(request.isSwarmRole),
            roleKey: request.roleKey || request.swarmRole?.roleKey || null,
            launchId: request.launchId || null,
            needsLaunchWrapper: true,
            startAfterMs: 0,
            standbyAwaitingDelegation: resolveSwarmPanelStandbyFlag(request),
            bootstrapMode: request.bootstrapMode || 'engram_first',
          },
        });

      const result = appendSwarmWorkerToWorkspace({
        workspaces: workspacesRef.current,
        runtimeRequest,
        buildPanel,
        panelCounterRef,
      });

      if (!result.ok) {
        return false;
      }

      consumedUiProvisionKeysRef.current.add(provisionKey);

      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === result.wsId
            ? {
                ...ws,
                columns: result.columns,
                swarmLaunchId: ws.swarmLaunchId || launchId,
              }
            : ws
        )
      );

      setTerminalRendererPreferences((prev) =>
        setPanelRendererPreference(
          prev,
          result.wsId,
          result.panelId,
          TERMINAL_RENDERER_INHERIT_MODE
        )
      );

      syncActiveWindowSnapshot(result.wsId, result.columns);

      await persistAgentRunMetadata(result.request, result.panelId, result.request.commandToRun);

      syncPanelLifecycleLayout(
        PANEL_LIFECYCLE_REASONS.PANEL_SPLIT,
        result.wsId,
        getPanelIdsFromColumns(result.columns)
      );

      if (projectId) {
        try {
          await fetch('/api/agenthub/operations/health', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'acknowledge_swarm_ui_provision',
              launch_id: launchId,
              role_key: roleKey,
            }),
          });
        } catch {
          // Best-effort ack; duplicate poll is guarded by consumedUiProvisionKeysRef.
        }
      }

      return true;
    },
    [
      persistAgentRunMetadata,
      projectId,
      syncActiveWindowSnapshot,
      syncPanelLifecycleLayout,
      panelCounterRef,
      setTerminalRendererPreferences,
      setWorkspaces,
      workspacesRef,
    ]
  );

  useEffect(() => {
    // Poll even when TWM is not the focused view — lazy worker provision must not
    // stall until the operator returns to the terminal workspace tab.
    if (!projectId) return undefined;

    let cancelled = false;

    const pollPendingWorkerProvisions = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(
          `/api/agenthub/operations/health?project_id=${encodeURIComponent(projectId)}`
        );
        if (!response.ok) return;
        const payload = await response.json();
        const pending = payload?.control_room_snapshot_input?.pending_ui_provisions || [];
        for (const entry of pending) {
          if (cancelled) break;
          const runtimeRequest = entry?.runtimeRequest;
          if (!runtimeRequest) continue;
          await materializeSwarmWorkerInPlace(runtimeRequest);
        }
      } catch {
        // Polling is best-effort.
      }
    };

    void pollPendingWorkerProvisions();
    const timer = window.setInterval(pollPendingWorkerProvisions, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [materializeSwarmWorkerInPlace, projectId]);

  return {
    createWorkspaceWithTerminalCount,
    addWorkspace,
    removeWorkspace,
    handleApplyGrid,
    persistAgentRunMetadata,
    materializeSwarmWorkerInPlace,
  };
}
