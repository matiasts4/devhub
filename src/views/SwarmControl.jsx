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
import SwarmPrimarySurface from '@/components/control-room/SwarmPrimarySurface';
import LaunchpadTemplatesPanel from '@/components/control-room/LaunchpadTemplatesPanel';
import SwarmTypeCatalogPanel from '@/components/control-room/SwarmTypeCatalogPanel';
import SwarmLaunchWizardModal from '@/components/control-room/SwarmLaunchWizardModal';
import WorkspacePageTitle from '@/components/workspace/WorkspacePageTitle';
import ActiveProcessesPanel from '@/components/control-room/ActiveProcessesPanel';

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
  const eventSourceRef = useRef(null);

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

  const handlePrimaryAction = useCallback(
    (cta) => {
      if (cta?.target === 'launchpad-templates') {
        openLaunchWizard({
          templateId: launchCatalog?.recommended_template_id,
          step: 'team',
          mode: 'template',
        });
      }
    },
    [launchCatalog?.recommended_template_id, openLaunchWizard]
  );

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
        runtimeRequests: payload.launch_result?.runtime_requests || [],
      });

      (payload.launch_result?.runtime_requests || []).forEach((request) => {
        window.dispatchEvent(new window.CustomEvent('devhub:run-agent', { detail: request }));
      });

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

  const filteredAgents = useMemo(() => agents.filter(matchesFilter), [agents, matchesFilter]);
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
    <div
      className="h-full flex flex-col core-page-shell"
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
    >
      <div
        className="sticky top-0 z-10 core-sticky-header border-b px-6 py-3 flex items-center justify-between"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <WorkspacePageTitle
          icon={Bot}
          title="Swarm Control"
          projectName={project?.name || header.workspace_label}
        />

        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
        >
          Supervisor {String(header.supervisor_state || 'unknown').toUpperCase()}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
            <ControlRoomHeader
              header={header}
              loading={loading}
              projectName={header.workspace_label}
              missionSummary={missionSummary}
            />

            <SwarmPrimarySurface surface={primarySurface} onPrimaryAction={handlePrimaryAction} />

            {launchResult ? (
              <section aria-label="Launch summary local">
                <div
                  className="rounded-2xl border p-4"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(255,176,64,0.14) 0%, rgba(255,176,64,0.04) 100%)',
                    borderColor: 'rgba(255,176,64,0.22)',
                  }}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p
                        className="text-xs font-semibold uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Launch snapshot durable
                      </p>
                      <h2 className="mt-2 text-lg font-semibold">
                        {launchResult.summary?.launchLabel}
                      </h2>
                      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {launchResult.summary?.summaryLines?.[4]}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openLaunchWizard({ step: 'launch' })}
                      className="rounded-xl border px-4 py-2 text-sm font-medium"
                      style={{
                        borderColor: 'rgba(255,176,64,0.24)',
                        background: 'rgba(255,176,64,0.12)',
                      }}
                    >
                      Reabrir summary
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {launchResult.summary?.summaryLines?.slice(0, 3).map((line) => (
                      <div
                        key={line}
                        className="rounded-xl border px-3 py-3 text-sm"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {line}
                      </div>
                    ))}
                  </div>

                  {launchSubmitState.error ? (
                    <p className="mt-3 text-sm" style={{ color: '#fca5a5' }}>
                      {launchSubmitState.error}
                    </p>
                  ) : null}
                </div>
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

            <section
              className="rounded-xl border p-4"
              style={{
                background: 'var(--surface-muted)',
                borderColor: 'var(--border-subtle)',
              }}
              aria-label="Controles operativos"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <label className="flex flex-1 flex-col gap-2 text-xs font-medium">
                  <span style={{ color: 'var(--text-muted)' }}>Filtrar registros</span>
                  <input
                    aria-label="Filtrar registros"
                    className="rounded-lg border px-3 py-2 outline-none"
                    style={{
                      background: 'var(--surface-app)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                    placeholder="agente, workspace, run, evidencia…"
                    value={filterText}
                    onChange={(event) => setFilterText(event.target.value)}
                  />
                </label>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setLayout('grid')}
                    aria-pressed={layout === 'grid'}
                    className="rounded-lg border px-3 py-2"
                    style={{
                      background: layout === 'grid' ? 'var(--surface-elevated)' : 'transparent',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    Grilla
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayout('stack')}
                    aria-pressed={layout === 'stack'}
                    className="rounded-lg border px-3 py-2"
                    style={{
                      background: layout === 'stack' ? 'var(--surface-elevated)' : 'transparent',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    Pila
                  </button>
                </div>
              </div>

              <div
                className="mt-3 flex flex-wrap gap-2 text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                <span
                  className="rounded-full border px-2.5 py-1"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {filteredAgents.length} agentes
                </span>
                <span
                  className="rounded-full border px-2.5 py-1"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {filteredWorkspaces.length} workspaces
                </span>
                <span
                  className="rounded-full border px-2.5 py-1"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {filteredRuns.length} runs
                </span>
                <span
                  className="rounded-full border px-2.5 py-1"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {filteredApprovals.length} aprobaciones
                </span>
                <span
                  className="rounded-full border px-2.5 py-1"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {filteredErrors.length} errores
                </span>
              </div>
            </section>

            <section className="space-y-3" aria-label="Operaciones activas">
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--text-muted)' }}
              >
                Operaciones activas
              </p>
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
                />
              </div>
            </section>

            <section className="space-y-3" aria-label="Procesos OpenCode">
              <ActiveProcessesPanel />
            </section>

            <section className="space-y-3" aria-label="Mision y evidencia">
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--text-muted)' }}
              >
                Mision y evidencia
              </p>
              <div
                className={layout === 'grid' ? 'grid gap-6 xl:grid-cols-2' : 'flex flex-col gap-6'}
              >
                <MissionKernelPanel
                  missionControl={effectiveMissionControl}
                  onComposerSubmit={handleComposerSubmit}
                />
                <EvidenceTimelinePanel items={evidenceTimeline} />
              </div>
            </section>

            <section className="space-y-3" aria-label="Inventario operativo">
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--text-muted)' }}
              >
                Inventario operativo
              </p>
              <div
                className={layout === 'grid' ? 'grid gap-6 xl:grid-cols-3' : 'flex flex-col gap-6'}
              >
                <AgentsClaimsPanel agents={filteredAgents} />
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
          </div>
        </div>
      </div>
    </div>
  );
}
