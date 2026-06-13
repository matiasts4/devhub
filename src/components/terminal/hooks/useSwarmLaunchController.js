// useSwarmLaunchController — manages swarm launch wizard state and enqueue logic.
// Extracted from TerminalWorkspacesManager.jsx.
// Args: { projectId, workspaces, activeWsId, activePanelIds, cwd, swarmLaunchCatalog, swarmLaunchProject, storage }
// Returns: { swarmLaunchWizardOpen, swarmLaunchWizardStep, swarmLaunchDraft, swarmLaunchSubmitState, updateSwarmLaunchDraft, openTerminalSwarmLauncher, handleTerminalSwarmLaunch, enqueueSwarmLaunchRequest, resolvedSwarmLaunchDraft, swarmLaunchPreview }

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  createSwarmLaunchDraft,
  deriveSwarmLaunchPreview,
  isOrchestratorRoleKey,
} from '@/lib/operations/swarmControl';
import { enforceDocOpsGateOnLaunchCommand } from '@/lib/docopsPrompts';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import {
  buildSwarmRoleMetadata,
  getSwarmRoleOrder,
  getSwarmSnapshotStorageKey,
} from '../utils/swarmRoleMeta';
import { closeTerminalSessions, syncWorkspaceCountersMonotonic } from '../workspaceStateHelpers';
import {
  setPanelRendererPreference,
  TERMINAL_RENDERER_INHERIT_MODE,
} from '../terminalRendererPreferences';

import {
  dispatchSwarmLaunchMaterialized,
  rescheduleSwarmLaunchBatchFlush,
} from '@/lib/terminal/swarmLaunchBatch';

export default function useSwarmLaunchController({
  projectId,
  workspaces,
  activeWsId,
  activePanelIds,
  cwd,
  swarmLaunchCatalog,
  swarmLaunchProject,
  storage,
  wsCounterRef,
  colCounterRef,
  panelCounterRef,
  windowCounterRef,
  setWorkspaces,
  setActiveWsId,
  setActivePanelIds,
  setTerminalRendererPreferences,
  getAllPanelIds,
}) {
  const [swarmLaunchWizardOpen, setSwarmLaunchWizardOpen] = useState(false);
  const [swarmLaunchWizardStep, setSwarmLaunchWizardStep] = useState('team');
  const [swarmLaunchDraft, setSwarmLaunchDraft] = useState(null);
  const [swarmLaunchSubmitState, setSwarmLaunchSubmitState] = useState({
    submitting: false,
    error: null,
  });
  const pendingSwarmLaunchRequestsRef = useRef([]);
  const swarmLaunchFlushTimerRef = useRef(null);
  const swarmLaunchScheduledTimersRef = useRef(new Map());
  const pendingSwarmLaunchByLaunchIdRef = useRef(new Map());

  const resolvedSwarmLaunchDraft = useMemo(
    () =>
      createSwarmLaunchDraft({
        catalog: swarmLaunchCatalog,
        project: swarmLaunchProject,
        draft: swarmLaunchDraft || {},
      }),
    [swarmLaunchCatalog, swarmLaunchDraft, swarmLaunchProject]
  );

  const swarmLaunchPreview = useMemo(
    () =>
      deriveSwarmLaunchPreview({
        catalog: swarmLaunchCatalog,
        draft: resolvedSwarmLaunchDraft,
      }),
    [swarmLaunchCatalog, resolvedSwarmLaunchDraft]
  );

  // Initialize draft on catalog/project change
  useEffect(() => {
    // Try to load persisted draft from localStorage first
    let persistedDraft = {};
    if (storage && projectId) {
      try {
        const saved = storage.getItem(`devhub_swarm_launch_draft_${projectId}`);
        if (saved) {
          persistedDraft = JSON.parse(saved);
        }
      } catch {
        // Ignore parse failures
      }
    }

    setSwarmLaunchDraft((current) =>
      createSwarmLaunchDraft({
        catalog: swarmLaunchCatalog,
        project: swarmLaunchProject,
        preferredTemplateId: swarmLaunchCatalog?.recommended_template_id,
        draft: persistedDraft,
      })
    );
  }, [swarmLaunchCatalog, swarmLaunchProject, projectId, storage]);

  // Cleanup timer on unmount
  useEffect(
    () => () => {
      if (swarmLaunchFlushTimerRef.current) {
        window.clearTimeout(swarmLaunchFlushTimerRef.current);
        swarmLaunchFlushTimerRef.current = null;
      }
      swarmLaunchScheduledTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      swarmLaunchScheduledTimersRef.current.clear();
      pendingSwarmLaunchRequestsRef.current = [];
      pendingSwarmLaunchByLaunchIdRef.current.forEach((batch) => {
        if (batch.timer) window.clearTimeout(batch.timer);
      });
      pendingSwarmLaunchByLaunchIdRef.current.clear();
    },
    []
  );

  const updateSwarmLaunchDraft = useCallback(
    (patch = {}) => {
      setSwarmLaunchDraft((current) => {
        const newDraft = createSwarmLaunchDraft({
          catalog: swarmLaunchCatalog,
          project: swarmLaunchProject,
          draft: { ...(current || {}), ...patch },
        });

        // Persist to localStorage
        if (storage && projectId) {
          try {
            storage.setItem(`devhub_swarm_launch_draft_${projectId}`, JSON.stringify(newDraft));
          } catch {
            // Ignore localStorage failures
          }
        }

        return newDraft;
      });
    },
    [swarmLaunchCatalog, swarmLaunchProject, projectId, storage]
  );

  const openTerminalSwarmLauncher = useCallback(() => {
    setSwarmLaunchDraft((current) =>
      createSwarmLaunchDraft({
        catalog: swarmLaunchCatalog,
        project: swarmLaunchProject,
        preferredTemplateId: swarmLaunchCatalog?.recommended_template_id,
        draft: current || {},
      })
    );
    setSwarmLaunchSubmitState({ submitting: false, error: null });
    setSwarmLaunchWizardStep('team');
    setSwarmLaunchWizardOpen(true);
  }, [swarmLaunchCatalog, swarmLaunchProject]);

  const handleTerminalSwarmLaunch = useCallback(async () => {
    if (!projectId) {
      setSwarmLaunchSubmitState({
        submitting: false,
        error: 'No hay project_id para lanzar el swarm desde terminales.',
      });
      return;
    }

    setSwarmLaunchSubmitState({ submitting: true, error: null });

    try {
      const response = await fetch('/api/agenthub/operations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'launch_swarm_local',
          project_id: projectId,
          draft: swarmLaunchPreview?.draft,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo lanzar el swarm desde terminales.');
      }

      if (payload.control_room_snapshot_input) {
        try {
          localStorage.setItem(
            getSwarmSnapshotStorageKey(projectId),
            JSON.stringify(payload.control_room_snapshot_input)
          );
        } catch {
          // Ignore localStorage failures.
        }
      }

      dispatchSwarmLaunchMaterialized(payload.launch_result?.runtime_requests || []);

      setSwarmLaunchWizardOpen(false);
      setSwarmLaunchSubmitState({ submitting: false, error: null });
    } catch (error) {
      setSwarmLaunchSubmitState({
        submitting: false,
        error: error?.message || 'No se pudo lanzar el swarm desde terminales.',
      });
    }
  }, [projectId, swarmLaunchPreview?.draft]);

  const persistAgentRunMetadata = useCallback(
    async (request, panelId, commandToRun, panelCwd = null) => {
      const {
        taskId,
        selectedAgent,
        launchOrigin,
        promptSummary,
        taskTitle,
        workspacePath,
        workspaceId,
        runId,
        sessionId,
        evidenceRef,
      } = request || {};
      if (!taskId || !panelId) return;
      const swarmRole = buildSwarmRoleMetadata(request);
      const resolvedWorkspacePath = workspacePath || panelCwd || null;
      const workspaceVerified = workspacePath ? workspacePath === panelCwd : null;

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
          workspacePath: resolvedWorkspacePath,
          actualWorkspacePath: panelCwd || null,
          workspaceId: workspaceId || null,
          runId: runId || null,
          sessionId: sessionId || null,
          workspaceVerified,
          evidenceRef: evidenceRef || null,
          launchedAt: Date.now(),
        };
        localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
      } catch {
        // Ignore localStorage failures.
      }

      // Keep launch metadata local-only here; registry lifecycle is managed by control-plane flows.
    },
    []
  );

  const syncActiveWindowSnapshot = useCallback((wsId, columns, nextActivePanelId = null) => {
    // This needs setWorkspaceWindows and activeWindowIds from orchestrator
    // For now, this is a placeholder — the orchestrator will handle this
  }, []);

  const createWorkspaceForSwarmLaunchRequests = useCallback(
    (requests = []) => {
      const launchRequests = requests
        .map((request) => {
          const commandToRun = enforceDocOpsGateOnLaunchCommand(
            request.command || `opencode --agent ${request.selectedAgent || DEFAULT_OPENCODE_AGENT}`
          );
          const swarmRole = buildSwarmRoleMetadata(request);
          return { ...request, commandToRun, swarmRole };
        })
        .filter((request) => request.taskId && request.commandToRun);

      if (launchRequests.length === 0) return;

      const directorRequest =
        launchRequests.find((request) => isOrchestratorRoleKey(request.swarmRole?.roleKey)) || null;
      const workerRequests = launchRequests
        .filter((request) => request !== directorRequest)
        .sort(
          (a, b) =>
            getSwarmRoleOrder(a.swarmRole?.roleKey) - getSwarmRoleOrder(b.swarmRole?.roleKey)
        );

      const groupedRequests =
        directorRequest && launchRequests.length >= 3
          ? [
              workerRequests.filter((_, index) => index % 2 === 0),
              workerRequests.filter((_, index) => index % 2 === 1),
              [directorRequest],
            ].filter((columnRequests) => columnRequests.length > 0)
          : [launchRequests];

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
            return {
              id: panelId,
              initialCommand: request.commandToRun,
              cwd: panelCwd,
              swarmRole: request.swarmRole,
            };
          });
          return { id: colId, panels };
        });

      const launchLabel = launchRequests[0]?.taskTitle?.split(' · ')?.[0] || 'Swarm launch';
      const activePanelForLaunch = directorPanelId || firstPanelId;
      const nextWorkspace = {
        id: newWsId,
        name: launchLabel,
        columns: newColumns,
      };

      let previousSwarmPanelIds = [];
      try {
        const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
        previousSwarmPanelIds = Object.values(runs || {})
          .filter((run) => run?.launchOrigin === 'swarm-control-launch' && run?.panelId)
          .map((run) => run.panelId);
      } catch {
        previousSwarmPanelIds = [];
      }
      if (previousSwarmPanelIds.length > 0) {
        closeTerminalSessions(previousSwarmPanelIds);
      }

      setWorkspaces((prev) => {
        const oldSwarmPanelIds = new Set(previousSwarmPanelIds);
        const retained = prev.filter((workspace) => {
          const panelIds = getAllPanelIds(workspace.columns || []);
          return !panelIds.some((panelId) => oldSwarmPanelIds.has(panelId));
        });
        return [...retained, nextWorkspace];
      });
      setActiveWsId(newWsId);
      setActivePanelIds((prev) => ({ ...prev, [newWsId]: activePanelForLaunch }));
      setTerminalRendererPreferences((prev) =>
        panelAssignments.reduce(
          (acc, assignment) =>
            // Explicit webgl pin for swarm agent terminals (in addition to INHERIT).
            // Guarantees xterm-webgl even if legacy stored defaults existed.
            // VTE is disabled globally; this path will never resolve to it.
            setPanelRendererPreference(acc, newWsId, assignment.panelId, 'xterm-webgl'),
          prev
        )
      );

      panelAssignments.forEach(({ request, panelId, panelCwd }) => {
        persistAgentRunMetadata(request, panelId, request.commandToRun, panelCwd);
      });
    },
    [
      cwd,
      persistAgentRunMetadata,
      wsCounterRef,
      colCounterRef,
      panelCounterRef,
      setWorkspaces,
      setActiveWsId,
      setActivePanelIds,
      setTerminalRendererPreferences,
      getAllPanelIds,
    ]
  );

  const flushSwarmLaunchBatch = useCallback(
    (launchId) => {
      const batch = pendingSwarmLaunchByLaunchIdRef.current.get(launchId);
      if (!batch) return;

      if (batch.timer) {
        window.clearTimeout(batch.timer);
        batch.timer = null;
      }

      pendingSwarmLaunchByLaunchIdRef.current.delete(launchId);
      createWorkspaceForSwarmLaunchRequests(batch.requests);
    },
    [createWorkspaceForSwarmLaunchRequests]
  );

  const flushPendingSwarmLaunchRequests = useCallback(() => {
    const requests = pendingSwarmLaunchRequestsRef.current;
    pendingSwarmLaunchRequestsRef.current = [];
    swarmLaunchFlushTimerRef.current = null;
    if (requests.length > 0) {
      createWorkspaceForSwarmLaunchRequests(requests);
    }
  }, [createWorkspaceForSwarmLaunchRequests]);

  const enqueueSwarmLaunchRequest = useCallback(
    (request) => {
      const launchId = request.launchId || 'unknown';
      let batch = pendingSwarmLaunchByLaunchIdRef.current.get(launchId);

      if (!batch) {
        batch = { requests: [], timer: null };
        pendingSwarmLaunchByLaunchIdRef.current.set(launchId, batch);
      }

      batch.requests.push(request);

      batch.timer = rescheduleSwarmLaunchBatchFlush({
        existingTimerId: batch.timer,
        onFlush: () => flushSwarmLaunchBatch(launchId),
        clearTimeoutFn: window.clearTimeout.bind(window),
        setTimeoutFn: window.setTimeout.bind(window),
      });
    },
    [flushSwarmLaunchBatch]
  );

  return {
    swarmLaunchWizardOpen,
    setSwarmLaunchWizardOpen,
    swarmLaunchWizardStep,
    setSwarmLaunchWizardStep,
    swarmLaunchDraft,
    swarmLaunchSubmitState,
    updateSwarmLaunchDraft,
    openTerminalSwarmLauncher,
    handleTerminalSwarmLaunch,
    enqueueSwarmLaunchRequest,
    resolvedSwarmLaunchDraft,
    swarmLaunchPreview,
  };
}

function shortenCommandSummary(command) {
  const raw = String(command || '').trim();
  if (!raw) return 'Ejecucion iniciada desde terminal';
  if (raw.length <= 140) return raw;
  return `${raw.slice(0, 137)}...`;
}
