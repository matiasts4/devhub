// useSwarmLaunchController — manages swarm launch wizard state and enqueue logic.
// Extracted from TerminalWorkspacesManager.jsx.

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createSwarmLaunchDraft, deriveSwarmLaunchPreview } from '@/lib/operations/swarmControl';
import { getSwarmSnapshotStorageKey } from '../utils/swarmRoleMeta';
import { setPanelRendererPreference } from '../terminalRendererPreferences';
import { dispatchSwarmLaunchMaterialized } from '@/lib/terminal/swarmLaunchBatch';
import {
  createSwarmLaunchQueueHandlers,
  createWorkspaceForSwarmLaunchRequestsFn,
  resolveSwarmPanelStandbyFlag,
} from '@/lib/terminal/swarmLaunchWorkspace';

export default function useSwarmLaunchController({
  projectId,
  swarmLaunchCatalog,
  swarmLaunchProject,
  storage,
  cwd,
  wsCounterRef,
  colCounterRef,
  panelCounterRef,
  setWorkspaces,
  setActiveWsId,
  setActivePanelIds,
  setTerminalRendererPreferences,
  getAllPanelIds,
  syncActiveWindowSnapshot,
  materializedSwarmLaunchIdsRef = null,
  pendingSwarmLaunchByLaunchIdRef: externalPendingByLaunchIdRef = null,
  persistAgentRunMetadata,
  workspacesRef = null,
  buildPanel,
  onMarkPanelsClosing = null,
  onClearLaunchWrapperDispatch = null,
  onAfterMaterialize = null,
  setSwarmControlSnapshot = null,
  applyRendererPreference = null,
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
  const localPendingSwarmLaunchByLaunchIdRef = useRef(new Map());
  const pendingSwarmLaunchByLaunchIdRef =
    externalPendingByLaunchIdRef || localPendingSwarmLaunchByLaunchIdRef;
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

  useEffect(() => {
    setSwarmLaunchDraft((current) =>
      createSwarmLaunchDraft({
        catalog: swarmLaunchCatalog,
        project: swarmLaunchProject,
        draft: current || {},
      })
    );
  }, [swarmLaunchCatalog, swarmLaunchProject]);

  useEffect(
    () => () => {
      if (swarmLaunchFlushTimerRef.current) {
        window.clearTimeout(swarmLaunchFlushTimerRef.current);
        swarmLaunchFlushTimerRef.current = null;
      }
      pendingSwarmLaunchRequestsRef.current = [];
      pendingSwarmLaunchByLaunchIdRef.current.forEach((batch) => {
        if (batch.timer) window.clearTimeout(batch.timer);
      });
      pendingSwarmLaunchByLaunchIdRef.current.clear();
    },
    [pendingSwarmLaunchByLaunchIdRef]
  );

  const updateSwarmLaunchDraft = useCallback(
    (patch = {}) => {
      setSwarmLaunchDraft((current) =>
        createSwarmLaunchDraft({
          catalog: swarmLaunchCatalog,
          project: swarmLaunchProject,
          draft: { ...(current || {}), ...patch },
        })
      );
    },
    [swarmLaunchCatalog, swarmLaunchProject]
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

      const runtimeRequests = payload?.launch_result?.runtime_requests || [];
      if (runtimeRequests.length === 0) {
        const failedRoles = payload?.launch_result?.failed_roles || [];
        const failedDetail = failedRoles
          .map(
            (role) => `${role?.roleLabel || role?.roleKey}: ${role?.error || 'error desconocido'}`
          )
          .join(' | ');
        throw new Error(
          failedDetail
            ? `El swarm no se lanzó: no se pudo inicializar ningún agente. ${failedDetail}`
            : 'El swarm no se lanzó: no se pudo inicializar ningún agente.'
        );
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
        setSwarmControlSnapshot?.(payload.control_room_snapshot_input);
      }

      dispatchSwarmLaunchMaterialized(runtimeRequests);

      setSwarmLaunchWizardOpen(false);
      setSwarmLaunchSubmitState({ submitting: false, error: null });
    } catch (error) {
      setSwarmLaunchSubmitState({
        submitting: false,
        error: error?.message || 'No se pudo lanzar el swarm desde terminales.',
      });
    }
  }, [projectId, swarmLaunchPreview?.draft, setSwarmControlSnapshot]);

  const resolvedBuildPanel =
    buildPanel ||
    ((request, panelId, panelCwd) => ({
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
    }));

  const createWorkspaceForSwarmLaunchRequests = useMemo(
    () =>
      createWorkspaceForSwarmLaunchRequestsFn({
        cwd,
        wsCounterRef,
        colCounterRef,
        panelCounterRef,
        materializedSwarmLaunchIdsRef: resolvedMaterializedSwarmLaunchIdsRef,
        getAllPanelIds,
        buildPanel: resolvedBuildPanel,
        setWorkspaces,
        setActiveWsId,
        setActivePanelIds,
        setTerminalRendererPreferences,
        applyRendererPreference:
          applyRendererPreference ||
          ((acc, wsId, panelId) => setPanelRendererPreference(acc, wsId, panelId, 'xterm-webgl')),
        syncActiveWindowSnapshot,
        persistAgentRunMetadata,
        workspacesRef,
        onMarkPanelsClosing,
        onClearLaunchWrapperDispatch,
        onAfterMaterialize:
          onAfterMaterialize ||
          (({ launchId }) => {
            if (!launchId) return;
            resolvedMaterializedSwarmLaunchIdsRef.current.add(launchId);
            const pendingBatch = pendingSwarmLaunchByLaunchIdRef.current.get(launchId);
            if (pendingBatch?.timer) {
              window.clearTimeout(pendingBatch.timer);
            }
            pendingSwarmLaunchByLaunchIdRef.current.delete(launchId);
          }),
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
      resolvedBuildPanel,
      onMarkPanelsClosing,
      onClearLaunchWrapperDispatch,
      onAfterMaterialize,
      applyRendererPreference,
      pendingSwarmLaunchByLaunchIdRef,
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
        clearTimeoutFn: (...args) => window.clearTimeout(...args),
        setTimeoutFn: (...args) => window.setTimeout(...args),
      }),
    [
      createWorkspaceForSwarmLaunchRequests,
      resolvedMaterializedSwarmLaunchIdsRef,
      pendingSwarmLaunchByLaunchIdRef,
    ]
  );

  return {
    swarmLaunchWizardOpen,
    setSwarmLaunchWizardOpen,
    swarmLaunchWizardStep,
    setSwarmLaunchWizardStep,
    swarmLaunchDraft,
    swarmLaunchSubmitState,
    setSwarmLaunchSubmitState,
    updateSwarmLaunchDraft,
    openTerminalSwarmLauncher,
    handleTerminalSwarmLaunch,
    enqueueSwarmLaunchRequest,
    createWorkspaceForSwarmLaunchRequests,
    resolvedSwarmLaunchDraft,
    swarmLaunchPreview,
  };
}
