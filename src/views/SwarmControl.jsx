import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Bot } from 'lucide-react';
import {
  composeControlRoomSnapshot,
  createSwarmLaunchDraft,
  deriveSwarmLaunchPreview,
  performDirectorApprovalDecision,
  persistMissionControlComposerMessage,
  selectControlRoomAgents,
  selectControlRoomApprovals,
  selectControlRoomDiagnostics,
  selectControlRoomEvidenceTimeline,
  selectControlRoomErrors,
  selectControlRoomHeader,
  selectControlRoomMission,
  selectControlRoomRuns,
  selectControlRoomWorkspaces,
  selectDirectorQueue,
  selectDirectorMissionSummary,
  selectSwarmControlPrimarySurface,
  selectSwarmLaunchCatalog,
} from '@/lib/operations/swarmControl';
import ControlRoomHeader from '@/components/control-room/ControlRoomHeader';
import DirectorQueuePanel from '@/components/control-room/DirectorQueuePanel';
import AgentsClaimsPanel from '@/components/control-room/AgentsClaimsPanel';
import WorkspacesPanel from '@/components/control-room/WorkspacesPanel';
import RunsArtifactsPanel from '@/components/control-room/RunsArtifactsPanel';
import ApprovalsErrorsPanel from '@/components/control-room/ApprovalsErrorsPanel';
import DiagnosticOverlay from '@/components/control-room/DiagnosticOverlay';
import MissionKernelPanel from '@/components/control-room/MissionKernelPanel';
import EvidenceTimelinePanel from '@/components/control-room/EvidenceTimelinePanel';
import DGObserverSidebar from '@/components/control-room/DGObserverSidebar';
import { useDirectorGeneralBridge } from '@/lib/directorGeneral';
import SwarmPrimarySurface from '@/components/control-room/SwarmPrimarySurface';
import LaunchpadTemplatesPanel from '@/components/control-room/LaunchpadTemplatesPanel';
import SwarmTypeCatalogPanel from '@/components/control-room/SwarmTypeCatalogPanel';
import SwarmLaunchWizardModal from '@/components/control-room/SwarmLaunchWizardModal';
import { ChromeSurface } from '@/components/ui/chrome-surface';
import { Button } from '@/components/ui/button';
import WorkspacePageTitle from '@/components/workspace/WorkspacePageTitle';
import ActiveProcessesPanel from '@/components/control-room/ActiveProcessesPanel';
import SwarmDelegationPanel from '@/components/control-room/SwarmDelegationPanel';
import StatusSignal from '@/components/ui/StatusSignal';
import OperatorTimelineFeed from '@/components/OperatorTimeline/OperatorTimelineFeed.jsx';
import {
  dataTileStyle,
  filterBarStyle,
  inputStyle,
  panelStyle,
  pillStyle,
  sectionSurfaceStyle,
} from '@/chrome/morphology';
import {
  getWorkspaceBreadcrumbStyle,
  getWorkspacePageContentStyle,
  getWorkspacePageHeaderStyle,
  getWorkspacePageShellStyle,
} from './workspacePageChrome';
import { dispatchSwarmLaunchMaterialized } from '@/lib/terminal/swarmLaunchBatch';

void [
  ControlRoomHeader,
  DirectorQueuePanel,
  AgentsClaimsPanel,
  WorkspacesPanel,
  RunsArtifactsPanel,
  ApprovalsErrorsPanel,
  DiagnosticOverlay,
  MissionKernelPanel,
  EvidenceTimelinePanel,
  SwarmPrimarySurface,
  LaunchpadTemplatesPanel,
  SwarmTypeCatalogPanel,
  SwarmLaunchWizardModal,
  ActiveProcessesPanel,
];

function buildSnapshotInput({ snapshotInput, fetchedInput, project }) {
  if (snapshotInput) return snapshotInput;
  if (fetchedInput) return fetchedInput;
  return project ? { project } : {};
}

function getSwarmSnapshotStorageKey(projectId) {
  return projectId ? `devhub_swarm_control_snapshot:${projectId}` : 'devhub_swarm_control_snapshot';
}

function readCachedSwarmSnapshot(projectId) {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage?.getItem(getSwarmSnapshotStorageKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedSwarmSnapshot(projectId, snapshotInput) {
  if (typeof window === 'undefined' || !snapshotInput) return;

  try {
    window.localStorage?.setItem(
      getSwarmSnapshotStorageKey(projectId),
      JSON.stringify(snapshotInput)
    );
  } catch {
    // Ignore localStorage failures.
  }
}

export function getSwarmControlLayoutButtonVariant(layout, targetLayout) {
  return layout === targetLayout ? 'devhubGlass' : 'devhubGhost';
}

export function getSwarmControlChromeStyles() {
  return {
    launchSummaryShell: {
      ...sectionSurfaceStyle({ emphasized: true }),
      background: 'var(--chrome-panel-fill-emphasis)',
      borderColor: 'var(--chrome-border-color)',
    },
    launchSummaryCard: {
      ...dataTileStyle(),
      background: 'var(--chrome-control-fill)',
    },
    controlSection: {
      ...panelStyle(),
      background: 'var(--chrome-panel-fill)',
    },
    controlCluster: {
      ...panelStyle(),
      background: 'var(--chrome-control-fill)',
    },
    filterInput: {
      ...inputStyle(),
      background: 'var(--chrome-control-fill)',
      borderRadius: 'var(--chrome-radius-control)',
    },
    statChip: {
      ...pillStyle(),
      background: 'var(--chrome-control-fill)',
    },
  };
}

export default function SwarmControl({ snapshotInput = null }) {
  const { project } = useOutletContext() || {};
  const [fetchedInput, setFetchedInput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [missionControlOverride, setMissionControlOverride] = useState(null);
  const [directorQueueOverride, setDirectorQueueOverride] = useState(null);
  const [handoffSubmitState, setHandoffSubmitState] = useState({ submitting: false, error: null });
  const [approvalMutationState, setApprovalMutationState] = useState({
    submittingKey: null,
    error: null,
    errorKey: null,
  });
  const [filterText, setFilterText] = useState('');
  const [layout, setLayout] = useState('grid');
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [expandedPanels, setExpandedPanels] = useState({ diagnostics: true });
  const [launchWizardOpen, setLaunchWizardOpen] = useState(false);
  const [launchWizardStep, setLaunchWizardStep] = useState('team');
  const [launchDraft, setLaunchDraft] = useState(null);
  const [launchResult, setLaunchResult] = useState(null);
  const [launchSubmitState, setLaunchSubmitState] = useState({ submitting: false, error: null });
  const [terminateState, setTerminateState] = useState({ submitting: false, error: null });
  const [activateZedState, setActivateZedState] = useState({ submitting: false, error: null });
  const [pruneState, setPruneState] = useState({ submitting: false, error: null, result: null });
  const eventSourceRef = useRef(null);

  // DG bridge state — reads projectId from context
  const dg = useDirectorGeneralBridge({ projectId: project?.id });
  const scheduledLaunchTimersRef = useRef(new Map());

  useEffect(
    () => () => {
      scheduledLaunchTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      scheduledLaunchTimersRef.current.clear();
    },
    []
  );

  const loadSnapshot = useCallback(async () => {
    if (snapshotInput) return;

    const cachedSnapshot = readCachedSwarmSnapshot(project?.id);
    if (cachedSnapshot) {
      setFetchedInput((current) => current || { ...cachedSnapshot, project });
    }

    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (project?.id) params.set('project_id', project.id);

      const response = await fetch(
        params.size
          ? `/api/agenthub/operations/health?${params.toString()}`
          : '/api/agenthub/operations/health',
        { cache: 'no-store' }
      );
      if (!response.ok) return;

      const payload = await response.json();
      const nextInput =
        payload.control_room_input ||
        payload.control_room_snapshot_input ||
        payload.control_room ||
        null;

      if (nextInput) {
        writeCachedSwarmSnapshot(project?.id, nextInput);
        setFetchedInput(nextInput);
      }
    } catch {
      // Snapshot endpoint may not yet expose control-room payload in this slice.
    } finally {
      setLoading(false);
    }
  }, [project?.id, snapshotInput]);

  const mergeFetchedInput = useCallback(
    (nextInput = null) => {
      if (!nextInput) return;
      setFetchedInput((current) => ({ ...(current || {}), ...nextInput, project }));
    },
    [project]
  );

  useEffect(() => {
    if (snapshotInput) return undefined;

    loadSnapshot();
    return undefined;
  }, [loadSnapshot, snapshotInput]);

  useEffect(() => {
    if (snapshotInput || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return undefined;
    }

    const params = new URLSearchParams();
    if (project?.id) params.set('project_id', project.id);

    const activeMissionId = fetchedInput?.mission_control?.mission?.mission_id || null;
    if (activeMissionId) params.set('mission_id', activeMissionId);

    const sseUrl = params.size
      ? `/api/agenthub/sessions/stream?${params.toString()}`
      : '/api/agenthub/sessions/stream';

    let isSubscribed = true;
    const source = new EventSource(sseUrl);
    eventSourceRef.current = source;

    const handleDirectorFeed = async (event) => {
      if (!isSubscribed) return;

      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      const eventMissionId =
        payload?.mission_id || payload?.director_feed?.handoff?.task?.mission_id || null;
      if (activeMissionId && eventMissionId && activeMissionId !== eventMissionId) {
        return;
      }

      await loadSnapshot();
    };

    source.addEventListener('director-feed', handleDirectorFeed);

    return () => {
      isSubscribed = false;
      source.removeEventListener('director-feed', handleDirectorFeed);
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  }, [
    fetchedInput?.mission_control?.mission?.mission_id,
    loadSnapshot,
    project?.id,
    snapshotInput,
  ]);

  const snapshot = useMemo(
    () =>
      composeControlRoomSnapshot(
        buildSnapshotInput({
          snapshotInput,
          fetchedInput,
          project,
        })
      ),
    [snapshotInput, fetchedInput, project]
  );

  const header = useMemo(() => selectControlRoomHeader(snapshot), [snapshot]);
  const missionSummary = useMemo(() => selectDirectorMissionSummary(snapshot), [snapshot]);
  const agents = useMemo(() => selectControlRoomAgents(snapshot), [snapshot]);
  const workspaces = useMemo(() => selectControlRoomWorkspaces(snapshot), [snapshot]);
  const runs = useMemo(() => selectControlRoomRuns(snapshot), [snapshot]);
  const approvals = useMemo(() => selectControlRoomApprovals(snapshot), [snapshot]);
  const diagnostics = useMemo(() => selectControlRoomDiagnostics(snapshot), [snapshot]);
  const evidenceTimeline = useMemo(() => selectControlRoomEvidenceTimeline(snapshot), [snapshot]);
  const errors = useMemo(() => selectControlRoomErrors(snapshot), [snapshot]);
  const missionControl = useMemo(() => selectControlRoomMission(snapshot), [snapshot]);
  const directorQueue = useMemo(() => selectDirectorQueue(snapshot), [snapshot]);
  const primarySurface = useMemo(() => selectSwarmControlPrimarySurface(snapshot), [snapshot]);
  const launchCatalog = useMemo(() => selectSwarmLaunchCatalog(snapshot), [snapshot]);
  const resolvedLaunchDraft = useMemo(
    () => createSwarmLaunchDraft({ catalog: launchCatalog, project, draft: launchDraft || {} }),
    [launchCatalog, launchDraft, project]
  );
  const launchPreview = useMemo(
    () => deriveSwarmLaunchPreview({ catalog: launchCatalog, draft: resolvedLaunchDraft }),
    [launchCatalog, resolvedLaunchDraft]
  );
  const effectiveMissionControl = missionControlOverride || missionControl;
  const effectiveDirectorQueue = directorQueueOverride || directorQueue;
  const isIdleLaunchpad = primarySurface.mode === 'idle';

  const eligibleExecutors = useMemo(
    () =>
      (Array.isArray(effectiveMissionControl?.participants)
        ? effectiveMissionControl.participants
        : []
      ).filter(
        (participant) =>
          participant?.status === 'active' && participant?.role_in_mission !== 'director'
      ),
    [effectiveMissionControl]
  );
  const handoffUnsafe = eligibleExecutors.length !== 1;
  const handoffDisabledReason = handoffSubmitState.error
    ? handoffSubmitState.error
    : handoffUnsafe
      ? 'Resolución insegura de destinatario: exactamente un executor activo.'
      : null;

  useEffect(() => {
    setMissionControlOverride(null);
  }, [missionControl]);

  useEffect(() => {
    setDirectorQueueOverride(null);
    setHandoffSubmitState({ submitting: false, error: null });
  }, [directorQueue]);

  useEffect(() => {
    setApprovalMutationState({ submittingKey: null, error: null, errorKey: null });
  }, [approvals]);

  useEffect(() => {
    setLaunchDraft((current) =>
      createSwarmLaunchDraft({ catalog: launchCatalog, project, draft: current || {} })
    );
  }, [launchCatalog, project]);

  const updateLaunchDraft = useCallback(
    (patch = {}) => {
      setLaunchDraft((current) =>
        createSwarmLaunchDraft({
          catalog: launchCatalog,
          project,
          draft: { ...(current || {}), ...patch },
        })
      );
    },
    [launchCatalog, project]
  );

  const openLaunchWizard = useCallback(
    ({ templateId = null, swarmTypeId = null, step = 'team', mode = null } = {}) => {
      setLaunchDraft((current) =>
        createSwarmLaunchDraft({
          catalog: launchCatalog,
          project,
          preferredTemplateId: templateId,
          preferredSwarmTypeId: swarmTypeId,
          draft: {
            ...(current || {}),
            ...(mode ? { mode } : {}),
          },
        })
      );
      setLaunchWizardStep(step);
      setLaunchWizardOpen(true);
    },
    [launchCatalog, project]
  );

  const handleTerminateSwarmLaunch = useCallback(async () => {
    const launchId = primarySurface?.hero?.launchId;
    if (!project?.id || !launchId) {
      setTerminateState({ submitting: false, error: 'No hay swarm activo para finalizar.' });
      return;
    }

    setTerminateState({ submitting: true, error: null });

    try {
      const response = await fetch('/api/agenthub/operations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'terminate_swarm_local',
          project_id: project.id,
          launch_id: launchId,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo finalizar el swarm.');
      }

      const nextInput = payload?.control_room_snapshot_input || payload?.control_room_input || null;
      if (nextInput) {
        writeCachedSwarmSnapshot(project.id, nextInput);
        mergeFetchedInput(nextInput);
      } else {
        try {
          localStorage.removeItem(getSwarmSnapshotStorageKey(project.id));
        } catch {
          // ignore
        }
        setFetchedInput(null);
      }

      setTerminateState({ submitting: false, error: null });
    } catch (error) {
      setTerminateState({
        submitting: false,
        error: error?.message || 'No se pudo finalizar el swarm.',
      });
    }
  }, [primarySurface, project]);

  const handlePrimaryAction = useCallback(
    (cta) => {
      if (cta?.target === 'launchpad-templates') {
        openLaunchWizard({
          templateId: launchCatalog?.recommended_template_id,
          step: 'team',
          mode: 'template',
        });
      }
      if (cta?.target === 'terminate-swarm') {
        handleTerminateSwarmLaunch();
      }
    },
    [launchCatalog?.recommended_template_id, openLaunchWizard, handleTerminateSwarmLaunch]
  );

  const handlePruneAllWorktrees = useCallback(async () => {
    if (!project?.localPath) {
      setPruneState({ submitting: false, error: 'Proyecto sin localPath.', result: null });
      return;
    }

    setPruneState({ submitting: true, error: null, result: null });

    try {
      const response = await fetch('/api/agenthub/operations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prune_all_worktrees',
          repo_root: project.localPath,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudieron podar los worktrees.');
      }

      setPruneState({
        submitting: false,
        error: null,
        result: payload,
      });
    } catch (error) {
      setPruneState({
        submitting: false,
        error: error?.message || 'No se pudieron podar los worktrees.',
        result: null,
      });
    }
  }, [project]);

  const handleLaunchSubmit = useCallback(async () => {
    if (!project?.id) return;

    setLaunchSubmitState({ submitting: true, error: null });

    try {
      const response = await fetch('/api/agenthub/operations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'launch_swarm_local',
          project_id: project.id,
          draft: launchPreview?.draft,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo lanzar el swarm durable.');
      }

      const nextInput = payload.control_room_snapshot_input || null;
      if (nextInput) {
        writeCachedSwarmSnapshot(project.id, nextInput);
        mergeFetchedInput(nextInput);
      }

      setLaunchResult({
        launchedAt: new Date().toISOString(),
        summary: {
          ...launchPreview,
          launchLabel: payload.launch_result?.launchLabel || launchPreview?.launchLabel,
          summaryLines: payload.launch_result?.summaryLines || launchPreview?.summaryLines,
        },
        launchTrace: payload.launch_result?.launch_trace || null,
        runtimeRequests: payload.launch_result?.runtime_requests || [],
      });

      dispatchSwarmLaunchMaterialized(payload.launch_result?.runtime_requests || []);

      setLaunchWizardOpen(false);
      setLaunchWizardStep('launch');
      setLaunchSubmitState({ submitting: false, error: null });
      await loadSnapshot();
    } catch (error) {
      setLaunchSubmitState({
        submitting: false,
        error: error?.message || 'No se pudo lanzar el swarm durable.',
      });
    }
  }, [launchPreview, loadSnapshot, mergeFetchedInput, project]);

  const handleComposerSubmit = async ({ recipient_agent_ids, body_summary }) => {
    if (!effectiveMissionControl?.mission?.mission_id) {
      throw new Error('No hay misión activa para este mensaje local.');
    }

    const nextMissionControl = await persistMissionControlComposerMessage({
      recipient_agent_ids,
      body_summary,
    });

    setMissionControlOverride(nextMissionControl);
  };

  const handleClaimNext = async () => {
    if (handoffUnsafe || !project?.id) return;

    setHandoffSubmitState({ submitting: true, error: null });

    try {
      const response = await fetch('/api/agenthub/operations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim_director_next_task',
          project_id: project.id,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo reclamar el siguiente task durable.');
      }

      const nextDirectorQueue =
        payload?.control_room_snapshot_input?.director_queue ||
        payload?.control_room_input?.director_queue;

      if (nextDirectorQueue) {
        setDirectorQueueOverride(nextDirectorQueue);
      }

      setHandoffSubmitState({ submitting: false, error: null });
    } catch (error) {
      setHandoffSubmitState({
        submitting: false,
        error: error?.message || 'No se pudo reclamar el siguiente task durable.',
      });
    }
  };

  const handleDirectorDecision = async (approval, decision) => {
    setApprovalMutationState({
      submittingKey: approval.checkpoint_key,
      error: null,
      errorKey: null,
    });

    try {
      const payload = await performDirectorApprovalDecision({
        task_id: approval.task_id,
        checkpoint_key: approval.checkpoint_key,
        decision,
        workspace_id: approval.workspace_id,
        run_id: approval.run_id,
        evidence_ref: approval.evidence_ref,
        fetchImpl: fetch,
      });

      const nextInput =
        payload?.control_room_snapshot_input ||
        payload?.control_room_input ||
        payload?.control_room ||
        null;
      if (nextInput) {
        setFetchedInput(nextInput);
      }

      setApprovalMutationState({ submittingKey: null, error: null, errorKey: null });
    } catch (error) {
      setApprovalMutationState({
        submittingKey: null,
        error: error?.message || 'No se pudo registrar la decisión del Director.',
        errorKey: approval.checkpoint_key,
      });
    } finally {
      await loadSnapshot();
    }
  };

  const normalizedFilter = filterText.trim().toLowerCase();
  const matchesFilter = useCallback(
    (record) => {
      if (!normalizedFilter) return true;
      return JSON.stringify(record || {})
        .toLowerCase()
        .includes(normalizedFilter);
    },
    [normalizedFilter]
  );

  const handleActivateZed = useCallback(async () => {
    const launchId = effectiveMissionControl?.mission?.mission_id || null;
    if (!launchId || !project?.id) return;

    setActivateZedState({ submitting: true, error: null });
    try {
      const response = await fetch('/api/agenthub/operations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'activate_zed_standby',
          project_id: project.id,
          launch_id: launchId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo activar ZED.');
      }
      setActivateZedState({ submitting: false, error: null });
    } catch (error) {
      setActivateZedState({
        submitting: false,
        error: error?.message || 'No se pudo activar ZED.',
      });
    }
  }, [effectiveMissionControl?.mission?.mission_id, project?.id]);

  const filteredAgents = useMemo(() => agents.filter(matchesFilter), [agents, matchesFilter]);

  const workerRoles = useMemo(
    () =>
      filteredAgents
        .map((agent) => {
          const id = String(agent?.agent_id || '');
          const match = id.match(/sdd_worker_\d+$/);
          return match ? match[0] : null;
        })
        .filter(Boolean)
        .sort(),
    [filteredAgents]
  );

  const isStandbyMission = useMemo(() => {
    const summary = String(missionSummary?.summary || missionControl?.mission?.summary || '');
    return /standby/i.test(summary);
  }, [missionControl?.mission?.summary, missionSummary?.summary]);
  const filteredWorkspaces = useMemo(
    () => workspaces.filter(matchesFilter),
    [workspaces, matchesFilter]
  );
  const filteredRuns = useMemo(() => runs.filter(matchesFilter), [runs, matchesFilter]);
  const filteredApprovals = useMemo(
    () => approvals.filter(matchesFilter),
    [approvals, matchesFilter]
  );
  const filteredErrors = useMemo(() => errors.filter(matchesFilter), [errors, matchesFilter]);

  return (
    <div className="h-full flex flex-col core-page-shell" style={getWorkspacePageShellStyle()}>
      <div
        className="sticky top-0 z-10 core-sticky-header border-b px-6 py-3 flex items-center justify-between"
        style={getWorkspacePageHeaderStyle()}
      >
        <WorkspacePageTitle
          icon={Bot}
          title="Swarm Control"
          projectName={project?.name || header.workspace_label}
        />

        <ChromeSurface
          as="span"
          surface="pill"
          tone="accent"
          className="px-2 py-0.5 text-xs"
          style={getWorkspaceBreadcrumbStyle()}
        >
          <span className="inline-flex items-center gap-2">
            <StatusSignal
              tone={header.supervisor_state === 'active' ? 'success' : 'neutral'}
              animation={header.supervisor_state === 'active' ? 'blink' : 'none'}
              compact
            />
            Supervisor {String(header.supervisor_state || 'unknown').toUpperCase()}
          </span>
        </ChromeSurface>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div style={getWorkspacePageContentStyle()}>
          <div className="flex flex-col gap-5">
            <ControlRoomHeader
              header={header}
              loading={loading}
              projectName={header.workspace_label}
              missionSummary={missionSummary}
            />

            <SwarmPrimarySurface surface={primarySurface} onPrimaryAction={handlePrimaryAction} />

            {launchResult ? (
              <section aria-label="Launch summary local">
                <ChromeSurface asChild surface="panel" emphasized>
                  <div className="p-4" style={sectionSurfaceStyle({ emphasized: true })}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="typography-label">Launch snapshot durable</p>
                        <h2 className="mt-2 typography-card-title">
                          {launchResult.summary?.launchLabel}
                        </h2>
                        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {launchResult.summary?.summaryLines?.[4]}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="devhubGlass"
                        size="toolbar"
                        onClick={() => openLaunchWizard({ step: 'launch' })}
                      >
                        Reabrir summary
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {launchResult.summary?.summaryLines?.slice(0, 3).map((line) => (
                        <ChromeSurface key={line} asChild surface="pill">
                          <div className="px-3 py-3 text-sm" style={dataTileStyle()}>
                            {line}
                          </div>
                        </ChromeSurface>
                      ))}
                    </div>

                    {launchResult.launchTrace ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <ChromeSurface asChild surface="pill">
                          <div className="px-3 py-3 text-sm" style={dataTileStyle()}>
                            Strategy · {launchResult.launchTrace.launchStrategy || 'director_first'}
                          </div>
                        </ChromeSurface>
                        <ChromeSurface asChild surface="pill">
                          <div className="px-3 py-3 text-sm" style={dataTileStyle()}>
                            Bootstrap · {launchResult.launchTrace.bootstrapMode || 'engram_first'}
                          </div>
                        </ChromeSurface>
                        <ChromeSurface asChild surface="pill">
                          <div className="px-3 py-3 text-sm" style={dataTileStyle()}>
                            Phases · {launchResult.launchTrace.phaseCount || 0} · Memory ·{' '}
                            {launchResult.launchTrace.memorySnapshotCount || 0}
                          </div>
                        </ChromeSurface>
                      </div>
                    ) : null}

                    {launchSubmitState.error ? (
                      <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
                        {launchSubmitState.error}
                      </p>
                    ) : null}
                  </div>
                </ChromeSurface>
              </section>
            ) : null}

            {isIdleLaunchpad ? (
              <section className="grid gap-5 xl:grid-cols-2" aria-label="Lanzador idle">
                <LaunchpadTemplatesPanel
                  catalog={launchCatalog}
                  selectedTemplateId={launchPreview?.draft?.templateId}
                  onSelectTemplate={(templateId) =>
                    updateLaunchDraft({ templateId, mode: 'template' })
                  }
                  onLaunch={(templateId) =>
                    openLaunchWizard({ templateId, step: 'team', mode: 'template' })
                  }
                />

                <SwarmTypeCatalogPanel
                  catalog={launchCatalog}
                  selectedSwarmTypeId={launchPreview?.draft?.swarmTypeId}
                  onSelectSwarmType={(swarmTypeId) =>
                    updateLaunchDraft({ swarmTypeId, mode: 'custom' })
                  }
                  onLaunch={(swarmTypeId) =>
                    openLaunchWizard({ swarmTypeId, step: 'configure', mode: 'custom' })
                  }
                />
              </section>
            ) : null}

            <ChromeSurface asChild surface="panel">
              <section className="p-4" style={filterBarStyle()} aria-label="Controles operativos">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="flex-1" style={panelStyle()}>
                    <label className="flex flex-col gap-2 p-3 text-xs font-medium">
                      <span style={{ color: 'var(--text-muted)' }}>Filtrar registros</span>
                      <input
                        aria-label="Filtrar registros"
                        className="w-full"
                        style={inputStyle()}
                        placeholder="agente, workspace, run, evidencia…"
                        value={filterText}
                        onChange={(event) => setFilterText(event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-2 p-2" style={panelStyle()}>
                    <Button
                      type="button"
                      variant={getSwarmControlLayoutButtonVariant(layout, 'grid')}
                      size="toolbar"
                      onClick={() => setLayout('grid')}
                      aria-pressed={layout === 'grid'}
                    >
                      Grilla
                    </Button>
                    <Button
                      type="button"
                      variant={getSwarmControlLayoutButtonVariant(layout, 'stack')}
                      size="toolbar"
                      onClick={() => setLayout('stack')}
                      aria-pressed={layout === 'stack'}
                    >
                      Pila
                    </Button>
                  </div>
                </div>

                <div
                  className="mt-3 flex flex-wrap gap-2 text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ChromeSurface
                    as="span"
                    surface="pill"
                    className="px-2.5 py-1"
                    style={pillStyle()}
                  >
                    {filteredAgents.length} agentes
                  </ChromeSurface>
                  <ChromeSurface
                    as="span"
                    surface="pill"
                    className="px-2.5 py-1"
                    style={pillStyle()}
                  >
                    {filteredWorkspaces.length} workspaces
                  </ChromeSurface>
                  <ChromeSurface
                    as="span"
                    surface="pill"
                    className="px-2.5 py-1"
                    style={pillStyle()}
                  >
                    {filteredRuns.length} runs
                  </ChromeSurface>
                  <ChromeSurface
                    as="span"
                    surface="pill"
                    className="px-2.5 py-1"
                    style={pillStyle()}
                  >
                    {filteredApprovals.length} aprobaciones
                  </ChromeSurface>
                  <ChromeSurface
                    as="span"
                    surface="pill"
                    className="px-2.5 py-1"
                    style={pillStyle()}
                  >
                    {filteredErrors.length} errores
                  </ChromeSurface>
                </div>
              </section>
            </ChromeSurface>

            <section className="space-y-3" aria-label="Operaciones activas">
              <p className="typography-section-label">Operaciones activas</p>
              <div
                className={layout === 'grid' ? 'grid gap-6 xl:grid-cols-2' : 'flex flex-col gap-6'}
              >
                <DirectorQueuePanel
                  queue={effectiveDirectorQueue}
                  handoffDisabled={handoffUnsafe}
                  handoffDisabledReason={handoffDisabledReason}
                  isSubmitting={handoffSubmitState.submitting}
                  onClaimNext={handleClaimNext}
                />

                <ApprovalsErrorsPanel
                  approvals={filteredApprovals}
                  errors={filteredErrors}
                  mutationState={approvalMutationState}
                  onDecision={handleDirectorDecision}
                  dgPendingApproval={dg.pendingApproval}
                  dgMissionId={dg.activeMissionId}
                  onDGDApprove={dg.onApprove}
                  onDGDReject={dg.onReject}
                  dgError={dg.error}
                />
              </div>

              <SwarmDelegationPanel
                missionId={missionControl?.mission?.mission_id || null}
                workerRoles={workerRoles}
                standbyMode={isStandbyMission}
                onActivateZed={handleActivateZed}
                activateState={activateZedState}
              />
            </section>

            <section className="space-y-3" aria-label="Procesos OpenCode">
              <ActiveProcessesPanel />
            </section>

            <section className="space-y-3" aria-label="Mision y evidencia">
              <p className="typography-section-label">Mision y evidencia</p>
              <div
                className={layout === 'grid' ? 'grid gap-6 xl:grid-cols-2' : 'flex flex-col gap-6'}
              >
                <MissionKernelPanel
                  missionControl={effectiveMissionControl}
                  onComposerSubmit={handleComposerSubmit}
                />
                <div className="flex flex-col gap-3">
                  <p className="typography-section-label">Evidence</p>
                  <EvidenceTimelinePanel
                    items={evidenceTimeline}
                    dgTimelineRows={dg.timelineRows}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <p className="typography-section-label">Timeline</p>
                  <OperatorTimelineFeed rollup limit={20} />
                </div>
                <div className="flex flex-col gap-3">
                  <p className="typography-section-label">Director General</p>
                  <DGObserverSidebar
                    activeMissionId={dg.activeMissionId}
                    timelineRows={dg.timelineRows}
                    pollingState={dg.pollingState}
                    pendingApproval={dg.pendingApproval}
                    error={dg.error}
                    lastPollAt={dg.lastPollAt}
                    retry={dg.retryMission}
                    onApprove={dg.onApprove}
                    onReject={dg.onReject}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3" aria-label="Inventario operativo">
              <p className="typography-section-label">Inventario operativo</p>
              <div
                className={layout === 'grid' ? 'grid gap-6 xl:grid-cols-3' : 'flex flex-col gap-6'}
              >
                <AgentsClaimsPanel
                  agents={filteredAgents}
                  missionId={missionControl?.mission?.mission_id}
                  onReactivate={loadSnapshot}
                />
                <WorkspacesPanel workspaces={filteredWorkspaces} />
                <RunsArtifactsPanel
                  runs={filteredRuns}
                  selectedRunId={selectedRunId}
                  onSelectRun={setSelectedRunId}
                />
              </div>
            </section>

            <DiagnosticOverlay
              diagnostics={diagnostics}
              expanded={expandedPanels.diagnostics}
              onToggle={() =>
                setExpandedPanels((current) => ({
                  ...current,
                  diagnostics: !current.diagnostics,
                }))
              }
            />

            <SwarmLaunchWizardModal
              open={launchWizardOpen}
              catalog={launchCatalog}
              preview={launchPreview}
              currentStep={launchWizardStep}
              onClose={() => setLaunchWizardOpen(false)}
              onStepChange={setLaunchWizardStep}
              onDraftChange={updateLaunchDraft}
              onLaunch={handleLaunchSubmit}
            />

            {terminateState.error ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {terminateState.error}
              </div>
            ) : null}

            {pruneState.result ? (
              <div className="mt-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                {pruneState.result.summary}
              </div>
            ) : pruneState.error ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {pruneState.error}
              </div>
            ) : null}

            {project?.localPath ? (
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={pruneState.submitting}
                  onClick={handlePruneAllWorktrees}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-red-500/30 px-3 py-1.5 text-xs text-red-300 transition-all hover:border-red-400/50 hover:text-red-200 hover:bg-red-500/10 disabled:opacity-40"
                >
                  {pruneState.submitting ? 'Podendoting…' : 'Podar todos los worktrees .devhub'}
                </button>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Elimina todos los worktrees de swarm en este repo
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
