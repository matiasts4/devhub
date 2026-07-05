import { enforceDocOpsGateOnLaunchCommand } from '@/lib/docopsPrompts';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import { isOrchestratorRoleKey, isSddWorkerRoleKey } from '@/lib/operations/swarmControl';
import {
  SWARM_SPAWN_STRATEGY_AUTOMATIC,
  findDirectorPanelInColumns,
  insertWorkerPanelIntoGrowingSwarmColumns,
} from '@/lib/operations/swarmLazySpawn';
import {
  buildSwarmRoleMetadata,
  getSwarmRoleOrder,
} from '@/components/terminal/utils/swarmRoleMeta';
import { closeTerminalSessions } from '@/components/terminal/workspaceStateHelpers';
import { rescheduleSwarmLaunchBatchFlush } from '@/lib/terminal/swarmLaunchBatch';

export function collectPreviousSwarmPanelIds(getItem = () => '{}') {
  try {
    const runs = JSON.parse(getItem('devhub_agent_runs') || '{}');
    return Object.values(runs || {})
      .filter((run) => run?.launchOrigin === 'swarm-control-launch' && run?.panelId)
      .map((run) => run.panelId);
  } catch {
    return [];
  }
}

export function prepareSwarmLaunchRequests(requests = []) {
  return requests
    .map((request) => {
      const commandToRun = enforceDocOpsGateOnLaunchCommand(
        request.command || `opencode --agent ${request.selectedAgent || DEFAULT_OPENCODE_AGENT}`
      );
      const swarmRole = buildSwarmRoleMetadata(request);
      return { ...request, commandToRun, swarmRole };
    })
    .filter((request) => request.taskId && request.commandToRun);
}

export function resolveSwarmPanelStandbyFlag(request = {}) {
  const roleKey = request.roleKey || request.swarmRole?.roleKey || '';
  const bootstrapMode = request.bootstrapMode || 'engram_first';
  return bootstrapMode === 'standby' && isSddWorkerRoleKey(roleKey);
}

export function groupSwarmLaunchRequestsIntoColumns(launchRequests = []) {
  const directorRequest =
    launchRequests.find((request) => isOrchestratorRoleKey(request.swarmRole?.roleKey)) || null;
  const workerRequests = launchRequests
    .filter((request) => request !== directorRequest)
    .sort(
      (a, b) => getSwarmRoleOrder(a.swarmRole?.roleKey) - getSwarmRoleOrder(b.swarmRole?.roleKey)
    );

  return directorRequest && launchRequests.length >= 3
    ? [
        workerRequests.filter((_, index) => index % 2 === 0),
        workerRequests.filter((_, index) => index % 2 === 1),
        [directorRequest],
      ].filter((columnRequests) => columnRequests.length > 0)
    : [launchRequests];
}

export function buildSwarmLaunchWorkspacePlan({
  launchRequests = [],
  cwd,
  wsCounterRef,
  colCounterRef,
  panelCounterRef,
  buildPanel,
}) {
  const groupedRequests = groupSwarmLaunchRequestsIntoColumns(launchRequests);

  wsCounterRef.current += 1;
  const newWsId = `ws${wsCounterRef.current}`;

  let firstPanelId = null;
  let directorPanelId = null;
  const panelAssignments = [];
  const newColumns = groupedRequests
    .filter((columnRequests) => columnRequests.length > 0)
    .map((columnRequests) => {
      colCounterRef.current += 1;
      const colId = `c${colCounterRef.current}`;
      const panels = columnRequests.map((request) => {
        panelCounterRef.current += 1;
        const panelId = `p${panelCounterRef.current}`;
        const panelCwd = request.workspacePath || cwd;
        if (!firstPanelId) firstPanelId = panelId;
        if (isOrchestratorRoleKey(request.swarmRole?.roleKey)) directorPanelId = panelId;
        panelAssignments.push({ request, panelId, panelCwd });
        return buildPanel(request, panelId, panelCwd);
      });
      return { id: colId, panels };
    });

  const launchLabel = launchRequests[0]?.taskTitle?.split(' · ')?.[0] || 'Swarm launch';
  const activePanelForLaunch = directorPanelId || firstPanelId;
  const launchId = String(launchRequests[0]?.launchId || '').trim();
  const spawnStrategy = launchRequests[0]?.spawnStrategy || SWARM_SPAWN_STRATEGY_AUTOMATIC;
  const nextWorkspace = {
    id: newWsId,
    name: launchLabel,
    columns: newColumns,
    swarmLaunchId: launchId || null,
    spawnStrategy: spawnStrategy || null,
  };

  return {
    launchId,
    newWsId,
    newColumns,
    nextWorkspace,
    panelAssignments,
    activePanelForLaunch,
  };
}

export function createSyncActiveWindowSnapshot({ setWorkspaceWindows, getActiveWindowIds }) {
  return (wsId, columns, nextActivePanelId = null) => {
    setWorkspaceWindows((prev) => {
      const windows = prev[wsId] || [];
      const activeWindowId = getActiveWindowIds()[wsId];
      if (!activeWindowId || windows.length === 0) return prev;

      return {
        ...prev,
        [wsId]: applyActiveWindowColumnSnapshot(
          windows,
          activeWindowId,
          columns,
          nextActivePanelId
        ),
      };
    });
  };
}

/** Persist live workspace.columns into the active window tab before switching away. */
export function applyActiveWindowColumnSnapshot(
  windows = [],
  activeWindowId,
  columns,
  activePanelId = null
) {
  if (!activeWindowId || !Array.isArray(columns) || columns.length === 0) {
    return windows;
  }

  return windows.map((win) => {
    if (win.id !== activeWindowId) return win;
    return {
      ...win,
      // Clone deeply so later mutations to the live workspace.columns do not
      // leak back into the parked window snapshot.
      columns: JSON.parse(JSON.stringify(columns)),
      activePanelId:
        activePanelId ||
        win.activePanelId ||
        columns.flatMap((col) => col.panels || [])[0]?.id ||
        null,
    };
  });
}

export function resolveWorkspaceWindowAfterPanelClose({
  windows = [],
  activeWindowId = null,
  remainingPanelIds = [],
}) {
  if (remainingPanelIds.length > 0 || !activeWindowId || windows.length <= 1) {
    return { action: 'keep', windows, activeWindowId };
  }

  const nextWindows = windows.filter((win) => win.id !== activeWindowId);
  const nextActiveWindowId = nextWindows[0]?.id || null;
  const nextActiveWindow =
    nextWindows.find((win) => win.id === nextActiveWindowId) || nextWindows[0] || null;

  return {
    action: 'remove',
    windows: nextWindows,
    activeWindowId: nextActiveWindowId,
    removedWindowId: activeWindowId,
    nextActiveWindow,
    nextPanelId:
      nextActiveWindow?.activePanelId ||
      nextActiveWindow?.columns?.flatMap((col) => col.panels || [])[0]?.id ||
      null,
  };
}

export function createWorkspaceForSwarmLaunchRequestsFn({
  cwd,
  wsCounterRef,
  colCounterRef,
  panelCounterRef,
  materializedSwarmLaunchIdsRef = null,
  getAllPanelIds,
  buildPanel,
  setWorkspaces,
  setActiveWsId,
  setActivePanelIds,
  setTerminalRendererPreferences,
  applyRendererPreference,
  syncActiveWindowSnapshot,
  persistAgentRunMetadata,
  workspacesRef = null,
  onAfterMaterialize = null,
  onMarkPanelsClosing = null,
  onClearLaunchWrapperDispatch = null,
  getPreviousSwarmPanelIds = () =>
    collectPreviousSwarmPanelIds((key) => {
      if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
        return globalThis.localStorage.getItem(key);
      }
      return '{}';
    }),
  closePreviousSessions = closeTerminalSessions,
}) {
  return function createWorkspaceForSwarmLaunchRequests(requests = []) {
    const launchId = String(requests[0]?.launchId || '').trim();
    if (launchId && materializedSwarmLaunchIdsRef?.current?.has(launchId)) {
      return;
    }

    const launchRequests = prepareSwarmLaunchRequests(requests);
    if (launchRequests.length === 0) return;

    if (launchId && typeof onClearLaunchWrapperDispatch === 'function') {
      onClearLaunchWrapperDispatch(launchId);
    }

    const plan = buildSwarmLaunchWorkspacePlan({
      launchRequests,
      cwd,
      wsCounterRef,
      colCounterRef,
      panelCounterRef,
      buildPanel,
    });

    const previousSwarmPanelIds = getPreviousSwarmPanelIds();
    if (previousSwarmPanelIds.length > 0) {
      if (typeof onMarkPanelsClosing === 'function') {
        onMarkPanelsClosing(previousSwarmPanelIds);
      }
      closePreviousSessions(previousSwarmPanelIds);
    }

    setWorkspaces((prev) => {
      const oldSwarmPanelIds = new Set(previousSwarmPanelIds);
      const retained = prev.filter((workspace) => {
        const panelIds = getAllPanelIds(workspace.columns || []);
        return !panelIds.some((panelId) => oldSwarmPanelIds.has(panelId));
      });
      const nextWorkspaces = [...retained, plan.nextWorkspace];
      if (workspacesRef) {
        workspacesRef.current = nextWorkspaces;
      }
      return nextWorkspaces;
    });
    setActiveWsId(plan.newWsId);
    setActivePanelIds((prev) => ({ ...prev, [plan.newWsId]: plan.activePanelForLaunch }));
    setTerminalRendererPreferences((prev) =>
      plan.panelAssignments.reduce(
        (acc, assignment) => applyRendererPreference(acc, plan.newWsId, assignment.panelId),
        prev
      )
    );

    if (typeof syncActiveWindowSnapshot === 'function') {
      syncActiveWindowSnapshot(plan.newWsId, plan.newColumns, plan.activePanelForLaunch);
    }

    plan.panelAssignments.forEach(({ request, panelId, panelCwd }) => {
      persistAgentRunMetadata(request, panelId, request.commandToRun, panelCwd);
    });

    if (typeof onAfterMaterialize === 'function') {
      onAfterMaterialize({
        launchId,
        plan,
        panelAssignments: plan.panelAssignments,
      });
    }
  };
}

export function createSwarmLaunchQueueHandlers({
  pendingSwarmLaunchByLaunchIdRef,
  pendingSwarmLaunchRequestsRef = null,
  swarmLaunchFlushTimerRef = null,
  materializedSwarmLaunchIdsRef = null,
  createWorkspaceForSwarmLaunchRequests,
  clearTimeoutFn = (id) => clearTimeout(id),
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
}) {
  const flushSwarmLaunchBatch = (launchId) => {
    const batch = pendingSwarmLaunchByLaunchIdRef.current.get(launchId);
    if (!batch) return;

    if (batch.timer) {
      clearTimeoutFn(batch.timer);
      batch.timer = null;
    }

    pendingSwarmLaunchByLaunchIdRef.current.delete(launchId);
    createWorkspaceForSwarmLaunchRequests(batch.requests);
  };

  const flushPendingSwarmLaunchRequests = () => {
    if (!pendingSwarmLaunchRequestsRef) return;
    const requests = pendingSwarmLaunchRequestsRef.current;
    pendingSwarmLaunchRequestsRef.current = [];
    if (swarmLaunchFlushTimerRef) {
      swarmLaunchFlushTimerRef.current = null;
    }
    if (requests.length > 0) {
      createWorkspaceForSwarmLaunchRequests(requests);
    }
  };

  const enqueueSwarmLaunchRequest = (request) => {
    const launchId = request.launchId || 'unknown';
    if (launchId !== 'unknown' && materializedSwarmLaunchIdsRef?.current?.has(launchId)) {
      return;
    }

    let batch = pendingSwarmLaunchByLaunchIdRef.current.get(launchId);
    if (!batch) {
      batch = { requests: [], timer: null };
      pendingSwarmLaunchByLaunchIdRef.current.set(launchId, batch);
    }

    batch.requests.push(request);
    batch.timer = rescheduleSwarmLaunchBatchFlush({
      existingTimerId: batch.timer,
      onFlush: () => flushSwarmLaunchBatch(launchId),
      clearTimeoutFn,
      setTimeoutFn,
    });
  };

  return {
    flushSwarmLaunchBatch,
    flushPendingSwarmLaunchRequests,
    enqueueSwarmLaunchRequest,
  };
}

/**
 * Append a lazily-provisioned worker panel to an existing swarm workspace (growing grid).
 *
 * @returns {{ ok: boolean, wsId?: string, panelId?: string, columns?: object[], reason?: string }}
 */
export function appendSwarmWorkerToWorkspace({
  workspaces = [],
  runtimeRequest = {},
  buildPanel,
  panelCounterRef,
}) {
  const launchId = String(runtimeRequest?.launchId || '').trim();
  const roleKey = String(runtimeRequest?.roleKey || '').trim();
  if (!launchId || !roleKey || isOrchestratorRoleKey(roleKey)) {
    return { ok: false, reason: 'invalid-runtime-request' };
  }

  const workspace = workspaces.find((ws) => {
    if (String(ws?.swarmLaunchId || '').trim() === launchId) return true;
    return (ws?.columns || []).some((column) =>
      (column?.panels || []).some(
        (panel) => String(panel?.swarmContext?.launchId || '').trim() === launchId
      )
    );
  });

  if (!workspace) {
    return { ok: false, reason: 'workspace-not-found' };
  }

  const existingWorker = (workspace.columns || []).some((column) =>
    (column?.panels || []).some((panel) => panel?.swarmContext?.roleKey === roleKey)
  );
  if (existingWorker) {
    return { ok: false, reason: 'worker-already-materialized' };
  }

  panelCounterRef.current += 1;
  const panelId = `p${panelCounterRef.current}`;
  const panelCwd = runtimeRequest.workspacePath || workspace.columns?.[0]?.panels?.[0]?.cwd || null;
  const launchRequests = prepareSwarmLaunchRequests([runtimeRequest]);
  const request = launchRequests[0];
  if (!request) {
    return { ok: false, reason: 'invalid-launch-request' };
  }

  const workerPanel = buildPanel(request, panelId, panelCwd);
  const directorPanel = findDirectorPanelInColumns(workspace.columns || []);
  const nextColumns = insertWorkerPanelIntoGrowingSwarmColumns(
    workspace.columns || [],
    workerPanel,
    directorPanel?.id || null
  );

  return {
    ok: true,
    wsId: workspace.id,
    panelId,
    columns: nextColumns,
    panelCwd,
    request,
  };
}
