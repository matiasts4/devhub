// useSwarmLaunchController — manages swarm launch wizard state and enqueue logic.
// Extracted from TerminalWorkspacesManager.jsx.
// Args: { projectId, workspaces, activeWsId, activePanelIds, cwd, swarmLaunchCatalog, swarmLaunchProject, storage }
// Returns: { swarmLaunchWizardOpen, swarmLaunchWizardStep, swarmLaunchDraft, swarmLaunchSubmitState, updateSwarmLaunchDraft, openTerminalSwarmLauncher, handleTerminalSwarmLaunch, enqueueSwarmLaunchRequest, resolvedSwarmLaunchDraft, swarmLaunchPreview }

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createSwarmLaunchDraft, deriveSwarmLaunchPreview } from '@/lib/operations/swarmControl';
import { enforceDocOpsGateOnLaunchCommand } from '@/lib/docopsPrompts';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import { buildSwarmRoleMetadata, getSwarmSnapshotStorageKey } from '../utils/swarmRoleMeta';
import { setPanelRendererPreference } from '../terminalRendererPreferences';
import { dispatchSwarmLaunchMaterialized } from '@/lib/terminal/swarmLaunchBatch';
import {
  createSwarmLaunchQueueHandlers,
  createWorkspaceForSwarmLaunchRequestsFn,
  resolveSwarmPanelStandbyFlag,
} from '@/lib/terminal/swarmLaunchWorkspace';

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
  syncActiveWindowSnapshot,
  materializedSwarmLaunchIdsRef = null,
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
  const localMaterializedSwarmLaunchIdsRef = useRef(new Set());
  const resolvedMaterializedSwarmLaunchIdsRef =
    materializedSwarmLaunchIdsRef || localMaterializedSwarmLaunchIdsRef;

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

  const createWorkspaceForSwarmLaunchRequests = useMemo(
    () =>
      createWorkspaceForSwarmLaunchRequestsFn({
        cwd,
        wsCounterRef,
        colCounterRef,
        panelCounterRef,
        materializedSwarmLaunchIdsRef: resolvedMaterializedSwarmLaunchIdsRef,
        getAllPanelIds,
        buildPanel: (request, panelId, panelCwd) => ({
          id: panelId,
          initialCommand: request.commandToRun,
          cwd: panelCwd,
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
        }),
        setWorkspaces,
        setActiveWsId,
        setActivePanelIds,
        setTerminalRendererPreferences,
        applyRendererPreference: (acc, wsId, panelId) =>
          setPanelRendererPreference(acc, wsId, panelId, 'xterm-webgl'),
        syncActiveWindowSnapshot,
        persistAgentRunMetadata,
        onAfterMaterialize: ({ launchId }) => {
          if (!launchId) return;
          resolvedMaterializedSwarmLaunchIdsRef.current.add(launchId);
          const pendingBatch = pendingSwarmLaunchByLaunchIdRef.current.get(launchId);
          if (pendingBatch?.timer) {
            window.clearTimeout(pendingBatch.timer);
          }
          pendingSwarmLaunchByLaunchIdRef.current.delete(launchId);
        },
      }),
    [
      cwd,
      persistAgentRunMetadata,
      syncActiveWindowSnapshot,
      getAllPanelIds,
      setWorkspaces,
      setActiveWsId,
      setActivePanelIds,
      setTerminalRendererPreferences,
      wsCounterRef,
      colCounterRef,
      panelCounterRef,
      resolvedMaterializedSwarmLaunchIdsRef,
    ]
  );

  const { enqueueSwarmLaunchRequest } = useMemo(
    () =>
      createSwarmLaunchQueueHandlers({
        pendingSwarmLaunchByLaunchIdRef,
        pendingSwarmLaunchRequestsRef,
        swarmLaunchFlushTimerRef,
        materializedSwarmLaunchIdsRef: resolvedMaterializedSwarmLaunchIdsRef,
        createWorkspaceForSwarmLaunchRequests,
        clearTimeoutFn: window.clearTimeout.bind(window),
        setTimeoutFn: window.setTimeout.bind(window),
      }),
    [createWorkspaceForSwarmLaunchRequests, resolvedMaterializedSwarmLaunchIdsRef]
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
